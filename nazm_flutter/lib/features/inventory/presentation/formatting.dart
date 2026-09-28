import 'package:decimal/decimal.dart';
import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../../../core/text/arabic.dart';
import '../../../domain/entities/item.dart';

String _locale(BuildContext context) => Localizations.localeOf(context).languageCode;

String formatNumber(BuildContext context, num value) => NumberFormat.decimalPattern(_locale(context)).format(value);

String formatDecimal(BuildContext context, Decimal value) =>
    NumberFormat.decimalPattern(_locale(context)).format(value.toDouble());

/// A valuation as the reference shows it: one amount, or a range, in its own
/// currency — never converted.
String formatValuation(BuildContext context, Valuation v) {
  final amount = v.min == v.max
      ? formatDecimal(context, v.min)
      : '${formatDecimal(context, v.min)}–${formatDecimal(context, v.max)}';
  return '$amount ${v.currency}';
}

String formatDate(BuildContext context, int millis) =>
    DateFormat.yMMMd(_locale(context)).format(DateTime.fromMillisecondsSinceEpoch(millis));

final RegExp _range = RegExp(r'^(\d+(?:\.\d+)?)(?:\s*[-–—]\s*(\d+(?:\.\d+)?))?$');

/// The valuation field's text: «5000», «5,000», «٥٠٠٠-٨٠٠٠». Null when no
/// number is recognised (the form then says so and saves without one).
({Decimal min, Decimal max})? parseValuationText(String text) {
  final cleaned = normalizeDigits(text).replaceAll(',', '').replaceAll(' ', '').trim();
  final m = _range.firstMatch(cleaned);
  if (m == null) return null;
  final a = Decimal.parse(m[1]!);
  final b = m[2] == null ? a : Decimal.parse(m[2]!);
  return a <= b ? (min: a, max: b) : (min: b, max: a);
}
