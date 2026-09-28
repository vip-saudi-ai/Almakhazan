// The language layer: one catalogue, two languages, and nothing about the
// data changing when the language does.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LANGUAGE, LANGUAGES, formatNumber, getLanguage, isRtl, messageKeys, onLanguageChange,
  pick, setLanguage, t,
} from '../../src/i18n.js';
import { MESSAGES } from '../../src/locales/index.js';
import { activityDetail, categoryName, conditionLabel, currencySymbol, roleLabel, unitLabel } from '../../src/labels.js';
import { AppError, describeError } from '../../src/utils.js';
import { CONDITIONS, DEFAULT_CATEGORIES, UNCATEGORIZED } from '../../src/config.js';

const withLanguage = (lang, fn) => {
  const before = getLanguage();
  setLanguage(lang);
  try { return fn(); } finally { setLanguage(before); }
};

test('Arabic is the default and right to left; English is left to right', () => {
  assert.equal(DEFAULT_LANGUAGE, 'ar');
  assert.deepEqual(LANGUAGES, ['ar', 'en']);
  assert.equal(getLanguage(), 'ar');
  assert.equal(isRtl('ar'), true);
  assert.equal(isRtl('en'), false);
});

test('every key has both languages, and plural sets always have "other"', () => {
  for (const [key, entry] of Object.entries(MESSAGES)) {
    for (const lang of LANGUAGES) {
      assert.ok(entry[lang] != null && entry[lang] !== '', `${lang} missing for ${key}`);
      if (typeof entry[lang] === 'object') assert.ok(entry[lang].other != null, `${lang}.other missing for ${key}`);
    }
  }
  assert.ok(messageKeys().length > 1000);
});

test('the same key reads in the chosen language', () => {
  assert.equal(t('common.cancel'), 'إلغاء');
  withLanguage('en', () => assert.equal(t('common.cancel'), 'Cancel'));
});

test('English plurals pick one/other; Arabic uses its own forms', () => {
  withLanguage('en', () => {
    assert.equal(t('count.items', { count: 1 }), '1 item');
    assert.equal(t('count.items', { count: 2 }), '2 items');
    assert.equal(t('count.items', { count: 0 }), '0 items');
  });
  assert.equal(t('planUi.members', { count: 1 }), 'عضو واحد');
  assert.equal(t('planUi.members', { count: 2 }), 'عضوان');
  assert.equal(t('planUi.members', { count: 5 }), '5 أعضاء');
  assert.equal(t('planUi.members', { count: 20 }), '20 عضواً');
});

test('numbers in parameters are formatted for the language', () => {
  withLanguage('en', () => assert.equal(t('count.items', { count: 12500 }), '12,500 items'));
  assert.equal(formatNumber(12500), '12,500');
});

test('a missing key falls back to Arabic, then to the key — never an empty string', () => {
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('pick() reads { ar, en } data in the chosen language', () => {
  const name = { ar: 'احترافي', en: 'Pro' };
  assert.equal(pick(name), 'احترافي');
  withLanguage('en', () => assert.equal(pick(name), 'Pro'));
  assert.equal(pick('plain'), 'plain');
});

test('listeners hear a change and can unsubscribe', () => {
  const heard = [];
  const off = onLanguageChange((lang) => heard.push(lang));
  setLanguage('en');
  setLanguage('ar');
  off();
  setLanguage('en');
  setLanguage('ar');
  assert.deepEqual(heard, ['en', 'ar']);
});

test('system values are labelled by identity; the stored value never changes', () => {
  const stored = CONDITIONS[0];
  withLanguage('en', () => {
    assert.equal(conditionLabel(stored), 'Excellent');
    assert.equal(unitLabel('قطعة'), 'piece');
    assert.equal(roleLabel('admin'), 'Admin');
    assert.equal(currencySymbol('SAR'), 'SAR');
    assert.equal(conditionLabel('customer wording'), 'customer wording');
    assert.equal(unitLabel('my unit'), 'my unit');
  });
  assert.equal(CONDITIONS[0], stored);
});

test('seeded categories are localised until the customer renames them', () => {
  const seeded = DEFAULT_CATEGORIES[0];
  withLanguage('en', () => {
    assert.notEqual(categoryName(seeded), seeded.name);
    assert.equal(categoryName({ ...seeded, name: 'My own name' }), 'My own name');
    assert.equal(categoryName(UNCATEGORIZED), t('category.uncategorized'));
  });
  assert.equal(categoryName(seeded), seeded.name);
});

test('activity entries hold facts, and read in either language', () => {
  const entry = { action: 'SPREADSHEET_IMPORTED', fileName: 'stock.xlsx', writtenRows: 3 };
  assert.equal(activityDetail(entry), '3 قطعة من stock.xlsx');
  withLanguage('en', () => assert.equal(activityDetail(entry), '3 items from stock.xlsx'));
  assert.equal(activityDetail({ action: 'ITEM_CREATED', itemName: 'ساعة' }), 'ساعة');
});

test('one error code, a message in each language', () => {
  const error = new AppError('error.repo/sku-conflict', { code: 'repo/sku-conflict' });
  assert.equal(error.code, 'repo/sku-conflict');
  assert.equal(describeError(error), 'الرمز SKU مستخدم على قطعة أخرى.');
  withLanguage('en', () => assert.equal(describeError(error), 'This SKU is already used by another item.'));
});

test('every example question offered, in either language, is one the parser answers', async () => {
  const { askInventory, capabilities, suggestions } = await import('../../src/ask.js');
  const lookups = { categories: [], locations: [{ id: 'l1', name: 'الخزنة' }, { id: 'l2', name: 'safe' }], folders: [] };
  const items = [{ id: 'a', name: 'ساعة الجيب', locationId: 'l1', images: [] }, { id: 'b', name: 'pocket watch', locationId: 'l2', images: [] }];
  for (const lang of LANGUAGES) {
    withLanguage(lang, () => {
      for (const question of [...suggestions(), ...capabilities().map((c) => c.example)]) {
        const result = askInventory(question, { items, lookups });
        assert.ok(result.understood, `${lang}: not understood — ${question}`);
      }
    });
  }
});

test('an export’s headings, in either language, map back to their fields on import', async () => {
  const { guessMapping } = await import('../../src/import-mapping.js');
  const fields = {
    sku: 'field.sku', barcode: 'field.barcode', name: 'field.name', category: 'field.category',
    folder: 'field.folder', location: 'field.location', quantity: 'field.quantity', unit: 'field.unit',
    condition: 'field.condition', brand: 'field.brand', serialNumber: 'field.serialNumber',
    modelNumber: 'field.modelNumber', referenceNumber: 'field.referenceNumber',
    valuationMin: 'export.minValuation', valuationMax: 'export.maxValuation', currency: 'field.currency',
    description: 'field.description',
  };
  for (const lang of LANGUAGES) {
    withLanguage(lang, () => {
      const keys = Object.keys(fields);
      const mapping = guessMapping(keys.map((field) => t(fields[field])));
      for (const [index, field] of keys.entries()) assert.equal(mapping[field], index, `${lang}: ${field} (${t(fields[field])})`);
    });
  }
});
