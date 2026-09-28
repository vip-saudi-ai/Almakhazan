import 'dart:convert';
import 'dart:io';

/// A golden fixture written by `tool/export_fixtures.mjs` from the reference.
Object? fixture(String name) => jsonDecode(File('test/fixtures/$name').readAsStringSync());
