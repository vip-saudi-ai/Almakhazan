import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/app/app.dart';
import 'package:nazm/app/config/features.dart';
import 'package:nazm/app/providers.dart';
import 'package:nazm/data/local/database.dart';

void main() {
  test('the release switches every cloud feature off, and dependents follow', () {
    const release = FeatureFlags.release;
    expect([release.cloud, release.accounts, release.team, release.billing, release.cloudAi], everyElement(isFalse));
    const inconsistent = FeatureFlags(team: true, billing: true, cloudAi: true, accounts: true);
    final c = inconsistent.consistent;
    expect([c.accounts, c.team, c.billing, c.cloudAi], everyElement(isFalse));
  });

  Future<NazmDatabase> pumpApp(WidgetTester tester) async {
    final db = NazmDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await tester.pumpWidget(ProviderScope(overrides: [databaseProvider.overrideWithValue(db)], child: const NazmApp()));
    await tester.pumpAndSettle();
    return db;
  }

  testWidgets('first launch asks for the language, then opens in Arabic, right to left', (tester) async {
    await pumpApp(tester);
    expect(find.text('اختر اللغة'), findsOneWidget);
    expect(find.text('Choose your language'), findsOneWidget);
    await tester.tap(find.text('العربية'));
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);
    final direction = Directionality.of(tester.element(find.byType(NavigationBar)));
    expect(direction, TextDirection.rtl);
  });

  testWidgets('English opens left to right, and the choice is kept', (tester) async {
    final db = await pumpApp(tester);
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(Directionality.of(tester.element(find.byType(NavigationBar))), TextDirection.ltr);
    expect(find.text('Overview'), findsWidgets);
    final stored = await (db.select(db.settings)..where((s) => s.key.equals('language'))).getSingle();
    expect(stored.valueJson, '"en"');
  });
}
