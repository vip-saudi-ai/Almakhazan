import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/core/text/arabic.dart';

import '../fixtures.dart';

void main() {
  final cases = (fixture('text_folding.json')! as List).cast<Map<String, Object?>>();

  test('text folding matches the reference byte for byte (${cases.length} inputs)', () {
    for (final c in cases) {
      final input = c['input']! as String;
      expect(normalizeDigits(input), c['normalizeDigits'], reason: 'normalizeDigits «$input»');
      expect(normalizeArabic(input), c['normalizeArabic'], reason: 'normalizeArabic «$input»');
      expect(nameSortKey(input), c['nameSortKey'], reason: 'nameSortKey «$input»');
    }
  });

  test('digit runs are padded so names sort in number order', () {
    expect(nameSortKey('قطعة 2').compareTo(nameSortKey('قطعة 10')), lessThan(0));
  });
}
