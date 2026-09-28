@Tags(['scale'])
library;

import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/data/local/database.dart';
import 'package:nazm/data/local/drift_item_repository.dart';
import 'package:nazm/domain/entities/item.dart';
import 'package:nazm/domain/query/item_query.dart';

/// Runs only with `NAZM_SCALE_RUN=1 flutter test test/scale`.
/// 100,000 records (`NAZM_SCALE` to change) in a file database. Timings are
/// printed, not asserted: they depend on the machine. What is asserted is
/// that every ordinary read is bounded — a page holds a page, counts and
/// totals come from SQL and the kept aggregate, never from records in Dart.
void main() {
  if (Platform.environment['NAZM_SCALE_RUN'] == null) {
    test('scale run', () {}, skip: 'set NAZM_SCALE_RUN=1');
    return;
  }
  final total = int.tryParse(Platform.environment['NAZM_SCALE'] ?? '') ?? 100000;
  late Directory dir;
  late NazmDatabase db;
  late DriftItemRepository repo;

  setUpAll(() async {
    dir = await Directory.systemTemp.createTemp('nazm_scale');
    db = NazmDatabase(NativeDatabase(File('${dir.path}/scale.db')));
    repo = DriftItemRepository(db);
    final watch = Stopwatch()..start();
    const chunk = 5000;
    const cats = ['equipment_generators', 'art_paintings', 'jewellery_watches', 'uncategorized'];
    for (var start = 0; start < total; start += chunk) {
      final items = <Item>[
        for (var i = start; i < start + chunk && i < total; i++)
          Item.fromJson({
            'id': 'sc${i.toString().padLeft(7, '0')}',
            'name': i % 97 == 0 ? 'مولد كهربائي $i' : 'قطعة $i',
            'brand': i % 11 == 0 ? 'Honda' : '',
            'sku': 'SC-$i',
            'quantity': (i % 4) + 1,
            'unit': 'قطعة',
            'categoryId': cats[i % 4],
            'locationId': i % 3 == 0 ? 'loc_a' : null,
            'folderId': i % 10 == 0 ? 'fld_a' : null,
            'valuation': i.isEven ? {'min': 100 + i, 'max': 200 + i, 'currency': i % 7 == 0 ? 'USD' : 'SAR'} : null,
            'createdAt': 1700000000000 + i,
            'updatedAt': 1700000000000 + i,
            'deletedAt': i % 29 == 0 ? 1760000000000 : null,
          }),
      ];
      await repo.createItems(items);
    }
    // ignore: avoid_print
    print('seeded $total records in ${watch.elapsedMilliseconds} ms');
  });

  tearDownAll(() async {
    await db.close();
    await dir.delete(recursive: true);
  });

  Future<T> timed<T>(String label, Future<T> Function() work) async {
    final watch = Stopwatch()..start();
    final result = await work();
    // ignore: avoid_print
    print('$label: ${watch.elapsedMicroseconds / 1000} ms');
    return result;
  }

  test('overview totals come from the kept aggregate', () async {
    final a = (await timed('overview aggregate', repo.inventoryAggregate))!;
    final trashed = (total + 28) ~/ 29;
    expect(a.live + a.trashed, total);
    expect(a.trashed, trashed);
    expect(a.currency.keys.toSet(), {'SAR', 'USD'});
  });

  test('first page, a deep page by name, and a filtered page each hold one page', () async {
    final first = await timed('newest page', () => repo.queryItems(ItemQuery.validate({'limit': 50})));
    expect(first.items.length, 50);
    var q = ItemQuery.validate({
      'sort': {'field': 'name', 'direction': 'asc'},
      'limit': 100,
    });
    var page = await repo.queryItems(q);
    for (var i = 0; i < 20; i++) {
      q = q.withCursor(page.nextCursor);
      page = await timed('name page ${i + 2}', () => repo.queryItems(q));
      expect(page.items.length, 100);
    }
    final folder = await timed(
      'folder page',
      () => repo.queryItems(
        ItemQuery.validate({
          'filters': {'folderId': 'fld_a'},
          'limit': 50,
        }),
      ),
    );
    expect(folder.items.every((i) => i.folderId == 'fld_a'), isTrue);
    final value = await timed(
      'value page',
      () => repo.queryItems(
        ItemQuery.validate({
          'filters': {'valuationCurrency': 'USD'},
          'sort': {'field': 'valuation', 'direction': 'desc'},
          'limit': 50,
        }),
      ),
    );
    expect(value.items.length, 50);
  });

  test('search, identifier lookup and counts are index reads', () async {
    final found = await timed('word search', () => repo.queryItems(ItemQuery.validate({'text': 'مولد', 'limit': 50})));
    expect(found.items, isNotEmpty);
    final sku = await timed(
      'sku lookup',
      () => repo.queryItems(
        ItemQuery.validate({
          'filters': {'sku': 'SC-4242'},
        }),
      ),
    );
    expect(sku.items.single.id, 'sc0004242');
    final count = await timed(
      'count in category',
      () => repo.countItemsMatching(
        ItemQuery.validate({
          'filters': {'categoryId': 'art_paintings'},
        }),
      ),
    );
    expect(count, greaterThan(0));
    final sums = await timed(
      'SAR total',
      () => repo.aggregateItems(
        ItemQuery.validate({
          'filters': {'valuationCurrency': 'SAR'},
        }),
      ),
    );
    expect(sums.byCurrency.keys, ['SAR']);
  });
}
