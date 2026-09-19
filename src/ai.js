// Claude analysis client.
//
// The browser never holds the Anthropic key and never calls api.anthropic.com.
// It invokes a callable Cloud Function, which authenticates the caller, reads
// the image from Storage with admin credentials, and validates Claude's answer
// before it comes back here.

import { FUNCTIONS_REGION } from './config.js';
import { firebaseContext, isCloudEnabled } from './firebase.js';
import { AppError } from './utils.js';
import { primaryImage, validateAiData } from './validation.js';

export const AiAvailability = {
  READY: 'ready',
  OFFLINE: 'offline',
  UNAVAILABLE: 'unavailable',
};

export function aiAvailability() {
  if (!isCloudEnabled()) return AiAvailability.UNAVAILABLE;
  if (!navigator.onLine) return AiAvailability.OFFLINE;
  return firebaseContext().functions ? AiAvailability.READY : AiAvailability.UNAVAILABLE;
}

export const AI_STATUS_LABELS = {
  ready: 'متصل',
  offline: 'غير متصل',
  unavailable: 'غير مهيأ',
};

const ERROR_MESSAGES = {
  unauthenticated: 'سجّل الدخول لاستخدام التحليل',
  'permission-denied': 'لا تملك صلاحية التحليل',
  'resource-exhausted': 'تم تجاوز حد الاستخدام، حاول بعد قليل',
  'deadline-exceeded': 'استغرق التحليل وقتاً طويلاً، حاول مجدداً',
  unavailable: 'خدمة التحليل غير متاحة حالياً',
  'failed-precondition': 'خدمة التحليل غير مهيأة على الخادم',
  'invalid-argument': 'بيانات التحليل غير مكتملة',
  internal: 'حدث خطأ أثناء التحليل',
};

/**
 * Requests an analysis for an item's primary image.
 * @returns {Promise<object>} validated aiData ready to store on the item
 */
export async function analyzeItem({ workspaceId, itemId, image, name, categoryName, categories = [] }) {
  const availability = aiAvailability();
  if (availability === AiAvailability.OFFLINE) {
    throw new AppError('التحليل يحتاج اتصالاً بالإنترنت', { code: 'ai/offline' });
  }
  if (availability !== AiAvailability.READY) {
    throw new AppError('خدمة التحليل غير مهيأة', { code: 'ai/unavailable' });
  }
  if (!image?.storagePath || image.storagePath.startsWith('local:')) {
    throw new AppError('ارفع الصورة إلى السحابة أولاً', { code: 'ai/no-cloud-image' });
  }

  const { functions, sdk } = firebaseContext();
  const callable = sdk.functions.httpsCallable(functions, 'analyzeInventoryItem', { timeout: 120_000 });

  let response;
  try {
    response = await callable({
      workspaceId,
      itemId,
      imageId: image.id,
      storagePath: image.storagePath,
      name: name || '',
      categoryName: categoryName || '',
      // The workspace's own category names, so a suggestion lands in the
      // customer's taxonomy instead of inventing a new one.
      categories,
    });
  } catch (error) {
    console.error('[ai] callable failed', error);
    const message = ERROR_MESSAGES[error?.code?.replace('functions/', '')] || 'تعذّر إجراء التحليل';
    throw new AppError(message, { code: error?.code, cause: error });
  }

  const payload = response?.data;
  if (!payload || payload.ok === false) {
    throw new AppError(payload?.message || 'استجابة التحليل غير صالحة', { code: 'ai/bad-response' });
  }

  // The function already validated this; re-validating here keeps the client
  // safe even if the backend is ever changed or replaced.
  const aiData = validateAiData(payload.analysis, {
    model: payload.model,
    imageHash: image.hash,
    analyzedAt: Date.now(),
  });
  if (!aiData) throw new AppError('لم يُرجع التحليل نتيجة قابلة للاستخدام', { code: 'ai/empty' });

  return aiData;
}

/**
 * True when the stored analysis describes a different image than the one now
 * attached, so the UI can flag it instead of presenting it as current.
 */
export function isAnalysisStale(item) {
  if (!item?.aiData) return false;
  const image = primaryImage(item);
  if (!image) return true;
  if (!item.aiData.imageHash || !image.hash) return false;
  return item.aiData.imageHash !== image.hash;
}

export const AI_DISCLAIMER = 'هذا التقدير مبني على الصور والمعلومات المتاحة، ولا يُعد توثيقاً احترافياً ولا تقييماً معتمداً.';
export const ASSISTANT_NAME = 'مساعد نَظْم';
export const ASSISTANT_MARK = '✦';
export const AI_TITLE = ASSISTANT_NAME;
export const AI_SUBTITLE = 'تقدير أولي';
export { FUNCTIONS_REGION };
