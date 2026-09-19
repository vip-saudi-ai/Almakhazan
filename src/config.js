// Firebase project config and app-wide constants.
// The Firebase web apiKey is a public project identifier, not a secret; access is
// controlled by Security Rules and App Check. The Anthropic key lives server-side only.

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD_dYt4pKDpu0YWg9PovvsWMOl99U3dlIQ',
  authDomain: 'almakhzan-3d808.firebaseapp.com',
  projectId: 'almakhzan-3d808',
  storageBucket: 'almakhzan-3d808.firebasestorage.app',
  messagingSenderId: '356609664014',
  appId: '1:356609664014:web:6ec089c2102b9ba22ec85f',
};

// Set to a reCAPTCHA v3 site key to enable App Check; null disables it.
export const APP_CHECK_SITE_KEY = null;

export const FUNCTIONS_REGION = 'us-central1';

export const APP_VERSION = '8.0';
export const SCHEMA_VERSION = 2;

export const PAGE_SIZE = 20;

export const ROLES = { OWNER: 'owner', ADMIN: 'admin', EDITOR: 'editor', VIEWER: 'viewer' };
export const ROLE_LABELS = {
  owner: 'مالك',
  admin: 'مدير',
  editor: 'محرر',
  viewer: 'مشاهد',
};
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

export const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP'];
export const CURRENCY_LABELS = { SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£' };

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

export const TEXT_LIMITS = {
  name: 200,
  sku: 64,
  barcode: 64,
  brand: 120,
  description: 4000,
  folderName: 120,
  folderDesc: 300,
  categoryName: 120,
  locationName: 120,
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
  LOCATION_CREATED: 'LOCATION_CREATED',
  LOCATION_DELETED: 'LOCATION_DELETED',
  IMPORT_MERGED: 'IMPORT_MERGED',
  IMPORT_RESTORED: 'IMPORT_RESTORED',
  MIGRATION_COMPLETED: 'MIGRATION_COMPLETED',
  WORKSPACE_CLEARED: 'WORKSPACE_CLEARED',
};

export const ACTION_LABELS = {
  ITEM_CREATED: 'أُضيفت قطعة',
  ITEM_UPDATED: 'عُدّلت قطعة',
  ITEM_DELETED: 'نُقلت قطعة للمحذوفات',
  ITEM_RESTORED: 'استُعيدت قطعة',
  ITEM_PURGED: 'حُذفت قطعة نهائياً',
  ITEM_DUPLICATED: 'نُسخت قطعة',
  ITEM_MOVED: 'نُقلت قطعة',
  AI_ANALYZED: 'تحليل بالذكاء الاصطناعي',
  FOLDER_CREATED: 'أُنشئ مجلد',
  FOLDER_UPDATED: 'عُدّل مجلد',
  FOLDER_DELETED: 'حُذف مجلد',
  CATEGORY_CREATED: 'أُضيف تصنيف',
  CATEGORY_UPDATED: 'عُدّل تصنيف',
  CATEGORY_DELETED: 'حُذف تصنيف',
  LOCATION_CREATED: 'أُضيف موقع',
  LOCATION_DELETED: 'حُذف موقع',
  IMPORT_MERGED: 'دمج استيراد',
  IMPORT_RESTORED: 'استعادة نسخة',
  MIGRATION_COMPLETED: 'اكتملت الترقية',
  WORKSPACE_CLEARED: 'مسح البيانات',
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
