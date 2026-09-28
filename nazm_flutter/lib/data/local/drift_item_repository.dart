// The device implementation of the item and aggregate repositories.
//
// Every write — create, update, trash, restore, purge — happens in one SQLite
// transaction together with the record's derived rows (search tokens, catalog
// references, field ids) and the change to the kept aggregate, so the
// Overview's numbers can never drift from the records. Every read is bounded:
// pages by keyset, counts and sums by SQL, never the inventory in memory.
//
// Workspace scope is the database file itself (one per workspace), so no
// query has to remember a workspace filter.

import 'dart:convert';

import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';

import '../../core/errors/app_error.dart';
import '../../core/text/arabic.dart';
import '../../domain/entities/inventory_aggregate.dart';
import '../../domain/entities/item.dart';
import '../../domain/query/item_query.dart';
import '../../domain/repositories/capabilities.dart';
import '../../domain/repositories/repositories.dart';
import '../../domain/services/item_index.dart';
import 'database.dart';

typedef Clock = int Function();

int _systemClock() => DateTime.now().toUtc().millisecondsSinceEpoch;

class DriftItemRepository implements ItemRepository, AggregateRepository {
  DriftItemRepository(this._db, {this.clock = _systemClock});

  final NazmDatabase _db;

  /// UTC milliseconds; injectable so tests are deterministic.
  final Clock clock;
  static const _batch = 500;

  @override
  BackendCapabilities get capabilities => BackendCapabilities.local;

  // ── rows ⇄ records ───────────────────────────────────────────────────────

  static String? _nonEmpty(String s) => s.isEmpty ? null : s;

  ItemsCompanion _companion(Item i) {
    final v = i.valuation;
    return ItemsCompanion(
      id: Value(i.id),
      name: Value(i.name),
      nameSortKey: Value(nameSortKey(i.name)),
      sku: Value(_nonEmpty(i.sku)),
      barcode: Value(_nonEmpty(i.barcode)),
      serialNumber: Value(_nonEmpty(i.serialNumber)),
      modelNumber: Value(_nonEmpty(i.modelNumber)),
      referenceNumber: Value(_nonEmpty(i.referenceNumber)),
      brand: Value(_nonEmpty(i.brand)),
      mainCategoryId: Value(i.mainCategoryId),
      categoryId: Value(i.categoryId),
      subcategoryId: Value(i.subcategoryId),
      legacyCategoryId: Value(i.legacyCategoryId),
      folderId: Value(i.folderId),
      locationId: Value(i.locationId),
      quantity: Value(i.quantity.toDouble()),
      unit: Value(i.unit),
      condition: Value(i.condition),
      valuationMin: Value(v?.min.toString()),
      valuationMax: Value(v?.max.toString()),
      valuationCurrency: Value(v?.currency),
      valuationMidpoint: Value(v?.midpoint),
      valuationSource: Value(v?.source),
      valuationType: Value(v?.valuationType),
      valuationDate: Value(v?.valuationDate),
      description: Value(i.description),
      imagesJson: Value(jsonEncode([for (final img in i.images) img.toJson()])),
      primaryImageId: Value(i.primaryImageId),
      hasImages: Value(i.hasImages),
      customFieldsJson: Value(jsonEncode(i.customFields)),
      customFieldDefsJson: Value(jsonEncode(i.customFieldDefs)),
      aiDataJson: Value(i.aiData == null ? null : jsonEncode(i.aiData)),
      importJobId: Value(i.importJobId),
      sourceLine: Value(i.sourceLine),
      createdAt: Value(i.createdAt),
      createdBy: Value(i.createdBy),
      updatedAt: Value(i.updatedAt),
      updatedBy: Value(i.updatedBy),
      deletedAt: Value(i.deletedAt),
      deletedBy: Value(i.deletedBy),
      version: Value(i.version),
    );
  }

