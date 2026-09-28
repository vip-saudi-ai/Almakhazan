// Fields a stored record carries only so that a database can order and find
// it — never edited, never shown, always derived from the fields that are.
// Ported from the reference (src/item-index.js, INDEX_FIELDS_VERSION 2); the
// derivations must stay identical so tokens written by either app match.

import '../../core/text/arabic.dart';
import '../entities/item.dart';

const indexFieldsVersion = 2;
const _maxTokens = 32;
const _maxTokenLength = 64;
final RegExp _wordSplit = RegExp(r'[\s/,،.;:()\-_]+');
final RegExp _digit = RegExp(r'\d');
final RegExp _space = RegExp(r'\s');
final RegExp _spaces = RegExp(r'\s+');

String _cut(String s, int max) => s.length > max ? s.substring(0, max) : s;

/// The catalog entities a record points at, sorted, at most 32.
List<String> catalogRefsOf(Item item) {
  final refs = <String>{};
  for (final value in item.customFields.values) {
    if (value is Map && value['ref'] is String && (value['ref'] as String).isNotEmpty) refs.add(value['ref'] as String);
  }
  final sorted = refs.toList()..sort();
  return sorted.length > 32 ? sorted.sublist(0, 32) : sorted;
}

/// The folded words and identifiers a record can be found by without reading it.
List<String> searchTokensOf(Item item) {
  final tokens = <String>{};
  void add(String? value) {
    final folded = normalizeArabic(value ?? '');
    if (folded.isEmpty) return;
    for (final word in folded.split(_wordSplit)) {
      if (word.length < 2) continue;
      tokens.add(_cut(word, _maxTokenLength));
      // «المولد» is also found by «مولد».
      if (word.length > 4 && word.startsWith('ال')) tokens.add(_cut(word.substring(2), _maxTokenLength));
    }
  }

  // Identifiers whole as well as by part: «INV-2026-000123» is found as typed.
  for (final value in [item.sku, item.barcode, item.serialNumber, item.modelNumber, item.referenceNumber]) {
    final folded = normalizeArabic(value);
    if (folded.length >= 2) tokens.add(_cut(folded, _maxTokenLength));
    add(value);
  }
  add(item.name);
  add(item.brand);
  for (final value in item.customFields.values) {
    // A code typed into a specialised field — a VIN, a part number — whole.
    if (value is String &&
        _digit.hasMatch(value) &&
        !_space.hasMatch(value.trim()) &&
        value.length <= _maxTokenLength) {
      final folded = normalizeArabic(value);
      if (folded.length >= 3) tokens.add(folded);
      continue;
    }
    if (value is! Map || value['label'] is! String) continue;
    final label = value['label'] as String;
    final folded = normalizeArabic(label);
    if (folded.length >= 2) tokens.add(_cut(folded.replaceAll(_spaces, ''), _maxTokenLength));
    add(label);
  }
  final list = tokens.toList();
  return list.length > _maxTokens ? list.sublist(0, _maxTokens) : list;
}
