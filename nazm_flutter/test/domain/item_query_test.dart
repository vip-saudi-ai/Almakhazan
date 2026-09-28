import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/core/errors/app_error.dart';
import 'package:nazm/domain/query/item_query.dart';

import '../fixtures.dart';

void main() {
  final cases = (fixture('query_specs.json')! as List).cast<Map<String, Object?>>();

  test('the query contract accepts and refuses exactly what the reference does (${cases.length} specs)', () {
    for (final c in cases) {
      final input = Map<String, Object?>.from(c['input']! as Map);
      final label = jsonEncode(input);
      if (c['ok'] == true) {
        final q = ItemQuery.validate(input);
        expect(jsonDecode(jsonEncode([for (final f in q.filters) f.toJson()])), c['filters'], reason: label);
        expect(q.text, c['text'], reason: label);
        expect(q.sort.toJson(), c['sort'], reason: label);
        expect(q.limit, c['limit'], reason: label);
        expect(q.projection.name, c['projection'], reason: label);
      } else {
        expect(
          () => ItemQuery.validate(input),
          throwsA(
            isA<AppError>()
                .having((e) => e.code, 'code', 'query/invalid')
                .having((e) => e.details['detail'], 'detail', c['detail']),
          ),
          reason: label,
        );
      }
    }
  });

  test('a query survives its wire form, and a cursor only fits its own query', () {
    final q = ItemQuery.validate({
      'filters': {
        'locationId': {
          'in': ['a', 'b'],
        },
        'hasImages': true,
      },
      'text': 'مولد',
      'sort': {'field': 'name', 'direction': 'asc'},
      'limit': 30,
    });
    final again = ItemQuery.validate(jsonDecode(jsonEncode(q.toJson())) as Map<String, Object?>);
    expect(again.specKey, q.specKey);
    final cursor = q.encodeCursor({'k': 'x', 'id': 'itm_9'});
    expect(q.withCursor(cursor).decodeCursor(), {'k': 'x', 'id': 'itm_9'});
    final other = ItemQuery.validate({'text': 'لوحة'});
    expect(() => other.withCursor(cursor).decodeCursor(), throwsA(isA<AppError>()));
  });
}
