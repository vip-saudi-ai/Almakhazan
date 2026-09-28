// The inventory aggregate: the Overview's numbers, kept by deltas in the same
// transaction as every item write, never computed by reading records.
//
// Ported from the reference (src/aggregates.js, schema 2). The JSON shape is
// identical, so the same DTO can come from SQLite or, later, from a server.

import '../../core/serialization/json_number.dart';
import 'item.dart';

const aggregateKey = 'inventory';
const aggregateSchema = 2;

/// The bucket for "none" in a breakdown (no location, no folder…).
const noneBucket = '__none__';

const _maps = ['byMain', 'byCategory', 'bySub', 'byLocation', 'byFolder', 'byCondition', 'byClass'];

/// The `byClass` key of a record.
String classKey(Item item) => '${item.mainCategoryId ?? ''}|${item.categoryId}';

/// A record that can be found and counted: a name, a usable quantity, and one
/// way to identify it beyond the name.
bool isSound(Item item) =>
    item.name.isNotEmpty &&
    item.quantity.isFinite &&
    item.quantity >= 0 &&
    (item.valuation != null || item.sku.isNotEmpty || item.barcode.isNotEmpty || item.description.isNotEmpty);

class CurrencyTotal {
  CurrencyTotal({this.count = 0, this.total = 0});
  int count;
  double total;
  Map<String, Object?> toJson() => {'count': count, 'total': jsNumber(total)};
}

class ScoreSum {
  ScoreSum({this.count = 0, this.sum = 0});
  int count;
  double sum;
  Map<String, Object?> toJson() => {'count': count, 'sum': jsNumber(sum)};
}

class InventoryAggregate {
  InventoryAggregate();

  int live = 0;
  int trashed = 0;
  num quantity = 0;
  int withImages = 0;
  int valued = 0;
  int analyzed = 0;
  int sound = 0;
  final Map<String, Map<String, int>> maps = {for (final m in _maps) m: <String, int>{}};
  final Map<String, CurrencyTotal> currency = {};
  final ScoreSum aiLocal = ScoreSum();
  final ScoreSum aiGlobal = ScoreSum();
  int? builtAt;

  Map<String, int> get byMain => maps['byMain']!;
  Map<String, int> get byCategory => maps['byCategory']!;
  Map<String, int> get bySub => maps['bySub']!;
  Map<String, int> get byLocation => maps['byLocation']!;
  Map<String, int> get byFolder => maps['byFolder']!;
  Map<String, int> get byCondition => maps['byCondition']!;
  Map<String, int> get byClass => maps['byClass']!;

  /// Adds (sign 1) or removes (sign −1) one record's contribution.
  void apply(Item? item, int sign) {
    if (item == null) return;
    if (item.isDeleted) {
      trashed += sign;
      return;
    }
    live += sign;
    quantity += sign * item.quantity;
    withImages += sign * (item.hasImages ? 1 : 0);
    valued += sign * (item.valuation != null ? 1 : 0);
    analyzed += sign * (item.aiData != null ? 1 : 0);
    sound += sign * (isSound(item) ? 1 : 0);
    final keys = {
      'byMain': item.mainCategoryId ?? noneBucket,
      'byCategory': item.categoryId.isEmpty ? noneBucket : item.categoryId,
      'bySub': item.subcategoryId ?? noneBucket,
      'byLocation': item.locationId ?? noneBucket,
      'byFolder': item.folderId ?? noneBucket,
      'byCondition': item.condition.isEmpty ? noneBucket : item.condition,
      'byClass': classKey(item),
    };
    for (final entry in keys.entries) {
      final map = maps[entry.key]!;
      final next = (map[entry.value] ?? 0) + sign;
      if (next != 0) {
        map[entry.value] = next;
      } else {
        map.remove(entry.value);
      }
    }
    final v = item.valuation;
    if (v != null) {
      final entry = currency.putIfAbsent(v.currency, CurrencyTotal.new);
      entry.count += sign;
      entry.total += sign * v.midpoint;
      if (entry.count == 0) currency.remove(v.currency);
    }
    for (final (target, key) in [(aiLocal, 'localScore'), (aiGlobal, 'globalScore')]) {
      final raw = item.aiData?[key];
      final value = raw is num ? raw.toDouble() : (raw is String ? double.tryParse(raw) : null);
      if (value == null || !value.isFinite) continue;
      target.count += sign;
      target.sum += sign * value;
    }
  }

  /// A record changing from [before] to [after] (either may be null).
  void replace(Item? before, Item? after) {
    apply(before, -1);
    apply(after, 1);
  }

  Map<String, Object?> toJson() => {
    'key': aggregateKey,
    'schema': aggregateSchema,
    'live': live,
    'trashed': trashed,
    'quantity': jsNumber(quantity),
    'withImages': withImages,
    'valued': valued,
    'analyzed': analyzed,
    'sound': sound,
    for (final m in _maps) m: Map<String, int>.from(maps[m]!),
    'currency': {for (final e in currency.entries) e.key: e.value.toJson()},
    'aiLocal': aiLocal.toJson(),
    'aiGlobal': aiGlobal.toJson(),
    'builtAt': builtAt,
  };

  /// Reads a stored aggregate; null when it is of another schema (it is then
  /// rebuilt, not trusted).
  static InventoryAggregate? fromJson(Map<String, Object?> json) {
    if (json['schema'] != aggregateSchema) return null;
    int i(Object? v) => v is num ? v.toInt() : 0;
    final a = InventoryAggregate()
      ..live = i(json['live'])
      ..trashed = i(json['trashed'])
      ..quantity = (json['quantity'] as num?) ?? 0
      ..withImages = i(json['withImages'])
      ..valued = i(json['valued'])
      ..analyzed = i(json['analyzed'])
      ..sound = i(json['sound'])
      ..builtAt = json['builtAt'] is num ? (json['builtAt'] as num).toInt() : null;
    for (final m in _maps) {
      final raw = json[m];
      if (raw is Map) a.maps[m]!.addAll({for (final e in raw.entries) '${e.key}': i(e.value)});
    }
    final cur = json['currency'];
    if (cur is Map) {
      for (final e in cur.entries) {
        final v = e.value as Map;
        a.currency['${e.key}'] = CurrencyTotal(count: i(v['count']), total: ((v['total'] as num?) ?? 0).toDouble());
      }
    }
    for (final (target, key) in [(a.aiLocal, 'aiLocal'), (a.aiGlobal, 'aiGlobal')]) {
      final v = json[key];
      if (v is Map) {
        target
          ..count = i(v['count'])
          ..sum = ((v['sum'] as num?) ?? 0).toDouble();
      }
    }
    return a;
  }
}
