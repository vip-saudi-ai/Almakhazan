// NAZM's legal documents, in Arabic and English, section by section.
//
// Each section carries both languages side by side so a section can never
// exist in one and be missing in the other; tests/unit/legal.test.mjs checks
// that every section has a title and a body in both. The app shows the
// language on screen, never both at once.
//
// Wording rules these documents follow:
//   · Nothing that is not running is described as running. Cloud services,
//     subscriptions, payments and external AI are "when enabled" / "when you
//     choose to use". No provider is named that the configuration does not
//     confirm.
//   · No retention period is promised that the system does not enforce.
//   · No clause removes a right Saudi law makes mandatory.
//
// Placeholders, filled at render time (src/views/legal.js):
//   {entity}   the legal entity's name in the document's language
//   {contact}  the configured privacy/support channel, or the in-app Support page
//
// Body entries: a string is a paragraph; { list: [...] } is a bulleted list.
// Changing a document materially means bumping LEGAL_VERSION.

export const LEGAL_VERSION = '2026-09-25';

/** The approved controller wording — the default for nazm.config.js → legal. */
export const LEGAL_ENTITY = {
  ar: 'شركة مزايدة، المالكة والمشغلة لتطبيق نَظْم (NAZM)',
  en: 'Mazayda Company, owner and operator of the NAZM application',
};

const section = (id, title, ar, en) => ({ id, title, body: { ar, en } });

// ── Privacy Policy ─────────────────────────────────────────────────────────

