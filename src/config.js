// Firebase project config and app-wide constants.
import { ENV } from './environment.js';
import { purchaseProvider } from './purchase-provider.js';
// The Firebase web apiKey is a public project identifier, not a secret; access is
// controlled by Security Rules and App Check. The Anthropic key lives server-side only.

// The project a deployment talks to is deployment configuration: nazm.config.js
// → firebase.project. Unused while features.cloud is off.
export const FIREBASE_CONFIG = ENV.firebase.project;

// App Check, feature flags, contact details and every other value that differs
// between deployments live in nazm.config.js, read through src/environment.js.

export const FUNCTIONS_REGION = 'us-central1';

/**
 * The one version, semantic. package.json and the native project's
 * CFBundleShortVersionString carry the same value; the native build number is
 * the native project's own. Capabilities that are not operational in a
 * release are switched off in nazm.config.js rather than shown unfinished.
 */
export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 2;

/**
 * The version of the classification data model (src/taxonomy.js) — separate
 * from APP_VERSION and from the backup format, carried in every backup.
 */
export const TAXONOMY_SCHEMA_VERSION = 1;

export const PAGE_SIZE = 20;

export const ROLES = { OWNER: 'owner', ADMIN: 'admin', EDITOR: 'editor', VIEWER: 'viewer' };
const ROLE_RANK = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function roleAtLeast(role, minimum) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minimum] ?? 99);
}

export const CONDITIONS = ['ممتازة', 'جيدة جداً', 'جيدة', 'مقبولة', 'ضعيفة', 'للإتلاف'];

export const CONDITION_COLORS = {
  'ممتازة': '#34C759',
  'جيدة جداً': '#5AC8FA',
  'جيدة': '#007AFF',
  'مقبولة': '#FF9500',
  'ضعيفة': '#FF3B30',
  'للإتلاف': '#AF52DE',
};

/**
 * The currencies offered in the picker — the common ones for this market.
 *
 * This is a convenience list, NOT the set of currencies the app accepts. A
 * record may legitimately be valued in any ISO 4217 currency: a spreadsheet
 * imported from Dubai prices things in AED, an auction invoice from Geneva in
 * CHF. Any valid code is stored and shown as itself.
 */
export const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP'];

/**
 * ISO 4217, active codes plus the withdrawn ones still found in real records.
 *
 * `Intl.NumberFormat` is not the validator it looks like: it accepts any
 * well-formed three-letter code and prints it back, so "ZZZ" and "PCS" — a
 * unit column mapped to the currency field by mistake — would both pass. A
 * real list is what turns that into a problem the import can report.
 *
 * The withdrawn codes are deliberate: an inventory records what something was
 * bought for, and a 2010 purchase in HRK or SLL did happen. Rejecting the code
 * would not undo the purchase, it would only lose the record of it.
 */
const ISO_4217 = new Set(`
AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL
BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP
ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR
IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL
LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR
NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD
SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX
USD UYU UZS VED VES VND VUV WST XAF XAG XAU XCD XCG XDR XOF XPF XPT XXX YER ZAR
ZMW ZWG
BYR HRK LTL LVL MRO SLL STD VEF ZMK ZWL
`.trim().split(/\s+/));

/** Is this a currency, by the standard rather than by the picker? */
export function isCurrencyCode(code) {
  return ISO_4217.has(String(code || '').trim().toUpperCase());
}

/**
 * The canonical code, or the fallback when there isn't one.
 *
 * Anything else is data loss with a straight face: a valuation of 10,000 AED
 * relabelled SAR because AED was not in a four-entry list is not a display
 * problem, it is the record now saying something the owner never said.
 */
export function normalizeCurrencyCode(code, fallback = 'SAR') {
  const upper = String(code || '').trim().toUpperCase();
  return isCurrencyCode(upper) ? upper : fallback;
}

export const VALUATION_SOURCES = { MANUAL: 'manual', AI: 'ai', APPRAISAL: 'appraisal' };
export const VALUATION_TYPES = { ESTIMATE: 'estimate', PURCHASE: 'purchase', INSURANCE: 'insurance' };

export const UNITS = {
  'عدد': ['قطعة', 'علبة', 'كرتون', 'دزينة', 'مجموعة', 'طقم'],
  'وزن': ['كغ', 'غ', 'طن', 'رطل'],
  'حجم': ['لتر', 'مل', 'م³', 'غالون'],
  'طول': ['م', 'سم', 'مم', 'إنش', 'قدم'],
  'أخرى': ['وحدة', 'عبوة', 'لفة', 'حزمة'],
};

// Units measuring discrete objects reject fractional quantities.
export const INTEGER_UNITS = new Set(['قطعة', 'علبة', 'كرتون', 'دزينة', 'مجموعة', 'طقم']);

