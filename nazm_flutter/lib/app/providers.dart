// Application-wide providers. Features add their own next to their code;
// these are the few every feature shares.

import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/local/database.dart';
import 'config/features.dart';

/// The device database. Overridden in tests with an in-memory one.
final databaseProvider = Provider<NazmDatabase>((ref) {
  final db = NazmDatabase.open();
  ref.onDispose(db.close);
  return db;
});

final featureFlagsProvider = Provider<FeatureFlags>((ref) => FeatureFlags.release.consistent);

final releaseLinksProvider = Provider<ReleaseLinks>((ref) => ReleaseLinks.release);

const _languageKey = 'language';
const _themeKey = 'theme';

/// The chosen language: null until the customer picks one on first launch
/// (the reference's language gate), then 'ar' or 'en', kept on the device.
class LocaleController extends AsyncNotifier<Locale?> {
  @override
  Future<Locale?> build() async {
    final code = await _read(ref, _languageKey);
    return code == 'ar' || code == 'en' ? Locale(code as String) : null;
  }

  Future<void> choose(Locale locale) async {
    await _write(ref, _languageKey, locale.languageCode);
    state = AsyncData(locale);
  }
}

final localeProvider = AsyncNotifierProvider<LocaleController, Locale?>(LocaleController.new);

/// Light, dark or following the system (the default).
class ThemeModeController extends AsyncNotifier<ThemeMode> {
  @override
  Future<ThemeMode> build() async {
    final value = await _read(ref, _themeKey);
    return ThemeMode.values.firstWhere((m) => m.name == value, orElse: () => ThemeMode.system);
  }

  Future<void> choose(ThemeMode mode) async {
    await _write(ref, _themeKey, mode.name);
    state = AsyncData(mode);
  }
}

final themeModeProvider = AsyncNotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

Future<Object?> _read(Ref ref, String key) async {
  final db = ref.read(databaseProvider);
  final row = await (db.select(db.settings)..where((s) => s.key.equals(key))).getSingleOrNull();
  return row == null ? null : jsonDecode(row.valueJson);
}

Future<void> _write(Ref ref, String key, Object? value) async {
  final db = ref.read(databaseProvider);
  await db
      .into(db.settings)
      .insertOnConflictUpdate(SettingsCompanion(key: Value(key), valueJson: Value(jsonEncode(value))));
}
