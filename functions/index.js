'use strict';

/**
 * analyzeInventoryItem — the only path between the browser and Anthropic.
 *
 * The API key is held in Secret Manager and injected into this function's
 * runtime. It is never sent to, or reachable from, the client.
 *
 * Every call is authenticated, authorized against workspace membership, rate
 * limited, and its result validated against a schema before it is returned.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const MODEL = process.env.ANALYSIS_MODEL || 'claude-opus-5';
const CONDITIONS = ['ممتازة', 'جيدة جداً', 'جيدة', 'مقبولة', 'ضعيفة', 'للإتلاف'];
const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP'];
const EDITOR_ROLES = new Set(['editor', 'admin', 'owner']);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };

const SYSTEM_PROMPT = [
  'أنت خبير في تقييم المقتنيات النادرة والثمينة.',
  'مهمتك تحليل بصري أولي للصورة المرفقة فقط: صف القطعة، قدّر حالتها، وأعطِ تقديراً سعرياً مبدئياً.',
  'هذا ليس توثيقاً احترافياً ولا تقييماً معتمداً، ولا تدّعِ أنه كذلك.',
  'إن لم تتمكن من تحديد القطعة بثقة، قل ذلك صراحة في التقييم واخفض درجات الثقة.',
  'استخدم أداة record_analysis لتسجيل النتيجة، ولا تكتب أي نص خارجها.',
].join('\n');

/** Strict schema: the model cannot return a shape this does not describe. */
const ANALYSIS_TOOL = {
  name: 'record_analysis',
  description: 'يسجّل نتيجة التحليل البصري للقطعة.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'وصف دقيق للقطعة في جملتين' },
      evaluation: { type: 'string', description: 'تقييم موجز يذكر درجة اليقين' },
      condition: { type: 'string', enum: CONDITIONS },
      localScore: { type: 'integer', minimum: 0, maximum: 10, description: 'جاذبية القطعة في السوق المحلي' },
      globalScore: { type: 'integer', minimum: 0, maximum: 10, description: 'جاذبية القطعة في السوق العالمي' },
      suggestedValuationMin: { type: 'number', minimum: 0 },
      suggestedValuationMax: { type: 'number', minimum: 0 },
      currency: { type: 'string', enum: CURRENCIES },
    },
    required: [
      'description', 'evaluation', 'condition', 'localScore', 'globalScore',
      'suggestedValuationMin', 'suggestedValuationMax', 'currency',
    ],
    additionalProperties: false,
  },
};

function requireString(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `الحقل ${field} مطلوب`);
  }
  if (value.length > maxLength) {
    throw new HttpsError('invalid-argument', `الحقل ${field} أطول من المسموح`);
  }
  return value.trim();
}

/** The caller must be an editor or above in the workspace they name. */
async function authorize(uid, workspaceId) {
  const snap = await admin.firestore()
    .doc(`workspaces/${workspaceId}/members/${uid}`)
    .get();

  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'لست عضواً في هذا المخزن');
  }
  const role = snap.data().role;
  if (!EDITOR_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'صلاحيتك للعرض فقط');
  }
  return role;
}

/**
 * A simple per-user window counter. Prevents one account from turning the
 * shared API key into an unbounded bill.
 */
async function enforceRateLimit(uid) {
  const ref = admin.firestore().doc(`rateLimits/${uid}`);
  const now = Date.now();

  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const windowStart = data?.windowStart ?? 0;

    if (now - windowStart > RATE_LIMIT.windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }
    if ((data.count ?? 0) >= RATE_LIMIT.max) {
      throw new HttpsError('resource-exhausted', 'تم تجاوز حد التحليلات لهذه الساعة');
    }
    tx.update(ref, { count: (data.count ?? 0) + 1 });
  });
}

