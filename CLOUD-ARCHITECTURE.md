# NAZM — cloud-readiness architecture

Status: **prepared, not enabled.** The 1.0.0 production release is device-only:
`cloud=false`, `team=false`, `billing=false`, `cloudAi=false`. Nothing in this
document is reachable from the release UI, no Firebase request is made, and no
background sync exists. This document describes the seams that let the cloud
become the authoritative store later, with the device as an offline-capable
cache, **without rewriting the screens.**

It is not a claim that NAZM is "cloud ready". What exists, what is only
designed, and what is missing are each labelled below.

---

## 1. The one rule

Screens ask the **Repository**. The Repository asks a **backend**. A screen
never knows whether the answer came from IndexedDB or a server, and never needs
the whole inventory in memory to answer anything.

```
 views/*  ──►  repository.js  ──►  LocalBackend      (IndexedDB, today)
   │              │            └─►  FirestoreBackend  (prepared, disabled)
   │              ├─ queryItems / countItemsMatching / aggregateItems / searchItems
   │              ├─ getInventoryOverview / rebuildAggregates
   │              ├─ duplicateCandidates
   │              └─ getItem / getItems / create / update / bulk* / clearInventory
   └─ insights.js (assistant + health, through the repository only)
```

Static checks that hold this (tests/browser/cloud-readiness.test.mjs,
tests/browser/window.test.mjs): opening Overview, Assistant, Inventory,
Categories and Settings calls `completeItems` zero times; clearing the
inventory calls it zero times.

---

## 2. Paths, today and in the cloud

| Path | Device-only (1.0) | Cloud-authoritative (future) |
|---|---|---|
| **List / browse** | `query.js` → `query-idb.js`: IndexedDB indexes and cursors, one page read | Same call; `FirestoreBackend.queryItems` translates the query contract to a Firestore query (`_specQuery`), device cache serves offline |
| **Filtered question** (assistant hand-off, health task) | `repository.queryItems(spec)` → `query-local.js` (ordered index walk or bounded top-K) | `FirestoreBackend.queryItems` (server query + composite index, §6) |
| **Count** | index sizes (`countRange`) or bounded walk of the most selective index | `getCountFromServer` |
| **Totals / Overview / health** | persisted aggregate record (`aggregates` store), updated in the same transaction as every write | a server-kept aggregate document (`workspaces/{id}/aggregates/inventory`) maintained by a Cloud Function — **not built** |
| **Search** | `searchTokens` multi-entry index (name/brand words, identifiers) | search service (or the same tokens as an array-contains field) — **not built**; Firestore backend refuses text today (`query/unsupported`) |
| **Identifier lookup** (scanner) | `sku` / `barcode` / `serialNumber` indexes | equality queries on the same fields |
| **Write** | Repository → LocalBackend transaction: record + derived index fields + aggregate delta, atomically | write to the local cache + an entry in the mutation queue (`sync-queue.js`), sent by a sync worker — **worker not built** |
| **Sync** | none; queue refuses to accept entries while `SYNC` is unavailable | queue drained in order; conflicts by base version (§4) |
| **Media** | `images` + `mediaAssets` stores, thumbnail/display/full tiers (`storage.js ImageTier`) | Cloud Storage under `workspaces/{id}/media/{mediaId}`, same tiers, same reference counts |
| **Aggregates rebuild** | `repository.rebuildAggregates()`: page-at-a-time walk, safe against concurrent writes (`writesDuring`) | server job |
| **Full Backup** | streaming ZIP64 `.nazmbackup` (`backup-writer.js`), device only | server export job returning a file (job interface, §5) |
| **Full Restore** | streaming, resumable, index-driven (`restore-engine.js`) | server restore job; device restore stays for device workspaces |
| **Export** | XLSX/JSON in memory up to `EXPORT_LIMITS` (20,000 records); CSV streamed page by page at any size | same interface; large exports become server jobs |

---

## 3. The query contract (`src/query-spec.js`)

A query is plain data — no functions, no field paths from the caller:

```js
{ filters: { mainCategoryId: 'equipment_tools', updatedAt: { lt: t }, locationId: { exists: false } },
  text: 'مولد', sort: { field: 'name', direction: 'asc' }, limit: 50, cursor: '…', projection: 'list' }
```