export const CAT_ICONS = ['🎨', '🏺', '📜', '⚔️', '💎', '🪙', '🕌', '📚', '✨', '🚗', '🧿', '🗿', '📷', '🗺️', '🪑', '⌚', '🏅', '👑', '🔩', '🛠️', '🪄', '📦', '🔧', '⚡', '🌿'];
export const FOLDER_ICONS = ['🗂', '📁', '🏛', '🏠', '🧳', '💼', '🎒', '🗃', '📂', '🖼', '🎁', '🏆', '💡', '🌟', '🔮', '🏺', '🧩', '🗝', '🎭', '🌍'];
export const FOLDER_COLORS = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5AC8FA', '#5856D6', '#FF6B6B', '#4ECDC4', '#F7B731'];
export const CHART_COLORS = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5AC8FA', '#5856D6', '#FF6B6B'];

export const IMAGE_LIMITS = {
  maxOriginalEdge: 2560,
  thumbnailEdge: 640,
  // An iPhone photo routinely exceeds 12MB, and RAW/HEIC more so.
  maxBytes: 40 * 1024 * 1024,
  maxPerItem: 12,
  // Formats every browser can render. Anything else the browser can decode
  // (HEIC/HEIF from iPhone, TIFF, BMP…) is accepted and transcoded to JPEG so
  // it displays on other devices too.
  webSafeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
};

/**
 * The largest JSON backup a restore or merge will read, per platform.
 *
 * A backup is parsed whole: the file's bytes, the decoded text and the parsed
 * records are all in memory at once, which peaks at several times the file
 * size. A desktop browser has room for the largest backup NAZM can write
 * (tools/measure-backup-size.mjs: a realistic record is ~7.4 KB, so 256 MB is
 * ~35,000 records). An iPhone's WebView is killed under memory pressure well
 * before that, so the native app accepts 64 MB (~8,600 realistic records) and
 * says so, rather than being terminated half way through a restore. The size
 * is checked from the file's metadata, before a byte is read.
 */
export const IMPORT_LIMITS = {
  backupBytes: { web: 256 * 1024 * 1024, native: 64 * 1024 * 1024 },
};

const TEXT_LIMITS_CATEGORY_NAME = 120;

export const TEXT_LIMITS = {
  name: 200,
  sku: 64,
  barcode: 64,
  // The identifiers printed on the object itself. A serial number names one
  // object; a model number names the product line; a reference number is
  // whatever the owner's own system, an insurer or an auction house calls it.
  serialNumber: 80,
  modelNumber: 80,
  referenceNumber: 80,
  brand: 120,
  description: 4000,
  folderName: 120,
  folderDesc: 300,
  categoryName: TEXT_LIMITS_CATEGORY_NAME,
  locationName: 120,
};

/**
 * Classification and custom-field limits, in one place. Generous enough that
 * no real inventory meets them; there to keep a malformed import or a runaway
 * script from producing a picker nobody can use.
 */
export const TAXONOMY_LIMITS = {
  // A Main Category, Category or Subcategory the customer names.
  label: TEXT_LIMITS_CATEGORY_NAME,
  customNodes: 2000,
  aliases: 20,
  // Field definitions saved on one Category (or Main Category) as a template.
  fieldsPerTemplate: 50,
  // Field definitions that belong to a single record.
  fieldsPerItem: 50,
  // Values one record carries, template and own fields together.
  valuesPerItem: 120,
  fieldLabel: 80,
  fieldId: 64,
  options: 50,
  optionLabel: 80,
  text: 500,
  multiline: 4000,
  url: 2000,
};

export const ACTIONS = {
  ITEM_CREATED: 'ITEM_CREATED',
  ITEM_UPDATED: 'ITEM_UPDATED',
  ITEM_DELETED: 'ITEM_DELETED',
  ITEM_RESTORED: 'ITEM_RESTORED',
  ITEM_PURGED: 'ITEM_PURGED',
  ITEM_DUPLICATED: 'ITEM_DUPLICATED',
  ITEM_MOVED: 'ITEM_MOVED',
  AI_ANALYZED: 'AI_ANALYZED',
  FOLDER_CREATED: 'FOLDER_CREATED',
  FOLDER_UPDATED: 'FOLDER_UPDATED',
  FOLDER_DELETED: 'FOLDER_DELETED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  CATEGORY_MERGED: 'CATEGORY_MERGED',
  TAXONOMY_MIGRATED: 'TAXONOMY_MIGRATED',
  TAXONOMY_RESET: 'TAXONOMY_RESET',
  LOCATION_CREATED: 'LOCATION_CREATED',
  LOCATION_DELETED: 'LOCATION_DELETED',
  IMPORT_MERGED: 'IMPORT_MERGED',
  IMPORT_RESTORED: 'IMPORT_RESTORED',
  IMPORT_ROLLED_BACK: 'IMPORT_ROLLED_BACK',
  SPREADSHEET_IMPORTED: 'SPREADSHEET_IMPORTED',
  SPREADSHEET_IMPORT_STOPPED: 'SPREADSHEET_IMPORT_STOPPED',
  ITEMS_BULK_UPDATED: 'ITEMS_BULK_UPDATED',
  ITEMS_BULK_DELETED: 'ITEMS_BULK_DELETED',
  MIGRATION_COMPLETED: 'MIGRATION_COMPLETED',
  WORKSPACE_CLEARED: 'WORKSPACE_CLEARED',
};