const PRIVACY = [
  section('about', { ar: 'عن نَظْم', en: 'About NAZM' }, [
    'نَظْم تطبيق لتوثيق المقتنيات والمخزون والأصول وتنظيمها: تسجيل القطع وصورها ومعرّفاتها وقيمها وأماكنها، ومسح الباركود ورموز QR، والاستيراد والتصدير. يعمل التطبيق على جهازك دون حساب، ويمكن أن تُتاح فيه لاحقاً خدمات سحابية اختيارية.',
    'توضح هذه السياسة كيف تُعالَج البيانات الشخصية عند استخدام نَظْم، وهي مكتوبة وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية ولوائحه.',
  ], [
    'NAZM is an application for documenting and organising collections, inventory and assets: recording items, their photos, identifiers, values and locations, scanning barcodes and QR codes, and importing and exporting records. It works on your device without an account, and optional cloud services may be offered in it later.',
    'This policy explains how personal data is processed when you use NAZM. It is written in accordance with the Personal Data Protection Law of the Kingdom of Saudi Arabia and its regulations.',
  ]),
  section('scope', { ar: 'نطاق السياسة', en: 'Scope' }, [
    'تسري هذه السياسة على تطبيق نَظْم على iOS وعلى نسخته على الويب، وعلى أي خدمة مرتبطة به تشير إلى هذه السياسة. ولا تسري على خدمات أطراف أخرى تصل إليها من خلال التطبيق، فلكلٍّ منها سياسته.',
  ], [
    'This policy applies to the NAZM app on iOS, to its web version, and to any related service that refers to this policy. It does not apply to third-party services you reach through the app; each has its own policy.',
  ]),
  section('controller', { ar: 'الجهة المسؤولة عن البيانات', en: 'Data controller' }, [
    'الجهة المسؤولة عن معالجة بياناتك الشخصية هي {entity}.',
    'في مساحات العمل التي تنشئها منشأة لفريقها، تحدد المنشأة ما يُسجَّل فيها ومن يطّلع عليه، وتكون مسؤولة عن بيانات موظفيها ومحتواها وفق الأنظمة التي تخضع لها.',
  ], [
    'The controller responsible for processing your personal data is {entity}.',
    'In workspaces an organisation creates for its team, the organisation decides what is recorded there and who may see it, and is responsible for its staff’s data and its content under the laws that apply to it.',
  ]),
  section('data', { ar: 'البيانات التي نعالجها', en: 'Data we process' }, [
    'نعالج أقل قدر من البيانات يلزم لتقديم الخدمة. وتختلف البيانات بحسب ما تستخدمه:',
    { list: [
      'بيانات الحساب — عند إنشاء حساب إذا كانت الحسابات مفعّلة: الاسم، والبريد الإلكتروني، ومعرّف المستخدم، وطريقة الدخول (البريد وكلمة المرور، أو «تسجيل الدخول مع Apple»، أو Google). لا نطّلع على كلمة المرور.',
      'بيانات المقتنيات والمخزون — ما تدخله أنت: أسماء القطع وأوصافها، والكميات، والتصنيفات، والمواقع، والحالة، والقيم والعملات، والرقم التسلسلي والموديل والمرجع، والملاحظات.',
      'الصور — الصور التي تلتقطها أو تختارها لتوثيق قطعك، ونسخ مصغّرة منها للعرض.',
      'الكاميرا — تُستخدم فقط حين تطلب التصوير أو المسح، ولا يُسجَّل بثّها ولا يُرسل.',
      'الباركود ورموز QR — القيمة المقروءة تُكتب في الحقل الذي طلبت المسح له، وتُعالج على جهازك.',
      'بيانات الفريق ومساحة العمل — عند تفعيل الفرق: اسم المساحة، والأعضاء وأدوارهم، والدعوات، وسجل النشاط (من أضاف أو عدّل ماذا ومتى).',
      'البيانات التقنية والأمنية — عند استخدام الخدمات السحابية: معرّفات الجلسة، ورموز التحقق من سلامة التطبيق، وسجلات الأخطاء التقنية اللازمة للأمان وتشغيل الخدمة.',
      'بيانات الاشتراك والدفع — عند إتاحة الخطط المدفوعة: الخطة وحالتها وتاريخها. تتم عمليات الشراء عبر App Store، ولا نستلم بيانات بطاقتك.',
      'مراسلات الدعم — ما ترسله إلينا حين تتواصل معنا، وردودنا عليه.',
    ] },
  ], [
    'We process the minimum data needed to provide the service. What we process depends on what you use:',
    { list: [
      'Account information — when you create an account, if accounts are enabled: your name, email address, user identifier and sign-in method (email and password, Sign in with Apple, or Google). We never see your password.',
      'Inventory and collection information — what you enter: item names and descriptions, quantities, categories, locations, condition, values and currencies, serial, model and reference numbers, and notes.',
      'Photos — the photos you take or choose to document your items, and smaller copies of them for display.',
      'Camera — used only when you ask to take a photo or scan; its feed is not recorded or sent.',
      'Barcodes and QR codes — the value read is written into the field you scanned for, and is processed on your device.',
      'Team and workspace data — when teams are enabled: the workspace name, its members and their roles, invitations, and the activity log (who added or changed what, and when).',
      'Technical and security data — when you use cloud services: session identifiers, app-integrity tokens, and the technical error logs needed for security and to run the service.',
      'Subscription and payment information — when paid plans are offered: your plan, its status and dates. Purchases are made through the App Store; we do not receive your card details.',
      'Support communications — what you send us when you contact us, and our replies.',
    ] },
  ]),
  section('collection', { ar: 'كيف تُجمع البيانات', en: 'How data is collected' }, [
    { list: [
      'منك مباشرة: ما تكتبه وتصوّره وتستورده وتمسحه.',
      'من جهازك: الكاميرا والصور التي تختارها، وفقط بعد إذنك.',
      'من مزوّد تسجيل الدخول الذي تختاره (Apple أو Google) عند تفعيل الحسابات: اسمك وبريدك — ويمكن لـApple إخفاء بريدك الحقيقي.',
      'من App Store عند إتاحة الاشتراكات: حالة الاشتراك، دون بيانات الدفع.',
      'تلقائياً عند استخدام الخدمات السحابية: البيانات التقنية والأمنية المذكورة أعلاه.',
    ] },
  ], [
    { list: [
      'From you directly: what you type, photograph, import and scan.',
      'From your device: the camera and the photos you select, and only with your permission.',
      'From the sign-in provider you choose (Apple or Google), when accounts are enabled: your name and email — Apple can hide your real address.',
      'From the App Store, when subscriptions are offered: the subscription status, never payment details.',
      'Automatically, when you use cloud services: the technical and security data described above.',
    ] },
  ]),
  section('purposes', { ar: 'أغراض المعالجة', en: 'Purposes of processing' }, [
    { list: [
      'تقديم نَظْم: حفظ سجلاتك وعرضها والبحث فيها وتصديرها.',
      'إنشاء حسابك وإدارته والتحقق من هويتك عند تفعيل الحسابات.',
      'المزامنة والتعاون في مساحات العمل عند تفعيلهما واختيارك لهما.',
      'تحليل الصور بالذكاء الاصطناعي، فقط حين تطلبه وبعد موافقتك.',
      'إدارة الاشتراكات عند إتاحتها.',
      'حماية الخدمة ومستخدميها ومنع إساءة الاستخدام.',
      'الرد على طلبات الدعم وطلبات الخصوصية.',
      'الوفاء بالالتزامات النظامية.',
    ] },
    'لا نستخدم محتوى مقتنياتك للإعلانات، ولا نبيعه.',
  ], [
    { list: [
      'Providing NAZM: storing, showing, searching and exporting your records.',
      'Creating and managing your account and verifying your identity, when accounts are enabled.',
      'Sync and collaboration in workspaces, when enabled and chosen by you.',
      'AI analysis of photos, only when you request it and after your consent.',
      'Managing subscriptions, when offered.',
      'Protecting the service and its users and preventing misuse.',
      'Answering support and privacy requests.',
      'Meeting legal obligations.',
    ] },
    'We do not use your inventory content for advertising, and we do not sell it.',
  ]),
  section('basis', { ar: 'الأساس النظامي للمعالجة', en: 'Legal basis' }, [
    'نعالج البيانات الشخصية على الأساس الذي ينطبق على كل غرض:',
    { list: [
      'تنفيذ الخدمة التي طلبتها والاتفاق بيننا (الشروط والأحكام): الحساب، والسجلات، والمزامنة، والاشتراك.',
      'موافقتك: حيث تكون الموافقة مطلوبة نظاماً، ومنها إرسال صورك وبياناتك إلى مزوّد ذكاء اصطناعي خارجي، وأذونات الكاميرا والصور على جهازك. ويمكنك سحب موافقتك في أي وقت دون أن يؤثر ذلك على ما سبقه.',
      'المصلحة المشروعة: أمن الخدمة ومنع الاحتيال وإصلاح الأعطال، بما لا يضر بحقوقك.',
      'الالتزام النظامي: ما تفرضه الأنظمة السارية في المملكة.',
    ] },
  ], [
    'We process personal data on the basis that applies to each purpose:',
    { list: [
      'Providing the service you asked for and our agreement (the Terms & Conditions): your account, records, sync and subscription.',
      'Your consent: where the law requires consent, including sending your photos and data to an external AI provider, and camera and photo permissions on your device. You may withdraw consent at any time without affecting what came before.',
      'Legitimate interest: security of the service, fraud prevention and fixing faults, in a way that does not override your rights.',
      'Legal obligation: what the laws in force in the Kingdom require.',
    ] },
  ]),
  section('local', { ar: 'التخزين على جهازك', en: 'Local storage on your device' }, [
    'دون حساب أو خدمات سحابية، تبقى سجلاتك وصورك على جهازك فقط، في مساحة التخزين الخاصة بالتطبيق، ولا تُرسل إلينا. لا نستطيع الاطلاع عليها ولا استعادتها لك.',
    'حذف التطبيق من جهازك يحذف هذه البيانات من الجهاز، لكنه لا يحذف حساباً سحابياً إن وُجد. ولحماية سجلاتك من الضياع استخدم «تصدير بياناتي» بانتظام.',
  ], [
    'Without an account or cloud services, your records and photos stay only on your device, in the app’s own storage, and are not sent to us. We cannot see them and cannot recover them for you.',
    'Deleting the app from your device removes this data from the device, but does not delete a cloud account if one exists. To protect your records from loss, use Export My Data regularly.',
  ]),
  section('cloud', { ar: 'المعالجة السحابية (عند تفعيلها)', en: 'Cloud processing (when enabled)' }, [
    'عند تفعيل الخدمات السحابية واختيارك استخدامها، تُحفظ سجلاتك وصورك لدى مزوّدي البنية السحابية الذين نتعاقد معهم، لتتمكن من الوصول إليها من أجهزتك ومشاركتها مع فريقك. تُنقل البيانات مشفّرة، ويُقيَّد الوصول إليها بقواعد أمان تفحص الحساب والمساحة والصلاحية في كل طلب.',
    'لا تُرفع سجلات جهازك إلى السحابة إلا بطلب منك.',
  ], [
    'When cloud services are enabled and you choose to use them, your records and photos are stored with the cloud infrastructure providers we contract with, so you can reach them from your devices and share them with your team. Data travels encrypted, and access is restricted by security rules that check the account, the workspace and the permission on every request.',
    'Records on your device are uploaded to the cloud only when you ask.',
  ]),
  section('ai', { ar: 'الذكاء الاصطناعي', en: 'AI processing' }, [
    'بعض ميزات نَظْم تعمل على جهازك دون إرسال شيء، مثل البحث والمساعد الذي يجيب من سجلاتك ومؤشر جودة البيانات.',
    'عند إتاحة تحليل الصور بالذكاء الاصطناعي واختيارك استخدامه، تُرسل صورة القطعة ومعلومات محدودة عنها (الاسم والتصنيف إن وُجدا) إلى خوادمنا، ومنها إلى مزوّد ذكاء اصطناعي خارجي لمعالجتها وإعادة اقتراحات. نعرض عليك قبل أول إرسال شاشة توضح ذلك ونطلب موافقتك، ولا يحدث أي إرسال دونها.',
    'نتائج الذكاء الاصطناعي اقتراحات قد تكون غير دقيقة، وليست تقييماً مهنياً ولا توثيقاً لأصالة القطع. لا يُحفظ أي اقتراح في سجلاتك إلا إذا قبلته.',
  ], [
    'Some NAZM features run on your device without sending anything, such as search, the assistant that answers from your records, and the data-quality score.',
    'When AI photo analysis is offered and you choose to use it, the item’s photo and limited information about it (its name and category, if any) are sent to our servers and from there to an external AI provider, which processes them and returns suggestions. Before the first transmission we show a screen explaining this and ask for your consent; nothing is sent without it.',
    'AI results are suggestions that may be inaccurate. They are not a professional appraisal or an authentication of any item. No suggestion is saved to your records unless you accept it.',
  ]),
  section('processors', { ar: 'مزوّدو الخدمة', en: 'Service providers' }, [
    'قد نستعين عند تفعيل الخدمات المعنية بمزوّدين يعالجون البيانات نيابة عنا ووفق تعليماتنا فقط: البنية السحابية والاستضافة، وخدمات تسجيل الدخول، ومزوّد الذكاء الاصطناعي، ومعالجة المدفوعات عبر Apple. نلزمهم بحماية البيانات وعدم استخدامها لأغراضهم.',
    'لا نبيع بياناتك الشخصية ولا نشاركها لأغراض إعلانية.',
    'قد نفصح عن البيانات إذا ألزمنا بذلك نظام أو أمر من جهة مختصة.',
  ], [
    'When the relevant services are enabled, we may use providers that process data on our behalf and only on our instructions: cloud infrastructure and hosting, sign-in services, the AI provider, and payment processing through Apple. We require them to protect the data and not to use it for their own purposes.',
    'We do not sell your personal data or share it for advertising.',
    'We may disclose data where a law or an order of a competent authority requires it.',
  ]),
  section('transfers', { ar: 'النقل خارج المملكة', en: 'Transfers outside Saudi Arabia' }, [
    'قد يكون بعض مزوّدي الخدمة المذكورين خارج المملكة العربية السعودية. عند تفعيل خدمة تتطلب ذلك، لا نُجري النقل إلا وفق ما يجيزه نظام حماية البيانات الشخصية ولائحة نقل البيانات خارج المملكة، وبالضمانات التي تتطلبها، وبأقل قدر من البيانات يلزم للغرض.',
    'البيانات المحفوظة على جهازك فقط لا تُنقل.',
  ], [
    'Some of the service providers above may be located outside the Kingdom of Saudi Arabia. When a service that requires this is enabled, we transfer data only as the Personal Data Protection Law and its regulation on transfers outside the Kingdom permit, with the safeguards they require and with the minimum data the purpose needs.',
    'Data kept only on your device is not transferred.',
  ]),
  section('retention', { ar: 'مدة الاحتفاظ', en: 'Retention' }, [
    'نحتفظ بالبيانات ما دامت لازمة للغرض الذي جُمعت له: بيانات الحساب والسجلات السحابية ما دام الحساب قائماً، ومراسلات الدعم ما دام ذلك لازماً لخدمتك، والسجلات التقنية لمدة محدودة تكفي للأمان وتشخيص الأعطال.',
    'قد نحتفظ ببعض البيانات مدة أطول إذا ألزمنا نظام بذلك، أو لإثبات حق أو الدفاع عنه، وبالقدر اللازم لذلك فقط.',
    'البيانات على جهازك تبقى حتى تحذفها أنت أو تحذف التطبيق.',
  ], [
    'We keep data for as long as the purpose it was collected for requires it: account data and cloud records while the account exists, support communications while needed to serve you, and technical logs for a limited period sufficient for security and fault diagnosis.',
    'We may keep some data longer where a law requires it, or to establish or defend a legal claim, and only to the extent needed.',
    'Data on your device stays until you delete it or delete the app.',
  ]),
  section('destruction', { ar: 'الإتلاف والحذف', en: 'Destruction and deletion' }, [
    'عند انتهاء الغرض أو قبول طلب إتلاف، نحذف البيانات أو نجعلها غير قابلة لتحديد صاحبها، ما لم يلزمنا نظام بالاحتفاظ بها. قد تبقى نسخ في النسخ الاحتياطية التقنية لفترة محدودة قبل أن تُستبدل، ولا تُستخدم خلالها لأي غرض آخر.',
    'على جهازك: «مسح بيانات هذا الجهاز» في الإعدادات يحذف سجلات التطبيق وصوره المحفوظة على هذا الجهاز.',
  ], [
    'When the purpose ends or a destruction request is accepted, we delete the data or make it no longer identify you, unless a law requires us to keep it. Copies may remain in technical backups for a limited period before they are overwritten, and are not used for anything else in the meantime.',
    'On your device: Erase Data on This Device in Settings deletes the app’s records and photos stored on that device.',
  ]),
  section('account-deletion', { ar: 'حذف الحساب', en: 'Account deletion' }, [
    'يمكنك طلب حذف حسابك من داخل التطبيق: الإعدادات ← القانونية والخصوصية ← حذف الحساب. يُنهي الحذف الوصول إلى الحساب، ويُحذف معه ما يرتبط به من بيانات شخصية ومحتوى لا يلزم الاحتفاظ به نظاماً.',
    'إذا كنت مالكاً لمساحة عمل يشاركك فيها آخرون، نطلب منك أولاً نقل ملكيتها أو حذفها، حتى لا تُحذف بيانات عمل تخص غيرك دون قرار منهم.',
    'حذف التطبيق من الجهاز لا يحذف الحساب.',
  ], [
    'You can ask to delete your account from inside the app: Settings → Legal & Privacy → Delete Account. Deletion ends access to the account and removes the personal data and content linked to it that the law does not require us to keep.',
    'If you own a workspace that others share with you, we ask you first to transfer its ownership or delete it, so that business data belonging to others is not deleted without their decision.',
    'Deleting the app from your device does not delete the account.',
  ]),
  section('rights', { ar: 'حقوقك', en: 'Your rights' }, [
    'يكفل لك نظام حماية البيانات الشخصية، وفق شروطه وحدوده:',
    { list: [
      'الحق في العلم بكيفية جمع بياناتك ومعالجتها والغرض منها — وهذه السياسة جزء من ذلك.',
      'الحق في الوصول إلى بياناتك الشخصية لدينا.',
      'الحق في الحصول على نسخة منها بصيغة مقروءة وواضحة — ويتيح «تصدير بياناتي» نسخة من سجلاتك.',
      'الحق في تصحيحها أو إكمالها أو تحديثها.',
      'الحق في طلب إتلافها حين لا تعود لازمة للغرض، ما لم يلزم الاحتفاظ بها نظاماً.',
      'الحق في سحب موافقتك حيث تكون المعالجة قائمة على الموافقة.',
    ] },
  ], [
    'The Personal Data Protection Law gives you, under its conditions and limits:',
    { list: [
      'The right to be informed of how your data is collected and processed and why — this policy is part of that.',
      'The right to access the personal data we hold about you.',
      'The right to obtain a copy of it in a readable and clear format — Export My Data provides a copy of your records.',
      'The right to have it corrected, completed or updated.',
      'The right to request its destruction when it is no longer needed for its purpose, unless a law requires it to be kept.',
      'The right to withdraw your consent where processing is based on consent.',
    ] },
  ]),
  section('exercise', { ar: 'كيف تمارس حقوقك', en: 'How to exercise your rights' }, [
    'كثير من هذه الحقوق متاح مباشرة في التطبيق: التعديل والتصدير والحذف. ولأي طلب آخر تواصل معنا عبر {contact}. قد نطلب ما يثبت هويتك قبل تنفيذ الطلب لحماية بياناتك، ونرد خلال المدة التي يحددها النظام.',
  ], [
    'Many of these rights are available directly in the app: editing, exporting and deleting. For any other request, contact us through {contact}. We may ask you to confirm your identity before acting on a request, to protect your data, and we respond within the period the law sets.',
  ]),
  section('security', { ar: 'أمن المعلومات', en: 'Information security' }, [
    'نطبّق تدابير تقنية وتنظيمية مناسبة لحماية البيانات: التشفير أثناء النقل، وقواعد صلاحيات تُفحص على الخادم في كل عملية، وحصر المفاتيح السرية في الخادم، وعدم تضمين أي سر في التطبيق. ولا يوجد نظام آمن تماماً؛ وإذا وقع حادث يمس بياناتك نتصرف ونبلغ وفق ما يفرضه النظام.',
    'أمن جهازك مسؤوليتك أيضاً: قفل الشاشة وتحديث النظام يحميان البيانات المحفوظة عليه.',
  ], [
    'We apply appropriate technical and organisational measures to protect data: encryption in transit, permission rules checked on the server for every operation, secret keys kept only on the server, and no secret embedded in the app. No system is completely secure; if an incident affects your data, we act and notify as the law requires.',
    'Your device’s security is also in your hands: a screen lock and system updates protect the data stored on it.',
  ]),
  section('permissions', { ar: 'أذونات الجهاز', en: 'Device permissions' }, [
    { list: [
      'الكاميرا: لتصوير قطعك ومسح الباركود ورموز QR عند طلبك فقط.',
      'الصور: يُستخدم منتقي الصور في النظام، فلا يصل التطبيق إلا إلى الصور التي تختارها.',
    ] },
    'لا يطلب نَظْم الوصول إلى الميكروفون أو جهات الاتصال أو الموقع الدقيق أو Bluetooth، ولا يطلب إذن التتبع. ويمكنك تغيير الأذونات في أي وقت من إعدادات جهازك.',
  ], [
    { list: [
      'Camera: to photograph your items and scan barcodes and QR codes, only when you ask.',
      'Photos: the system photo picker is used, so the app reaches only the photos you select.',
    ] },
    'NAZM does not ask for the microphone, contacts, precise location or Bluetooth, and does not ask for tracking permission. You can change permissions at any time in your device settings.',
  ]),
  section('third-party-data', { ar: 'بيانات الآخرين', en: 'Data about other people' }, [
    'إذا سجّلت في نَظْم بيانات تخص أشخاصاً آخرين — كاسم مالك سابق أو موظف مسؤول عن أصل — فأنت مسؤول عن أن يكون لديك الحق في ذلك، وعن تسجيل ما يلزم فقط.',
  ], [
    'If you record information about other people in NAZM — such as a previous owner or the employee responsible for an asset — you are responsible for having the right to do so, and for recording only what is needed.',
  ]),
  section('workspace', { ar: 'خصوصية مساحات العمل', en: 'Workspace and team privacy' }, [
    'عند تفعيل الفرق، يرى محتوى المساحة أعضاؤها بحسب الصلاحيات التي يمنحها مالكها ومديروها، ويظهر في سجل النشاط من أجرى كل تغيير. لا يُعرض محتوى مساحتك لغير أعضائها، مع مراعاة الحالات النظامية ومزوّدي الخدمة اللازمين لتشغيل نَظْم.',
    'لا يتضمن نَظْم مشاركة عامة أو صفحات عامة لمحتواك.',
  ], [
    'When teams are enabled, a workspace’s content is visible to its members according to the permissions its owner and admins grant, and the activity log shows who made each change. Your workspace’s content is not shown to non-members, subject to legal requirements and the service providers needed to run NAZM.',
    'NAZM has no public sharing or public pages for your content.',
  ]),
  section('minors', { ar: 'القاصرون', en: 'Minors' }, [
    'نَظْم غير موجّه للأطفال. لا يُنشأ حساب إلا لمن بلغ السن النظامية أو بموافقة وليّه. إذا علمنا أننا جمعنا بيانات طفل دون ذلك، نحذفها.',
  ], [
    'NAZM is not directed at children. An account may be created only by someone of legal age or with their guardian’s consent. If we learn we have collected a child’s data without this, we delete it.',
  ]),
  section('cookies', { ar: 'ملفات تعريف الارتباط والتخزين المحلي', en: 'Cookies and local storage' }, [
    'يستخدم نَظْم التخزين المحلي في المتصفح أو التطبيق لحفظ سجلاتك على جهازك ولغتك وإعداداتك، ولتشغيل التطبيق دون اتصال. ولا نستخدم ملفات تعريف ارتباط إعلانية أو للتتبع. عند تفعيل الحسابات قد تُستخدم ملفات لازمة لتسجيل الدخول فقط.',
  ], [
    'NAZM uses local storage in the browser or app to keep your records, language and settings on your device, and to work offline. We do not use advertising or tracking cookies. When accounts are enabled, cookies strictly needed for sign-in may be used.',
  ]),
  section('tracking', { ar: 'الإعلانات والتتبع', en: 'Advertising and tracking' }, [
    'لا يعرض نَظْم إعلانات، ولا يتضمن أدوات إعلانية أو تحليلات تتبع، ولا يربط بياناتك ببيانات من تطبيقات أو مواقع أخرى لأغراض إعلانية، ولا يبيع بياناتك.',
  ], [
    'NAZM shows no ads, includes no advertising or tracking-analytics tools, does not link your data with data from other apps or websites for advertising, and does not sell your data.',
  ]),
  section('links', { ar: 'روابط وخدمات الأطراف الأخرى', en: 'Third-party links and services' }, [
    'قد يفتح التطبيق روابط أو خدمات لأطراف أخرى، مثل App Store أو صفحات تسجيل الدخول. تخضع هذه لسياسات أصحابها، ولسنا مسؤولين عن ممارساتها.',
  ], [
    'The app may open third-party links or services, such as the App Store or sign-in pages. These are governed by their owners’ policies, and we are not responsible for their practices.',
  ]),
  section('changes', { ar: 'تعديل السياسة', en: 'Changes to this policy' }, [
    'قد نحدّث هذه السياسة. نعرض تاريخ آخر تحديث في أعلاها، وننبّهك داخل التطبيق إلى التغييرات الجوهرية، ونطلب موافقتك مجدداً حيث يلزم ذلك.',
  ], [
    'We may update this policy. The date of the last update is shown at the top, we tell you about material changes inside the app, and we ask for your consent again where required.',
  ]),
  section('contact', { ar: 'الشكاوى والتواصل', en: 'Complaints and contact' }, [
    'لأي سؤال أو طلب أو شكوى تتعلق بالخصوصية تواصل معنا عبر {contact}. وإن لم تكن راضياً عن ردّنا، يحق لك تقديم شكوى إلى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا) بصفتها الجهة المختصة.',
  ], [
    'For any privacy question, request or complaint, contact us through {contact}. If you are not satisfied with our answer, you may lodge a complaint with the Saudi Data & AI Authority (SDAIA) as the competent authority.',
  ]),
  section('acknowledgment', { ar: 'الإقرار', en: 'Acknowledgment' }, [
    'باستخدامك نَظْم تقر بأنك اطّلعت على هذه السياسة. ولا تُعدّ قراءتها موافقة على ما يتطلب موافقة مستقلة، كتحليل الصور بالذكاء الاصطناعي، إذ نطلبها منك في حينه.',
  ], [
    'By using NAZM you acknowledge that you have read this policy. Reading it is not consent to anything that requires separate consent, such as AI photo analysis, which we ask for at the time.',
  ]),
];

