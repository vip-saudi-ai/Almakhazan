import 'dart:math';

final Random _random = Random.secure();

/// A new record id in the reference's format (src/utils.js `uid`): the prefix,
/// the time in base 36 and two random 32-bit numbers in base 36 — e.g.
/// `itmmukriy538vly2o1plgew6`. Created on the device, kept forever, and the
/// same id a record will have in the cloud.
String newId(String prefix) {
  // Two 16-bit halves: on the web `1 << 32` is a JavaScript shift and yields 0.
  String r() => (_random.nextInt(0x10000) * 0x10000 + _random.nextInt(0x10000)).toRadixString(36);
  return '$prefix${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}${r()}${r()}';
}
