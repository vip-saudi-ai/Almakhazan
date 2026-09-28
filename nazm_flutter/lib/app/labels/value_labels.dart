// Stored values shown in the reader's language. Conditions and units are
// stored as the reference stores them (Arabic words), and translated only on
// screen — the same tables as src/labels.js. A value not in the tables (a
// unit the customer typed) is shown as it is.

import '../../l10n/generated/app_localizations.dart';

const conditionValues = ['ممتازة', 'جيدة جداً', 'جيدة', 'مقبولة', 'ضعيفة', 'للإتلاف'];

String conditionLabel(AppLocalizations l, String value) => switch (value) {
  'ممتازة' => l.conditionExcellent,
  'جيدة جداً' => l.conditionVeryGood,
  'جيدة' => l.conditionGood,
  'مقبولة' => l.conditionFair,
  'ضعيفة' => l.conditionPoor,
  'للإتلاف' => l.conditionDisposal,
  _ => value,
};

/// The reference's unit groups, in order (src/config.js UNITS).
const unitGroups = <String, List<String>>{
  'عدد': ['قطعة', 'علبة', 'كرتون', 'دزينة', 'مجموعة', 'طقم'],
  'وزن': ['كغ', 'غ', 'طن', 'رطل'],
  'حجم': ['لتر', 'مل', 'م³', 'غالون'],
  'طول': ['م', 'سم', 'مم', 'إنش', 'قدم'],
  'أخرى': ['وحدة', 'عبوة', 'لفة', 'حزمة'],
};

/// Units counting discrete objects take whole quantities only.
const integerUnits = {'قطعة', 'علبة', 'كرتون', 'دزينة', 'مجموعة', 'طقم'};

String unitLabel(AppLocalizations l, String value) => switch (value) {
  'قطعة' => l.unitPiece,
  'علبة' => l.unitBox,
  'كرتون' => l.unitCarton,
  'دزينة' => l.unitDozen,
  'مجموعة' => l.unitSet,
  'طقم' => l.unitKit,
  'كغ' => l.unitKg,
  'غ' => l.unitG,
  'طن' => l.unitTon,
  'رطل' => l.unitLb,
  'لتر' => l.unitLiter,
  'مل' => l.unitMl,
  'م³' => l.unitM3,
  'غالون' => l.unitGallon,
  'م' => l.unitM,
  'سم' => l.unitCm,
  'مم' => l.unitMm,
  'إنش' => l.unitInch,
  'قدم' => l.unitFoot,
  'وحدة' => l.unitUnit,
  'عبوة' => l.unitPack,
  'لفة' => l.unitRoll,
  'حزمة' => l.unitBundle,
  _ => value,
};

/// Currencies offered first in the form; any ISO code from a backup or an
/// import is kept as it is.
const commonCurrencies = ['SAR', 'USD', 'EUR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'GBP', 'EGP', 'JOD'];