* Fields and operators come from `QUERY_FIELDS`; anything else is `query/invalid`.
* `limit` ≤ `MAX_LIMIT` (200). `in` lists ≤ 30 (Firestore's limit).
* A value comparison or value sort requires a currency equality: values are
  never compared across currencies.
* Cursors are opaque, bound to the query that issued them (a cursor spent on
  another query is refused) and, on the device, to the strategy that issued
  them — a strategy change between pages resumes from the last record instead
  of restarting.
* Semantics are defined once by `matchesSpec` and `compareForSort`. The
  contract tests run the device backend and a mock cloud backend (built only
  from those two functions) over the same queries and require identical
  records, order and counts.

---

## 4. Sync and conflicts (designed; dormant)

`src/sync-queue.js` defines the mutation record and its store (`mutations`,
DB v12):

```
{ mutationId, entityType, entityId, op, payload, baseVersion,
  createdAt, status, attempts, lastError, conflict }
```

* `enqueueMutation` returns `null` and writes nothing unless the `SYNC`
  feature is available. There is no timer and no listener in the module.
* Conflict rule (`detectConflict`): a mutation applies only if the server
  still holds `baseVersion`; otherwise it is `stale-base` (edited elsewhere),
  `deleted-remotely`, or `already-exists` (create). A conflict is kept with
  both sides for a person to resolve — the same rule the device applies to
  concurrent edits today (`ConflictError`).
* Entity sync state (`SyncState`: local / pending / synced / conflict) is
  defined for the day records carry it; in 1.0 it is not written.

Not built: the sync worker, the conflict UI, server-side version checks
beyond the existing Firestore rules.

---

## 5. Long operations as jobs (`src/job-service.js`)

Exports (and later imports, backups, restores) are started with `startJob` and
answered with `{ jobId, kind, status, progress, result, error }`. On the
device the job has usually finished when the call returns; a cloud backend
will return it `queued` and complete it on a server. Callers read `status`,
so they do not change when that happens. CSV export already runs this way.

---

## 6. Future Firestore indexes

Collection `workspaces/{workspaceId}/items`. Every query also carries
`deletedAt == null` (live) unless it asks for the Trash. Existing indexes are
in `firestore.indexes.json`; these are **additionally** required before the
cloud backend can serve the query contract. They are listed here, not
deployed, because nothing queries them yet.

| Query | Composite index |
|---|---|
| name order | `deletedAt ASC, nameSortKey ASC, __name__ ASC` |
| name order in a folder / category / location | `deletedAt, folderId, nameSortKey` · `deletedAt, categoryId, nameSortKey` · `deletedAt, locationId, nameSortKey` |
| value order | `deletedAt, valuation.currency, valuationMidpoint DESC` |
| value above a threshold | `deletedAt, valuation.currency, valuationMidpoint` |
| updated order / stale | `deletedAt, updatedAt DESC` |
| main category browse | `deletedAt, mainCategoryId, createdAt DESC` |
| subcategory browse | `deletedAt, subcategoryId, createdAt DESC` |
| location browse | `deletedAt, locationId, createdAt DESC` |
| condition filter | `deletedAt, condition, createdAt DESC` |
| Trash | `deletedAt DESC` (single field) |
| identifier lookup | single-field: `sku`, `barcode`, `serialNumber` (automatic) |
| search tokens | `searchTokens ARRAY_CONTAINS, updatedAt DESC` (or a search service) |
| derived booleans | `hasImages`, `valued`, `analyzed` must be **stored** denormalized before they can be filtered server-side; the Firestore backend refuses them today (`query/unsupported`) |

Not indexed server-side by default: custom field values, descriptions,
AI text. Aggregating or indexing every customer-defined field would grow
without bound.

Catalog selections are the exception, because they are bounded: each record
stores the ids it refers to in `catalogRefs` (at most 32, sorted), so "every
Rolex" or "every record using this custom brand" is
`catalogRefs ARRAY_CONTAINS <id>` plus `deletedAt`. On the device this is the
`catalogRefs` multiEntry index (DB version 13); in Firestore it needs the
composite index `catalogRefs ARRAY_CONTAINS, deletedAt ASC, updatedAt DESC`.

### 6a. The catalog service (`src/catalog/service.js`)

The pickers ask `catalogService`, never a dataset:

| Call | Meaning |
|---|---|
| `search({domain, entityType, parentId, ancestorId, query, limit, cursor})` | ranked page (≤ 100, default 30); cursor is opaque |
| `children({domain, entityType, parentId, limit, cursor})` | a level under a parent |
| `getEntity(id)`, `path(id)`, `isWithin(id, ancestorId)` | lookups; unknown ids return null and the record's saved label is shown |
| `resolveText({domain, entityType, ancestorId, text})` | `unique` / `ambiguous` / `none` — used by the spreadsheet import |
| `findDuplicates`, `createCustom`, `renameCustom`, `retireCustom` | the customer's own entries |
| `recent`, `recordUse` | recent and frequent selections, stored on the device only |

Providers:

- **BuiltinCatalogProvider** — the bundled data (`CATALOG-DATA.md`), loaded per
  domain group on first use; a watch brand list does not load references
  until a reference is searched.
- **UserCatalogProvider** — the workspace's `catalogEntities` collection
  (`source: 'custom'`, ids `cust_…`). It travels with the workspace, the Full
  Backup and the JSON export; restore writes it before items.
- **CloudCatalogProvider** — present and inactive. It is `active` only with
  the cloud feature on *and* a configured endpoint (none is configured), so
  no catalog request leaves the device in this release. When enabled it must
  serve the same paginated contract; the bundled catalog stays the offline
  fallback.

Security rules for `workspaces/{id}/catalogEntities/{entityId}`: members read;
writers create and update only ids matching `^cust_[a-z0-9]{1,60}$` with
`source == 'custom'`; nobody deletes (entries are retired, because records
hold their ids). The bundled catalog is never written to the workspace.

Scaling notes: the bundled catalog is 1,711 entities and searches in well
under a millisecond on the device. A catalog of hundreds of thousands of
references (every watch reference, every vehicle trim) does not belong in the
bundle; that is what the cloud provider and a search service are for.

---

## 7. Data model: field classification

**Authoritative (entered or decided by a person; synced; backed up):**
`id, name, sku, barcode, serialNumber, modelNumber, referenceNumber,
mainCategoryId, categoryId, subcategoryId, legacyCategoryId, customFields,
customFieldDefs, folderId, locationId, quantity, unit, condition, brand,
valuation{min,max,currency,source,valuationType}, description, images[],
primaryImageId, importJobId, sourceLine, deletedAt, deletedBy`

**System-maintained (set by the repository, synced):**
`createdAt, createdBy, updatedAt, updatedBy, version` (optimistic concurrency).

**Derived (never edited, never backed up as data, recomputed wherever stored)
— `item-index.js`:**
`nameSortKey, valuationMidpoint, searchTokens` (`INDEX_FIELDS_VERSION` bumps
trigger a resumable backfill), `customFieldIds`.

**Advisory (produced by analysis, shown as such, never authoritative):**
`aiData` (scores, suggested valuation, description).

**Device-only (never synced):** image bytes in `images`, the `mediaAssets`
reference counts (a cloud workspace keeps its own), `restoreIndex`,
`workIndex`, `aggregates` (the cloud keeps its own), `mutations`, UI
preferences, the query cache.

**Aggregate record** (`aggregates.js`, schema 2): live/trashed counts,
quantity, with-images, valued, analyzed, sound; breakdowns by main category,
category, subcategory, location, folder, condition and (main, category) pair;
valuation per currency; analysis score sums. Structural fields only.

---

## 8. Caches and memory bounds

* `repository.itemCache`: LRU, 100 records.
* `repository.queryCache`: LRU, 30 answers, 30 s, only for a backend whose
  every write passes through this tab (`keepsAggregates`); invalidated by any
  item write (a write counter bumped inside the write transaction).
* The inventory window: ≤ 200 records; screens never grow it to answer a
  question.
* Duplicate candidates: key-only walks of the `serialNumber`, `barcode`,
  `sku`, `nameSortKey` indexes; only colliding records are read (capped at
  5,000).
* ZIP64 central directory: a pluggable spool (`BlobDirectorySpool` by default;
  an OPFS/temp-file spool can be passed to `Zip64Writer`).

---

## 9. Full Backup / Restore guarantees

* A restore never skips a record. `backup-validate.js` migrates each record
  from its schema and validates it; anything that would be dropped or changed
  (images, valuation, condition, field values, references, truncated text,
  invalid metadata) refuses the whole backup before a single write.
* Missing images are verified as an exact set: every id the restored records
  reference and no image holds is checked against the backup's declared list,
  page by page on disk — at any size.
* `originalSafetyBackup` is taken once, before the first write, and never
  replaced. A resumed restore does not require a new one; it may take an
  optional `recoveryCheckpointBackup`, recorded separately.

---

## 10. What is not ready (release blockers for any cloud launch)

* Server-side aggregate maintenance (Cloud Function) and server search.
* The sync worker, conflict UI, and offline write path through the queue.
* Denormalized `hasImages` / `valued` / `analyzed` on cloud records.
* The indexes in §6.
* Server export/restore jobs.
* `supportUrl`, `privacyPolicyUrl` and contact addresses remain unset release
  blockers (see PRODUCTION-CHECKLIST.md); they are not invented here.
