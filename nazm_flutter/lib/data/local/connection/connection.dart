// Opens the device database: native SQLite on iOS and Android, and a
// WebAssembly SQLite (sql.js, persisted in IndexedDB) in the web preview.

export 'connection_native.dart' if (dart.library.js_interop) 'connection_web.dart';
