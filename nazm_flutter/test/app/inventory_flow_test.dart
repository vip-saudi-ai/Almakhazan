import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/app/app.dart';
import 'package:nazm/app/providers.dart';
import 'package:nazm/data/local/database.dart';
import 'package:nazm/domain/query/item_query.dart';
import 'package:nazm/features/taxonomy/domain/builtin_taxonomy.dart';

void main() {
  testWidgets('add with a name only, add the next, open, trash, restore — and the overview counts', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final db = NazmDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    // Assets are read from disk here: the bundle loads on a real clock the
    // widget test's fake clock does not advance.
    final taxonomy = BuiltinTaxonomy.fromJson(File('assets/taxonomy/taxonomy.json').readAsStringSync());
    await tester.pumpWidget(
      ProviderScope(
        overrides: [databaseProvider.overrideWithValue(db), taxonomyProvider.overrideWith((ref) async => taxonomy)],
        child: const NazmApp(),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('No items yet.'), findsOneWidget);

    // A name is all a record needs.
    await tester.tap(find.text('Add item'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the item name'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'Generator');
    await tester.enterText(find.widgetWithText(TextFormField, 'SKU'), 'GEN-1');
    await tester.tap(find.text('Save & Add Next'));
    await tester.pumpAndSettle();
    expect(find.text('Saved — add the next one'), findsOneWidget);
    // The identifier did not carry over.
    final sku = tester.widget<TextField>(
      find.descendant(of: find.widgetWithText(TextFormField, 'SKU'), matching: find.byType(TextField)),
    );
    expect(sku.controller!.text, isEmpty);
    await tester.enterText(find.byType(TextFormField).first, 'Painting');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Generator'), findsOneWidget);
    expect(find.text('Painting'), findsOneWidget);

    // Detail, then Trash.
    await tester.tap(find.text('Generator'));
    await tester.pumpAndSettle();
    expect(find.text('GEN-1'), findsOneWidget);
    await tester.tap(find.byTooltip('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.text('Generator'), findsNothing);

    final repo = ProviderScope.containerOf(tester.element(find.byType(NavigationBar))).read(itemRepositoryProvider);
    expect(await repo.countItemsMatching(ItemQuery.validate({})), 1);
    expect(
      await repo.countItemsMatching(
        ItemQuery.validate({
          'filters': {'deleted': true},
        }),
      ),
      1,
    );

    // Restore from the Trash.
    await tester.tap(find.byTooltip('Trash'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Restore'));
    await tester.pumpAndSettle();
    expect(find.text('Item restored'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Generator'), findsOneWidget);

    // The overview reads the kept aggregate: two live records.
    await tester.tap(find.text('Overview').last);
    await tester.pumpAndSettle();
    expect(find.text('Records'), findsOneWidget);
    expect(find.text('2'), findsWidgets);
  });
}
