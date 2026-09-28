// The local database schema.
//
// Mirrors the reference app's IndexedDB stores (src/local-store.js, version
// 13) as typed SQLite tables. Domain identity is always the existing string
// id (`itm…`, `cust_…`, built-in taxonomy ids…); SQLite's rowid is never an
// application id, so records keep the same ids when they reach the cloud.
//
// Timestamps are UTC milliseconds since the epoch, as in the reference and
// in every backup. Values whose shape *is* the backup shape (images, custom
// field values, per-record field definitions, AI data) stay JSON text; the
// columns the app filters, sorts or counts by are real columns with indexes.
//
// IndexedDB's multiEntry indexes (searchTokens, catalogRefs, customFieldIds)
// become join tables keyed (value, item_id), WITHOUT ROWID.

import 'package:drift/drift.dart';

/// Inventory records. Soft-deleted rows keep `deletedAt`; live queries filter
/// `deleted_at IS NULL`, so every scope index leads with `deleted_at`.
@DataClassName('ItemRow')
@TableIndex(name: 'items_live_created', columns: {#deletedAt, #createdAt, #id})
@TableIndex(name: 'items_live_updated', columns: {#deletedAt, #updatedAt, #id})
@TableIndex(name: 'items_live_name', columns: {#deletedAt, #nameSortKey, #id})
@TableIndex(name: 'items_live_folder', columns: {#deletedAt, #folderId, #createdAt})
@TableIndex(name: 'items_live_category', columns: {#deletedAt, #categoryId, #createdAt})
@TableIndex(name: 'items_live_main', columns: {#deletedAt, #mainCategoryId, #createdAt})
@TableIndex(name: 'items_live_sub', columns: {#deletedAt, #subcategoryId, #createdAt})
@TableIndex(name: 'items_live_location', columns: {#deletedAt, #locationId, #createdAt})
@TableIndex(name: 'items_live_condition', columns: {#deletedAt, #condition})
@TableIndex(name: 'items_live_value', columns: {#deletedAt, #valuationCurrency, #valuationMidpoint, #id})
@TableIndex(name: 'items_live_images', columns: {#deletedAt, #hasImages})
@TableIndex(name: 'items_sku', columns: {#sku})
@TableIndex(name: 'items_barcode', columns: {#barcode})
@TableIndex(name: 'items_serial', columns: {#serialNumber})
@TableIndex(name: 'items_model', columns: {#modelNumber})
@TableIndex(name: 'items_reference', columns: {#referenceNumber})
@TableIndex(name: 'items_import_job', columns: {#importJobId})
class Items extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  TextColumn get name => text().withDefault(const Constant(''))();
  TextColumn get nameSortKey => text().withDefault(const Constant(''))();
  TextColumn get sku => text().nullable()();
  TextColumn get barcode => text().nullable()();
  TextColumn get serialNumber => text().nullable()();
  TextColumn get modelNumber => text().nullable()();
  TextColumn get referenceNumber => text().nullable()();
  TextColumn get brand => text().nullable()();
  TextColumn get mainCategoryId => text().nullable()();
  TextColumn get categoryId => text()();
  TextColumn get subcategoryId => text().nullable()();
  TextColumn get legacyCategoryId => text().nullable()();
  TextColumn get folderId => text().nullable()();
  TextColumn get locationId => text().nullable()();

  /// The reference allows fractional quantities for measured units.
  RealColumn get quantity => real().withDefault(const Constant(1))();
  TextColumn get unit => text()();

  /// The stored condition value, exactly as the reference stores it.
  TextColumn get condition => text().withDefault(const Constant(''))();

  /// Exact decimal text; never summed across currencies.
  TextColumn get valuationMin => text().nullable()();
  TextColumn get valuationMax => text().nullable()();
  TextColumn get valuationCurrency => text().nullable()();

  /// Order/range key only (the reference's `valuationMidpoint`).
  RealColumn get valuationMidpoint => real().nullable()();
  TextColumn get valuationSource => text().nullable()();
  TextColumn get valuationType => text().nullable()();
  IntColumn get valuationDate => integer().nullable()();
  TextColumn get description => text().withDefault(const Constant(''))();
  TextColumn get imagesJson => text().withDefault(const Constant('[]'))();
  TextColumn get primaryImageId => text().nullable()();
  BoolColumn get hasImages => boolean().withDefault(const Constant(false))();
  TextColumn get customFieldsJson => text().withDefault(const Constant('{}'))();
  TextColumn get customFieldDefsJson => text().withDefault(const Constant('[]'))();
  TextColumn get aiDataJson => text().nullable()();
  TextColumn get importJobId => text().nullable()();
  IntColumn get sourceLine => integer().nullable()();
  IntColumn get createdAt => integer()();
  TextColumn get createdBy => text().nullable()();
  IntColumn get updatedAt => integer()();
  TextColumn get updatedBy => text().nullable()();
  IntColumn get deletedAt => integer().nullable()();
  TextColumn get deletedBy => text().nullable()();
  IntColumn get version => integer().withDefault(const Constant(1))();

  @override
  Set<Column> get primaryKey => {id};
}

/// A word of the name/brand or an identifier, per record (searchTokens).
@DataClassName('ItemTokenRow')
@TableIndex(name: 'item_tokens_item', columns: {#itemId})
class ItemTokens extends Table {
  TextColumn get token => text()();
  TextColumn get itemId => text()();

  @override
  Set<Column> get primaryKey => {token, itemId};

  @override
  bool get withoutRowId => true;
}

/// A catalog entity a record points at (catalogRefs).
@DataClassName('ItemCatalogRefRow')
@TableIndex(name: 'item_catalog_refs_item', columns: {#itemId})
class ItemCatalogRefs extends Table {
  TextColumn get ref => text()();
  TextColumn get itemId => text()();

  @override
  Set<Column> get primaryKey => {ref, itemId};

  @override
  bool get withoutRowId => true;
}

/// A field id a record holds a value under (customFieldIds).
@DataClassName('ItemFieldIdRow')
@TableIndex(name: 'item_field_ids_item', columns: {#itemId})
class ItemFieldIds extends Table {
  TextColumn get fieldId => text()();
  TextColumn get itemId => text()();

  @override
  Set<Column> get primaryKey => {fieldId, itemId};

  @override
  bool get withoutRowId => true;
}

/// The customer's Main Categories, Categories and Subcategories, and the
/// local settings (hidden, order, rename, merge) of built-in ones.
@DataClassName('TaxonomyNodeRow')
@TableIndex(name: 'taxonomy_parent', columns: {#parentId})
class TaxonomyNodes extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  TextColumn get name => text().withDefault(const Constant(''))();
  TextColumn get icon => text().withDefault(const Constant('📦'))();
  TextColumn get level => text().nullable()();
  TextColumn get source => text().nullable()();
  TextColumn get parentId => text().nullable()();
  BoolColumn get hidden => boolean().withDefault(const Constant(false))();
  BoolColumn get pinned => boolean().withDefault(const Constant(false))();
  RealColumn get sortOrder => real().nullable()();
  TextColumn get mergedInto => text().nullable()();
  TextColumn get template => text().nullable()();
  TextColumn get fieldsJson => text().withDefault(const Constant('[]'))();
  IntColumn get taxonomyVersion => integer().nullable()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Field definitions kept for as long as any record may hold a value.
@DataClassName('FieldDefinitionRow')
class FieldDefinitions extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  TextColumn get type => text()();
  TextColumn get label => text()();

  /// The full normalised definition (options, unit, validation, catalog…).
  TextColumn get definitionJson => text()();
  BoolColumn get retired => boolean().withDefault(const Constant(false))();
  IntColumn get retiredAt => integer().nullable()();
  BoolColumn get recovered => boolean().withDefault(const Constant(false))();
  TextColumn get originalTaxonomyNodeId => text().nullable()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// The customer's own catalog entries (`source = custom`, ids `cust_…`).
@DataClassName('CustomCatalogEntityRow')
@TableIndex(name: 'catalog_custom_level', columns: {#entityType, #parentId})
class CustomCatalogEntities extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  TextColumn get domainsJson => text()();
  TextColumn get entityType => text()();
  TextColumn get parentId => text().nullable()();
  TextColumn get nameAr => text().withDefault(const Constant(''))();
  TextColumn get nameEn => text().withDefault(const Constant(''))();
  TextColumn get aliasesArJson => text().withDefault(const Constant('[]'))();
  TextColumn get aliasesEnJson => text().withDefault(const Constant('[]'))();
  TextColumn get code => text().nullable()();
  TextColumn get metadataJson => text().withDefault(const Constant('{}'))();
  TextColumn get status => text().withDefault(const Constant('active'))();
  TextColumn get redirectTo => text().nullable()();
  TextColumn get sortKey => text().withDefault(const Constant(''))();
  IntColumn get createdAt => integer().nullable()();
  IntColumn get updatedAt => integer().nullable()();
  IntColumn get retiredAt => integer().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('LocationRow')
class Locations extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  TextColumn get name => text()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('FolderRow')
class Folders extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  TextColumn get name => text()();
  TextColumn get description => text().withDefault(const Constant(''))();
  TextColumn get icon => text().withDefault(const Constant('🗂'))();
  TextColumn get color => text().withDefault(const Constant('#007AFF'))();
  IntColumn get createdAt => integer()();
  TextColumn get createdBy => text().nullable()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Image metadata. The bytes live on the filesystem under the app's media
/// directory; paths are relative to it and are an implementation detail —
/// `id` (mediaId) is the identity.
@DataClassName('MediaAssetRow')
@TableIndex(name: 'media_orphaned', columns: {#refCount, #orphanedAt})
class MediaAssets extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  TextColumn get relativePath => text().nullable()();
  TextColumn get thumbnailPath => text().nullable()();
  TextColumn get mimeType => text().nullable()();
  IntColumn get fileSize => integer().nullable()();
  IntColumn get width => integer().nullable()();
  IntColumn get height => integer().nullable()();
  TextColumn get sha256 => text().nullable()();
  TextColumn get originalFilename => text().nullable()();
  IntColumn get refCount => integer().withDefault(const Constant(0))();
  IntColumn get orphanedAt => integer().nullable()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('ActivityRow')
@TableIndex(name: 'activity_time', columns: {#timestamp})
class Activity extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceId => text().withDefault(const Constant('local'))();
  IntColumn get timestamp => integer()();
  TextColumn get kind => text()();
  TextColumn get dataJson => text().withDefault(const Constant('{}'))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Preferences and small device state (the reference's `meta` store).
@DataClassName('SettingRow')
class Settings extends Table {
  TextColumn get key => text()();
  TextColumn get valueJson => text()();

  @override
  Set<Column> get primaryKey => {key};
}

/// The inventory aggregate (aggregates.js schema), kept in the same
/// transaction as every item write. One row per key.
@DataClassName('AggregateRow')
class Aggregates extends Table {
  TextColumn get key => text()();
  IntColumn get schema => integer()();
  TextColumn get dataJson => text()();
  IntColumn get builtAt => integer().nullable()();

  @override
  Set<Column> get primaryKey => {key};
}

/// Writes waiting for the cloud. Serializable records only; dormant while
/// cloud is off.
@DataClassName('PendingMutationRow')
@TableIndex(name: 'mutations_status', columns: {#status, #createdAt})
@TableIndex(name: 'mutations_entity', columns: {#entityType, #entityId})
class PendingMutations extends Table {
  TextColumn get mutationId => text()();
  TextColumn get workspaceId => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get operation => text()();
  IntColumn get baseVersion => integer().nullable()();
  TextColumn get payloadJson => text()();
  IntColumn get createdAt => integer()();
  IntColumn get attemptCount => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  TextColumn get status => text()();

  @override
  Set<Column> get primaryKey => {mutationId};
}

/// A Full Restore's persisted state machine.
@DataClassName('RestoreJobRow')
class RestoreJobs extends Table {
  TextColumn get id => text()();
  TextColumn get restoreKey => text()();
  TextColumn get status => text()();
  TextColumn get stateJson => text()();
  IntColumn get startedAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Which records, definitions and images an incoming backup holds — on disk,
/// never as an in-memory set of every id.
@DataClassName('RestoreIndexRow')
class RestoreIndex extends Table {
  TextColumn get job => text()();
  TextColumn get collection => text()();
  TextColumn get entryId => text()();

  @override
  Set<Column> get primaryKey => {job, collection, entryId};

  @override
  bool get withoutRowId => true;
}

/// Scratch space for whole-inventory passes (reconciliation, backup refs).
@DataClassName('WorkIndexRow')
class WorkIndex extends Table {
  TextColumn get run => text()();
  TextColumn get kind => text()();
  TextColumn get entryId => text()();
  IntColumn get value => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {run, kind, entryId};

  @override
  bool get withoutRowId => true;
}

@DataClassName('ImportJobRow')
@TableIndex(name: 'import_jobs_fingerprint', columns: {#fileFingerprint})
@TableIndex(name: 'import_jobs_status', columns: {#status, #startedAt})
class ImportJobs extends Table {
  TextColumn get id => text()();
  TextColumn get fileFingerprint => text()();
  TextColumn get status => text()();
  TextColumn get stateJson => text()();
  IntColumn get startedAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// The last backups made on this device (degraded or complete).
@DataClassName('BackupMetadataRow')
class BackupMetadata extends Table {
  TextColumn get id => text()();
  TextColumn get kind => text()();
  TextColumn get dataJson => text()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Recent and frequent catalog choices, per picker level; device only.
@DataClassName('CatalogUsageRow')
@TableIndex(name: 'catalog_usage_level', columns: {#level, #lastUsedAt})
class CatalogUsage extends Table {
  TextColumn get level => text()();
  TextColumn get entityId => text()();
  IntColumn get useCount => integer().withDefault(const Constant(0))();
  IntColumn get lastUsedAt => integer()();

  @override
  Set<Column> get primaryKey => {level, entityId};

  @override
  bool get withoutRowId => true;
}