  static Item _record(ItemRow r) {
    Valuation? valuation;
    if (r.valuationCurrency != null && r.valuationMin != null && r.valuationMax != null) {
      valuation = Valuation(
        min: Decimal.parse(r.valuationMin!),
        max: Decimal.parse(r.valuationMax!),
        currency: r.valuationCurrency!,
        source: r.valuationSource,
        valuationType: r.valuationType,
        valuationDate: r.valuationDate,
      );
    }
    final q = r.quantity;
    return Item(
      id: r.id,
      name: r.name,
      sku: r.sku ?? '',
      barcode: r.barcode ?? '',
      serialNumber: r.serialNumber ?? '',
      modelNumber: r.modelNumber ?? '',
      referenceNumber: r.referenceNumber ?? '',
      brand: r.brand ?? '',
      mainCategoryId: r.mainCategoryId,
      categoryId: r.categoryId,
      subcategoryId: r.subcategoryId,
      legacyCategoryId: r.legacyCategoryId,
      customFields: Map<String, Object?>.from(jsonDecode(r.customFieldsJson) as Map),
      customFieldDefs: [for (final d in jsonDecode(r.customFieldDefsJson) as List) Map<String, Object?>.from(d as Map)],
      folderId: r.folderId,
      locationId: r.locationId,
      quantity: q == q.truncateToDouble() && q.abs() < 9007199254740992 ? q.toInt() : q,
      unit: r.unit,
      condition: r.condition,
      valuation: valuation,
      description: r.description,
      images: [for (final i in jsonDecode(r.imagesJson) as List) ItemImage(Map<String, Object?>.from(i as Map))],
      primaryImageId: r.primaryImageId,
      aiData: r.aiDataJson == null ? null : Map<String, Object?>.from(jsonDecode(r.aiDataJson!) as Map),
      importJobId: r.importJobId,
      sourceLine: r.sourceLine,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
      deletedAt: r.deletedAt,
      deletedBy: r.deletedBy,
      version: r.version,
    );
  }

  // ── writes ───────────────────────────────────────────────────────────────

  Future<void> _writeDerived(Item item) async {
    await (_db.delete(_db.itemTokens)..where((t) => t.itemId.equals(item.id))).go();
    await (_db.delete(_db.itemCatalogRefs)..where((t) => t.itemId.equals(item.id))).go();
    await (_db.delete(_db.itemFieldIds)..where((t) => t.itemId.equals(item.id))).go();
    await _db.batch((b) {
      b.insertAll(_db.itemTokens, [
        for (final t in searchTokensOf(item)) ItemTokensCompanion.insert(token: t, itemId: item.id),
      ], mode: InsertMode.insertOrIgnore);
      b.insertAll(_db.itemCatalogRefs, [
        for (final r in catalogRefsOf(item)) ItemCatalogRefsCompanion.insert(ref: r, itemId: item.id),
      ]);
      b.insertAll(_db.itemFieldIds, [
        for (final f in item.customFieldIds) ItemFieldIdsCompanion.insert(fieldId: f, itemId: item.id),
      ]);
    });
  }

  Future<void> _deleteDerived(String id) async {
    await (_db.delete(_db.itemTokens)..where((t) => t.itemId.equals(id))).go();
    await (_db.delete(_db.itemCatalogRefs)..where((t) => t.itemId.equals(id))).go();
    await (_db.delete(_db.itemFieldIds)..where((t) => t.itemId.equals(id))).go();
  }

  /// A live record already holding this SKU, other than [exceptId].
  Future<void> _assertSkuFree(String sku, {String? exceptId}) async {
    if (sku.isEmpty) return;
    final query = _db.select(_db.items)
      ..where((i) => i.sku.equals(sku) & i.deletedAt.isNull())
      ..limit(1);
    if (exceptId != null) query.where((i) => i.id.equals(exceptId).not());
    final clash = await query.getSingleOrNull();
    if (clash != null) {
      throw AppError('repo/sku-conflict', details: {'sku': sku, 'itemId': clash.id});
    }
  }

  Future<ItemRow?> _row(String id) => (_db.select(_db.items)..where((i) => i.id.equals(id))).getSingleOrNull();

  /// Runs [body] in one transaction with the kept aggregate loaded before any
  /// record changes (rebuilt from the records first if none is stored), and
  /// saves it after — so a write can never count its own rows twice.
  Future<T> _write<T>(Future<T> Function(InventoryAggregate aggregate) body) => _db.transaction(() async {
    final aggregate = await _loadAggregate() ?? await _rebuild();
    final result = await body(aggregate);
    await _saveAggregate(aggregate);
    return result;
  });

