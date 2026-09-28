/// A number as JavaScript's JSON.stringify writes it: a whole double is
/// written without a fraction (`0`, not `0.0`), so JSON the Flutter app writes
/// (backups, aggregates) reads the same as the reference's.
num jsNumber(num value) {
  if (value is double && value.isFinite && value == value.truncateToDouble() && value.abs() < 9007199254740992) {
    return value.toInt();
  }
  return value;
}
