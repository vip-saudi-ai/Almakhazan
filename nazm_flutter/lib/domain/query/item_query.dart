// The query contract: what a screen, the assistant or an export may ask a
// repository for, as plain serialisable data — the same object whether the
// device answers it from SQLite or a server answers it later.
//
// Ported from the reference (src/query-spec.js). Nothing here is a function
// or a callback: every field and operator comes from [queryFields], anything
// else is refused before a backend sees it, and a query round-trips through
// JSON unchanged.

import 'dart:convert';

import '../../core/errors/app_error.dart';
import '../../core/text/arabic.dart';

const int maxQueryLimit = 200;
const int defaultQueryLimit = 50;
const int _maxIn = 30;
const int _maxText = 200;

enum FieldType { string, number, boolean }

enum QueryOp { eq, isIn, exists, gt, gte, lt, lte }

extension QueryOpName on QueryOp {
  /// The operator's name in the serialised contract.
  String get wire => this == QueryOp.isIn ? 'in' : name;

  static QueryOp? parse(String? wire) => switch (wire) {
    'eq' => QueryOp.eq,
    'in' => QueryOp.isIn,
    'exists' => QueryOp.exists,
    'gt' => QueryOp.gt,
    'gte' => QueryOp.gte,
    'lt' => QueryOp.lt,
    'lte' => QueryOp.lte,
    _ => null,
  };
}

class QueryFieldDef {
  const QueryFieldDef(this.type, this.ops);
  final FieldType type;
  final Set<QueryOp> ops;
}

const _eqInExists = {QueryOp.eq, QueryOp.isIn, QueryOp.exists};
const _range = {QueryOp.gt, QueryOp.gte, QueryOp.lt, QueryOp.lte};

/// The fields a query may name. Structural fields only: custom field values
/// are not queryable (and are not indexed server-side by default).
const Map<String, QueryFieldDef> queryFields = {
  'id': QueryFieldDef(FieldType.string, {QueryOp.eq, QueryOp.isIn}),
  'mainCategoryId': QueryFieldDef(FieldType.string, _eqInExists),
  'categoryId': QueryFieldDef(FieldType.string, _eqInExists),
  'subcategoryId': QueryFieldDef(FieldType.string, _eqInExists),
  'locationId': QueryFieldDef(FieldType.string, _eqInExists),
  'folderId': QueryFieldDef(FieldType.string, _eqInExists),
  'condition': QueryFieldDef(FieldType.string, _eqInExists),
  'sku': QueryFieldDef(FieldType.string, {QueryOp.eq}),
  'barcode': QueryFieldDef(FieldType.string, {QueryOp.eq}),
  'serialNumber': QueryFieldDef(FieldType.string, {QueryOp.eq}),
  'modelNumber': QueryFieldDef(FieldType.string, {QueryOp.eq}),
  'referenceNumber': QueryFieldDef(FieldType.string, {QueryOp.eq}),
  'hasImages': QueryFieldDef(FieldType.boolean, {QueryOp.eq}),
  'valued': QueryFieldDef(FieldType.boolean, {QueryOp.eq}),
  'analyzed': QueryFieldDef(FieldType.boolean, {QueryOp.eq}),
  'valuationCurrency': QueryFieldDef(FieldType.string, {QueryOp.eq, QueryOp.isIn}),
  // Compared only within one currency (validated).
  'valuationMidpoint': QueryFieldDef(FieldType.number, _range),
  'quantity': QueryFieldDef(FieldType.number, {QueryOp.eq, ..._range}),
  'createdAt': QueryFieldDef(FieldType.number, _range),
  'updatedAt': QueryFieldDef(FieldType.number, _range),
  // Live records unless asked otherwise: `deleted: true` is the Trash.
  'deleted': QueryFieldDef(FieldType.boolean, {QueryOp.eq}),
};

enum SortField { createdAt, updatedAt, name, valuation }

enum SortDirection { asc, desc }

enum Projection { full, list }

class QueryFilter {
  const QueryFilter(this.field, this.op, this.value);
  final String field;
  final QueryOp op;

