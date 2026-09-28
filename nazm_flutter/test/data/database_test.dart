import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/data/local/database.dart';

void main() {
  late NazmDatabase db;
  setUp(() => db = NazmDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<List<String>> names(String type) async => [
    for (final row
        in await db
            .customSelect("SELECT name FROM sqlite_master WHERE type = '$type' AND name NOT LIKE 'sqlite_%'")
            .get())
      row.read<String>('name'),
  ];

  test('every table of the reference data model exists', () async {
    final tables = await names('table');
    for (final t in [
      'items',
      'item_tokens',
      'item_catalog_refs',
      'item_field_ids',
      'taxonomy_nodes',
      'field_definitions',
      'custom_catalog_entities',
      'locations',
      'folders',
      'media_assets',
      'activity',
      'settings',
      'aggregates',
      'pending_mutations',
      'restore_jobs',
      'restore_index',
      'work_index',
      'import_jobs',
      'backup_metadata',
      'catalog_usage',
    ]) {
      expect(tables, contains(t));
    }
  });

  test('records keep their own string ids', () async {
    await db
        .into(db.items)
        .insert(
          ItemsCompanion.insert(id: 'itm_mk2x9', categoryId: 'uncategorized', unit: 'قطعة', createdAt: 1, updatedAt: 1),
        );
    final row = await (db.select(db.items)..where((i) => i.id.equals('itm_mk2x9'))).getSingle();
    expect(row.id, 'itm_mk2x9');
    expect(row.deletedAt, isNull);
  });

  Future<String> plan(String sql) async =>
      (await db.customSelect('EXPLAIN QUERY PLAN $sql').get()).map((r) => r.read<String>('detail')).join(' | ');

  test('list queries are answered by their indexes, not by a scan and a sort', () async {
    final newest = await plan(
      'SELECT id FROM items WHERE deleted_at IS NULL ORDER BY deleted_at, created_at DESC, id DESC LIMIT 50',
    );
    expect(newest, contains('items_live_created'));
    expect(newest, isNot(contains('TEMP B-TREE')));

    final byName = await plan(
      'SELECT id FROM items WHERE deleted_at IS NULL ORDER BY deleted_at, name_sort_key, id LIMIT 50',
    );
    expect(byName, contains('items_live_name'));
    expect(byName, isNot(contains('TEMP B-TREE')));

    final inFolder = await plan(
      "SELECT id FROM items WHERE deleted_at IS NULL AND folder_id = 'f' ORDER BY created_at DESC LIMIT 50",
    );
    expect(inFolder, contains('items_live_folder'));

    final byValue = await plan(
      "SELECT id FROM items WHERE deleted_at IS NULL AND valuation_currency = 'SAR' ORDER BY valuation_midpoint DESC, id DESC LIMIT 50",
    );
    expect(byValue, contains('items_live_value'));
    expect(byValue, isNot(contains('TEMP B-TREE')));

    final bySku = await plan("SELECT id FROM items WHERE sku = 'X'");
    expect(bySku, contains('items_sku'));

    final token = await plan("SELECT item_id FROM item_tokens WHERE token >= 'rol' AND token < 'rom'");
    expect(token, contains('PRIMARY KEY'));
  });

  test('the restore index is a keyed table, not a set in memory', () async {
    await db.batch((b) {
      b.insertAll(db.restoreIndex, [
        for (var i = 0; i < 1000; i++) RestoreIndexCompanion.insert(job: 'r1', collection: 'items', entryId: 'itm_$i'),
      ]);
    });
    final count = await db
        .customSelect("SELECT COUNT(*) AS n FROM restore_index WHERE job = 'r1' AND collection = 'items'")
        .getSingle();
    expect(count.read<int>('n'), 1000);
    expect(
      await plan(
        "SELECT entry_id FROM restore_index WHERE job = 'r1' AND collection = 'items' AND entry_id > 'itm_5' LIMIT 500",
      ),
      contains('PRIMARY KEY'),
    );
  });
}
