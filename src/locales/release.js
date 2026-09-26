// Legal & Privacy, Support, account deletion, erasing the device, AI consent,
// store purchases — the 1.0.0 release surfaces. The documents themselves are
// in legal-documents.js.

export const messages = {
  // ── Settings ──
  'settings.legal': { ar: 'القانونية والخصوصية', en: 'Legal & Privacy' },
  'settings.about': { ar: 'حول التطبيق', en: 'About' },
  'settings.version': { ar: 'الإصدار {version}', en: 'Version {version}' },
  'settings.versionBuild': { ar: 'الإصدار {version} ({build})', en: 'Version {version} ({build})' },

  // ── legal documents ──
  'legal.privacyPolicy': { ar: 'سياسة الخصوصية', en: 'Privacy Policy' },
  'legal.terms': { ar: 'الشروط والأحكام', en: 'Terms & Conditions' },
  'legal.dataAi': { ar: 'البيانات والذكاء الاصطناعي', en: 'Data & AI Privacy' },
  'legal.dataAiSub': { ar: 'ملخص مختصر لما يحدث لبياناتك', en: 'A short summary of what happens to your data' },
  'legal.lastUpdated': { ar: 'آخر تحديث: {date}', en: 'Last updated: {date}' },
  'legal.commercialRegistration': { ar: 'السجل التجاري', en: 'Commercial Registration' },
  'legal.address': { ar: 'العنوان', en: 'Address' },
  'legal.website': { ar: 'الموقع الإلكتروني', en: 'Website' },
  'legal.email': { ar: 'البريد الإلكتروني', en: 'Email' },
  'legal.webVersion': { ar: 'فتح النسخة المنشورة على الويب', en: 'Open the published web version' },
  'support.noChannel': {
    ar: 'لا تتوفر وسيلة تواصل مباشرة في هذه النسخة من التطبيق. المساعدة أعلاه وأدوات الخصوصية في الإعدادات متاحة لك دائماً.',
    en: 'No direct contact option is available in this version of the app. The help above and the privacy tools in Settings are always available to you.',
  },
  'support.privacyNoChannel': {
    ar: 'يمكنك الآن الوصول إلى بياناتك وتصحيحها وتصديرها وحذفها من داخل التطبيق: عدّل أي قطعة، واستخدم «تصدير بياناتي» و«مسح بيانات هذا الجهاز». لا تتوفر في هذه النسخة وسيلة لإرسال طلب خصوصية مكتوب.',
    en: 'You can access, correct, export and delete your data in the app right now: edit any item, and use Export My Data and Erase Data on This Device. This version has no channel for sending a written privacy request.',
  },
  'legal.contactInApp': {
    ar: 'صفحة «الدعم» في التطبيق (الإعدادات ← القانونية والخصوصية ← الدعم)',
    en: 'the Support page in the app (Settings → Legal & Privacy → Support)',
  },
  'gate.consent': {
    ar: 'بإنشاء الحساب، فإنك توافق على {terms} وتقر بالاطلاع على {privacy}.',
    en: 'By creating an account, you agree to the {terms} and acknowledge the {privacy}.',
  },
  'gate.passwordRule': { ar: 'كلمة المرور: 6 أحرف على الأقل.', en: 'Password: at least 6 characters.' },

  // ── Support ──
  'support.title': { ar: 'الدعم', en: 'Support' },
  'support.rowSub': { ar: 'المساعدة والتواصل وطلبات الخصوصية', en: 'Help, contact and privacy requests' },
  'support.help': { ar: 'مساعدة سريعة', en: 'Quick help' },
  'support.tipAdd': { ar: 'أضف قطعة من زر «+» في الشاشة الرئيسية، مع صورها وموقعها وقيمتها.', en: 'Add an item with the + button on the home screen, with its photos, location and value.' },
  'support.tipScan': { ar: 'امسح باركود أو رمز QR من زر المسح بجانب البحث، أو من حقل الباركود في النموذج.', en: 'Scan a barcode or QR code with the scan button next to search, or from the barcode field in the form.' },
  'support.tipBackup': { ar: 'صدّر نسخة من بياناتك بانتظام من الإعدادات ← البيانات؛ ملف JSON يمكن استعادته لاحقاً.', en: 'Export a copy of your data regularly from Settings → Data; a JSON file can be restored later.' },
  'support.tipSearch': { ar: 'ابحث بالاسم أو SKU أو الباركود أو الرقم التسلسلي، وضيّق النتائج بالفلاتر.', en: 'Search by name, SKU, barcode or serial number, and narrow results with filters.' },
  'support.helpCenter': { ar: 'مركز المساعدة', en: 'Help Center' },
  'support.helpCenterSub': { ar: 'يفتح في المتصفح', en: 'Opens in your browser' },
  'support.contactHeading': { ar: 'تواصل معنا', en: 'Contact us' },
  'support.contact': { ar: 'راسل الدعم', en: 'Email support' },
  'support.contactSubject': { ar: 'دعم نَظْم', en: 'NAZM support' },
  'support.report': { ar: 'الإبلاغ عن مشكلة', en: 'Report a problem' },
  'support.reportSub': { ar: 'يُرفق رقم الإصدار والمنصة فقط', en: 'Only the app version and platform are attached' },
  'support.reportSubject': { ar: 'مشكلة في نَظْم', en: 'Problem with NAZM' },
  'support.privacyRequest': { ar: 'طلبات الخصوصية', en: 'Privacy requests' },
  'support.privacyRequestSub': {
    ar: 'يمكنك الوصول إلى بياناتك وتصحيحها وتصديرها وحذفها من داخل التطبيق مباشرة: عدّل أي قطعة، واستخدم «تصدير بياناتي»، و«مسح بيانات هذا الجهاز»، و«حذف الحساب» إن كان لديك حساب.',
    en: 'You can access, correct, export and delete your data directly in the app: edit any item, and use Export My Data, Erase Data on This Device, and Delete Account if you have an account.',
  },
  'support.privacyRequestSend': { ar: 'إرسال طلب خصوصية', en: 'Send a privacy request' },
  'support.privacySubject': { ar: 'طلب خصوصية — نَظْم', en: 'Privacy request — NAZM' },

  // ── account ──
  'account.name': { ar: 'الاسم', en: 'Name' },
  'account.email': { ar: 'البريد الإلكتروني', en: 'Email' },
  'account.provider': { ar: 'طريقة الدخول', en: 'Sign-in method' },
  'account.provider.apple': { ar: 'Apple', en: 'Apple' },
  'account.provider.google': { ar: 'Google', en: 'Google' },
  'account.provider.password': { ar: 'البريد وكلمة المرور', en: 'Email and password' },
  'account.workspace': { ar: 'مساحة العمل', en: 'Workspace' },
  'account.deleteTitle': { ar: 'حذف الحساب', en: 'Delete Account' },
  'account.deleteRowSub': { ar: 'إنهاء الحساب وحذف بياناته', en: 'Close the account and delete its data' },
  'account.deleteExplain': {
    ar: 'سيؤدي حذف حسابك إلى إنهاء الوصول إلى الحساب وطلب حذف البيانات الشخصية والمحتوى المرتبط به الذي لا يلزم الاحتفاظ به نظاماً. لا يمكن التراجع عن هذه العملية بعد اكتمالها.',
    en: 'Deleting your account ends access to it and requests deletion of the personal data and content linked to it that the law does not require us to keep. This cannot be undone once it is complete.',
  },
  'account.deletePoint.access': { ar: 'لن تتمكن من تسجيل الدخول بهذا الحساب مجدداً.', en: 'You will no longer be able to sign in with this account.' },
  'account.deletePoint.data': { ar: 'تُحذف مساحات العمل التي تملكها وحدك وكل سجلاتها وصورها، وتُزال عضويتك من المساحات الأخرى.', en: 'Workspaces you own alone are deleted with all their records and photos, and you are removed from other workspaces.' },
  'account.deletePoint.device': { ar: 'المخزون المحفوظ على هذا الجهاز دون حساب لا يُحذف بهذا الإجراء؛ امسحه من «مسح بيانات هذا الجهاز».', en: 'An inventory kept on this device without an account is not deleted by this; erase it with Erase Data on This Device.' },
  'account.deletePoint.app': { ar: 'حذف التطبيق من جهازك لا يحذف الحساب.', en: 'Deleting the app from your device does not delete the account.' },
  'account.deletePoint.subscription': { ar: 'اشتراكات App Store تُلغى من إعدادات حسابك في App Store، ولا يلغيها حذف الحساب.', en: 'App Store subscriptions are cancelled in your App Store account settings; deleting the account does not cancel them.' },
  'account.blocked': {
    ar: 'لا يمكن حذف الحساب الآن: أنت مالك مساحات عمل يشاركك فيها آخرون، وحذفها سيحذف بيانات عمل تخصهم.',
    en: 'Your account cannot be deleted yet: you own workspaces other people use, and deleting them would delete business data that is theirs too.',
  },
  'account.blockedHow': {
    ar: 'انقل ملكية كل مساحة إلى أحد أعضائها، أو احذف المساحة، ثم عد إلى هنا.',
    en: 'Transfer ownership of each workspace to one of its members, or delete the workspace, then come back here.',
  },
  'account.willDeleteOwned': {
    ar: { one: 'ستُحذف مساحة عمل واحدة تملكها وحدك.', two: 'ستُحذف مساحتا عمل تملكهما وحدك.', few: 'ستُحذف {count} مساحات عمل تملكها وحدك.', other: 'ستُحذف {count} مساحة عمل تملكها وحدك.' },
    en: { one: 'One workspace you own alone will be deleted.', other: '{count} workspaces you own alone will be deleted.' },
  },
  'account.willLeave': {
    ar: { one: 'ستُزال عضويتك من مساحة عمل واحدة.', two: 'ستُزال عضويتك من مساحتَي عمل.', few: 'ستُزال عضويتك من {count} مساحات عمل.', other: 'ستُزال عضويتك من {count} مساحة عمل.' },
    en: { one: 'You will be removed from one workspace.', other: 'You will be removed from {count} workspaces.' },
  },
  'account.reauthExplain': { ar: 'للتأكد أنك صاحب الحساب، سجّل الدخول مرة أخرى.', en: 'To confirm it is you, sign in again.' },
  'account.reauthPassword': { ar: 'تأكيد بكلمة المرور', en: 'Confirm with password' },
  'account.reauthApple': { ar: 'تأكيد عبر Apple', en: 'Confirm with Apple' },
  'account.reauthGoogle': { ar: 'تأكيد عبر Google', en: 'Confirm with Google' },
  'account.finalWarning': { ar: 'هذه الخطوة الأخيرة. بعد الحذف لا يمكن استعادة الحساب ولا بياناته.', en: 'This is the last step. After deletion, the account and its data cannot be recovered.' },
  'account.confirmWord': { ar: 'حذف', en: 'DELETE' },
  'account.typeToConfirm': { ar: 'اكتب "{word}" للتأكيد', en: 'Type {word} to confirm' },
  'account.deleteNow': { ar: 'حذف الحساب نهائياً', en: 'Delete account permanently' },
  'account.deleting': { ar: 'جارٍ الحذف…', en: 'Deleting…' },
  'account.deleted': { ar: 'حُذف حسابك. شكراً لاستخدامك نَظْم.', en: 'Your account has been deleted. Thank you for using NAZM.' },

  // ── erasing this device ──
  'erase.row': { ar: 'مسح بيانات هذا الجهاز', en: 'Erase Data on This Device' },
  'erase.rowSub': { ar: 'يحذف المخزون المحفوظ على هذا الجهاز', en: 'Deletes the inventory stored on this device' },
  'erase.title': { ar: 'مسح بيانات هذا الجهاز؟', en: 'Erase data on this device?' },
  'erase.message': {
    ar: 'تُحذف من هذا الجهاز كل القطع والصور والمجلدات والتصنيفات والمواقع وسجل النشاط. هذه النسخة الوحيدة من بياناتك، فصدّر نسخة احتياطية أولاً. تبقى لغتك وإعدادات العرض.',
    en: 'Every item, photo, folder, category, location and activity entry on this device is deleted. This is the only copy of your data, so export a backup first. Your language and display settings are kept.',
  },
  'erase.messageCloud': {
    ar: 'يُحذف المخزون المحفوظ على هذا الجهاز فقط. لا يحذف هذا حسابك، ولا البيانات المحفوظة في السحابة.',
    en: 'Only the inventory stored on this device is deleted. This does not delete your account or the data stored in the cloud.',
  },
  'erase.phrase': { ar: 'مسح', en: 'ERASE' },
  'erase.confirm': { ar: 'مسح البيانات', en: 'Erase data' },

  // ── AI consent ──
  'aiConsent.title': { ar: 'استخدام الذكاء الاصطناعي', en: 'AI Processing' },
  'aiConsent.intro': {
    ar: 'تحليل الصور ميزة اختيارية تقترح اسم القطعة وتصنيفها ووصفها وقيمتها التقديرية. قبل أن تستخدمها، هذا ما يحدث:',
    en: 'Photo analysis is an optional feature that suggests an item’s name, category, description and estimated value. Before you use it, here is what happens:',
  },
  'aiConsent.whatHeading': { ar: 'ما الذي يُرسل', en: 'What is sent' },
  'aiConsent.what.photo': { ar: 'صورة القطعة التي تطلب تحليلها.', en: 'The photo of the item you ask to analyse.' },
  'aiConsent.what.context': { ar: 'اسمها وتصنيفها إن كنت أدخلتهما، وأسماء تصنيفاتك لتقع الاقتراحات فيها.', en: 'Its name and category if you entered them, and your category names so suggestions fit them.' },
  'aiConsent.whyHeading': { ar: 'لماذا', en: 'Why' },
  'aiConsent.why': { ar: 'لاقتراح تفاصيل القطعة بدلاً من كتابتها يدوياً.', en: 'To suggest the item’s details instead of you typing them.' },
  'aiConsent.whoHeading': { ar: 'من يعالجها', en: 'Who processes it' },
  'aiConsent.who': {
    ar: 'تمر الصورة بخوادم نَظْم إلى مزوّد ذكاء اصطناعي خارجي يعالجها ويعيد الاقتراحات، وفق سياسة الخصوصية.',
    en: 'The photo passes through NAZM’s servers to an external AI provider, which processes it and returns suggestions, as described in the Privacy Policy.',
  },
  'aiConsent.limitsHeading': { ar: 'اعلم أن', en: 'Please note' },
  'aiConsent.limit.control': { ar: 'القرار لك: لا يُرسل شيء إلا حين تطلب التحليل، ويمكنك سحب الموافقة من الإعدادات.', en: 'You are in control: nothing is sent unless you ask for an analysis, and you can withdraw consent in Settings.' },
  'aiConsent.limit.accuracy': { ar: 'النتائج قد تكون غير دقيقة، ولا يُحفظ منها شيء إلا إذا قبلته.', en: 'Results may be inaccurate, and nothing is saved unless you accept it.' },
  'aiConsent.limit.notAppraisal': { ar: 'الاقتراحات ليست تقييماً مهنياً ولا توثيقاً لأصالة القطعة.', en: 'Suggestions are not a professional appraisal or an authentication of the item.' },
  'aiConsent.agree': { ar: 'موافقة ومتابعة', en: 'Agree & Continue' },
  'aiConsent.cancel': { ar: 'إلغاء', en: 'Cancel' },
  'aiConsent.withdraw': { ar: 'سحب الموافقة على تحليل الصور', en: 'Withdraw consent to photo analysis' },
  'aiConsent.withdrawSub': { ar: 'سيُطلب منك الموافقة مجدداً قبل أي تحليل', en: 'You will be asked again before any analysis' },
  'aiConsent.withdrawn': { ar: 'سُحبت الموافقة', en: 'Consent withdrawn' },

  // ── plans (only when this release sells them) ──
  'planUi.limitTitle': { ar: 'وصلت إلى الحد', en: 'Limit reached' },
  'planUi.limitReached': { ar: 'وصلت إلى الحد المتاح لمساحة العمل هذه.', en: 'You have reached the limit for this workspace.' },
  'planUi.restorePurchases': { ar: 'استعادة المشتريات', en: 'Restore Purchases' },
  'planUi.restoreRequested': { ar: 'جارٍ التحقق من مشترياتك', en: 'Checking your purchases' },
  'planUi.manageSubscription': { ar: 'إدارة الاشتراك', en: 'Manage Subscription' },
  'planUi.purchaseProcessing': { ar: 'تتم معالجة الشراء، وستتحدث خطتك عند اكتماله', en: 'Your purchase is being processed; your plan updates when it completes' },

  // ── scanner ──
  'scan.openSettings': { ar: 'فتح الإعدادات', en: 'Open Settings' },

  // ── errors ──
  'error.account/busy': { ar: 'عملية أخرى قيد التنفيذ. انتظر حتى تكتمل.', en: 'Another operation is in progress. Wait for it to finish.' },
  'error.account/operation-running': { ar: 'يجري استيراد أو استعادة الآن. انتظر حتى يكتمل ثم حاول مجدداً.', en: 'An import or restore is running. Wait for it to finish, then try again.' },
  'error.account/unavailable': { ar: 'هذه الخدمة غير متاحة الآن. حاول لاحقاً.', en: 'This service is not available right now. Try again later.' },
  'error.account/requires-recent-login': { ar: 'لأمان حسابك، سجّل الدخول مجدداً ثم أعد المحاولة.', en: 'For your account’s security, sign in again and retry.' },
  'error.account/owns-shared-workspace': { ar: 'أنت مالك مساحة عمل يشاركك فيها آخرون. انقل ملكيتها أو احذفها أولاً.', en: 'You own a workspace other people use. Transfer or delete it first.' },
  'error.account/too-many-attempts': { ar: 'محاولات كثيرة. حاول بعد قليل.', en: 'Too many attempts. Try again shortly.' },
  'error.account/owner-cannot-leave': { ar: 'مالك المساحة لا يغادرها؛ انقل ملكيتها أو احذفها.', en: 'The owner cannot leave a workspace; transfer or delete it instead.' },
  'error.account/not-a-member': { ar: 'هذا الشخص ليس عضواً في المساحة.', en: 'That person is not a member of the workspace.' },
  'error.account/offline': { ar: 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً — لم يُحذف شيء.', en: 'Could not connect. Check your connection and try again — nothing was deleted.' },
  'error.account/failed': { ar: 'تعذّر إكمال العملية، ولم يُحذف شيء. حاول مجدداً.', en: 'The operation could not be completed, and nothing was deleted. Try again.' },
  'error.account/erase-failed': { ar: 'تعذّر مسح بيانات الجهاز. حاول مجدداً.', en: 'The device data could not be erased. Try again.' },
  'error.account/reauth-cancelled': { ar: 'أُلغي تسجيل الدخول.', en: 'Sign-in was cancelled.' },
  'error.account/reauth-failed': { ar: 'تعذّر التحقق من الحساب. حاول مجدداً.', en: 'The account could not be verified. Try again.' },
  'error.auth/provider-unavailable': { ar: 'طريقة الدخول هذه غير متاحة الآن.', en: 'This sign-in method is not available right now.' },
  'error.billing/unavailable': { ar: 'الشراء غير متاح الآن.', en: 'Purchases are not available right now.' },
  'error.billing/failed': { ar: 'تعذّر إكمال الشراء، ولم يُخصم شيء من قبلنا. حاول مجدداً.', en: 'The purchase could not be completed. Try again.' },
  'error.ai/consent-required': { ar: 'يلزم الموافقة على معالجة الذكاء الاصطناعي أولاً.', en: 'Consent to AI processing is needed first.' },
  'error.scan/denied-settings': {
    ar: 'الوصول إلى الكاميرا متوقف لنَظْم. فعّله من إعدادات الجهاز، أو اختر صورة للرمز أو أدخله يدوياً.',
    en: 'Camera access is off for NAZM. Turn it on in your device Settings, or choose a photo of the code or enter it manually.',
  },
};