  /// String, num, bool, or a List of those for `in`.
  final Object value;

  Map<String, Object?> toJson() => {'field': field, 'op': op.wire, 'value': value};

  @override
  bool operator ==(Object other) =>
      other is QueryFilter && other.field == field && other.op == op && jsonEncode(other.value) == jsonEncode(value);

  @override
  int get hashCode => Object.hash(field, op, jsonEncode(value));
}

class QuerySort {
  const QuerySort(this.field, this.direction);
  final SortField field;
  final SortDirection direction;

  static const newest = QuerySort(SortField.createdAt, SortDirection.desc);

  Map<String, Object?> toJson() => {'field': field.name, 'direction': direction.name};
}

/// A validated query. Build one with [ItemQuery.validate] from the wire form
/// (a JSON-like map, the reference's shape) or with the typed constructor
/// followed by [ItemQuery.validated].
class ItemQuery {
  const ItemQuery._({
    required this.filters,
    required this.text,
    required this.sort,
    required this.limit,
    required this.cursor,
    required this.projection,
  });

  final List<QueryFilter> filters;

  /// Folded with [normalizeArabic]; null when there is no text.
  final String? text;
  final QuerySort sort;
  final int limit;
  final String? cursor;
  final Projection projection;

  /// Validates the wire form: `{filters, text, sort, limit, cursor, projection}`.
  /// Filters may be a map (`{field: value}` or `{field: {op: value}}`) or a
  /// list of `{field, op, value}`. Throws `query/invalid`.
  static ItemQuery validate(Map<String, Object?> input) {
    const allowed = {'filters', 'text', 'sort', 'limit', 'cursor', 'projection'};
    for (final key in input.keys) {
      if (!allowed.contains(key)) throw _invalid(key);
    }

    final filters = <QueryFilter>[];
    final raw = input['filters'] ?? const <String, Object?>{};
    final Iterable<MapEntry<String?, Object?>> entries;
    if (raw is List) {
      entries = raw.map((f) {
        if (f is! Map) throw _invalid('filters');
        return MapEntry(f['field'] as String?, <String, Object?>{'${f['op']}': f['value']});
      });
    } else if (raw is Map) {
      entries = raw.entries.map((e) => MapEntry(e.key as String?, e.value));
    } else {
      throw _invalid('filters');
    }
    for (final entry in entries) {
      final field = entry.key;
      final def = field == null ? null : queryFields[field];
      if (def == null) throw _invalid('field:$field');
      final condition = entry.value;
      final ops = condition is Map ? condition.map((k, v) => MapEntry('$k', v)) : {'eq': condition};
      for (final op in ops.entries) {
        final parsed = QueryOpName.parse(op.key);
        if (parsed == null || !def.ops.contains(parsed)) throw _invalid('op:$field.${op.key}');
        filters.add(QueryFilter(field!, parsed, _checkValue(field, def, parsed, op.value)));
      }
    }
    if (!filters.any((f) => f.field == 'deleted')) {
      filters.add(const QueryFilter('deleted', QueryOp.eq, false));
    }

    final currencyEq = filters.any((f) => f.field == 'valuationCurrency' && f.op == QueryOp.eq);
    if (filters.any((f) => f.field == 'valuationMidpoint') && !currencyEq) {
      throw _invalid('valuationMidpoint needs valuationCurrency');
    }

    String? text;
    final rawText = input['text'];
    if (rawText != null) {
      if (rawText is! String || rawText.length > _maxText) throw _invalid('text');
      final folded = normalizeArabic(rawText);
      text = folded.isEmpty ? null : folded;
    }

    final rawSort = input['sort'];
    var sortField = SortField.createdAt;
    var sortDirection = SortDirection.desc;
    if (rawSort != null) {
      if (rawSort is! Map) throw _invalid('sort');
      final f = rawSort['field'] ?? 'createdAt';
      final d = rawSort['direction'] ?? 'desc';
      sortField = SortField.values.firstWhere((s) => s.name == f, orElse: () => throw _invalid('sort:$f'));
      sortDirection = SortDirection.values.firstWhere(
        (s) => s.name == d,
        orElse: () => throw _invalid('sort.direction'),
      );
    }
    if (sortField == SortField.valuation && !currencyEq) {
      throw _invalid('valuation sort needs valuationCurrency');
    }

    final rawLimit = input['limit'] ?? defaultQueryLimit;
    if (rawLimit is! int || rawLimit < 1 || rawLimit > maxQueryLimit) throw _invalid('limit');
    final rawCursor = input['cursor'];
    if (rawCursor != null && rawCursor is! String) throw _invalid('cursor');
    final rawProjection = input['projection'] ?? 'full';
    final projection = Projection.values.firstWhere(
      (p) => p.name == rawProjection,
      orElse: () => throw _invalid('projection'),
    );

    return ItemQuery._(
      filters: List.unmodifiable(filters),
      text: text,
      sort: QuerySort(sortField, sortDirection),
      limit: rawLimit,
      cursor: (rawCursor is String && rawCursor.isNotEmpty) ? rawCursor : null,
      projection: projection,
    );
  }