export const DEFAULT_CATEGORIES = [
  { id: 'c1', name: 'الفنون الجميلة', icon: '🎨' },
  { id: 'c2', name: 'التحف والأنتيكات', icon: '🏺' },
  { id: 'c3', name: 'المخطوطات والوثائق النادرة', icon: '📜' },
  { id: 'c4', name: 'الأسلحة التاريخية', icon: '⚔️' },
  { id: 'c5', name: 'المجوهرات والأحجار الكريمة', icon: '💎' },
  { id: 'c6', name: 'العملات والطوابع', icon: '🪙' },
  { id: 'c7', name: 'التحف الإسلامية والشرقية', icon: '🕌' },
  { id: 'c8', name: 'الكتب النادرة', icon: '📚' },
  { id: 'c9', name: 'المقتنيات الفاخرة الحديثة', icon: '✨' },
  { id: 'c10', name: 'السيارات الكلاسيكية', icon: '🚗' },
  { id: 'c11', name: 'القطع التراثية الشعبية', icon: '🧿' },
  { id: 'c12', name: 'الآثار', icon: '🗿' },
  { id: 'c13', name: 'الصور الفوتوغرافية النادرة', icon: '📷' },
  { id: 'c14', name: 'الخرائط والأطالس القديمة', icon: '🗺️' },
  { id: 'c15', name: 'الأثاث التاريخي', icon: '🪑' },
  { id: 'c16', name: 'الساعات الفاخرة', icon: '⌚' },
  { id: 'c17', name: 'الميداليات والأوسمة', icon: '🏅' },
  { id: 'c18', name: 'المقتنيات الملكية والبروتوكولية', icon: '👑' },
  { id: 'c19', name: 'السكراب', icon: '🔩' },
  { id: 'c20', name: 'المعدات', icon: '🛠️' },
  { id: 'c21', name: 'السجاد', icon: '🪄' },
];

export const DEFAULT_LOCATIONS = [
  { id: 'l1', name: 'مستودع رئيسي' },
  { id: 'l2', name: 'الرف A' },
  { id: 'l3', name: 'الرف B' },
  { id: 'l4', name: 'منطقة الخردة' },
];

export const UNCATEGORIZED_ID = 'uncategorized';
export const UNCATEGORIZED = { id: UNCATEGORIZED_ID, name: 'غير مصنّف', icon: '📦', system: true };

// ── device-only mode: an explicit commercial policy ─────────────────────────
//
// Without an account there is no workspace and no subscription, and the old
// code read that absence as "no limits" — a side effect of a null entitlement
// rather than a decision. Every plan limit was one "don't sign in" away from
// not applying. The policy is now a named choice:
//
//   consumer_free_tier     device-only inventories get the Free plan's limits
//                          (record quota, activity retention). The default for
//                          any real, hosted origin.
//   development_unlimited  no plan limits on the device. Only for development
//                          (localhost) and for the single-file demo opened from
//                          disk, where there is nothing being sold.
//   standalone             no plan limits on the device, because this release
//                          sells nothing (features.billing is off). A limit the
//                          customer could not lift would be a dead end: the
//                          device inventory is the complete product then. The
//                          plan table and entitlement engine are untouched and
//                          take over again the moment billing is switched on.
//
// To decide it differently for a deployment, set LOCAL_MODE_POLICY_OVERRIDE.
// The plan values themselves are not touched here.

export const LocalModePolicy = {
  CONSUMER_FREE_TIER: 'consumer_free_tier',
  DEVELOPMENT_UNLIMITED: 'development_unlimited',
  STANDALONE: 'standalone',
};

/** null = decided by the origin, as described above. */
export const LOCAL_MODE_POLICY_OVERRIDE = null;

export function localModePolicy(where = globalThis.location) {
  if (LOCAL_MODE_POLICY_OVERRIDE) return LOCAL_MODE_POLICY_OVERRIDE;
  // Nothing is sold without both the flag and a store to sell through.
  if (!ENV.features.billing || !purchaseProvider()) return LocalModePolicy.STANDALONE;
  const protocol = where?.protocol || '';
  const host = where?.hostname || '';
  const development = protocol === 'file:'
    || host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
  return development ? LocalModePolicy.DEVELOPMENT_UNLIMITED : LocalModePolicy.CONSUMER_FREE_TIER;
}
