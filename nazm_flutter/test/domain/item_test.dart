import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/domain/entities/inventory_aggregate.dart';
import 'package:nazm/domain/entities/item.dart';

import '../fixtures.dart';

void main() {
  final raw = (fixture('items.json')! as List).cast<Map<String, Object?>>();

  test('a reference record reads and writes back unchanged', () {
    for (final r in raw) {
      final item = Item.fromJson(r);
      expect(jsonDecode(jsonEncode(item.toJson())), r, reason: r['id'] as String);
    }
  });

  test('the aggregate of the same records equals the reference aggregate', () {
    final a = InventoryAggregate();
    for (final r in raw) {
      a.apply(Item.fromJson(r), 1);
    }
    final ours = jsonDecode(jsonEncode(a.toJson())) as Map<String, Object?>..remove('builtAt');
    final theirs = Map<String, Object?>.from(fixture('aggregate.json')! as Map)..remove('builtAt');
    expect(ours, theirs);
  });

  test('adding and removing every record returns the aggregate to empty', () {
    final a = InventoryAggregate();
    final items = raw.map(Item.fromJson).toList();
    for (final i in items) {
      a.apply(i, 1);
    }
    for (final i in items) {
      a.apply(i, -1);
    }
    expect(jsonEncode(a.toJson()), jsonEncode(InventoryAggregate().toJson()));
  });

  test('the aggregate is written as the reference writes it, byte for byte', () {
    final a = InventoryAggregate();
    for (final r in raw) {
      a.apply(Item.fromJson(r), 1);
    }
    final ours = a.toJson()..remove('builtAt');
    final theirs = Map<String, Object?>.from(fixture('aggregate.json')! as Map)..remove('builtAt');
    expect(jsonEncode(ours), jsonEncode(theirs));
  });

  test('a stored aggregate of another schema is not trusted', () {
    expect(InventoryAggregate.fromJson({'schema': 1, 'live': 5}), isNull);
    final back = InventoryAggregate.fromJson(Map<String, Object?>.from(fixture('aggregate.json')! as Map))!;
    expect(back.live, 4);
    expect(back.trashed, 1);
  });
}
