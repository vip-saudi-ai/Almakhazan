'use strict';

// analyzeInventoryItem — the only path between a browser and Anthropic.
//
// The API key lives in Secret Manager and is injected into this function's
// runtime only. Every call is authenticated, authorized against workspace
// membership, metered against the plan's monthly credits, and its image is
// verified to belong to the workspace that asked. Claude's answer is validated
// against a schema before it is returned.

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Anthropic = require('@anthropic-ai/sdk');
const {
  admin, db, bucket, logger,
  requireAuth, requireString, requireMember, assertWithinLimits, monthKey,
} = require('./lib');
const { consumeAiCredit } = require('./usage');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MODEL = process.env.ANALYSIS_MODEL || 'claude-opus-5';
const CONDITIONS = ['ممتازة', 'جيدة جداً', 'جيدة', 'مقبولة', 'ضعيفة', 'للإتلاف'];
const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP'];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
// A second, per-user ceiling on top of the plan's monthly credits, to blunt a
// compromised account burning the whole allowance in one burst.
const BURST_LIMIT = { max: 12, windowMs: 10 * 60 * 1000 };

const SYSTEM_PROMPT = [
  'أنت خبير في تقييم المقتنيات والمعدات والمخزون.',
  'مهمتك تحليل بصري أولي للصورة المرفقة فقط: صف القطعة، قدّر حالتها، وأعطِ تقديراً سعرياً مبدئياً.',
  'هذا ليس توثيقاً احترافياً ولا تقييماً معتمداً، ولا تدّعِ أنه كذلك.',
  'إن لم تتمكن من تحديد القطعة بثقة، قل ذلك صراحة في التقييم واخفض درجات الثقة.',
  'استخدم أداة record_analysis لتسجيل النتيجة، ولا تكتب أي نص خارجها.',
].join('\n');

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
      localScore: { type: 'integer', minimum: 0, maximum: 10 },
      globalScore: { type: 'integer', minimum: 0, maximum: 10 },
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

async function enforceBurstLimit(uid) {
  const ref = db.doc(`rateLimits/${uid}`);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const windowStart = data?.windowStart ?? 0;
    if (now - windowStart > BURST_LIMIT.windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }
    if ((data.count ?? 0) >= BURST_LIMIT.max) {
      throw new HttpsError('resource-exhausted', 'طلبات كثيرة خلال وقت قصير، حاول بعد قليل');
    }
    tx.update(ref, { count: (data.count ?? 0) + 1 });
  });
}

/**
 * Loads the image with admin credentials after proving it belongs to this
 * workspace. A client-supplied path is never trusted.
 */
