/// The versions NAZM keeps apart. Each moves on its own: a catalog data
/// refresh does not change the database, a database change does not change
/// the backup format.
abstract final class Versions {
  static const appVersion = '1.0.0';

  /// Drift schema version of the device database.
  static const databaseSchema = 1;

  /// The reference IndexedDB version whose data model this schema carries
  /// (src/local-store.js). Recorded in backups the Flutter app writes.
  static const referenceDatabaseVersion = 13;

  /// Taxonomy, catalog and backup versions come from the generated reference
  /// assets and the backup format module; these are the values the Flutter
  /// app writes and accepts.
  static const backupFormatVersion = 2;
  static const minSupportedBackupFormatVersion = 1;
}
