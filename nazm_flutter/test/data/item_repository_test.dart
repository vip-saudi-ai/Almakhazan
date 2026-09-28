import 'dart:convert';

import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/core/errors/app_error.dart';
import 'package:nazm/data/local/database.dart';
import 'package:nazm/data/local/drift_item_repository.dart';
import 'package:nazm/domain/entities/inventory_aggregate.dart';
import 'package:nazm/domain/entities/item.dart';
import 'package:nazm/domain/query/item_query.dart';
import 'package:nazm/domain/repositories/capabilities.dart';
import 'package:nazm/domain/services/item_index.dart';

import '../fixtures.dart';

void main() {
  final contract = fixture('contract.json')! as Map<String, Object?>;
  final dataset = [for (final r in contract['items']! as List) Item.fromJson(Map<String, Object?>.from(r as Map))];

  late NazmDatabase db;
  late DriftItemRepository repo;
  var now = 1800000000000;
  setUp(() {
    db = NazmDatabase(NativeDatabase.memory());
    repo = DriftItemRepository(db, clock: () => ++now);
  });
  tearDown(() => db.close());

  test('search tokens and catalog references match the reference for every record', () {
    final tokens = contract['tokens']! as Map<String, Object?>;
    final refs = contract['catalogRefs']! as Map<String, Object?>;
    for (final item in dataset) {
      expect(searchTokensOf(item), tokens[item.id], reason: item.id);
      expect(catalogRefsOf(item), refs[item.id], reason: item.id);
    }
  });

  test('every contract query returns the reference\'s records, in the reference\'s order, page by page', () async {
    await repo.createItems(dataset);
    for (final spec in (contract['specs']! as List).cast<Map<String, Object?>>()) {
      final input = Map<String, Object?>.from(spec['input']! as Map);
      final expected = (spec['ids']! as List).cast<String>();
      var query = ItemQuery.validate({...input, 'limit': 37});
      final got = <String>[];
      var pages = 0;
      for (;;) {
        final page = await repo.queryItems(query);
        got.addAll(page.items.map((i) => i.id));
        pages++;
        if (!page.hasMore) break;
        query = query.withCursor(page.nextCursor);
        expect(pages, lessThan(50));
      }
      expect(got, expected, reason: jsonEncode(input));
      expect(await repo.countItemsMatching(ItemQuery.validate(input)), expected.length, reason: jsonEncode(input));
    }
  });

  test('records read back exactly as written', () async {
    await repo.createItems(dataset);
    final back = await repo.getItems([for (final i in dataset) i.id]);
    expect(back.length, dataset.length);
    for (var i = 0; i < dataset.length; i++) {
      expect(jsonEncode(back[i].toJson()), jsonEncode(dataset[i].toJson()), reason: dataset[i].id);
    }
  });

  test('the kept aggregate follows every write and equals a rebuild', () async {
    await repo.createItems(dataset.take(200).toList());
    for (final item in dataset.skip(200)) {
      await repo.createItem(item);
    }
    final live = dataset.firstWhere((i) => !i.isDeleted);
    await repo.updateItem(Item.fromJson({...live.toJson(), 'quantity': 99, 'locationId': 'loc_z'}));
    await repo.trashItem(dataset.firstWhere((i) => !i.isDeleted && i.id != live.id).id);
    await repo.restoreItem(dataset.firstWhere((i) => i.isDeleted).id);
    await repo.purgeItem(dataset.last.id);

    final kept = (await repo.inventoryAggregate())!.toJson()..remove('builtAt');
    final rebuilt = (await repo.rebuildAggregates()).toJson()..remove('builtAt');
    // Same numbers; key order inside a breakdown is not meaningful.
    expect(jsonDecode(jsonEncode(kept)), jsonDecode(jsonEncode(rebuilt)));
    expect(kept['live'], await repo.countItemsMatching(ItemQuery.validate({})));
  });

  test('per-currency aggregation never adds currencies together', () async {
    await repo.createItems(dataset);
    final sar = await repo.aggregateItems(
      ItemQuery.validate({
        'filters': {'valuationCurrency': 'SAR'},
      }),
    );
    final expected = dataset.where((i) => !i.isDeleted && i.valuation?.currency == 'SAR');
    expect(sar.count, expected.length);
    expect(sar.byCurrency.keys, ['SAR']);
    expect(sar.byCurrency['SAR']!.total, closeTo(expected.fold<double>(0, (s, i) => s + i.valuation!.midpoint), 1e-6));
    final all = await repo.aggregateItems(ItemQuery.validate({}));
    expect(all.byCurrency.keys.toSet(), {'SAR', 'USD'});
  });

  Item fresh(String id, {String sku = ''}) => Item(
    id: id,
    name: 'قطعة $id',
    sku: sku,
    categoryId: 'uncategorized',
    unit: 'قطعة',
    createdAt: 1,
    updatedAt: 1,
    valuation: Valuation(min: Decimal.parse('1500.5'), max: Decimal.parse('1500.5'), currency: 'USD'),
  );

  Future<String?> code(Future<void> f) async {
    try {
      await f;
      return null;
    } on AppError catch (e) {
      return e.code;
    }
  }

  test('SKU uniqueness holds on create, update, batch and Trash restore; a trashed SKU may be reused', () async {
    await repo.createItem(fresh('a', sku: 'X-1'));
    expect(await code(repo.createItem(fresh('b', sku: 'X-1'))), 'repo/sku-conflict');
    expect(await code(repo.createItems([fresh('c', sku: 'Y'), fresh('d', sku: 'Y')])), 'repo/sku-conflict');
    expect(await repo.getItem('c'), isNull, reason: 'a refused batch writes nothing');
    await repo.createItem(fresh('b', sku: 'X-2'));
    expect(
      await code(repo.updateItem(Item.fromJson({...(await repo.getItem('b'))!.toJson(), 'sku': 'X-1'}))),
      'repo/sku-conflict',
    );
    await repo.trashItem('a');
    await repo.createItem(fresh('e', sku: 'X-1'));
    expect(await code(repo.restoreItem('a')), 'repo/sku-conflict');
  });

  test('a stale version is refused, not overwritten', () async {
    await repo.createItem(fresh('v'));
    final first = await repo.updateItem(
      Item.fromJson({...(await repo.getItem('v'))!.toJson(), 'name': 'أ'}),
      expectedVersion: 1,
    );
    expect(first.version, 2);
    expect(
      await code(repo.updateItem(Item.fromJson({...first.toJson(), 'name': 'ب'}), expectedVersion: 1)),
      'repo/conflict',
    );
    expect((await repo.getItem('v'))!.name, 'أ');
  });

  test('purging a record releases its media references', () async {
    await db
        .into(db.mediaAssets)
        .insert(MediaAssetsCompanion.insert(id: 'img_9', createdAt: 1, refCount: const Value(1)));
    await repo.createItem(
      Item.fromJson({
        ...fresh('p').toJson(),
        'images': [
          {'id': 'img_9', 'mediaId': 'img_9', 'storagePath': 'local:img_9'},
        ],
      }),
    );
    await repo.purgeItem('p');
    final asset = await (db.select(db.mediaAssets)..where((m) => m.id.equals('img_9'))).getSingle();
    expect(asset.refCount, 0);
    expect(asset.orphanedAt, isNotNull);
    expect(await repo.getItem('p'), isNull);
  });

  test('duplicate candidates are the records sharing an identifier or a name, bounded', () async {
    await repo.createItems([
      Item.fromJson({...fresh('s1').toJson(), 'serialNumber': 'SN-7', 'name': 'أ'}),
      Item.fromJson({...fresh('s2').toJson(), 'serialNumber': 'SN-7', 'name': 'ب'}),
      Item.fromJson({...fresh('n1').toJson(), 'name': 'مولد'}),
      Item.fromJson({...fresh('n2').toJson(), 'name': 'مولّد'}),
      Item.fromJson({...fresh('solo').toJson(), 'name': 'فريد'}),
    ]);
    final found = (await repo.duplicateCandidates())!;
    expect(found.items.map((i) => i.id).toSet(), {'s1', 's2', 'n1', 'n2'});
    expect(found.truncated, isFalse);
    expect((await repo.duplicateCandidates(limit: 2))!.truncated, isTrue);
  });

  test('the whole-inventory stream is paged and needs a declared purpose', () async {
    await repo.createItems(dataset);
    var pages = 0;
    var seen = 0;
    await for (final page in repo.scanAll(purpose: WholeDatasetPurpose.export, pageSize: 64)) {
      expect(page.length, lessThanOrEqualTo(64));
      pages++;
      seen += page.length;
    }
    expect(seen, dataset.length);
    expect(pages, (dataset.length / 64).ceil());
    expect(repo.capabilities.wholeInventoryRead, isTrue);
  });

  test('a stored aggregate of the current schema is read, not rebuilt', () async {
    await repo.createItems(dataset.take(10).toList());
    final a = await repo.inventoryAggregate();
    expect(a, isA<InventoryAggregate>());
    expect(a!.live + a.trashed, 10);
  });
}