  @override
  Future<Item> createItem(Item item) => _write((aggregate) async {
    if (await _row(item.id) != null) throw AppError('repo/exists', details: {'itemId': item.id});
    if (!item.isDeleted) await _assertSkuFree(item.sku);
    await _db.into(_db.items).insert(_companion(item));
    await _writeDerived(item);
    aggregate.apply(item, 1);
    return item;
  });

  @override
  Future<void> createItems(List<Item> items) => _write((aggregate) async {
    if (items.isEmpty) return;
    final ids = [for (final i in items) i.id];
    if (ids.toSet().length != ids.length) throw AppError('repo/exists', details: {'detail': 'duplicate id in batch'});
    for (var i = 0; i < ids.length; i += _batch) {
      final slice = ids.sublist(i, i + _batch > ids.length ? ids.length : i + _batch);
      final taken =
          await (_db.selectOnly(_db.items)
                ..addColumns([_db.items.id])
                ..where(_db.items.id.isIn(slice))
                ..limit(1))
              .getSingleOrNull();
      if (taken != null) throw AppError('repo/exists', details: {'itemId': taken.read(_db.items.id)});
    }
    // SKUs: unique within the batch and against live records.
    final skus = <String>{};
    for (final item in items) {
      if (item.isDeleted || item.sku.isEmpty) continue;
      if (!skus.add(item.sku)) throw AppError('repo/sku-conflict', details: {'sku': item.sku});
    }
    final skuList = skus.toList();
    for (var i = 0; i < skuList.length; i += _batch) {
      final slice = skuList.sublist(i, i + _batch > skuList.length ? skuList.length : i + _batch);
      final clash =
          await (_db.select(_db.items)
                ..where((t) => t.sku.isIn(slice) & t.deletedAt.isNull())
                ..limit(1))
              .getSingleOrNull();
      if (clash != null) throw AppError('repo/sku-conflict', details: {'sku': clash.sku, 'itemId': clash.id});
    }
    await _db.batch((b) {
      b.insertAll(_db.items, [for (final i in items) _companion(i)]);
      b.insertAll(_db.itemTokens, [
        for (final i in items)
          for (final t in searchTokensOf(i)) ItemTokensCompanion.insert(token: t, itemId: i.id),
      ], mode: InsertMode.insertOrIgnore);
      b.insertAll(_db.itemCatalogRefs, [
        for (final i in items)
          for (final r in catalogRefsOf(i)) ItemCatalogRefsCompanion.insert(ref: r, itemId: i.id),
      ]);
      b.insertAll(_db.itemFieldIds, [
        for (final i in items)
          for (final f in i.customFieldIds) ItemFieldIdsCompanion.insert(fieldId: f, itemId: i.id),
      ]);
    });
    for (final i in items) {
      aggregate.apply(i, 1);
    }
  });

  @override
  Future<Item> updateItem(Item item, {int? expectedVersion}) => _write((aggregate) async {
    final before = await _row(item.id);
    if (before == null) throw AppError('repo/missing', details: {'itemId': item.id});
    if (expectedVersion != null && before.version != expectedVersion) {
      throw AppError(
        'repo/conflict',
        details: {'itemId': item.id, 'expected': expectedVersion, 'actual': before.version},
      );
    }
    if (!item.isDeleted) await _assertSkuFree(item.sku, exceptId: item.id);
    final next = Item.fromJson({...item.toJson(), 'updatedAt': clock(), 'version': before.version + 1});
    await _db.update(_db.items).replace(_companion(next));
    await _writeDerived(next);
    final previous = _record(before);
    aggregate.replace(previous, next);
    return next;
  });

  Future<void> _setDeleted(String id, {required bool deleted}) => _write((aggregate) async {
    final before = await _row(id);
    if (before == null) throw AppError('repo/missing', details: {'itemId': id});
    final previous = _record(before);
    if (previous.isDeleted == deleted) return;
    // A record coming back from the Trash must not bring a SKU someone else
    // has taken meanwhile.
    if (!deleted) await _assertSkuFree(previous.sku, exceptId: id);
    final now = clock();
    final next = Item.fromJson({
      ...previous.toJson(),
      'deletedAt': deleted ? now : null,
      'deletedBy': null,
      'updatedAt': now,
      'version': previous.version + 1,
    });
    await _db.update(_db.items).replace(_companion(next));
    aggregate.replace(previous, next);
  });

