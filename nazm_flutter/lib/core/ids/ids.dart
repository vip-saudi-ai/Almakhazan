import 'dart:math';

final Random _random = Random.secure();

/// A new record id in the reference's format (src/utils.js `uid`): the prefix,
/// the time in base 36 and two random 32-bit numbers in base 36 — e.g.
/// `itmmukriy538vly2o1plgew6`. Created on the device, kept forever, and the
/// same id a record will have in the cloud.
String newId(String prefix) {
  String r() => _random.nextInt(1 << 32).toRadixString(36);
  return '$prefix${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}${r()}${r()}';
}
