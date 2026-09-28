# NAZM → Flutter migration plan

The HTML/JavaScript app in the repository root is the **golden functional
reference**. This directory holds its replacement: a genuine Flutter/Dart
application (no WebView, no JavaScript at runtime) that keeps NAZM's
behaviour, data model, business rules and file formats.

Status legend used throughout: **implemented** (code exists) · **verified**
(tests prove parity) · **pending** · **blocked** (cannot be done in the
current environment, with the reason).

---

## 1. Reference inventory (what exists today)

131 JavaScript modules, ~41,000 lines (36,900 excluding locale and catalog
data), 44 browser test suites, 16 unit test files, 1,678 localisation keys
per language. Grouped by responsibility:

| Area | Reference modules | Responsibility |
|---|---|---|
| Startup / shell | `app.js`, `boot-guard.js`, `navigation.js`, `viewport.js`, `ui.js`, `platform.js`, `environment.js` | boot order, tabs, sheets, safe areas, keyboard, platform detection |
| Config / flags | `nazm.config.js`, `config.js`, `features.js`, `release` locale | release configuration, feature flags (cloud, accounts, team, billing, cloud AI all off) |
| Localisation | `i18n.js`, `locales/*.js`, `labels.js` | ar/en, plurals, numbers, RTL/LTR switching at run time |
| Local storage | `local-store.js` (IndexedDB v13), `storage.js` | 16 stores, compound/multiEntry indexes, transactions, cursors, key pages |
| Repository | `repository.js` (4,137 lines) | the only data gateway: item CRUD, bulk ops, SKU uniqueness, quotas, taxonomy CRUD, field registry, catalog entities, aggregates, query contract, capabilities, `completeItems` guard |
| Validation | `validation.js`, `custom-fields.js`, `backup-validate.js` | item/category/location/folder normalisation, valuation, quantity, field values |
| Taxonomy | `taxonomy.js`, `locales/taxonomy-catalog.js`, `migration.js` | Main → Category → Subcategory, built-ins, hidden, custom, merge, legacy placement, field templates |
| Custom fields | `custom-fields.js`, `field-format.js` | 15 field types, registry, retired/recovered definitions, previous fields, display rows |
| Smart catalogs | `catalog/*` (model, index, builtin, service, validate, import-resolve, data/*) | 1,711 built-in entities, ranking, cascading, custom entries, duplicates, usage, import resolution |
| Query | `query-spec.js`, `query.js`, `query-idb.js`, `query-local.js`, `item-index.js`, `search.js` | serialisable query contract, keyset cursors, indexed filters/sorts, search tokens, Arabic folding |
| Aggregates | `aggregates.js` | persisted overview aggregate kept by deltas in the write transaction |
| Overview / assistant / health | `views/overview.js`, `ask.js`, `insights.js`, `health.js`, `duplicates.js` | aggregate-backed overview, rules-based query-driven assistant, health score, duplicate groups |
| Media | `media.js`, `image-*`, `views/image-viewer.js`, `device-upload.js` | originals + thumbnails, mediaAssets with refcounts, reconciliation, viewer |
| Scanner / labels | `scanner.js`, `views/scan.js`, `qr.js`, `label-pdf.js`, `views/labels.js` | barcode/QR scan, own QR encoder, label PDF |
| Import / export | `spreadsheet.js`, `import-mapping.js`, `import-jobs.js`, `views/sheet-import.js`, `exporting.js`, `export-service.js`, `xlsx-writer.js` | CSV/XLSX import with preview, jobs, cancel/rollback, Excel/CSV/JSON export |
| Backup / restore | `zip64.js`, `backup-format.js`, `backup-writer.js`, `backup-reader.js`, `backup-validate.js`, `restore-engine.js`, `restore-index.js`, `restore.js`, `full-backup.js` | `.nazmbackup` v1/v2, ZIP64, NDJSON chunks, SHA-256, safety backup, resumable lossless restore, exact missing-media set |
| Trash | `views/manage.js`, repository | soft delete, restore, purge with media release |
| Future cloud | `firebase.js`, `auth.js`, `account.js`, `team.js`, `subscription.js`, `entitlements.js`, `sync-queue.js` | dormant; FirestoreBackend, mutation queue, capabilities |
| Legal | `views/legal.js`, `settings-legal.js`, `locales/legal-documents.js` | privacy, terms, support, erase-local-data |

## 2. Persistent data model (IndexedDB v13 → Drift)

IndexedDB stores and their Drift equivalent. Domain identity stays the
existing string ids everywhere; SQLite `rowid` is never an application id.

| IndexedDB store | Drift table(s) | Notes |
|---|---|---|
| `items` | `items`, `item_tokens`, `item_catalog_refs`, `item_field_ids` | multiEntry indexes (`searchTokens`, `catalogRefs`, `customFieldIds`) become join tables keyed `(value, item_id)`; `images`, `customFields`, `customFieldDefs`, `aiData` stay JSON columns (their shape is the backup shape) |
| `categories` | `taxonomy_nodes` | custom nodes, overrides (hidden, renamed, order, mergedInto) of built-ins |
| `fieldDefinitions` | `field_definitions` | active / retired / recovered |
| `catalogEntities` | `custom_catalog_entities` | `source = custom`, ids `cust_…` |
| `locations`, `folders` | `locations`, `folders` | |
| `images` (blobs) | files under `media/` | originals and thumbnails on the filesystem, never BLOBs |
| `mediaAssets` | `media_assets` | `mediaId`, relative paths, mime, size, width, height, sha256, refCount, orphanedAt |
| `activity` | `activity` | bounded retention as today |
| `importJobs` | `import_jobs` | fingerprint, mapping, progress, status |
| `meta` | `settings` (key/value JSON) | preferences, last backup, restore job pointer |
| `restoreIndex` | `restore_index` `(job, collection, id)` | temporary, keyed by restore job |
| `workIndex` | `work_index` `(run, kind, id, value)` | reconciliation scratch |
| `aggregates` | `aggregates` (one JSON row) | same schema as `aggregates.js`; DTO identical to the server one |
| `mutations` | `pending_mutations` | serialisable records only, dormant |
| (prefs `catalogUsage`) | `catalog_usage` | recent / frequent per level, device only |
| — | `restore_jobs`, `backup_metadata` | restore state machine and last-backup record, today in `meta` |

`items` columns (all nullable where the reference allows null):
`id` PK text · `workspace_id` · `name` · `name_sort_key` · `sku` · `barcode` ·
`serial_number` · `model_number` · `reference_number` · `brand` ·
`main_category_id` · `category_id` · `subcategory_id` · `legacy_category_id` ·
`folder_id` · `location_id` · `quantity` (REAL — the reference allows decimals
per unit) · `unit` · `condition` (stored value as today, e.g. `ممتازة`) ·
`valuation_min` / `valuation_max` (TEXT, exact decimal) · `valuation_currency` ·
`valuation_midpoint` (REAL, sort/range key only) · `valuation_source` ·
`description` · `images_json` · `primary_image_id` · `has_images` ·
`custom_fields_json` · `custom_field_defs_json` · `ai_data_json` ·
`import_job_id` · `source_line` · `created_at` · `created_by` · `updated_at` ·
`updated_by` · `deleted_at` · `deleted_by` · `version`.

Indexes (from the reference's actual queries, not every column):
`(deleted_at, created_at)`, `(deleted_at, updated_at)`,
`(deleted_at, name_sort_key, id)`, `(deleted_at, folder_id, created_at)`,
`(deleted_at, category_id, created_at)`, `(deleted_at, main_category_id, created_at)`,
`(deleted_at, subcategory_id)`, `(deleted_at, location_id, created_at)`,
`(deleted_at, condition)`, `(deleted_at, valuation_currency, valuation_midpoint)`,
`(deleted_at, has_images)`, `sku`, `barcode`, `serial_number`, `import_job_id`;
join tables are `WITHOUT ROWID` with PK `(value, item_id)` plus `(item_id)`.
Every index is checked with `EXPLAIN QUERY PLAN` in tests (phase 5).

Versions kept separate: `databaseSchemaVersion` (Drift `schemaVersion`),
`taxonomySchemaVersion`, `catalogSchemaVersion` / `catalogDataVersion`,
`backupFormatVersion` (2, reads 1), `appVersion`.

Money: valuation bounds are stored as exact decimal text and exposed as a
`Money`/`Decimal` value object; the midpoint REAL exists only to order and
range-filter, as `valuationMidpoint` does today. Currencies are never summed
together. Backup numbers round-trip exactly (JSON number ↔ decimal text).

## 3. Package choices

Evaluated for maintenance, iOS/Android support, licence, null safety,
large-file behaviour. Only what is needed:

| Need | Package | Why / alternative rejected |
|---|---|---|
| State | `flutter_riverpod` | typed providers, no codegen required |
| Routing | `go_router` | declarative, native back, deep links later |
| SQLite | `drift`, `drift_flutter` (bundles `sqlite3`), dev: `drift_dev`, `build_runner` | typed tables, migrations, transactions, streams; FTS5 available |
| Paths / files | `path_provider`, `path` | app-specific directories |
| Hashing | `crypto` | SHA-256 streaming (`startChunkedConversion`) |
| Localisation | `flutter_localizations`, `intl` (gen-l10n from ARB) | official |
| Money | `decimal` | exact decimal arithmetic |
| Camera / gallery | `image_picker` | official; HEIC/JPEG per platform |
| Scanning | `mobile_scanner` | ML Kit / AVFoundation, maintained |
| Share / files | `share_plus`, `file_picker` | system share sheet, document picker |
| PDF | `pdf` | pure Dart; QR drawn from our own encoder |
| Thumbnails | `image` (pure Dart, run in an isolate) | resize/encode without platform channels |
| ZIP64 | **own Dart port of `zip64.js`** (stored entries, CRC-32, ZIP64 records) over `RandomAccessFile` | the `.nazmbackup` format uses stored entries only; no package verifiably streams ZIP64 writes of 4 GB+ to disk; owning ~500 lines keeps byte compatibility |
| XLSX read/write | own port of `spreadsheet.js` / `xlsx-writer.js`, inflate via `archive` | lazy row iteration and bounded memory; `excel` loads whole workbooks |

No Firebase packages are added while `features.cloud = false`.

## 4. Project structure

```
nazm_flutter/
  assets/
    catalog/          generated from src/catalog/data (JSON, versioned)
    taxonomy/         built-in taxonomy + field definitions/templates (JSON)
  lib/
    app/              app.dart, router/, theme/, config/ (feature flags)
    l10n/             app_ar.arb, app_en.arb (generated from src/locales)
    core/             errors/, logging/, text/ (Arabic folding, sort keys), ids/
    data/local/       Drift database, tables, DAOs
    domain/           entities, value objects, repository contracts, query contract
    features/
      inventory/ taxonomy/ catalogs/ custom_fields/ locations/ folders/
      search/ overview/ assistant/ health/ trash/ scanner/ labels/
      import_export/ backup_restore/ settings/
  test/               unit + Drift (real SQLite in memory/file) + widget tests
  integration_test/   workflows, large-data runs
  tool/               asset generation scripts (Node, reading the reference)
```

Assets are **generated from the reference source** by `tool/export_reference.mjs`
(catalog rows, taxonomy, field templates, locale strings → ARB) so the two
implementations cannot drift apart during migration; provenance stays in
`CATALOG-DATA.md`.

## 5. Architecture rules carried over

- Every screen talks to repositories; repositories to data sources. No SQL,
  no Drift types, no Firestore types in presentation or domain code.
- Query contract (`ItemQuery`: filters, text, sort, limit, cursor, projection)
  is serialisable and validated before any backend sees it; keyset cursors
  only; page size ≤ 100.
- Aggregates are updated in the same transaction as the item write; Overview,
  Assistant and Health read aggregates, counts and pages only.
- Backend capabilities (`wholeInventoryRead`, …) and the explicit-purpose rule
  for any whole-dataset read are part of the contract from day one.
- Local-only by default; cloud data sources exist as interfaces, not code
  paths; `pending_mutations` is dormant.
- Restore is lossless or fails; state machine persisted; safety backup taken
  once; restore index on disk; missing media verified as an exact set.

## 6. Feature parity matrix

Every row stays **pending** until a test proves it. "Data" = backup/JSON
compatibility with the reference.

| # | Reference feature | Flutter equivalent | Data | Tests | Status |
|---|---|---|---|---|---|
| 1 | Startup, boot guard, language gate | `app/`, first-run language choice | — | widget | pending |
| 2 | Feature flags / release config | `app/config/features.dart` | — | unit | pending |
| 3 | ar/en, RTL/LTR switch at run time | gen-l10n, `Directionality` from locale | — | widget | pending |
| 4 | Light/dark theme tokens | `app/theme/` | — | widget | pending |
| 5 | Item create/edit/duplicate | inventory feature | ✓ same shape | unit/widget | pending |
| 6 | SKU uniqueness (transactional) | Drift transaction + index | — | Drift | pending |
| 7 | Trash, restore, purge (+media release) | trash feature | ✓ | Drift | pending |
| 8 | Folders, locations | folders/locations | ✓ | Drift | pending |
| 9 | Quantity/units, condition values | domain value objects | ✓ | unit | pending |
| 10 | Valuation min/max/currency, per-currency totals | `Money`, aggregate | ✓ exact | unit | pending |
| 11 | Identifiers (sku, barcode, serial, model, reference) + exact search | `item_tokens`, indexes | ✓ | Drift | pending |
| 12 | Taxonomy Main/Category/Sub, built-ins, hidden, custom, merge, order, deprecated, legacy placement | taxonomy feature | ✓ ids identical | unit | pending |
| 13 | Field registry, 15 types, retired/recovered, previous fields | custom_fields | ✓ | unit/widget | pending |
| 14 | Category field templates, `showWhen`, `supersedes` | taxonomy assets | — | unit | pending |
| 15 | Smart catalogs: 1,711 entities, 197 watch brands, ranking, aliases, Arabic | catalogs feature + assets | ✓ ids identical | unit | pending |
| 16 | Searchable cascading picker, recent/frequent, manual, custom create/rename/retire, duplicates | `SearchableCatalogSheet` | ✓ | widget | pending |
| 17 | Save & Add Next, Use last selection, no unique carry | inventory form | — | widget | pending |
| 18 | Home list, filters, sorts, pagination, windowing | search feature | — | Drift/widget | pending |
| 19 | Overview from aggregate | overview | ✓ aggregate DTO | Drift | pending |
| 20 | Assistant (rules, query-driven) | assistant | — | unit | pending |
| 21 | Health score, duplicate candidates | health | — | unit | pending |
| 22 | Images: originals, thumbnails, refcounts, reconciliation, viewer | media | ✓ sha256 | Drift/unit | pending |
| 23 | Camera / gallery / HEIC | `image_picker` | — | device | pending |
| 24 | Barcode / QR scanning | `mobile_scanner` | — | device | pending |
| 25 | QR labels PDF + share | labels (`pdf`, `share_plus`) | — | unit | pending |
| 26 | CSV/XLSX import, preview, mapping, jobs, cancel, catalog resolution rules | import_export | ✓ | unit/Drift | pending |
| 27 | Excel / streaming CSV / JSON export | import_export | ✓ | unit | pending |
| 28 | `.nazmbackup` v2 writer (ZIP64, NDJSON, SHA-256, degraded) | backup_restore | ✓ byte-compatible | unit | pending |
| 29 | `.nazmbackup` v1/v2 reader + verification | backup_restore | ✓ | unit | pending |
| 30 | Lossless restore, job state machine, safety backup, resume, exact missing-media | backup_restore | ✓ | Drift/integration | pending |
| 31 | JSON export/import (legacy) | import_export | ✓ | unit | pending |
| 32 | Legal, support, erase local data | settings | — | widget | pending |
| 33 | Capabilities, no whole-inventory fallback | repository contract | — | unit | pending |
| 34 | Cloud (auth, team, billing, sync, cloud AI) | interfaces only, flags off | — | — | out of scope (dormant) |
| 35 | Migration HTML → Flutter via Full Backup | restore path | ✓ | acceptance | pending |

## 7. Phases

| Phase | Content | Exit criteria |
|---|---|---|
| 1 Architecture | project, lints, theme, l10n from reference, router, Riverpod, error model, flags, Drift schema v1 (all tables, indexes), repository & query contracts | `flutter analyze` clean, `flutter test` green, schema test on real SQLite |
| 2 Domain/Data | item normalisation parity, taxonomy, fields, catalogs (assets + service + ranking), aggregates, keyset queries, media metadata | unit + Drift tests using fixtures produced by the reference JS |
| 3 Core UI | Home, list, Add/Edit/Detail, Trash, folders, locations | widget tests, ar/en, RTL/LTR |
| 4 Smart catalogs UI | sheet, cascade, manual/custom, Save & Add Next | widget tests from the reference browser tests |
| 5 Search/analytics | filters, sorts, Overview, Assistant, Health; 100k/500k runs; EXPLAIN checks | no whole-inventory materialisation |
| 6 Media/scanner | camera, gallery, thumbnails (isolate), scanning, QR PDF | device tests |
| 7 Import/export | CSV/XLSX import with jobs, exports streaming | fixtures from reference |
| 8 Backup/restore | ZIP64 port, writer, reader, restore engine | backups written by the reference restore in Flutter, and back |
| 9 Migration | reference Full Backup → Flutter restore acceptance | counts, content, sha256, ids identical |
| 10 Regression | full parity matrix | matrix has no unexplained gap |

## 8. Phase status

### Phase 1 — Architecture: implemented, verified (Linux)

| Item | Status | Evidence |
|---|---|---|
| Flutter 3.47.5 / Dart 3.13.4 project, iOS + Android targets | implemented | `flutter create`, bundle id `app.nazm.nazm` (placeholder until the final identifier is confirmed) |
| Strict lints (`strict-casts`, `strict-raw-types`, extra rules) | verified | `flutter analyze`: no issues |
| Formatting | verified | `dart format --line-length 120` clean |
| Localisation: 1,726 reference strings → ARB (ar/en, ICU plurals), gen-l10n | verified | generated from `src/locales`, widget test |
| Language gate on first launch, persisted choice, RTL/LTR | verified | widget tests (ar → RTL, en → LTR, stored) |
| Theme tokens light/dark from `styles/tokens.css` | implemented | `NazmTheme`, `NazmColors` |
| go_router shell (Inventory, Overview, Assistant, Settings → Categories) | implemented | screens are phase placeholders |
| Riverpod providers (database, flags, locale, theme) | implemented | overridable in tests |
| Feature flags, all cloud features off, dependency consistency | verified | unit test |
| Error model (`AppError` codes and areas) | implemented | |
| Drift schema v1: 20 tables, indexes from the reference's queries | verified | schema test on real SQLite; `EXPLAIN QUERY PLAN` shows index use and no temp sort for newest/name/value lists |
| Restore index as a keyed table | verified | 1,000-row test with PK range reads |
| Query contract (`ItemQuery`) with the reference's validation | verified | 28 golden specs from `query-spec.js`, accepted/refused identically, same `detail`; JSON round trip; cursor bound to its query |
| Arabic folding, digits, name sort key | verified | 30 golden inputs, byte-identical |
| `Item` entity, lossless round trip of reference records | verified | 5 golden records, JSON-identical |
| Inventory aggregate (schema 2) | verified | same aggregate as the reference, byte-identical JSON |
| Repository contracts + capabilities + explicit whole-dataset purposes | implemented | interfaces; Drift implementation is phase 2 |
| Catalog (1,711 entities, 7 lazy groups) and taxonomy assets | implemented | generated and validated by the reference's validator |

## 9. Environment limits (stated, not hidden)

This work runs in a Linux container. `flutter analyze`, `flutter test`
(including Drift on a real SQLite) and Android builds are possible here
if the Android SDK can be installed; **iOS builds, TestFlight, camera and
scanner device tests require macOS/Xcode and real devices** and are reported
as blocked until run there.