  @override
  Future<void> trashItem(String id) => _setDeleted(id, deleted: true);

  @override
  Future<void> restoreItem(String id) => _setDeleted(id, deleted: false);

  @override
  Future<void> purgeItem(String id) => _write((aggregate) async {
    final before = await _row(id);
    if (before == null) return;
    final previous = _record(before);
    await (_db.delete(_db.items)..where((i) => i.id.equals(id))).go();
    await _deleteDerived(id);
    // The record's images lose one reference each; an image nothing holds
    // any more is marked orphaned (reclaimed later by the media store).
    final now = clock();
    for (final image in previous.images) {
      final mediaId = image.mediaId ?? image.id;
      await _db.customUpdate(
        'UPDATE media_assets SET ref_count = MAX(ref_count - 1, 0), '
        'orphaned_at = CASE WHEN ref_count - 1 <= 0 THEN COALESCE(orphaned_at, ?) ELSE orphaned_at END '
        'WHERE id = ?',
        variables: [Variable.withInt(now), Variable.withString(mediaId)],
        updates: {_db.mediaAssets},
      );
    }
    aggregate.apply(previous, -1);
  });

  // ── reads ────────────────────────────────────────────────────────────────

  @override
  Future<Item?> getItem(String id) async {
    final row = await _row(id);
    return row == null ? null : _record(row);
  }

  @override
  Future<List<Item>> getItems(List<String> ids) async {
    final byId = <String, Item>{};
    for (var i = 0; i < ids.length; i += _batch) {
      final slice = ids.sublist(i, i + _batch > ids.length ? ids.length : i + _batch);
      for (final row in await (_db.select(_db.items)..where((t) => t.id.isIn(slice))).get()) {
        byId[row.id] = _record(row);
      }
    }
    return [
      for (final id in ids)
        if (byId[id] != null) byId[id]!,
    ];
  }

  static const _columns = {
    'id': 'id',
    'mainCategoryId': 'main_category_id',
    'categoryId': 'category_id',
    'subcategoryId': 'subcategory_id',
    'locationId': 'location_id',
    'folderId': 'folder_id',
    'condition': 'condition',
    'sku': 'sku',
    'barcode': 'barcode',
    'serialNumber': 'serial_number',
    'modelNumber': 'model_number',
    'referenceNumber': 'reference_number',
    'valuationCurrency': 'valuation_currency',
    'valuationMidpoint': 'valuation_midpoint',
    'quantity': 'quantity',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
  };

  static const _identifierFields = {'id', 'sku', 'barcode', 'serialNumber', 'modelNumber', 'referenceNumber'};

  static const _sortColumns = {
    SortField.createdAt: 'created_at',
    SortField.updatedAt: 'updated_at',
    SortField.name: 'name_sort_key',
    SortField.valuation: 'valuation_midpoint',
  };

  static Variable<Object> _var(Object value) => switch (value) {
    final bool b => Variable.withBool(b),
    final int n => Variable.withInt(n),
    final num n => Variable.withReal(n.toDouble()),
    final String s => Variable.withString(s),
    _ => throw AppError('query/invalid', details: {'detail': 'value'}),
  };