// ── Terms & Conditions ─────────────────────────────────────────────────────

const TERMS = [
  section('service', { ar: 'التعريف بالخدمة', en: 'The service' }, [
    'نَظْم تطبيق لتوثيق المقتنيات والمخزون والأصول وتنظيمها، تملكه وتشغّله {entity} («نحن»). تنظّم هذه الشروط استخدامك للتطبيق على iOS والويب وأي خدمة مرتبطة به («الخدمة»).',
  ], [
    'NAZM is an application for documenting and organising collections, inventory and assets, owned and operated by {entity} (“we”). These terms govern your use of the app on iOS and the web and any related service (the “Service”).',
  ]),
  section('acceptance', { ar: 'القبول', en: 'Acceptance' }, [
    'باستخدامك الخدمة أو إنشائك حساباً توافق على هذه الشروط. إن لم توافق عليها فلا تستخدم الخدمة. وتُقرأ هذه الشروط مع سياسة الخصوصية.',
  ], [
    'By using the Service or creating an account you agree to these terms. If you do not agree, do not use the Service. These terms are read together with the Privacy Policy.',
  ]),
  section('eligibility', { ar: 'الأهلية', en: 'Eligibility' }, [
    'يجب أن تكون قد بلغت السن النظامية وتملك الأهلية للتعاقد، أو أن تستخدم الخدمة بموافقة وليّك. وإذا استخدمتها نيابة عن منشأة فأنت تقر بأن لك صلاحية إلزامها بهذه الشروط.',
  ], [
    'You must be of legal age and have the capacity to contract, or use the Service with your guardian’s consent. If you use it on behalf of an organisation, you confirm you have authority to bind it to these terms.',
  ]),
  section('accounts', { ar: 'الحساب وتسجيل الدخول', en: 'Accounts and sign-in' }, [
    'يعمل نَظْم على جهازك دون حساب. وعند إتاحة الحسابات، يلزم أن تكون بياناتك صحيحة، وأن تحافظ على سرية وسيلة دخولك، وأن تبلغنا عن أي استخدام غير مصرّح به. أنت مسؤول عما يتم من خلال حسابك.',
    'إذا سجّلت الدخول عبر Apple أو Google، فإن استخدامك تلك الخدمات يخضع لشروط مزوّدها أيضاً.',
  ], [
    'NAZM works on your device without an account. When accounts are offered, your details must be accurate, you must keep your sign-in method confidential, and you must tell us about any unauthorised use. You are responsible for what is done through your account.',
    'If you sign in with Apple or Google, your use of those services is also governed by their provider’s terms.',
  ]),
  section('local-use', { ar: 'الاستخدام على جهازك', en: 'Use on your device' }, [
    'في الاستخدام دون حساب، تُحفظ سجلاتك وصورك على جهازك فقط. لا نملك نسخة منها ولا نستطيع استعادتها إذا فُقد الجهاز أو حُذف التطبيق أو مُسحت بياناته.',
  ], [
    'When used without an account, your records and photos are stored only on your device. We hold no copy of them and cannot recover them if the device is lost, the app is deleted or its data is erased.',
  ]),
  section('your-data', { ar: 'بياناتك ومحتواك', en: 'Your data and content' }, [
    'ما تدخله في نَظْم من سجلات وصور ومرفقات يبقى ملكاً لك أو لمن تمثله. وتمنحنا الإذن المحدود اللازم لحفظه ومعالجته وعرضه لك ولمن تمنحه الصلاحية، لغرض تقديم الخدمة فقط.',
    'أنت مسؤول عن محتواك ودقته ومشروعيته، وعن حقك في تسجيل ما تسجّله من صور وبيانات، بما فيها بيانات الآخرين. معلومات المخزون والقيم التي تسجّلها هي تقديرك أنت، ولا نتحقق منها.',
  ], [
    'The records, photos and attachments you enter in NAZM remain yours or those of whom you represent. You give us the limited permission needed to store, process and show them to you and to the people you authorise, only to provide the Service.',
    'You are responsible for your content, its accuracy and lawfulness, and your right to record the photos and data you record, including data about others. The inventory information and values you record are your own estimates; we do not verify them.',
  ]),
  section('media', { ar: 'الصور والكاميرا والباركود', en: 'Photos, camera and barcodes' }, [
    'تُستخدم الكاميرا والصور لتوثيق قطعك ومسح الباركود ورموز QR بطلبك. قراءة الرموز تعتمد على جودة الصورة والإضاءة وصيغة الرمز، وقد تفشل أو تخطئ؛ راجع القيمة المقروءة قبل حفظها.',
  ], [
    'The camera and photos are used to document your items and scan barcodes and QR codes at your request. Reading a code depends on image quality, lighting and the code’s format, and may fail or be wrong; check the value read before saving it.',
  ]),
  section('teams', { ar: 'مساحات العمل والفرق والاستخدام التجاري', en: 'Workspaces, teams and business use' }, [
    'عند إتاحة الفرق، يحدد مالك المساحة ومديروها الأعضاء وأدوارهم. المالك مسؤول عن منح الصلاحيات وسحبها، وعن محتوى المساحة. ويجوز استخدام نَظْم لأغراض المنشآت، وتكون المنشأة مسؤولة عن استخدام موظفيها ووفائها بالأنظمة التي تخضع لها.',
  ], [
    'When teams are offered, a workspace’s owner and admins decide its members and their roles. The owner is responsible for granting and withdrawing permissions and for the workspace’s content. NAZM may be used for business purposes; the organisation is responsible for its staff’s use and for meeting the laws that apply to it.',
  ]),
  section('import-export', { ar: 'الاستيراد والتصدير والنسخ الاحتياطي', en: 'Imports, exports and backups' }, [
    'يتيح نَظْم استيراد الملفات وتصدير سجلاتك. أنت مسؤول عن محتوى الملفات التي تستوردها، وعن الاحتفاظ بنسخ احتياطية من بياناتك؛ ونوصيك بتصديرها بانتظام. ملف النسخة الاحتياطية يحتوي السجلات دون ملفات الصور.',
  ], [
    'NAZM lets you import files and export your records. You are responsible for the content of files you import and for keeping backups of your data; we recommend exporting regularly. A backup file contains your records without the image files.',
  ]),
  section('cloud', { ar: 'الخدمات السحابية وتوفر الخدمة', en: 'Cloud services and availability' }, [
    'قد نتيح خدمات سحابية كالمزامنة والفرق. عند إتاحتها نسعى لتوفيرها باستمرار، لكنها قد تنقطع للصيانة أو لأسباب خارجة عن إرادتنا. ويبقى ما على جهازك متاحاً دون اتصال.',
  ], [
    'We may offer cloud services such as sync and teams. When offered, we aim to keep them available, but they may be interrupted for maintenance or for reasons beyond our control. What is on your device stays available offline.',
  ]),
  section('ai', { ar: 'الذكاء الاصطناعي', en: 'AI features' }, [
    'بعض ميزات المساعدة تعمل على جهازك. وعند إتاحة تحليل الصور بالذكاء الاصطناعي، يُجرى لدى مزوّد خارجي بعد موافقتك، وفق سياسة الخصوصية.',
    'نتائج الذكاء الاصطناعي اقتراحات آلية قد تكون غير دقيقة أو ناقصة، وليست تقييماً مهنياً ولا توثيقاً لأصالة أو قيمة. لا تعتمد عليها في قرار مالي أو قانوني دون مراجعة مختص، ولا يُحفظ منها شيء إلا بقبولك.',
  ], [
    'Some assistance features run on your device. When AI photo analysis is offered, it is performed by an external provider after your consent, as described in the Privacy Policy.',
    'AI results are automated suggestions that may be inaccurate or incomplete. They are not a professional appraisal or an authentication of origin or value. Do not rely on them for a financial or legal decision without review by a qualified person; nothing from them is saved unless you accept it.',
  ]),
  section('plans', { ar: 'الخطط والاشتراكات والأسعار', en: 'Plans, subscriptions and pricing' }, [
    'استخدام نَظْم على جهازك متاح دون مقابل. وقد نتيح لاحقاً خططاً مدفوعة؛ وعندها:',
    { list: [
      'تُشترى الاشتراكات داخل تطبيق iOS عبر App Store وتخضع لشروط Apple، وتُدار وتُلغى من إعدادات حسابك في App Store.',
      'تتجدد الاشتراكات تلقائياً ما لم تُلغَ قبل نهاية الفترة الحالية بالمدة التي تحددها Apple.',
      'تُعرض الأسعار قبل الشراء شاملة الضرائب المطبقة أو مع بيانها.',
      'قد نغيّر الأسعار مستقبلاً، ولا يسري التغيير على فترة دفعت ثمنها، ونبلغك مسبقاً وفق ما تتيحه Apple.',
      'تخضع طلبات الاسترداد لسياسات Apple وللأنظمة السارية.',
    ] },
  ], [
    'Using NAZM on your device is available free of charge. We may offer paid plans later; if we do:',
    { list: [
      'Subscriptions in the iOS app are purchased through the App Store, are subject to Apple’s terms, and are managed and cancelled in your App Store account settings.',
      'Subscriptions renew automatically unless cancelled before the end of the current period by the time Apple specifies.',
      'Prices are shown before purchase, including applicable taxes or stating them.',
      'We may change prices in future; a change does not apply to a period already paid for, and we give advance notice as Apple allows.',
      'Refund requests are subject to Apple’s policies and the laws in force.',
    ] },
  ]),
  section('enterprise', { ar: 'اتفاقيات المنشآت', en: 'Enterprise agreements' }, [
    'قد نبرم مع المنشآت اتفاقيات خاصة. وعند التعارض بين اتفاقية موقّعة وهذه الشروط، تسري الاتفاقية في ما نصّت عليه.',
  ], [
    'We may enter into separate agreements with organisations. Where a signed agreement conflicts with these terms, the agreement prevails on what it covers.',
  ]),
  section('acceptable-use', { ar: 'الاستخدام المقبول', en: 'Acceptable use' }, [
    'يُحظر عليك:',
    { list: [
      'استخدام الخدمة لأي غرض مخالف للأنظمة، أو لتسجيل أموال أو أصول غير مشروعة أو إخفائها.',
      'رفع محتوى ينتهك حقوق الآخرين أو خصوصيتهم أو يتضمن برمجيات ضارة.',
      'محاولة الوصول إلى بيانات أو حسابات أو مساحات لا تملك صلاحيتها.',
      'محاولة تعطيل الخدمة أو تجاوز قيودها أو قواعد أمانها أو فحصها دون إذن.',
      'الهندسة العكسية للخدمة إلا بالقدر الذي يجيزه النظام صراحة.',
      'إعادة بيع الخدمة أو استغلالها تجارياً دون اتفاق معنا.',
    ] },
    'يحق لنا اتخاذ ما يلزم لحماية الخدمة عند مخالفة ذلك، ومنه تقييد الوصول والإبلاغ للجهات المختصة حيث يلزم.',
  ], [
    'You must not:',
    { list: [
      'Use the Service for any unlawful purpose, or to record or conceal unlawful funds or assets.',
      'Upload content that infringes others’ rights or privacy, or contains malicious code.',
      'Attempt to access data, accounts or workspaces you are not authorised to access.',
      'Attempt to disrupt the Service, circumvent its limits or security rules, or probe it without permission.',
      'Reverse-engineer the Service except to the extent the law expressly allows.',
      'Resell or commercially exploit the Service without an agreement with us.',
    ] },
    'We may take the steps needed to protect the Service when these rules are broken, including restricting access and reporting to the competent authorities where required.',
  ]),
  section('ip', { ar: 'الملكية الفكرية والترخيص', en: 'Intellectual property and licence' }, [
    'التطبيق وتصميمه واسم نَظْم وشعاره مملوكة لنا أو لمرخّصينا. نمنحك ترخيصاً شخصياً محدوداً غير حصري وغير قابل للتحويل لاستخدام التطبيق وفق هذه الشروط وقواعد استخدام App Store.',
    'الأسماء والعلامات التجارية لأطراف أخرى الظاهرة في التطبيق، ومنها Apple وGoogle، مملوكة لأصحابها.',
  ], [
    'The app, its design, the NAZM name and logo belong to us or our licensors. We grant you a personal, limited, non-exclusive, non-transferable licence to use the app in accordance with these terms and the App Store usage rules.',
    'Third-party names and trademarks shown in the app, including Apple and Google, belong to their owners.',
  ]),
  section('apple', { ar: 'App Store', en: 'The App Store' }, [
    'هذه الشروط بينك وبيننا، وليست Apple طرفاً فيها ولا مسؤولة عن التطبيق أو محتواه أو صيانته أو دعمه أو أي مطالبة تتعلق به. ويحق لـApple والشركات التابعة لها، بصفتها مستفيدة من الغير، التمسك بهذه الشروط تجاهك في ما يخص ترخيص استخدام التطبيق.',
  ], [
    'These terms are between you and us. Apple is not a party to them and is not responsible for the app, its content, maintenance, support or any claim relating to it. Apple and its subsidiaries are third-party beneficiaries of these terms as they relate to the licence to use the app, and may enforce them against you.',
  ]),
  section('privacy', { ar: 'الخصوصية', en: 'Privacy' }, [
    'نعالج بياناتك الشخصية وفق سياسة الخصوصية، وهي متاحة داخل التطبيق دون تسجيل دخول.',
  ], [
    'We process your personal data as described in the Privacy Policy, available inside the app without signing in.',
  ]),
  section('termination', { ar: 'الحذف والإيقاف والإنهاء', en: 'Deletion, suspension and termination' }, [
    'يمكنك التوقف عن استخدام الخدمة في أي وقت، وطلب حذف حسابك من داخل التطبيق. ويجوز لنا إيقاف حساب أو إنهاؤه عند مخالفة جسيمة لهذه الشروط أو إذا ألزمنا نظام بذلك، مع إشعارك حيث يكون ذلك ممكناً ومسموحاً.',
    'عند حذف الحساب أو إنهائه يتوقف الوصول إليه وتُحذف بياناته وفق سياسة الخصوصية، ولا يمكن استعادتها بعد اكتمال الحذف. صدّر ما تحتاجه قبل ذلك. ولا يؤثر ذلك على البيانات المحفوظة على جهازك، ولا على اشتراك App Store الذي تديره Apple.',
  ], [
    'You may stop using the Service at any time and ask to delete your account from inside the app. We may suspend or terminate an account for a serious breach of these terms or where a law requires it, notifying you where possible and permitted.',
    'When an account is deleted or terminated, access to it ends and its data is deleted as the Privacy Policy describes, and cannot be recovered once deletion is complete. Export what you need first. This does not affect data stored on your device, or an App Store subscription, which Apple manages.',
  ]),
  section('updates', { ar: 'التحديثات وتغيير الميزات', en: 'Updates and feature changes' }, [
    'قد نحدّث التطبيق ونضيف ميزات أو نعدّلها أو نوقفها لتحسين الخدمة أو لأسباب أمنية أو نظامية. وإذا أثّر تغيير جوهرياً على خدمة مدفوعة، نبلغك مسبقاً بقدر الإمكان.',
    'نعتمد على خدمات أطراف أخرى (مثل منصات التشغيل وخدمات تسجيل الدخول والبنية السحابية)، وقد تتأثر بعض الميزات بتغيّرها أو توقفها.',
  ], [
    'We may update the app and add, change or discontinue features to improve the Service or for security or legal reasons. Where a change materially affects a paid service, we tell you in advance where possible.',
    'We rely on third-party services (such as operating platforms, sign-in services and cloud infrastructure), and some features may be affected when they change or stop.',
  ]),
  section('warranty', { ar: 'حدود الضمان', en: 'Warranties' }, [
    'نقدّم الخدمة ببذل العناية المعقولة، وفي حدود ما يجيزه النظام تُقدَّم «كما هي» دون ضمان بأن تكون خالية من الأخطاء أو متاحة دائماً أو مناسبة لغرض معين لم نلتزم به. ولا يمس ذلك أي ضمان لا يجوز استبعاده نظاماً.',
  ], [
    'We provide the Service with reasonable care and, to the extent the law permits, “as is”, without a warranty that it will be error-free, always available or fit for a particular purpose we have not committed to. This does not affect any warranty the law does not allow to be excluded.',
  ]),
  section('liability', { ar: 'حدود المسؤولية', en: 'Liability' }, [
    'في حدود ما يجيزه النظام، لا نكون مسؤولين عن الأضرار غير المباشرة أو التبعية، ولا عن فقد بيانات كان يمكن تجنبه بنسخة احتياطية، ولا عن قرارات بُنيت على قيم أو اقتراحات لم يُتحقق منها. ولا يحدّ شيء في هذه الشروط من مسؤوليتنا عن الغش أو الخطأ الجسيم أو أي مسؤولية لا يجوز تحديدها نظاماً.',
  ], [
    'To the extent the law permits, we are not liable for indirect or consequential loss, for loss of data a backup would have prevented, or for decisions based on values or suggestions that were not verified. Nothing in these terms limits our liability for fraud, gross negligence or any liability the law does not allow to be limited.',
  ]),
  section('consumer', { ar: 'حقوق المستهلك', en: 'Consumer rights' }, [
    'لا يُقصد بأي بند في هذه الشروط الانتقاص من حقوقك بصفتك مستهلكاً وفق الأنظمة السارية في المملكة العربية السعودية، وتسري تلك الحقوق عند تعارضها مع هذه الشروط.',
  ], [
    'Nothing in these terms is intended to reduce your rights as a consumer under the laws in force in the Kingdom of Saudi Arabia; those rights prevail where they conflict with these terms.',
  ]),
  section('force-majeure', { ar: 'القوة القاهرة', en: 'Force majeure' }, [
    'لا نُسأل عن تأخر أو تعذّر في تنفيذ التزاماتنا بسبب ظروف خارجة عن سيطرتنا المعقولة، كالكوارث وانقطاع الاتصالات أو خدمات مزوّدين رئيسيين أو قرارات الجهات المختصة.',
  ], [
    'We are not responsible for delay or failure in performing our obligations caused by circumstances beyond our reasonable control, such as disasters, outages of communications or key providers, or decisions of competent authorities.',
  ]),
  section('assignment', { ar: 'التنازل', en: 'Assignment' }, [
    'لا يجوز لك التنازل عن حقوقك أو التزاماتك بموجب هذه الشروط دون موافقتنا. ويجوز لنا التنازل عنها في إطار إعادة هيكلة أو اندماج أو نقل للنشاط، بما لا يمس حقوقك.',
  ], [
    'You may not assign your rights or obligations under these terms without our consent. We may assign them as part of a reorganisation, merger or transfer of the business, without affecting your rights.',
  ]),
  section('severability', { ar: 'استقلال البنود', en: 'Severability' }, [
    'إذا تبيّن أن أي بند غير نافذ، يُطبَّق بالقدر الممكن نظاماً وتبقى بقية البنود سارية.',
  ], [
    'If any provision is found unenforceable, it applies to the extent the law allows and the remaining provisions stay in force.',
  ]),
  section('law', { ar: 'النظام الحاكم وتسوية النزاعات', en: 'Governing law and disputes' }, [
    'تخضع هذه الشروط لأنظمة المملكة العربية السعودية وتفسَّر وفقها. ونسعى لحل أي خلاف ودياً أولاً عبر التواصل معنا، فإن تعذّر ذلك يُحال إلى الجهة القضائية المختصة في المملكة العربية السعودية.',
  ], [
    'These terms are governed by and interpreted under the laws of the Kingdom of Saudi Arabia. We aim to resolve any dispute amicably first, through contacting us; failing that, it is referred to the competent judicial authority in the Kingdom of Saudi Arabia.',
  ]),
  section('amendments', { ar: 'تعديل الشروط', en: 'Amendments' }, [
    'قد نعدّل هذه الشروط. نعرض تاريخ آخر تحديث في أعلاها، وننبّهك داخل التطبيق إلى التغييرات الجوهرية قبل سريانها بمدة معقولة. واستمرارك في الاستخدام بعد سريانها يعني قبولها.',
  ], [
    'We may amend these terms. The date of the last update is shown at the top, and we tell you about material changes inside the app a reasonable time before they take effect. Continuing to use the Service after they take effect means you accept them.',
  ]),
  section('contact', { ar: 'التواصل', en: 'Contact' }, [
    'لأي سؤال عن هذه الشروط تواصل معنا عبر {contact}.',
  ], [
    'For any question about these terms, contact us through {contact}.',
  ]),
  section('acknowledgment', { ar: 'الإقرار', en: 'Final acknowledgment' }, [
    'باستخدامك نَظْم تقر بأنك قرأت هذه الشروط وفهمتها ووافقت عليها.',
  ], [
    'By using NAZM you confirm that you have read, understood and agreed to these terms.',
  ]),
];