/** Reads the image with admin credentials; the client never sends pixels up. */
async function loadImage(workspaceId, itemId, storagePath) {
  const expectedPrefix = `workspaces/${workspaceId}/items/${itemId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    throw new HttpsError('permission-denied', 'مسار الصورة لا يخص هذه القطعة');
  }

  const file = admin.storage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError('not-found', 'الصورة غير موجودة');
  }

  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp|avif)$/.test(contentType)) {
    throw new HttpsError('invalid-argument', 'صيغة الصورة غير مدعومة');
  }
  if (Number(metadata.size) > MAX_IMAGE_BYTES) {
    throw new HttpsError('invalid-argument', 'حجم الصورة كبير جداً للتحليل');
  }

  const [buffer] = await file.download();
  return { data: buffer.toString('base64'), mediaType: contentType };
}

/** Re-checks Claude's output. Schema conformance is not the same as sanity. */
function validateAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const score = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(10, Math.max(0, Math.round(n)));
  };

  const description = typeof raw.description === 'string' ? raw.description.slice(0, 4000).trim() : '';
  const evaluation = typeof raw.evaluation === 'string' ? raw.evaluation.slice(0, 4000).trim() : '';
  if (!description && !evaluation) return null;

  const condition = CONDITIONS.includes(raw.condition) ? raw.condition : null;
  const currency = CURRENCIES.includes(raw.currency) ? raw.currency : 'SAR';

  let suggestedValuation = null;
  const min = Number(raw.suggestedValuationMin);
  const max = Number(raw.suggestedValuationMax);
  if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= 0) {
    suggestedValuation = {
      min: Math.min(min, max),
      max: Math.max(min, max),
      currency,
      source: 'ai',
      valuationType: 'estimate',
      valuationDate: Date.now(),
    };
  }

  return {
    description,
    evaluation,
    condition,
    localScore: score(raw.localScore),
    globalScore: score(raw.globalScore),
    suggestedValuation,
  };
}

function mapAnthropicError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    logger.error('Anthropic credentials rejected', { status: error.status });
    return new HttpsError('failed-precondition', 'إعدادات خدمة التحليل غير صحيحة');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpsError('resource-exhausted', 'الخدمة مزدحمة حالياً، حاول بعد قليل');
  }
  if (error instanceof Anthropic.BadRequestError) {
    logger.error('Anthropic rejected the request', { message: error.message });
    return new HttpsError('invalid-argument', 'تعذّر تجهيز طلب التحليل');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new HttpsError('deadline-exceeded', 'استغرق التحليل وقتاً طويلاً');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new HttpsError('unavailable', 'تعذّر الاتصال بخدمة التحليل');
  }
  if (error instanceof Anthropic.APIError) {
    logger.error('Anthropic API error', { status: error.status, message: error.message });
    return new HttpsError('internal', 'فشل التحليل');
  }
  return null;
}

exports.analyzeInventoryItem = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '512MiB', enforceAppCheck: false },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'سجّل الدخول أولاً');
    }

    const uid = request.auth.uid;
    const workspaceId = requireString(request.data?.workspaceId, 'workspaceId', 128);
    const itemId = requireString(request.data?.itemId, 'itemId', 128);
    const storagePath = requireString(request.data?.storagePath, 'storagePath', 512);
    const name = typeof request.data?.name === 'string' ? request.data.name.slice(0, 200) : '';
    const categoryName = typeof request.data?.categoryName === 'string' ? request.data.categoryName.slice(0, 200) : '';

    await authorize(uid, workspaceId);
    await enforceRateLimit(uid);

    const image = await loadImage(workspaceId, itemId, storagePath);

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 2 });

    const context = [
      name ? `اسم القطعة كما أدخله المستخدم: ${name}` : null,
      categoryName ? `التصنيف: ${categoryName}` : null,
      'حلّل الصورة وسجّل النتيجة عبر أداة record_analysis.',
    ].filter(Boolean).join('\n');

    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        output_config: { effort: 'medium' },
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: 'record_analysis' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: context },
          ],
        }],
      });
    } catch (error) {
      const mapped = mapAnthropicError(error);
      if (mapped) throw mapped;
      logger.error('Unexpected analysis failure', error);
      throw new HttpsError('internal', 'فشل التحليل');
    }

    if (response.stop_reason === 'refusal') {
      logger.warn('Analysis refused', { category: response.stop_details?.category });
      throw new HttpsError('failed-precondition', 'تعذّر تحليل هذه الصورة');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new HttpsError('internal', 'انقطع التحليل قبل اكتماله');
    }

    const toolUse = response.content.find(
      (block) => block.type === 'tool_use' && block.name === 'record_analysis',
    );
    if (!toolUse) {
      logger.error('No analysis tool call in response', { stopReason: response.stop_reason });
      throw new HttpsError('internal', 'لم يُرجع التحليل نتيجة قابلة للاستخدام');
    }

    const analysis = validateAnalysis(toolUse.input);
    if (!analysis) {
      throw new HttpsError('internal', 'نتيجة التحليل غير صالحة');
    }

    // The audit entry is written server-side so it cannot be forged or skipped.
    try {
      await admin.firestore().collection(`workspaces/${workspaceId}/activityLogs`).add({
        action: 'AI_ANALYZED',
        itemId,
        itemName: name || null,
        userId: uid,
        model: response.model,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error('Activity log write failed', error);
    }

    return {
      ok: true,
      model: response.model,
      analysis,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    };
  },
);
