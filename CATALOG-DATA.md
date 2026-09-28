# NAZM catalog data

The bundled catalog behind the searchable pickers (brand, manufacturer,
model, reference, artist, laboratory…). It is data, not code: every entry has
a stable, language-independent id, an English and an Arabic name, optional
aliases, and a parent where the domain has levels.

- Schema version: `CATALOG_SCHEMA_VERSION = 1` (`src/catalog/model.js`)
- Data version: `BUILTIN_CATALOG_DATA_VERSION = '2026.09.1'` — separate from
  `APP_VERSION`; a data refresh bumps this and nothing else.
- Validation: `validateCatalogData` (`src/catalog/validate.js`) runs in the
  unit tests: unique ids, existing parents in the same domain, no cycles,
  entity types valid for the domain, no empty aliases, no duplicate names
  under one parent.

## What is in it (data version 2026.09.1)

| Domain | Level | Entries |
|---|---|---|
| watch | brand | 197 |
| watch | collection | 232 (50 brands) |
| watch | model | 6 |
| watch | reference | 230 |
| vehicle | manufacturer | 82 |
| vehicle | model | 320 |
| machinery | manufacturer / model | 35 / 72 |
| forklift · crane · generator · pump · compressor · tools · parts | manufacturer | 17 · 12 · 19 · 13 · 10 · 26 · 25 |
| electronics | brand / family / model | 39 / 58 / 75 |
| lab | manufacturer / family / model | 16 / 31 / 46 |
| jewellery | brand / collection | 25 / 25 |
| gem | type / variety | 28 / 20 |
| gem_lab | laboratory | 12 |
| art | artist | 22 |
| furniture | maker | 16 |
| fashion | brand | 25 |

Total: 1,711 entities. A manufacturer that works in several domains
(Caterpillar: machinery, generators, forklifts, parts) is one entity listed
under each of them, not four copies.

### Watch references

References are included only where the reference number is widely published
by the maker and was considered certain when compiled: Rolex (113), Patek
Philippe (43), Audemars Piguet (21), Omega (11), Tudor (9), Richard Mille (7),
F.P. Journe (5), Sinn (5), Panerai (3), Grand Seiko (3), Seiko (3),
G-Shock (3), IWC (2), Vacheron Constantin (1), A. Lange & Söhne (1).

**This is not a list of all watch references**, and the product must never
describe it as one. It carries no production years, prices, case sizes,
movements or other specifications: those vary by dial, bracelet and year,
and a wrong one written into a customer's record is worse than an empty
field. The customer types what the catalog does not have; see *Custom
entries* below.

## Provenance

| Dataset | File | Source class | Compiled |
|---|---|---|---|
| Watch brands | `src/catalog/data/watches.js` | Makers' own published brand names; Arabic names as used by GCC retailers | 2026-09 |
| Watch collections, models, references | `src/catalog/data/watches.js` (`watchDetails`) | Makers' published collection names and reference numbers | 2026-09 |
| Vehicle makes and models | `src/catalog/data/vehicles.js` | Makers' model names as marketed in the GCC | 2026-09 |
| Machinery and equipment makers, machine models | `src/catalog/data/industrial.js` | Makers' published product lines | 2026-09 |
| Electronics, lab instruments | `src/catalog/data/devices.js` | Makers' published product families and model names | 2026-09 |
| Jewellery houses, gems, gem laboratories, artists, furniture, fashion | `src/catalog/data/collectibles.js` | Public names of houses, laboratories and artists; gemmological type names | 2026-09 |

The data was compiled by hand from general, publicly known naming. It was
not imported from a licensed feed and has not been checked entry by entry
against one. Treat it as a convenience for picking, never as an authority:
the item record keeps the label that was chosen alongside the id.

## Ids

- Built-in ids are lowercase slugs with a domain prefix, e.g.
  `watch_brand_rolex`, `watch_ref_rolex_126500ln`, `vehicle_model_toyota_land_cruiser`,
  `mfr_caterpillar`, `lab_model_thermo_fisher_nicolet_is50`. The full prefix
  list is `BUILTIN_ID_PREFIXES` (`src/catalog/builtin.js`).
- Customer ids start with `cust_` and are random; they cannot collide with a
  built-in id. The Firestore rules accept only `^cust_[a-z0-9]{1,60}$`.
- An id is never reused and never renamed. A name correction changes the
  name, not the id.

## Changing the data

1. Edit the file for the dataset. Keep the existing ids.
2. To withdraw an entry, mark it `status: 'deprecated'` (and set `redirectTo`
   when there is a successor). Never delete a row: records hold the id.
3. Bump `BUILTIN_CATALOG_DATA_VERSION`.
4. `node --test tests/unit/catalog.test.mjs` — the validator must pass.
5. Add a line to `CHANGELOG.md` and update the table above.

## Custom entries

A customer's own brand, model, reference or artist is stored in the
workspace (`catalogEntities`, `source: 'custom'`), is searchable next to the
built-in entries, can be renamed, and can be retired only when no record uses
it. It is included in the Full Backup and the JSON export, and restored
before items. It is never added to the bundled catalog.

A value picked "for this item only" is stored on the record as
`{ ref: null, label }` and creates nothing.

Creating and renaming are held to one duplicate rule (`findDuplicates`):
the same normalisation as search (Arabic letter forms, case, spaces,
punctuation in codes, aliases), at the same level (domain, type and parent —
one model name may exist under two makes, not twice under one). A name that
is a built-in entry, another active custom entry, or a retired custom entry
at that level is refused with a message naming it; the entry being renamed
is left out of its own check, and a rename never changes the id.

## Spreadsheet import

Catalog values from a file are linked only where the row agrees with itself:

- the parent (brand / manufacturer) named and found once → its children are
  looked up under it only;
- the parent named but not found (or ambiguous) → the children are kept as
  written (`ref: null`), never linked to another parent's entry, with a
  warning when the catalog knows them elsewhere;
- no parent named → a child found once anywhere may bring its path (Land
  Cruiser → Toyota);
- a model and a reference from the same row that disagree are both kept as
  written; an ambiguous child is kept as written with a warning.

The source cells (`brand`, `modelNumber`, `referenceNumber`) always stay on
the record exactly as the file had them.