  /// The wire form; `ItemQuery.validate(q.toJson())` reproduces `q`.
  Map<String, Object?> toJson() => {
    'filters': [for (final f in filters) f.toJson()],
    'text': text,
    'sort': sort.toJson(),
    'limit': limit,
    'cursor': cursor,
    'projection': projection.name,
  };

  ItemQuery withCursor(String? next) =>
      ItemQuery._(filters: filters, text: text, sort: sort, limit: limit, cursor: next, projection: projection);

  /// The identity of a query's answer: everything except the page position.
  String get specKey {
    final sorted = [...filters]..sort((a, b) => ('${a.field}${a.op.wire}').compareTo('${b.field}${b.op.wire}'));
    return jsonEncode([
      [for (final f in sorted) f.toJson()],
      text,
      sort.toJson(),
    ]);
  }

  /// A cursor carrying backend [state], tied to this query's identity.
  String encodeCursor(Object? state) => base64Url.encode(utf8.encode(jsonEncode({'q': specKey, 's': state})));

  /// The state inside [cursor]; a cursor issued for another query is refused.
  Object? decodeCursor() {
    final c = cursor;
    if (c == null) return null;
    try {
      final parsed = jsonDecode(utf8.decode(base64Url.decode(c))) as Map<String, Object?>;
      if (parsed['q'] != specKey) throw const FormatException('other query');
      return parsed['s'];
    } on Object {
      throw _invalid('cursor');
    }
  }

  /// The words of the text query (two characters or more).
  List<String> get textTerms => (text ?? '').split(RegExp(r'\s+')).where((w) => w.length >= 2).toList();
}

Object _checkValue(String field, QueryFieldDef def, QueryOp op, Object? value) {
  if (op == QueryOp.exists) {
    if (value is! bool) throw _invalid('$field.exists');
    return value;
  }
  if (op == QueryOp.isIn) {
    if (value is! List || value.isEmpty || value.length > _maxIn) throw _invalid('$field.in');
    return List.unmodifiable(value.map((v) => _checkValue(field, def, QueryOp.eq, v)));
  }
  switch (def.type) {
    case FieldType.number:
      if (value is! num || !value.isFinite) throw _invalid('$field.${op.wire}');
      return value;
    case FieldType.boolean:
      if (value is! bool) throw _invalid('$field.${op.wire}');
      return value;
    case FieldType.string:
      if (value is! String || value.isEmpty || value.length > 256) throw _invalid('$field.${op.wire}');
      return value;
  }
}

AppError _invalid(String detail) => AppError('query/invalid', details: {'detail': detail});

/// One page of an answer.
class ItemPage<T> {
  const ItemPage({required this.items, required this.nextCursor, this.total});
  final List<T> items;
  final String? nextCursor;

  /// Exact total when the backend knows it cheaply; null otherwise.
  final int? total;
  bool get hasMore => nextCursor != null;
}
