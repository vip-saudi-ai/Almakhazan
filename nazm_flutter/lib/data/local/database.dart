import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import '../../core/versions.dart';
import 'tables.dart';

part 'database.g.dart';

/// The device database. One per workspace on this device (today: `local`).
@DriftDatabase(
  tables: [
    Items,
    ItemTokens,
    ItemCatalogRefs,
    ItemFieldIds,
    TaxonomyNodes,
    FieldDefinitions,
    CustomCatalogEntities,
    Locations,
    Folders,
    MediaAssets,
    Activity,
    Settings,
    Aggregates,
    PendingMutations,
    RestoreJobs,
    RestoreIndex,
    WorkIndex,
    ImportJobs,
    BackupMetadata,
    CatalogUsage,
  ],
)
class NazmDatabase extends _$NazmDatabase {
  NazmDatabase(super.executor);

  /// Opens the on-device database in the app's support directory.
  factory NazmDatabase.open({String name = 'nazm'}) => NazmDatabase(driftDatabase(name: name));

  @override
  int get schemaVersion => Versions.databaseSchema;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) => m.createAll(),
    // Later versions add steps here. A schema change never wipes data.
    onUpgrade: (m, from, to) async {},
    beforeOpen: (details) async {
      await customStatement('PRAGMA foreign_keys = ON');
      // WAL keeps readers (lists) unblocked by a long writer (import,
      // restore). In-memory test databases report 'memory' and ignore it.
      await customSelect('PRAGMA journal_mode = WAL').get();
    },
  );
}
