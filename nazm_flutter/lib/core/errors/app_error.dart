/// Where an error came from, for mapping to a message the customer can act on.
enum ErrorArea { database, filesystem, camera, backup, restore, catalog, import, query, repository, network, unknown }

/// An application error: a stable [code] (the reference's codes, e.g.
/// `query/invalid`, `repo/unbounded-read`, `catalog/duplicate-builtin`), the
/// area it belongs to, and whatever the thrower knows ([details]) — never a
/// database's or a platform's own message shown to the customer.
class AppError implements Exception {
  AppError(this.code, {this.details = const {}, this.cause, ErrorArea? area}) : area = area ?? _areaOf(code);

  final String code;
  final ErrorArea area;
  final Map<String, Object?> details;
  final Object? cause;

  /// The localisation key the reference uses for this code, if any
  /// (`error.<code>`); the presentation layer resolves it.
  String get messageKey => 'error.$code';

  static ErrorArea _areaOf(String code) {
    final prefix = code.split('/').first;
    return switch (prefix) {
      'db' || 'idb' => ErrorArea.database,
      'file' || 'fs' => ErrorArea.filesystem,
      'camera' || 'scan' => ErrorArea.camera,
      'backup' => ErrorArea.backup,
      'restore' => ErrorArea.restore,
      'catalog' => ErrorArea.catalog,
      'import' => ErrorArea.import,
      'query' => ErrorArea.query,
      'repo' => ErrorArea.repository,
      'network' || 'cloud' => ErrorArea.network,
      _ => ErrorArea.unknown,
    };
  }

  @override
  String toString() => 'AppError($code${details.isEmpty ? '' : ', $details'})';
}