// ── Data & AI Privacy (a readable summary, not the policy) ─────────────────

const DATA_AI = [
  section('device', { ar: 'بياناتك على جهازك', en: 'Your data stays on your device' }, [
    'دون مزامنة سحابية، تبقى سجلاتك وصورك على هذا الجهاز فقط، ولا تصل إلينا.',
  ], [
    'Without cloud sync, your records and photos stay only on this device and never reach us.',
  ]),
  section('cloud', { ar: 'السحابة باختيارك', en: 'The cloud is your choice' }, [
    'لا يُرفع شيء إلى السحابة إلا عند تفعيل الخدمات السحابية واختيارك استخدامها.',
  ], [
    'Nothing is uploaded unless cloud services are enabled and you choose to use them.',
  ]),
  section('photos', { ar: 'الصور للتوثيق', en: 'Photos document your items' }, [
    'تُستخدم صورك لتوثيق مقتنياتك داخل سجلاتها، ولا شيء غير ذلك.',
  ], [
    'Your photos are used to document your items in their records, and nothing else.',
  ]),
  section('camera', { ar: 'الكاميرا عند الحاجة فقط', en: 'Camera only when needed' }, [
    'تعمل الكاميرا حين تطلب التصوير أو المسح فقط، وتتوقف فور إغلاقه أو خروجك من التطبيق.',
  ], [
    'The camera runs only when you ask to take a photo or scan, and stops as soon as you close it or leave the app.',
  ]),
  section('ai-optional', { ar: 'الذكاء الاصطناعي اختياري', en: 'AI is optional' }, [
    'البحث والمساعد ومؤشر جودة البيانات تعمل على جهازك. وتحليل الصور بمزوّد خارجي — عند إتاحته — لا يحدث إلا بعد أن نوضح لك ما سيُرسل وتوافق.',
  ], [
    'Search, the assistant and the data-quality score run on your device. Photo analysis by an external provider — when offered — happens only after we show you what will be sent and you agree.',
  ]),
  section('review', { ar: 'راجع الاقتراحات', en: 'Review every suggestion' }, [
    'اقتراحات الذكاء الاصطناعي قد تخطئ، وليست تقييماً مهنياً. لا يُحفظ منها شيء إلا إذا قبلته.',
  ], [
    'AI suggestions can be wrong and are not a professional appraisal. Nothing from them is saved unless you accept it.',
  ]),
  section('no-ads', { ar: 'لا إعلانات ولا بيع', en: 'No ads, no selling' }, [
    'لا يعرض نَظْم إعلانات، ولا يتتبعك، ولا يبيع محتوى مقتنياتك لأي جهة.',
  ], [
    'NAZM shows no ads, does not track you, and does not sell your inventory content to anyone.',
  ]),
];

export const LEGAL_DOCUMENTS = {
  privacy: { title: { ar: 'سياسة الخصوصية', en: 'Privacy Policy' }, sections: PRIVACY },
  terms: { title: { ar: 'الشروط والأحكام', en: 'Terms & Conditions' }, sections: TERMS },
  dataAi: { title: { ar: 'البيانات والذكاء الاصطناعي', en: 'Data & AI Privacy' }, sections: DATA_AI },
};
