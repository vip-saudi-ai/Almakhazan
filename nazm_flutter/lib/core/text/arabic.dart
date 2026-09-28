// Text folding shared by search, sorting and catalog matching.
//
// Ported from the reference (src/utils.js normalizeDigits, src/search.js
// normalizeArabic / nameSortKey). The output must be identical, byte for
// byte: stored sort keys and search tokens written by either implementation
// are compared with each other after a migration.

const _arabicIndic = '٠١٢٣٤٥٦٧٨٩';
const _persianIndic = '۰۱۲۳۴۵۶۷۸۹';

/// Arabic harakat, tanween, dagger alef and Quranic marks
/// (U+064B–U+0670, U+065F, U+06D6–U+06ED).
final RegExp _diacritics = RegExp('[ً-ٰٟۖ-ۭ]');
final RegExp _tatweel = RegExp('ـ');
final RegExp _whitespace = RegExp(r'\s+');
final RegExp _digitRun = RegExp(r'\d+');

/// Arabic-Indic and Persian digits to ASCII; the Arabic decimal and
/// thousands separators to '.' and ','.
String normalizeDigits(String? input) {
  if (input == null) return '';
  final out = StringBuffer();
  for (final rune in input.runes) {
    final ch = String.fromCharCode(rune);
    var index = _arabicIndic.indexOf(ch);
    if (index < 0) index = _persianIndic.indexOf(ch);
    if (index >= 0) {
      out.write(index);
    } else if (ch == '٫') {
      out.write('.');
    } else if (ch == '٬') {
      out.write(',');
    } else {
      out.write(ch);
    }
  }
  return out.toString();
}

/// Folds Arabic orthographic variants so «أثر» and «اثر» match each other.
String normalizeArabic(String? input) {
  if (input == null) return '';
  return normalizeDigits(input)
      .toLowerCase()
      .replaceAll(_diacritics, '')
      .replaceAll(_tatweel, '')
      .replaceAll(RegExp('[أإآٱ]'), 'ا')
      .replaceAll('ى', 'ي')
      .replaceAll('ؤ', 'و')
      .replaceAll('ئ', 'ي')
      .replaceAll('ة', 'ه')
      .replaceAll(_whitespace, ' ')
      .trim();
}

/// The ordering key of a name: folded as search folds it, every run of digits
/// zero-padded so «قطعة 2» sorts before «قطعة 10». Byte order of this key is
/// the name order everywhere, with no locale collation involved.
String nameSortKey(String? name) {
  final folded = normalizeArabic(name ?? '');
  if (folded.isEmpty) return '\uFFFF';
  final padded = folded.replaceAllMapped(_digitRun, (m) => m[0]!.padLeft(12, '0'));
  return padded.length > 256 ? padded.substring(0, 256) : padded;
}