async function loadImage(workspaceId, mediaId) {
  const snap = await db.doc(`workspaces/${workspaceId}/media/${mediaId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'الصورة غير موجودة');
  }
  const media = snap.data();
  const storagePath = media.storagePath;

  // Defence in depth: the document lives under this workspace, and its path
  // must also sit under the workspace's Storage prefix.
  if (typeof storagePath !== 'string'
      || !storagePath.startsWith(`workspaces/${workspaceId}/`)
      || storagePath.includes('..')) {
    logger.error('ai: media path outside workspace', { workspaceId, mediaId, storagePath });
    throw new HttpsError('permission-denied', 'مسار الصورة غير صالح');
  }

  const file = bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'ملف الصورة غير موجود');

  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp|avif)$/.test(contentType)) {
    throw new HttpsError('invalid-argument', 'صيغة الصورة غير مدعومة للتحليل');
  }
  if (Number(metadata.size) > MAX_IMAGE_BYTES) {
    throw new HttpsError('invalid-argument', 'حجم الصورة كبير جداً للتحليل');
  }

  const [buffer] = await file.download();
  return { data: buffer.toString('base64'), mediaType: contentType, hash: media.hash ?? null };
}

/** Schema conformance is not the same as sanity; re-check the values. */
function validateAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const score = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : null;
  };

  const description = typeof raw.description === 'string' ? raw.description.slice(0, 4000).trim() : '';
  const evaluation = typeof raw.evaluation === 'string' ? raw.evaluation.slice(0, 4000).trim() : '';
  if (!description && !evaluation) return null;

  const currency = CURRENCIES.includes(raw.currency) ? raw.currency : 'SAR';
  const min = Number(raw.suggestedValuationMin);
  const max = Number(raw.suggestedValuationMax);

  let suggestedValuation = null;
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
    condition: CONDITIONS.includes(raw.condition) ? raw.condition : null,
    localScore: score(raw.localScore),
    globalScore: score(raw.globalScore),
    suggestedValuation,
  };
}

function mapAnthropicError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    logger.error('ai: Anthropic credentials rejected', { status: error.status });
    return new HttpsError('failed-precondition', 'إعدادات خدمة التحليل غير صحيحة');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpsError('resource-exhausted', 'الخدمة مزدحمة حالياً، حاول بعد قليل');
  }
  if (error instanceof Anthropic.BadRequestError) {
    logger.error('ai: request rejected', { message: error.message });
    return new HttpsError('invalid-argument', 'تعذّر تجهيز طلب التحليل');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new HttpsError('deadline-exceeded', 'استغرق التحليل وقتاً طويلاً');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new HttpsError('unavailable', 'تعذّر الاتصال بخدمة التحليل');
  }
  if (error instanceof Anthropic.APIError) {
    logger.error('ai: API error', { status: error.status, message: error.message });
    return new HttpsError('internal', 'فشل التحليل');
  }
  return null;
}

exports.analyzeInventoryItem = onCall(
  {
    region: 'us-central1',
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
    // Flip to true once App Check is registered — see DEPLOYMENT.md.
    enforceAppCheck: false,
  },
  async (request) => {
    const uid = requireAuth(request);
    const workspaceId = requireString(request.data?.workspaceId, 'workspaceId', 128);
    const itemId = requireString(request.data?.itemId, 'itemId', 128);
    const mediaId = requireString(request.data?.mediaId ?? request.data?.imageId, 'mediaId', 128);
    const name = typeof request.data?.name === 'string' ? request.data.name.slice(0, 200) : '';
    const categoryName = typeof request.data?.categoryName === 'string' ? request.data.categoryName.slice(0, 200) : '';

    await requireMember(uid, workspaceId, 'editor');
    await assertWithinLimits(workspaceId, 'ai');
    await enforceBurstLimit(uid);

    const image = await loadImage(workspaceId, mediaId);
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 2 });

    const context = [
      name ? `اسم القطعة كما أدخله المستخدم: ${name}` : null,
      categoryName ? `التصنيف: ${categoryName}` : null,
      'حلّل الصورة وسجّل النتيجة عبر أداة record_analysis.',
    ].filter(Boolean).join('\n');

    let response;
    const startedAt = Date.now();
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
      await recordUsage({ workspaceId, uid, itemId, mediaId, status: 'error', error: error.message });
      const mapped = mapAnthropicError(error);
      if (mapped) throw mapped;
      logger.error('ai: unexpected failure', error);
      throw new HttpsError('internal', 'فشل التحليل');
    }

    if (response.stop_reason === 'refusal') {
      logger.warn('ai: analysis refused', { category: response.stop_details?.category });
      await recordUsage({ workspaceId, uid, itemId, mediaId, status: 'refused' });
      throw new HttpsError('failed-precondition', 'تعذّر تحليل هذه الصورة');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new HttpsError('internal', 'انقطع التحليل قبل اكتماله');
    }

    const toolUse = response.content.find(
      (block) => block.type === 'tool_use' && block.name === 'record_analysis',
    );
    if (!toolUse) {
      logger.error('ai: no tool call in response', { stopReason: response.stop_reason });
      throw new HttpsError('internal', 'لم يُرجع التحليل نتيجة قابلة للاستخدام');
    }

    const analysis = validateAnalysis(toolUse.input);
    if (!analysis) throw new HttpsError('internal', 'نتيجة التحليل غير صالحة');

    // Metering and the audit entry are written server-side so neither can be
    // skipped by a modified client.
    await consumeAiCredit(workspaceId);
    await recordUsage({
      workspaceId, uid, itemId, mediaId, status: 'ok',
      model: response.model,
      durationMs: Date.now() - startedAt,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    });

    return {
      ok: true,
      model: response.model,
      analysis,
      // Lets the client mark the analysis stale if the image later changes.
      imageHash: image.hash,
    };
  },
);

async function recordUsage(entry) {
  try {
    await db.collection(`workspaces/${entry.workspaceId}/aiUsage`).add({
      ...entry,
      period: monthKey(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('ai: usage record failed', { error: error.message });
  }
}

/**
 * Health endpoint so Settings can say "متصل" only when the service really is
 * configured — not merely because the Functions SDK loaded.
 */
exports.aiHealth = onCall({ region: 'us-central1', secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  const uid = requireAuth(request);
  const workspaceId = String(request.data?.workspaceId || '');
  await requireMember(uid, workspaceId, 'viewer');

  let configured = false;
  try {
    configured = Boolean(ANTHROPIC_API_KEY.value());
  } catch {
    configured = false;
  }
  if (!configured) return { ok: true, state: 'unconfigured' };

  try {
    await assertWithinLimits(workspaceId, 'ai');
  } catch (error) {
    if (error.code === 'resource-exhausted') return { ok: true, state: 'quota-exceeded', message: error.message };
    if (error.code === 'permission-denied') return { ok: true, state: 'not-in-plan', message: error.message };
    throw error;
  }
  return { ok: true, state: 'ready', model: MODEL };
});

exports._test = { validateAnalysis, CONDITIONS, CURRENCIES };
