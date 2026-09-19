# نشر المخزن v8

## 1. المتطلبات

- Node.js 20
- Firebase CLI: `npm install -g firebase-tools`
- مشروع Firebase على خطة **Blaze** (Cloud Functions تتطلبها)
- مفتاح Anthropic API من <https://console.anthropic.com>

```bash
firebase login
firebase use almakhzan-3d808
```

## 2. تفعيل خدمات Firebase

من Firebase Console:

| الخدمة | الإجراء |
|---|---|
| Authentication | فعّل **Email/Password**، واختيارياً **Google** |
| Firestore | أنشئ قاعدة بيانات (Production mode) |
| Storage | أنشئ bucket افتراضي |
| Functions | تُفعَّل تلقائياً عند أول نشر |
| App Check | (اختياري، موصى به) سجّل reCAPTCHA v3 للويب |

## 3. الأسرار والمتغيّرات

لا يوجد أي سر في الواجهة. المفتاح الوحيد يُخزَّن في Secret Manager:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# الصق المفتاح عند الطلب — لا تضعه في أي ملف
```

| الاسم | المكان | الوصف |
|---|---|---|
| `ANTHROPIC_API_KEY` | Secret Manager | مفتاح Anthropic — خادمي فقط |
| `ANALYSIS_MODEL` | متغيّر بيئة للدالة (اختياري) | افتراضياً `claude-opus-5` |

> `FIREBASE_CONFIG` في `src/config.js` ليس سراً — `apiKey` فيه معرّف مشروع عام، والحماية الفعلية عبر Security Rules وApp Check.

لتفعيل App Check: ضع مفتاح موقع reCAPTCHA v3 في `APP_CHECK_SITE_KEY` داخل `src/config.js`، ثم فعّل الفرض من Console، وبدّل `enforceAppCheck: false` إلى `true` في `functions/index.js`.

## 4. النشر

```bash
# قواعد الأمان والفهارس
firebase deploy --only firestore:rules,firestore:indexes,storage

# الدالة السحابية
cd functions && npm install && cd ..
firebase deploy --only functions

# الواجهة
firebase deploy --only hosting
```

أو دفعة واحدة: `firebase deploy`

## 5. التطوير محلياً

الواجهة تستخدم ES modules، فلا تعمل عبر `file://`. شغّل خادماً:

```bash
npx http-server -p 8080 -c-1
# ثم افتح http://localhost:8080
```

للمحاكيات الكاملة:

```bash
firebase emulators:start
```

## 6. الترقية من الإصدار السابق (v7)

الترقية **لا تبدأ تلقائياً**. بعد تسجيل الدخول لأول مرة، يظهر في **الإعدادات** قسم «بيانات من الإصدار السابق» مع زر «ابدأ الترقية».

ما يحدث عند الضغط:

1. اكتشاف المصدر (`makhzan7` في LocalStorage أو مستند `almakhzan/data`)
2. حفظ نسخة احتياطية كاملة من المصدر قبل أي تحويل
3. ترحيل التصنيفات والمواقع والمجلدات
4. ترحيل القطع واحدة واحدة، مع رفع الصور المضمّنة (Base64) إلى Storage
5. حفظ نقطة تقدّم بعد كل قطعة — الفشل يستأنف ولا يكرّر
6. مقارنة العدد قبل وبعد؛ لا يُعلَن الاكتمال إلا بتطابقهما

**البيانات القديمة لا تُحذف.** يمكن استرجاع النسخة الاحتياطية من IndexedDB تحت المفتاح `migration.v2.backup`.

## 7. الأدوار

كل مستخدم جديد يحصل على مخزن شخصي يكون فيه `owner`. لإضافة عضو:

```
workspaces/{workspaceId}/members/{uid}
{ role: "viewer" | "editor" | "admin", email, displayName, joinedAt }
```

| الدور | القراءة | إضافة/تعديل | حذف نهائي | إدارة الأعضاء |
|---|---|---|---|---|
| viewer | ✓ | — | — | — |
| editor | ✓ | ✓ | — | — |
| admin | ✓ | ✓ | ✓ | ✓ |
| owner | ✓ | ✓ | ✓ | ✓ (+ حذف المخزن) |

الصلاحيات مفروضة في Security Rules، والواجهة تخفي ما لا يُسمح به فقط كتحسين تجربة.

## 8. بنية البيانات

```
users/{uid}                                     → defaultWorkspaceId
workspaces/{workspaceId}                        → name, ownerId, schemaVersion
workspaces/{workspaceId}/members/{uid}          → role
workspaces/{workspaceId}/items/{itemId}         → مستند مستقل لكل قطعة
workspaces/{workspaceId}/folders/{folderId}
workspaces/{workspaceId}/categories/{categoryId}
workspaces/{workspaceId}/locations/{locationId}
workspaces/{workspaceId}/activityLogs/{logId}   → append-only
rateLimits/{uid}                                → حد استخدام التحليل (خادمي)
```

Storage:

```
workspaces/{workspaceId}/items/{itemId}/original/{imageId}.{ext}
workspaces/{workspaceId}/items/{itemId}/thumbnails/{imageId}.jpg
```

## 9. النسخ الاحتياطي

| النوع | الأداة | يشمل |
|---|---|---|
| بيانات | «نسخة احتياطية JSON» في الإعدادات | كل السجلات ومسارات الصور — **لا** يشمل ملفات الصور |
| وسائط | `gsutil -m cp -r gs://<bucket>/workspaces ./backup` | ملفات الصور |
| كامل | الاثنان معاً | — |

لنسخ احتياطي مجدول لـ Firestore: `gcloud firestore export gs://<bucket>/backups/$(date +%F)`

## 10. نسخة بملف واحد (للتجربة فقط)

النسخة المنشورة تعمل بوحدات ES ولا تحتاج بناءً. لكن فتح `index.html` مباشرة من القرص (`file://`) لا يعمل لأن المتصفح يمنع استيراد الوحدات هناك. لتجربة سريعة بدون خادم:

```bash
node tools/build-single-file.mjs   # → dist/almakhzan.html
```

الملف الناتج مستقل بالكامل ويُفتح بالنقر المزدوج. في هذا الوضع يعمل التطبيق محلياً على IndexedDB فقط — لا تسجيل دخول ولا مزامنة ولا تحليل بصري. **لا تنشر هذا الملف**؛ النشر يكون من `index.html` و`src/`.
