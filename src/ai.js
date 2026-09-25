// Claude analysis client.
//
// The browser never holds the Anthropic key and never calls api.anthropic.com.
// It invokes a callable Cloud Function, which authenticates the caller, reads
// the image from Storage with admin credentials, and validates Claude's answer
// before it comes back here.

import { FUNCTIONS_REGION } from './config.js';
import { firebaseContext, isCloudEnabled } from './firebase.js';
import { AppError } from './utils.js';
import { hasMessage, t } from './i18n.js';
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

/** The assistant's connection state, as the `ai.status.<state>` messages. */
export function aiStatusLabel(availability) {
  return t(`ai.status.${availability}`);
}

/**
 * Requests an analysis for an item's primary image.
 * @returns {Promise<object>} validated aiData ready to store on the item
 */
export async function analyzeItem({ workspaceId, itemId, image, name, categoryName, categories = [] }) {
  const availability = aiAvailability();
  if (availability === AiAvailability.OFFLINE) {
    throw new AppError('error.ai/offline', { code: 'ai/offline' });
  }
  if (availability !== AiAvailability.READY) {
    throw new AppError('error.ai/failed-precondition', { code: 'ai/unavailable' });
  }
  if (!image?.storagePath || image.storagePath.startsWith('local:')) {
    throw new AppError('error.ai/no-cloud-image', { code: 'ai/no-cloud-image' });
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
    const reason = error?.code?.replace('functions/', '');
    const key = reason && hasMessage(`error.ai/${reason}`) ? `error.ai/${reason}` : 'error.ai/failed';
    throw new AppError(key, { code: error?.code, cause: error });
  }

  const payload = response?.data;
  if (!payload || payload.ok === false) {
    // The function's own message, when it sent one; it is not ours to translate.
    throw new AppError(payload?.message || 'error.ai/bad-response', { code: 'ai/bad-response' });
  }

  // The function already validated this; re-validating here keeps the client
  // safe even if the backend is ever changed or replaced.
  const aiData = validateAiData(payload.analysis, {
    model: payload.model,
    imageHash: image.hash,
    analyzedAt: Date.now(),
  });
  if (!aiData) throw new AppError('error.ai/empty', { code: 'ai/empty' });

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

export const ASSISTANT_MARK = '✦';
export const aiDisclaimer = () => t('ai.disclaimer');
export const assistantName = () => t('ai.assistantName');
export const aiSubtitle = () => t('ai.subtitle');
export { FUNCTIONS_REGION };