  /// The WHERE clause of a validated query. Field names come only from the
  /// contract's own table; every value is a bound variable.
  (String, List<Variable<Object>>) _where(ItemQuery q) {
    final parts = <String>[];
    final vars = <Variable<Object>>[];
    for (final f in q.filters) {
      switch (f.field) {
        case 'deleted':
          parts.add(f.value == true ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL');
          continue;
        case 'hasImages':
          parts.add('has_images = ?');
          vars.add(Variable.withBool(f.value as bool));
          continue;
        case 'valued':
          parts.add(f.value == true ? 'valuation_currency IS NOT NULL' : 'valuation_currency IS NULL');
          continue;
        case 'analyzed':
          parts.add(f.value == true ? 'ai_data_json IS NOT NULL' : 'ai_data_json IS NULL');
          continue;
      }
      final col = _columns[f.field]!;
      switch (f.op) {
        case QueryOp.eq:
          parts.add('$col = ?');
          vars.add(_var(f.value));
        case QueryOp.isIn:
          final list = f.value as List;
          parts.add('$col IN (${List.filled(list.length, '?').join(', ')})');
          vars.addAll(list.map((v) => _var(v as Object)));
        case QueryOp.exists:
          // The reference reads an empty string as "none".
          parts.add(f.value == true ? "($col IS NOT NULL AND $col != '')" : "($col IS NULL OR $col = '')");
        case QueryOp.gt:
          parts.add('$col > ?');
          vars.add(_var(f.value));
        case QueryOp.gte:
          parts.add('$col >= ?');
          vars.add(_var(f.value));
        case QueryOp.lt:
          parts.add('$col < ?');
          vars.add(_var(f.value));
        case QueryOp.lte:
          parts.add('$col <= ?');
          vars.add(_var(f.value));
      }
    }
    // Text: every term is a prefix of one of the record's tokens.
    for (final term in q.textTerms) {
      parts.add('id IN (SELECT item_id FROM item_tokens WHERE token >= ? AND token < ?)');
      vars
        ..add(Variable.withString(term))
        ..add(Variable.withString(_prefixEnd(term)));
    }
    return (parts.isEmpty ? '1' : parts.join(' AND '), vars);
  }

  /// The smallest string greater than every string starting with [prefix].
  static String _prefixEnd(String prefix) {
    final units = prefix.codeUnits.toList();
    units[units.length - 1] = units.last + 1;
    return String.fromCharCodes(units);
  }

  @override
  Future<ItemPage<Item>> queryItems(ItemQuery query) async {
    final (where, vars) = _where(query);
    final col = _sortColumns[query.sort.field]!;
    final desc = query.sort.direction == SortDirection.desc;
    final dir = desc ? 'DESC' : 'ASC';
    final cmp = desc ? '<' : '>';
    var keyset = '';
    final state = query.decodeCursor();
    if (state is Map) {
      keyset = ' AND ($col $cmp ? OR ($col = ? AND id $cmp ?))';
      final v = _var(state['v']! as Object);
      vars.addAll([v, v, Variable.withString(state['id']! as String)]);
    }
    // An identifier equality (a scan, a typed serial) matches a handful of
    // rows: the identifier's own index finds them and they are sorted in
    // memory. Without the unary `+`, SQLite may walk the whole date index to
    // avoid that tiny sort — O(inventory) for one record.
    final byIdentifier = query.filters.any(
      (f) => _identifierFields.contains(f.field) && (f.op == QueryOp.eq || f.op == QueryOp.isIn),
    );
    final order = byIdentifier ? '+$col $dir, +id $dir' : '$col $dir, id $dir';
    final rows = await _db
        .customSelect(
          'SELECT * FROM items WHERE $where$keyset ORDER BY $order LIMIT ?',
          variables: [...vars, Variable.withInt(query.limit + 1)],
          readsFrom: {_db.items, _db.itemTokens},
        )
        .map((r) => _db.items.map(r.data))
        .get();
    final more = rows.length > query.limit;
    final page = more ? rows.sublist(0, query.limit) : rows;
    String? next;
    if (more) {
      final last = page.last;
      final Object value = switch (query.sort.field) {
        SortField.createdAt => last.createdAt,
        SortField.updatedAt => last.updatedAt,
        SortField.name => last.nameSortKey,
        SortField.valuation => last.valuationMidpoint ?? 0,
      };
      next = query.encodeCursor({'v': value, 'id': last.id});
    }
    return ItemPage(items: page.map(_record).toList(), nextCursor: next);
  }

  @override
  Future<int> countItemsMatching(ItemQuery query) async {
    final (where, vars) = _where(query);
    final row = await _db
        .customSelect('SELECT COUNT(*) AS n FROM items WHERE $where', variables: vars, readsFrom: {_db.items})
        .getSingle();
    return row.read<int>('n');
  }

  @override
  Future<ItemAggregate> aggregateItems(ItemQuery query) async {
    final (where, vars) = _where(query);
    final totals = await _db
        .customSelect(
          'SELECT COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS q FROM items WHERE $where',
          variables: vars,
          readsFrom: {_db.items},
        )
        .getSingle();
    final perCurrency = await _db
        .customSelect(
          'SELECT valuation_currency AS c, COUNT(*) AS n, SUM(valuation_midpoint) AS t FROM items '
          'WHERE $where AND valuation_currency IS NOT NULL GROUP BY valuation_currency',
          variables: vars,
          readsFrom: {_db.items},
        )
        .get();
    return ItemAggregate(
      count: totals.read<int>('n'),
      quantity: totals.read<double>('q'),
      byCurrency: {
        for (final r in perCurrency) r.read<String>('c'): (count: r.read<int>('n'), total: r.read<double>('t')),
      },
    );
  }

  @override
  Future<DuplicateCandidates?> duplicateCandidates({int limit = 5000}) async {
    // Live records sharing a non-empty identifier, or a name, with another
    // live record: found by grouped index reads, never by reading everything.
    String shared(String col, [String extra = '']) =>
        '$col IN (SELECT $col FROM items WHERE deleted_at IS NULL AND $col IS NOT NULL AND $col != \'\'$extra '
        'GROUP BY $col HAVING COUNT(*) > 1)';
    final rows = await _db
        .customSelect(
          'SELECT * FROM items WHERE deleted_at IS NULL AND ('
          '${shared('serial_number')} OR ${shared('barcode')} OR ${shared('sku')} OR '
          "${shared('name_sort_key', " AND name_sort_key != '￿'")}) LIMIT ?",
          variables: [Variable.withInt(limit + 1)],
          readsFrom: {_db.items},
        )
        .map((r) => _db.items.map(r.data))
        .get();
    final truncated = rows.length > limit;
    return DuplicateCandidates((truncated ? rows.sublist(0, limit) : rows).map(_record).toList(), truncated: truncated);
  }

  @override
  Stream<List<Item>> scanAll({required WholeDatasetPurpose purpose, int pageSize = 500}) async* {
    // The device holds every record, so any declared purpose is allowed here;
    // what makes it explicit is that callers must name one.
    String? after;
    for (;;) {
      final query = _db.select(_db.items)
        ..orderBy([(i) => OrderingTerm.asc(i.id)])
        ..limit(pageSize);
      if (after != null) query.where((i) => i.id.isBiggerThanValue(after!));
      final rows = await query.get();
      if (rows.isEmpty) return;
      yield rows.map(_record).toList();
      if (rows.length < pageSize) return;
      after = rows.last.id;
    }
  }

  // ── aggregate ────────────────────────────────────────────────────────────

  Future<InventoryAggregate?> _loadAggregate() async {
    final row = await (_db.select(_db.aggregates)..where((a) => a.key.equals(aggregateKey))).getSingleOrNull();
    if (row == null) return null;
    return InventoryAggregate.fromJson(jsonDecode(row.dataJson) as Map<String, Object?>);
  }

  Future<void> _saveAggregate(InventoryAggregate a) async {
    await _db
        .into(_db.aggregates)
        .insertOnConflictUpdate(
          AggregatesCompanion.insert(
            key: aggregateKey,
            schema: aggregateSchema,
            dataJson: jsonEncode(a.toJson()),
            builtAt: Value(a.builtAt),
          ),
        );
  }

  /// Rebuilds from the records a page at a time; the pages are released as
  /// soon as they are counted.
  Future<InventoryAggregate> _rebuild() async {
    final a = InventoryAggregate();
    await for (final page in scanAll(purpose: WholeDatasetPurpose.maintenance)) {
      for (final item in page) {
        a.apply(item, 1);
      }
    }
    a.builtAt = clock();
    return a;
  }

  @override
  Future<InventoryAggregate?> inventoryAggregate() async => await _loadAggregate() ?? await rebuildAggregates();

  @override
  Future<InventoryAggregate> rebuildAggregates() => _db.transaction(() async {
    final a = await _rebuild();
    await _saveAggregate(a);
    return a;
  });
}
