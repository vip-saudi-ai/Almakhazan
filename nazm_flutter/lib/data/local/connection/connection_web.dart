// The web preview only. drift's sql.js backend is its older web backend; the
// newer one needs a sqlite3.wasm build that is not available to this build
// environment. Production targets are iOS and Android (native SQLite).
// ignore_for_file: deprecated_member_use, experimental_member_use

import 'package:drift/drift.dart';
import 'package:drift/web.dart';

QueryExecutor openConnection(String name) => WebDatabase.withStorage(DriftWebStorage.indexedDb(name));
