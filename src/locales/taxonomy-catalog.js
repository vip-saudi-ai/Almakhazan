// The built-in classification library: Main Categories, their Categories, the
// few Subcategories that genuinely help, and the field templates a Category
// recommends. Data only — src/taxonomy.js is the service every screen reads it
// through.
//
// Every id here is stable forever. Items store these ids, never a label, so a
// label can be reworded in either language without touching a single record.
// Adding a definition is safe; renaming or reusing an id is not. A definition
// that is no longer wanted stays, and is hidden.
//
// Aliases are search words only (a customer typing «مولد» or "genset" finds
// Generators); they are never shown as categories of their own.

/**
 * The Main Categories, in their default order. `template` names the field
 * template a Category inherits unless it names its own (`template: null` is
 * "no specialised fields"). `icon` is presentation only.
 */
export const MAIN_CATEGORIES = [
  {
    id: 'equipment_tools', icon: '🛠️', ar: 'معدات وأدوات', en: 'Equipment & Tools', template: 'equipment',
    aliases: { ar: ['معدات', 'ادوات', 'معده'], en: ['equipment', 'tools', 'tool'] },
    categories: [
      { id: 'equipment_heavy', ar: 'معدات ثقيلة', en: 'Heavy Equipment', aliases: { ar: ['شيول', 'حفار', 'بلدوزر'], en: ['excavator', 'loader', 'bulldozer'] } },
      { id: 'equipment_electrical', ar: 'معدات كهربائية', en: 'Electrical Equipment' },
      { id: 'equipment_hand_tools', ar: 'أدوات يدوية', en: 'Hand Tools', aliases: { ar: ['مفك', 'مفتاح', 'شاكوش', 'مطرقة'], en: ['screwdriver', 'wrench', 'hammer', 'spanner'] } },
      { id: 'equipment_power_tools', ar: 'أدوات كهربائية', en: 'Power Tools', aliases: { ar: ['دريل', 'مثقاب', 'صاروخ', 'منشار'], en: ['drill', 'grinder', 'saw'] } },
      { id: 'equipment_workshop', ar: 'معدات ورش', en: 'Workshop Equipment', aliases: { ar: ['ورشة'], en: ['workshop', 'bench'] } },
      { id: 'equipment_safety', ar: 'معدات سلامة', en: 'Safety Equipment', aliases: { ar: ['طفاية', 'خوذة', 'سلامه'], en: ['extinguisher', 'helmet', 'ppe'] } },
      { id: 'equipment_measuring', ar: 'معدات قياس', en: 'Measuring Equipment', aliases: { ar: ['قياس', 'ميزان', 'متر'], en: ['gauge', 'meter', 'scale'] } },
      {
        id: 'equipment_generators', ar: 'مولدات', en: 'Generators',
        aliases: { ar: ['مولد', 'مولد كهرباء', 'جينيريتر', 'جنريتر'], en: ['generator', 'genset'] },
        subcategories: [
          { id: 'equipment_generators_diesel', ar: 'مولدات ديزل', en: 'Diesel Generators', aliases: { ar: ['ديزل'], en: ['diesel'] } },
          { id: 'equipment_generators_petrol', ar: 'مولدات بنزين', en: 'Petrol Generators', aliases: { ar: ['بنزين'], en: ['gasoline', 'petrol'] } },
          { id: 'equipment_generators_gas', ar: 'مولدات غاز', en: 'Gas Generators', aliases: { ar: ['غاز'], en: ['gas', 'lpg'] } },
          { id: 'equipment_generators_portable', ar: 'مولدات متنقلة', en: 'Portable Generators', aliases: { ar: ['متنقل'], en: ['portable'] } },
        ],
      },
      { id: 'equipment_pumps', ar: 'مضخات', en: 'Pumps', aliases: { ar: ['مضخة', 'ماطور', 'غطاس'], en: ['pump'] } },
      { id: 'equipment_compressors', ar: 'ضواغط', en: 'Compressors', aliases: { ar: ['ضاغط', 'كمبروسر'], en: ['compressor'] } },
      { id: 'equipment_lifting', ar: 'معدات رفع', en: 'Lifting Equipment', aliases: { ar: ['ونش', 'رافعة', 'جك'], en: ['hoist', 'jack', 'winch'] } },
      { id: 'equipment_cleaning', ar: 'معدات تنظيف', en: 'Cleaning Equipment', aliases: { ar: ['مكنسة', 'غسالة ضغط'], en: ['vacuum', 'pressure washer'] } },
      { id: 'equipment_agricultural', ar: 'معدات زراعية', en: 'Agricultural Equipment', aliases: { ar: ['زراعة', 'حراثة'], en: ['farm', 'tractor'] } },
      { id: 'equipment_construction', ar: 'معدات بناء', en: 'Construction Equipment', aliases: { ar: ['خلاطة', 'سقالة'], en: ['mixer', 'scaffolding'] } },
      { id: 'equipment_industrial', ar: 'معدات صناعية', en: 'Industrial Equipment', aliases: { ar: ['مصنع', 'مكينة'], en: ['machine', 'factory'] } },
      { id: 'equipment_accessories', ar: 'ملحقات', en: 'Accessories' },
      { id: 'equipment_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'electronics_devices', icon: '💻', ar: 'إلكترونيات وأجهزة', en: 'Electronics & Devices', template: 'electronics',
    aliases: { ar: ['الكترونيات', 'اجهزه الكترونيه', 'الاجهزة الالكترونية'], en: ['electronics'] },
    categories: [
      {
        id: 'electronics_computers', ar: 'حاسب آلي', en: 'Computers',
        aliases: { ar: ['كمبيوتر', 'حاسوب', 'لابتوب'], en: ['computer', 'pc', 'laptop'] },
        subcategories: [
          { id: 'electronics_computers_laptops', ar: 'أجهزة محمولة (لابتوب)', en: 'Laptops', aliases: { ar: ['لابتوب', 'محمول'], en: ['laptop', 'notebook'] } },
          { id: 'electronics_computers_desktops', ar: 'أجهزة مكتبية', en: 'Desktops', aliases: { ar: ['مكتبي'], en: ['desktop'] } },
          { id: 'electronics_computers_tablets', ar: 'أجهزة لوحية', en: 'Tablets', aliases: { ar: ['ايباد', 'تابلت'], en: ['ipad', 'tablet'] } },
        ],
      },
      { id: 'electronics_mobile', ar: 'أجهزة محمولة', en: 'Mobile Devices', aliases: { ar: ['جوال', 'هاتف', 'موبايل'], en: ['phone', 'mobile', 'smartphone', 'iphone'] } },
      { id: 'electronics_displays', ar: 'شاشات', en: 'Displays', aliases: { ar: ['شاشة', 'تلفزيون', 'مونيتر'], en: ['monitor', 'screen', 'tv'] } },
      { id: 'electronics_printers', ar: 'طابعات', en: 'Printers', aliases: { ar: ['طابعة'], en: ['printer', 'scanner'] } },
      { id: 'electronics_networking', ar: 'أجهزة شبكات', en: 'Networking Equipment', aliases: { ar: ['راوتر', 'سويتش', 'شبكة'], en: ['router', 'switch', 'network'] } },
      { id: 'electronics_communication', ar: 'أجهزة اتصالات', en: 'Communication Devices', aliases: { ar: ['لاسلكي', 'اتصالات'], en: ['radio', 'walkie-talkie'] } },
      { id: 'electronics_cameras', ar: 'كاميرات', en: 'Cameras', aliases: { ar: ['كاميرا'], en: ['camera'] } },
      { id: 'electronics_projectors', ar: 'أجهزة عرض', en: 'Projectors', aliases: { ar: ['بروجكتر', 'جهاز عرض'], en: ['projector'] } },
      { id: 'electronics_audio', ar: 'أنظمة صوت', en: 'Audio Equipment', aliases: { ar: ['سماعات', 'مكبر صوت'], en: ['speaker', 'audio', 'microphone'] } },
      { id: 'electronics_storage', ar: 'أجهزة تخزين', en: 'Storage Devices', aliases: { ar: ['هارديسك', 'فلاش'], en: ['hard drive', 'ssd', 'nas'] } },
      { id: 'electronics_servers', ar: 'خوادم', en: 'Servers', aliases: { ar: ['سيرفر', 'خادم'], en: ['server'] } },
      { id: 'electronics_pos', ar: 'أجهزة نقاط البيع', en: 'POS Equipment', aliases: { ar: ['كاشير', 'نقاط بيع'], en: ['pos', 'cashier'] } },
      { id: 'electronics_security', ar: 'أجهزة أمن ومراقبة', en: 'Security & Surveillance Devices', aliases: { ar: ['كاميرات مراقبة', 'انذار'], en: ['cctv', 'alarm', 'surveillance'] } },
      { id: 'electronics_accessories', ar: 'ملحقات إلكترونية', en: 'Electronic Accessories', aliases: { ar: ['شاحن', 'كيبل'], en: ['charger', 'cable'] } },
      { id: 'electronics_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'furniture_fixtures', icon: '🪑', ar: 'أثاث وتجهيزات', en: 'Furniture & Fixtures', template: 'furniture',
    aliases: { ar: ['اثاث', 'مفروشات'], en: ['furniture'] },
    categories: [
      { id: 'furniture_desks', ar: 'مكاتب', en: 'Desks', aliases: { ar: ['مكتب'], en: ['desk'] } },
      { id: 'furniture_chairs', ar: 'كراسي', en: 'Chairs', aliases: { ar: ['كرسي'], en: ['chair'] } },
      { id: 'furniture_tables', ar: 'طاولات', en: 'Tables', aliases: { ar: ['طاولة'], en: ['table'] } },
      { id: 'furniture_cabinets', ar: 'خزائن', en: 'Cabinets', aliases: { ar: ['خزانة', 'دولاب'], en: ['cabinet', 'wardrobe'] } },
      { id: 'furniture_shelving', ar: 'أرفف', en: 'Shelving', aliases: { ar: ['رف'], en: ['shelf', 'rack'] } },
      { id: 'furniture_storage_units', ar: 'وحدات تخزين', en: 'Storage Units' },
      { id: 'furniture_office', ar: 'أثاث مكتبي', en: 'Office Furniture' },
      { id: 'furniture_residential', ar: 'أثاث منزلي', en: 'Residential Furniture', aliases: { ar: ['كنب', 'سرير'], en: ['sofa', 'bed'] } },
      { id: 'furniture_outdoor', ar: 'أثاث خارجي', en: 'Outdoor Furniture' },
      { id: 'furniture_display_fixtures', ar: 'تجهيزات عرض', en: 'Display Fixtures', aliases: { ar: ['فترينة', 'ستاند'], en: ['showcase', 'stand'] } },
      { id: 'furniture_interior_fixtures', ar: 'تجهيزات داخلية', en: 'Interior Fixtures' },
      { id: 'furniture_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'vehicles_machinery', icon: '🚗', ar: 'مركبات وآليات', en: 'Vehicles & Machinery', template: 'vehicle',
    aliases: { ar: ['مركبات', 'سيارات', 'اليات'], en: ['vehicles', 'vehicle', 'machinery'] },
    categories: [
      { id: 'vehicles_cars', ar: 'سيارات', en: 'Cars', aliases: { ar: ['سيارة'], en: ['car'] } },
      { id: 'vehicles_trucks', ar: 'شاحنات', en: 'Trucks', aliases: { ar: ['شاحنة', 'تريلا', 'دينا'], en: ['truck', 'lorry'] } },
      { id: 'vehicles_buses', ar: 'حافلات', en: 'Buses', aliases: { ar: ['باص', 'حافلة'], en: ['bus'] } },
      { id: 'vehicles_motorcycles', ar: 'دراجات نارية', en: 'Motorcycles', aliases: { ar: ['دباب', 'دراجة نارية'], en: ['motorbike', 'motorcycle'] } },
      { id: 'vehicles_special', ar: 'مركبات خاصة', en: 'Special Vehicles' },
      { id: 'vehicles_mobile_heavy', ar: 'معدات ثقيلة متحركة', en: 'Mobile Heavy Machinery', template: 'equipment' },
      { id: 'vehicles_cranes', ar: 'رافعات', en: 'Cranes', aliases: { ar: ['كرين'], en: ['crane'] }, template: 'equipment' },
      { id: 'vehicles_forklifts', ar: 'رافعات شوكية', en: 'Forklifts', aliases: { ar: ['فوركلفت', 'رافعة شوكية'], en: ['forklift'] }, template: 'equipment' },
      { id: 'vehicles_trailers', ar: 'مقطورات', en: 'Trailers', aliases: { ar: ['مقطورة'], en: ['trailer'] } },
      { id: 'vehicles_boats', ar: 'قوارب', en: 'Boats', aliases: { ar: ['قارب', 'يخت'], en: ['boat', 'yacht'] } },
      { id: 'vehicles_engines', ar: 'محركات', en: 'Engines', aliases: { ar: ['محرك', 'مكينة'], en: ['engine'] }, template: 'equipment' },
      { id: 'vehicles_plates_keys', ar: 'لوحات ومفاتيح', en: 'Plates & Keys', template: null },
      { id: 'vehicles_documents', ar: 'مستندات المركبة', en: 'Vehicle Documents', aliases: { ar: ['استمارة'], en: ['registration'] }, template: null },
      { id: 'vehicles_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'materials_supplies', icon: '🧱', ar: 'مواد ومستلزمات', en: 'Materials & Supplies', template: 'product',
    aliases: { ar: ['مواد', 'مستلزمات', 'خامات'], en: ['materials', 'supplies'] },
    categories: [
      { id: 'materials_raw', ar: 'مواد خام', en: 'Raw Materials', aliases: { ar: ['خام'], en: ['raw'] } },
      { id: 'materials_operating', ar: 'مواد تشغيل', en: 'Operating Supplies' },
      { id: 'materials_packaging', ar: 'مواد تغليف', en: 'Packaging Materials', aliases: { ar: ['كراتين', 'تغليف'], en: ['boxes', 'wrap'] } },
      { id: 'materials_office', ar: 'مواد مكتبية', en: 'Office Supplies', aliases: { ar: ['قرطاسية', 'ورق'], en: ['stationery', 'paper'] } },
      { id: 'materials_cleaning', ar: 'مواد نظافة', en: 'Cleaning Supplies', aliases: { ar: ['منظفات'], en: ['detergent'] } },
      { id: 'materials_maintenance', ar: 'مواد صيانة', en: 'Maintenance Supplies' },
      { id: 'materials_construction', ar: 'مواد بناء', en: 'Construction Materials', aliases: { ar: ['اسمنت', 'حديد', 'بلك'], en: ['cement', 'rebar', 'blocks'] } },
      { id: 'materials_electrical', ar: 'مواد كهربائية', en: 'Electrical Materials', aliases: { ar: ['اسلاك', 'افياش'], en: ['wire', 'sockets'] } },
      { id: 'materials_plumbing', ar: 'مواد صحية', en: 'Plumbing & Sanitary Materials', aliases: { ar: ['مواسير', 'سباكة'], en: ['pipes', 'plumbing'] } },
      { id: 'materials_consumables', ar: 'مواد استهلاكية', en: 'Consumables' },
      { id: 'materials_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'spare_parts', icon: '🔩', ar: 'قطع غيار', en: 'Spare Parts', template: 'product',
    aliases: { ar: ['اسبير', 'قطعة غيار'], en: ['spare parts', 'spares'] },
    categories: [
      { id: 'parts_mechanical', ar: 'قطع غيار ميكانيكية', en: 'Mechanical Parts' },
      { id: 'parts_electrical', ar: 'قطع غيار كهربائية', en: 'Electrical Parts' },
      { id: 'parts_electronic', ar: 'قطع غيار إلكترونية', en: 'Electronic Parts' },
      { id: 'parts_vehicle', ar: 'قطع غيار مركبات', en: 'Vehicle Parts' },
      { id: 'parts_equipment', ar: 'قطع غيار معدات', en: 'Equipment Parts' },
      { id: 'parts_device', ar: 'قطع غيار أجهزة', en: 'Device Parts' },
      { id: 'parts_filters', ar: 'فلاتر', en: 'Filters', aliases: { ar: ['فلتر'], en: ['filter'] } },
      { id: 'parts_belts', ar: 'سيور', en: 'Belts', aliases: { ar: ['سير'], en: ['belt'] } },
      { id: 'parts_batteries', ar: 'بطاريات', en: 'Batteries', aliases: { ar: ['بطارية'], en: ['battery'] } },
      { id: 'parts_motors', ar: 'محركات', en: 'Motors', aliases: { ar: ['موتور'], en: ['motor'] } },
      { id: 'parts_maintenance_consumables', ar: 'مستهلكات صيانة', en: 'Maintenance Consumables', aliases: { ar: ['زيوت', 'شحوم'], en: ['oil', 'grease'] } },
      { id: 'parts_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'products_merchandise', icon: '📦', ar: 'منتجات وبضائع', en: 'Products & Merchandise', template: 'product',
    aliases: { ar: ['منتجات', 'بضائع', 'بضاعة'], en: ['products', 'merchandise', 'stock', 'goods'] },
    categories: [
      { id: 'products_finished', ar: 'منتجات جاهزة', en: 'Finished Products' },
      { id: 'products_for_sale', ar: 'بضائع للبيع', en: 'Merchandise' },
      { id: 'products_samples', ar: 'عينات', en: 'Samples', aliases: { ar: ['عينة'], en: ['sample'] } },
      { id: 'products_accessories', ar: 'إكسسوارات', en: 'Accessories' },
      { id: 'products_packaging', ar: 'تغليف', en: 'Packaging' },
      { id: 'products_returned', ar: 'منتجات مرتجعة', en: 'Returned Products', aliases: { ar: ['مرتجع'], en: ['returns'] } },
      { id: 'products_damaged', ar: 'منتجات تالفة', en: 'Damaged Products', aliases: { ar: ['تالف'], en: ['damaged'] } },
      { id: 'products_seasonal', ar: 'منتجات موسمية', en: 'Seasonal Products' },
      { id: 'products_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'art_collectibles', icon: '🎨', ar: 'فن ومقتنيات', en: 'Art & Collectibles', template: 'art',
    aliases: { ar: ['فن', 'فنون', 'مقتنيات', 'تحف'], en: ['art', 'collectibles', 'collection'] },
    categories: [
      { id: 'art_paintings', ar: 'لوحات', en: 'Paintings', aliases: { ar: ['لوحة', 'رسم', 'رسمة'], en: ['painting', 'canvas'] } },
      { id: 'art_sculptures', ar: 'منحوتات', en: 'Sculptures', aliases: { ar: ['منحوتة', 'تمثال'], en: ['sculpture', 'statue'] } },
      { id: 'art_works_on_paper', ar: 'أعمال ورقية', en: 'Works on Paper', aliases: { ar: ['رسم ورقي'], en: ['drawing'] } },
      { id: 'art_prints', ar: 'مطبوعات', en: 'Prints', aliases: { ar: ['طباعة حجرية'], en: ['print', 'lithograph'] } },
      { id: 'art_photography', ar: 'تصوير فوتوغرافي', en: 'Photography', aliases: { ar: ['صورة'], en: ['photograph', 'photo'] } },
      { id: 'art_digital', ar: 'فن رقمي', en: 'Digital Art', aliases: { ar: ['رقمي'], en: ['digital', 'nft'] } },
      { id: 'art_ceramics', ar: 'خزف وفخار', en: 'Ceramics & Pottery', aliases: { ar: ['خزف', 'فخار', 'بورسلين'], en: ['ceramic', 'pottery', 'porcelain'] } },
      { id: 'art_textiles', ar: 'نسيج', en: 'Textiles', aliases: { ar: ['سجاد', 'سجادة', 'قماش'], en: ['carpet', 'rug', 'tapestry'] } },
      { id: 'art_antiques', ar: 'تحف', en: 'Antiques', aliases: { ar: ['تحفة', 'انتيك', 'انتيكات'], en: ['antique'] } },
      { id: 'art_memorabilia', ar: 'مقتنيات تذكارية', en: 'Memorabilia', aliases: { ar: ['تذكار'], en: ['souvenir'] } },
      { id: 'art_coins_medals', ar: 'عملات وميداليات', en: 'Coins & Medals', aliases: { ar: ['عملة', 'ميدالية', 'وسام'], en: ['coin', 'medal', 'numismatics'] } },
      { id: 'art_historical_arms', ar: 'أسلحة تاريخية', en: 'Historical Arms', aliases: { ar: ['سيف', 'خنجر', 'سلاح قديم'], en: ['sword', 'dagger', 'arms'] } },
      { id: 'art_historical_objects', ar: 'مقتنيات تاريخية', en: 'Historical Objects', aliases: { ar: ['اثار', 'اثري'], en: ['artifact', 'antiquity'] } },
      { id: 'art_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'jewellery_gemstones', icon: '💎', ar: 'مجوهرات وأحجار', en: 'Jewellery & Gemstones', template: 'jewellery',
    aliases: { ar: ['مجوهرات', 'حلي', 'ذهب', 'احجار'], en: ['jewellery', 'jewelry', 'gems', 'gold'] },
    categories: [
      { id: 'jewellery_diamonds', ar: 'ألماس', en: 'Diamonds', aliases: { ar: ['الماس', 'الماسة'], en: ['diamond'] }, template: 'diamond' },
      { id: 'jewellery_gems', ar: 'أحجار كريمة', en: 'Gemstones', aliases: { ar: ['ياقوت', 'زمرد', 'فيروز', 'حجر كريم'], en: ['ruby', 'emerald', 'sapphire', 'gemstone'] }, template: 'gemstone' },
      { id: 'jewellery_organic', ar: 'أحجار عضوية', en: 'Organic Gem Materials', aliases: { ar: ['لؤلؤ', 'مرجان', 'كهرمان'], en: ['pearl', 'coral', 'amber'] }, template: 'gemstone' },
      { id: 'jewellery_loose_stones', ar: 'أحجار مفردة', en: 'Loose Stones', template: 'gemstone' },
      { id: 'jewellery_rings', ar: 'خواتم', en: 'Rings', aliases: { ar: ['خاتم', 'دبلة'], en: ['ring'] } },
      { id: 'jewellery_necklaces', ar: 'عقود', en: 'Necklaces', aliases: { ar: ['عقد', 'قلادة', 'سلسال'], en: ['necklace', 'pendant', 'chain'] } },
      { id: 'jewellery_bracelets', ar: 'أساور', en: 'Bracelets', aliases: { ar: ['سوار', 'اسورة'], en: ['bracelet', 'bangle'] } },
      { id: 'jewellery_earrings', ar: 'أقراط', en: 'Earrings', aliases: { ar: ['حلق', 'قرط'], en: ['earring'] } },
      { id: 'jewellery_brooches', ar: 'دبابيس', en: 'Brooches', aliases: { ar: ['بروش', 'دبوس'], en: ['brooch', 'pin'] } },
      { id: 'jewellery_watches', ar: 'ساعات', en: 'Watches', aliases: { ar: ['ساعة', 'رولكس'], en: ['watch', 'timepiece'] } },
      { id: 'jewellery_other_jewellery', ar: 'مجوهرات أخرى', en: 'Other Jewellery' },
      { id: 'jewellery_certificates', ar: 'شهادات وتقارير', en: 'Certificates & Reports', aliases: { ar: ['شهادة', 'تقرير مختبر'], en: ['certificate', 'report'] }, template: null },
      { id: 'jewellery_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'books_documents', icon: '📚', ar: 'كتب ووثائق', en: 'Books & Documents', template: 'books',
    aliases: { ar: ['كتب', 'وثائق', 'مستندات'], en: ['books', 'documents', 'papers'] },
    categories: [
      { id: 'books_books', ar: 'كتب', en: 'Books', aliases: { ar: ['كتاب'], en: ['book'] } },
      { id: 'books_manuscripts', ar: 'مخطوطات', en: 'Manuscripts', aliases: { ar: ['مخطوط', 'مخطوطة'], en: ['manuscript'] } },
      { id: 'books_qurans', ar: 'مصاحف', en: 'Qurans', aliases: { ar: ['مصحف', 'قران'], en: ['quran', 'koran', 'mushaf'] } },
      { id: 'books_docs', ar: 'وثائق', en: 'Documents', aliases: { ar: ['وثيقة', 'مستند'], en: ['document'] } },
      { id: 'books_letters', ar: 'رسائل', en: 'Letters', aliases: { ar: ['رسالة', 'خطاب'], en: ['letter'] } },
      { id: 'books_decrees', ar: 'فرمانات ومراسيم', en: 'Decrees & Firmans', aliases: { ar: ['فرمان', 'مرسوم'], en: ['firman', 'decree'] } },
      { id: 'books_maps', ar: 'خرائط', en: 'Maps', aliases: { ar: ['خريطة', 'اطلس'], en: ['map', 'atlas'] } },
      { id: 'books_historical_photos', ar: 'صور تاريخية', en: 'Historical Photographs', aliases: { ar: ['صورة قديمة'], en: ['old photo'] } },
      { id: 'books_periodicals', ar: 'مجلات ودوريات', en: 'Journals & Periodicals', aliases: { ar: ['مجلة', 'جريدة'], en: ['magazine', 'journal', 'newspaper'] } },
      { id: 'books_archive', ar: 'أرشيف', en: 'Archive Material', aliases: { ar: ['ارشيف'], en: ['archive'] } },
      { id: 'books_certificates', ar: 'شهادات', en: 'Certificates', aliases: { ar: ['شهادة'], en: ['certificate'] } },
      { id: 'books_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'clothing_accessories', icon: '👕', ar: 'ملابس وإكسسوارات', en: 'Clothing & Accessories', template: null,
    aliases: { ar: ['ملابس', 'ازياء'], en: ['clothing', 'apparel', 'fashion'] },
    categories: [
      { id: 'clothing_clothing', ar: 'ملابس', en: 'Clothing', aliases: { ar: ['ثوب', 'قميص'], en: ['shirt', 'dress'] } },
      { id: 'clothing_footwear', ar: 'أحذية', en: 'Footwear', aliases: { ar: ['حذاء', 'جزمة'], en: ['shoes', 'shoe'] } },
      { id: 'clothing_bags', ar: 'حقائب', en: 'Bags', aliases: { ar: ['شنطة', 'حقيبة'], en: ['bag', 'handbag'] } },
      { id: 'clothing_eyewear', ar: 'نظارات', en: 'Eyewear', aliases: { ar: ['نظارة'], en: ['glasses', 'sunglasses'] } },
      { id: 'clothing_belts', ar: 'أحزمة', en: 'Belts', aliases: { ar: ['حزام'], en: ['belt'] } },
      { id: 'clothing_accessory_items', ar: 'إكسسوارات', en: 'Accessories' },
      { id: 'clothing_heritage', ar: 'أزياء تراثية', en: 'Heritage Clothing', aliases: { ar: ['تراثي', 'بشت'], en: ['traditional'] } },
      { id: 'clothing_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'professional_equipment', icon: '🔬', ar: 'أدوات ومعدات مهنية', en: 'Professional Equipment', template: 'equipment',
    aliases: { ar: ['مهنية', 'مختبر', 'استوديو'], en: ['professional', 'lab', 'studio'] },
    categories: [
      { id: 'professional_lab', ar: 'أجهزة مختبر', en: 'Laboratory Equipment', aliases: { ar: ['مختبر', 'مجهر', 'ميكروسكوب'], en: ['laboratory', 'microscope'] } },
      { id: 'professional_measurement', ar: 'أجهزة قياس وتحليل', en: 'Measurement & Analysis Equipment', aliases: { ar: ['تحليل', 'مطياف'], en: ['analyzer', 'spectrometer'] } },
      { id: 'professional_imaging', ar: 'معدات تصوير', en: 'Imaging Equipment', aliases: { ar: ['عدسة', 'اضاءة'], en: ['lens', 'lighting'] } },
      { id: 'professional_artistic_tools', ar: 'أدوات فنية', en: 'Artistic Tools', aliases: { ar: ['فرش', 'ألوان'], en: ['brushes', 'easel'] } },
      { id: 'professional_production', ar: 'معدات إنتاج', en: 'Production Equipment' },
      { id: 'professional_training', ar: 'معدات تدريب', en: 'Training Equipment' },
      { id: 'professional_technical', ar: 'معدات تقنية', en: 'Technical Equipment' },
      { id: 'professional_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    id: 'assets_property', icon: '🏢', ar: 'أصول وممتلكات', en: 'Assets & Property', template: null,
    aliases: { ar: ['اصول', 'ممتلكات', 'عقار'], en: ['assets', 'property'] },
    categories: [
      { id: 'assets_fixed', ar: 'أصول ثابتة', en: 'Fixed Assets' },
      { id: 'assets_buildings', ar: 'مبانٍ', en: 'Buildings', aliases: { ar: ['مبنى', 'مباني'], en: ['building'] } },
      { id: 'assets_land', ar: 'أراضٍ', en: 'Land', aliases: { ar: ['ارض', 'اراضي'], en: ['plot'] } },
      { id: 'assets_real_estate_units', ar: 'وحدات عقارية', en: 'Real Estate Units', aliases: { ar: ['شقة', 'فيلا', 'محل'], en: ['apartment', 'unit', 'villa'] } },
      { id: 'assets_fixtures', ar: 'تجهيزات', en: 'Fixtures' },
      { id: 'assets_furniture', ar: 'أثاث', en: 'Furniture Assets', template: 'furniture' },
      { id: 'assets_equipment', ar: 'أجهزة', en: 'Equipment Assets', template: 'equipment' },
      { id: 'assets_leased', ar: 'أصول مؤجرة', en: 'Leased Assets', aliases: { ar: ['مستأجر', 'ايجار'], en: ['lease', 'rented'] } },
      { id: 'assets_other', ar: 'أخرى', en: 'Other', other: true },
    ],
  },
  {
    // Deliberately empty: the customer's own Categories go here.
    id: 'other', icon: '🗂️', ar: 'أخرى', en: 'Other', template: null,
    aliases: { ar: ['متنوع', 'عام'], en: ['misc', 'general'] },
    categories: [],
  },
];

/**
 * Where categories from before the hierarchy go when nothing maps them safely.
 * Shown only while it holds something — a new inventory never sees it.
 */
export const PREVIOUS_MAIN = {
  id: 'previous_categories', icon: '🗃️', ar: 'تصنيفات سابقة', en: 'Earlier Categories', template: null,
  aliases: { ar: [], en: [] }, categories: [], onlyWhenUsed: true,
};

/**
 * The categories NAZM seeded before the hierarchy existed, and where each one
 * goes. Only these ids, and only while the customer has not renamed them (a
 * renamed seed is the customer's own category now), are placed by this table.
 *
 *   category  the seed is the same thing as a built-in Category: its records
 *             move there and keep the old id in `legacyCategoryId`.
 *   main      the seed is a clear kind of thing but no single built-in
 *             Category: it stays, with its id and name, as a custom Category
 *             under that Main Category.
 *   neither   it stays, unchanged, under «تصنيفات سابقة».
 *
 * `mainOnly` records have a clear Main Category and no Category: the seed was
 * as broad as the Main Category itself («المعدات»).
 */
export const LEGACY_CATEGORY_MAP = {
  c1: { main: 'art_collectibles' },                     // الفنون الجميلة
  c2: { main: 'art_collectibles', category: 'art_antiques' }, // التحف والأنتيكات
  c3: { main: 'books_documents' },                      // المخطوطات والوثائق النادرة
  c4: { main: 'art_collectibles', category: 'art_historical_arms' }, // الأسلحة التاريخية
  c5: { main: 'jewellery_gemstones' },                  // المجوهرات والأحجار الكريمة
  c6: { main: 'art_collectibles' },                     // العملات والطوابع
  c7: { main: 'art_collectibles' },                     // التحف الإسلامية والشرقية
  c8: { main: 'books_documents' },                      // الكتب النادرة
  c9: { main: 'art_collectibles' },                     // المقتنيات الفاخرة الحديثة
  c10: { main: 'vehicles_machinery' },                  // السيارات الكلاسيكية
  c11: { main: 'art_collectibles' },                    // القطع التراثية الشعبية
  c12: { main: 'art_collectibles' },                    // الآثار
  c13: { main: 'art_collectibles' },                    // الصور الفوتوغرافية النادرة
  c14: { main: 'books_documents' },                     // الخرائط والأطالس القديمة
  c15: { main: 'furniture_fixtures' },                  // الأثاث التاريخي
  c16: { main: 'jewellery_gemstones' },                 // الساعات الفاخرة
  c17: { main: 'art_collectibles' },                    // الميداليات والأوسمة
  c18: { main: 'art_collectibles' },                    // المقتنيات الملكية والبروتوكولية
  // c19 «السكراب» has no safe home and stays under «تصنيفات سابقة».
  c20: { main: 'equipment_tools', mainOnly: true },     // المعدات
  c21: { main: 'art_collectibles' },                    // السجاد
};

/** Units a measurement field is recorded in. */
export const FIELD_UNITS = {
  h: { ar: 'ساعة', en: 'h' },
  km: { ar: 'كم', en: 'km' },
  g: { ar: 'غ', en: 'g' },
  ct: { ar: 'قيراط', en: 'ct' },
};

const GRADES = [
  { id: 'excellent', ar: 'ممتاز', en: 'Excellent' },
  { id: 'very_good', ar: 'جيد جداً', en: 'Very Good' },
  { id: 'good', ar: 'جيد', en: 'Good' },
  { id: 'fair', ar: 'مقبول', en: 'Fair' },
  { id: 'poor', ar: 'ضعيف', en: 'Poor' },
];

/**
 * Every built-in field, once. A template lists ids; an item stores values
 * under these ids in `customFields`. Labels never go into a record.
 *
 * Brand, model number, serial number, condition, SKU, barcode, quantity, unit
 * and value are the record's own core fields and are deliberately absent: a
 * template never shows a second «الرقم التسلسلي» next to the first.
 *
 * `defaultVisible: false` fields sit behind «عرض كل الحقول» until they hold a
 * value. No built-in field is required.
 */
export const FIELD_DEFINITIONS = [
  { id: 'manufacturer', type: 'text', ar: 'الشركة المصنعة', en: 'Manufacturer' },
  { id: 'asset_number', type: 'identifier', ar: 'رقم الأصل', en: 'Asset Number' },
  { id: 'manufacture_year', type: 'number', ar: 'سنة الصنع', en: 'Year', validation: { integer: true, min: 1800, max: 2200 } },
  { id: 'operating_hours', type: 'measurement', ar: 'ساعات التشغيل', en: 'Operating Hours', unit: 'h', validation: { min: 0 } },
  { id: 'capacity', type: 'text', ar: 'القدرة / السعة', en: 'Capacity / Power' },
  { id: 'maintenance_date', type: 'date', ar: 'تاريخ الصيانة', en: 'Maintenance Date', defaultVisible: false },
  { id: 'next_maintenance', type: 'date', ar: 'الصيانة القادمة', en: 'Next Maintenance' },

  { id: 'imei', type: 'identifier', ar: 'IMEI', en: 'IMEI', defaultVisible: false, validation: { pattern: '^[0-9 ]{14,17}$' } },
  { id: 'mac_address', type: 'identifier', ar: 'عنوان MAC', en: 'MAC Address', defaultVisible: false, validation: { pattern: '^[0-9A-Fa-f]{2}([:-]?[0-9A-Fa-f]{2}){5}$' } },
  { id: 'purchase_date', type: 'date', ar: 'تاريخ الشراء', en: 'Purchase Date' },
  { id: 'warranty_expiry', type: 'date', ar: 'انتهاء الضمان', en: 'Warranty Expiry' },

  { id: 'vin', type: 'identifier', ar: 'رقم الهيكل', en: 'VIN' },
  { id: 'plate_number', type: 'identifier', ar: 'رقم اللوحة', en: 'Plate Number' },
  { id: 'odometer', type: 'measurement', ar: 'العداد', en: 'Odometer', unit: 'km', validation: { min: 0 } },
  {
    id: 'fuel_type', type: 'select', ar: 'نوع الوقود', en: 'Fuel Type',
    options: [
      { id: 'petrol', ar: 'بنزين', en: 'Petrol' },
      { id: 'diesel', ar: 'ديزل', en: 'Diesel' },
      { id: 'hybrid', ar: 'هجين', en: 'Hybrid' },
      { id: 'electric', ar: 'كهربائي', en: 'Electric' },
      { id: 'gas', ar: 'غاز', en: 'Gas' },
      { id: 'other', ar: 'أخرى', en: 'Other' },
    ],
  },
  { id: 'registration_expiry', type: 'date', ar: 'انتهاء الاستمارة', en: 'Registration Expiry' },
  { id: 'insurance_expiry', type: 'date', ar: 'انتهاء التأمين', en: 'Insurance Expiry' },

  { id: 'artist', type: 'text', ar: 'الفنان', en: 'Artist' },
  { id: 'work_title', type: 'text', ar: 'عنوان العمل', en: 'Title' },
  { id: 'creation_year', type: 'text', ar: 'السنة', en: 'Year' },
  { id: 'medium', type: 'text', ar: 'الخامة / التقنية', en: 'Medium' },
  { id: 'dimensions', type: 'text', ar: 'الأبعاد', en: 'Dimensions' },
  { id: 'signature', type: 'text', ar: 'التوقيع', en: 'Signature' },
  { id: 'edition', type: 'text', ar: 'الطبعة', en: 'Edition', defaultVisible: false },
  { id: 'provenance', type: 'multiline', ar: 'المصدر (Provenance)', en: 'Provenance' },
  { id: 'exhibition_history', type: 'multiline', ar: 'تاريخ العرض', en: 'Exhibition History', defaultVisible: false },
  { id: 'literature', type: 'multiline', ar: 'المراجع والمنشورات', en: 'Literature', defaultVisible: false },
  { id: 'acquisition_date', type: 'date', ar: 'تاريخ الاقتناء', en: 'Acquisition Date', defaultVisible: false },
  { id: 'acquisition_source', type: 'text', ar: 'مصدر الاقتناء', en: 'Acquisition Source', defaultVisible: false },

  {
    id: 'metal', type: 'select', ar: 'المعدن', en: 'Metal',
    options: [
      { id: 'yellow_gold', ar: 'ذهب أصفر', en: 'Yellow Gold' },
      { id: 'white_gold', ar: 'ذهب أبيض', en: 'White Gold' },
      { id: 'rose_gold', ar: 'ذهب وردي', en: 'Rose Gold' },
      { id: 'platinum', ar: 'بلاتين', en: 'Platinum' },
      { id: 'silver', ar: 'فضة', en: 'Silver' },
      { id: 'steel', ar: 'ستانلس ستيل', en: 'Stainless Steel' },
      { id: 'other', ar: 'أخرى', en: 'Other' },
    ],
  },
  { id: 'metal_purity', type: 'text', ar: 'العيار', en: 'Metal Purity' },
  { id: 'gross_weight', type: 'measurement', ar: 'الوزن الإجمالي', en: 'Gross Weight', unit: 'g', validation: { min: 0 } },
  { id: 'stone_type', type: 'text', ar: 'نوع الحجر', en: 'Stone Type' },
  { id: 'stone_count', type: 'number', ar: 'عدد الأحجار', en: 'Number of Stones', validation: { integer: true, min: 0 } },
  { id: 'certificate', type: 'text', ar: 'الشهادة', en: 'Certificate' },
  { id: 'certificate_number', type: 'identifier', ar: 'رقم الشهادة', en: 'Certificate Number' },

  { id: 'carat_weight', type: 'measurement', ar: 'الوزن بالقيراط', en: 'Weight', unit: 'ct', validation: { min: 0 } },
  { id: 'measurements', type: 'text', ar: 'الأبعاد', en: 'Measurements' },
  {
    id: 'shape', type: 'select', ar: 'الشكل', en: 'Shape',
    options: [
      { id: 'round', ar: 'دائري', en: 'Round' },
      { id: 'oval', ar: 'بيضاوي', en: 'Oval' },
      { id: 'cushion', ar: 'وسادي', en: 'Cushion' },
      { id: 'emerald', ar: 'زمردي', en: 'Emerald' },
      { id: 'pear', ar: 'كمثري', en: 'Pear' },
      { id: 'marquise', ar: 'ماركيز', en: 'Marquise' },
      { id: 'princess', ar: 'برنسيس', en: 'Princess' },
      { id: 'heart', ar: 'قلب', en: 'Heart' },
      { id: 'cabochon', ar: 'كابوشون', en: 'Cabochon' },
      { id: 'other', ar: 'أخرى', en: 'Other' },
    ],
  },
  { id: 'colour', type: 'text', ar: 'اللون', en: 'Colour' },
  { id: 'clarity', type: 'text', ar: 'النقاء', en: 'Clarity' },
  { id: 'treatment', type: 'text', ar: 'المعالجة', en: 'Treatment' },
  { id: 'origin', type: 'text', ar: 'المنشأ', en: 'Origin' },
  { id: 'laboratory', type: 'text', ar: 'المختبر', en: 'Laboratory' },
  { id: 'report_number', type: 'identifier', ar: 'رقم التقرير', en: 'Report Number' },
  { id: 'report_date', type: 'date', ar: 'تاريخ التقرير', en: 'Report Date', defaultVisible: false },
  { id: 'cut_grade', type: 'select', ar: 'القطع', en: 'Cut', options: GRADES },
  { id: 'colour_grade', type: 'text', ar: 'درجة اللون', en: 'Colour Grade' },
  { id: 'clarity_grade', type: 'text', ar: 'درجة النقاء', en: 'Clarity Grade' },
  { id: 'polish', type: 'select', ar: 'الصقل', en: 'Polish', options: GRADES, defaultVisible: false },
  { id: 'symmetry', type: 'select', ar: 'التماثل', en: 'Symmetry', options: GRADES, defaultVisible: false },
  {
    id: 'fluorescence', type: 'select', ar: 'التألق', en: 'Fluorescence', defaultVisible: false,
    options: [
      { id: 'none', ar: 'لا يوجد', en: 'None' },
      { id: 'faint', ar: 'خفيف', en: 'Faint' },
      { id: 'medium', ar: 'متوسط', en: 'Medium' },
      { id: 'strong', ar: 'قوي', en: 'Strong' },
      { id: 'very_strong', ar: 'قوي جداً', en: 'Very Strong' },
    ],
  },

  { id: 'author', type: 'text', ar: 'المؤلف', en: 'Author' },
  { id: 'document_title', type: 'text', ar: 'العنوان', en: 'Title' },
  { id: 'document_date', type: 'text', ar: 'التاريخ', en: 'Date' },
  {
    id: 'languages', type: 'multiselect', ar: 'اللغة', en: 'Language',
    options: [
      { id: 'ar', ar: 'العربية', en: 'Arabic' },
      { id: 'en', ar: 'الإنجليزية', en: 'English' },
      { id: 'fa', ar: 'الفارسية', en: 'Persian' },
      { id: 'tr', ar: 'التركية العثمانية', en: 'Ottoman Turkish' },
      { id: 'ur', ar: 'الأردية', en: 'Urdu' },
      { id: 'fr', ar: 'الفرنسية', en: 'French' },
      { id: 'other', ar: 'أخرى', en: 'Other' },
    ],
  },
  { id: 'publisher', type: 'text', ar: 'الناشر', en: 'Publisher' },
  { id: 'publication_place', type: 'text', ar: 'مكان النشر', en: 'Place of Publication', defaultVisible: false },
  { id: 'document_number', type: 'identifier', ar: 'رقم المخطوط / الوثيقة', en: 'Manuscript / Document Number' },
  { id: 'material', type: 'text', ar: 'المادة', en: 'Material' },
  { id: 'page_count', type: 'number', ar: 'عدد الصفحات', en: 'Number of Pages', validation: { integer: true, min: 0 } },

  { id: 'supplier', type: 'text', ar: 'المورّد', en: 'Supplier' },
  { id: 'purchase_price', type: 'currency', ar: 'سعر الشراء', en: 'Purchase Price' },
  { id: 'selling_price', type: 'currency', ar: 'سعر البيع', en: 'Selling Price' },
  { id: 'reorder_level', type: 'number', ar: 'حد إعادة الطلب', en: 'Reorder Level', validation: { min: 0 } },
  { id: 'batch_number', type: 'identifier', ar: 'رقم الدفعة', en: 'Batch' },
  { id: 'expiry_date', type: 'date', ar: 'تاريخ الانتهاء', en: 'Expiry Date' },
];

/** A template is an ordered list of field ids. */
export const FIELD_TEMPLATES = {
  equipment: ['manufacturer', 'asset_number', 'manufacture_year', 'capacity', 'operating_hours', 'next_maintenance', 'maintenance_date'],
  electronics: ['purchase_date', 'warranty_expiry', 'asset_number', 'imei', 'mac_address'],
  furniture: ['manufacturer', 'material', 'dimensions', 'purchase_date'],
  vehicle: ['manufacturer', 'manufacture_year', 'vin', 'plate_number', 'odometer', 'fuel_type', 'registration_expiry', 'insurance_expiry'],
  art: ['artist', 'work_title', 'creation_year', 'medium', 'dimensions', 'signature', 'provenance', 'edition', 'exhibition_history', 'literature', 'acquisition_date', 'acquisition_source'],
  jewellery: ['metal', 'metal_purity', 'gross_weight', 'stone_type', 'stone_count', 'certificate', 'certificate_number'],
  gemstone: ['stone_type', 'carat_weight', 'measurements', 'shape', 'colour', 'clarity', 'treatment', 'origin', 'laboratory', 'report_number', 'report_date'],
  diamond: ['carat_weight', 'measurements', 'shape', 'cut_grade', 'colour_grade', 'clarity_grade', 'polish', 'symmetry', 'fluorescence', 'treatment', 'origin', 'laboratory', 'report_number', 'report_date'],
  books: ['author', 'document_title', 'document_date', 'languages', 'publisher', 'edition', 'publication_place', 'document_number', 'material', 'dimensions', 'page_count', 'provenance'],
  product: ['supplier', 'purchase_price', 'selling_price', 'reorder_level', 'batch_number', 'expiry_date'],
};

/** The Main Categories offered first to a new inventory. */
export const ONBOARDING_MAIN_CATEGORIES = [
  'equipment_tools', 'electronics_devices', 'furniture_fixtures', 'vehicles_machinery',
  'products_merchandise', 'art_collectibles', 'jewellery_gemstones', 'books_documents', 'other',
];
