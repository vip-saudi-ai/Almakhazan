// Built-in vehicle catalog: manufacturers and their models.
//
// Provenance (developer note): manufacturer names and model names as the
// manufacturers publish them; Arabic spellings are the common market ones.
// Compiled 2026-09. Only model names are recorded — no production years,
// engines or trims, which vary by market and year and are entered by the
// customer (the Year field is a picker, not catalog data). A manufacturer
// with no models listed is still selectable; its models are added manually.

/** [slug, English, Arabic, aliases, models] — ids `vehicle_make_<slug>`, `vehicle_model_<make>_<slug>`. */
export function vehicleMakes() {
  return [
    ['toyota', 'Toyota', 'تويوتا', ['تيوتا'], [
      ['Land Cruiser', 'لاندكروزر', ['لاند كروزر', 'LC', 'شاص']], ['Land Cruiser Prado', 'برادو', ['Prado']], ['Land Cruiser 70', 'لاندكروزر 70', ['LC70', 'ربع']],
      ['Camry', 'كامري', []], ['Corolla', 'كورولا', []], ['Corolla Cross', 'كورولا كروس', []], ['Hilux', 'هايلكس', ['هايلوكس']],
      ['Fortuner', 'فورتشنر', []], ['RAV4', 'راف فور', ['راف 4']], ['Highlander', 'هايلاندر', []], ['Yaris', 'يارس', []], ['Crown', 'كراون', []],
      ['Supra', 'سوبرا', []], ['Avalon', 'أفالون', []], ['Sequoia', 'سيكويا', []], ['Tundra', 'تندرا', []], ['Tacoma', 'تاكوما', []],
      ['4Runner', 'فور رنر', []], ['FJ Cruiser', 'إف جي كروزر', ['FJ']], ['Innova', 'إينوفا', []], ['Hiace', 'هايس', []], ['Coaster', 'كوستر', []],
      ['Rush', 'راش', []], ['Raize', 'رايز', []], ['Veloz', 'فيلوز', []], ['C-HR', 'سي إتش آر', ['CHR']], ['Prius', 'بريوس', []], ['GR86', 'جي آر 86', ['GR 86']],
      ['bZ4X', '', []],
    ]],
    ['lexus', 'Lexus', 'لكزس', [], [
      ['LX', '', []], ['GX', '', []], ['RX', '', []], ['NX', '', []], ['UX', '', []], ['ES', '', []], ['LS', '', []], ['IS', '', []],
      ['RC', '', []], ['LC', '', []], ['LM', '', []], ['TX', '', []],
    ]],
    ['nissan', 'Nissan', 'نيسان', [], [
      ['Patrol', 'باترول', []], ['Sunny', 'صني', []], ['Altima', 'ألتيما', []], ['Maxima', 'ماكسيما', []], ['X-Trail', 'إكس تريل', ['XTrail']],
      ['Pathfinder', 'باثفايندر', []], ['Navara', 'نافارا', []], ['Kicks', 'كيكس', []], ['Sentra', 'سنترا', []], ['GT-R', 'جي تي آر', ['GTR']],
      ['Z', '', ['370Z', '400Z']], ['Armada', 'أرمادا', []], ['Urvan', 'أورفان', []],
    ]],
    ['infiniti', 'Infiniti', 'إنفينيتي', ['انفنتي'], [['QX80', '', []], ['QX60', '', []], ['QX50', '', []], ['Q50', '', []]]],
    ['honda', 'Honda', 'هوندا', [], [
      ['Civic', 'سيفيك', []], ['Accord', 'أكورد', []], ['CR-V', 'سي آر في', ['CRV']], ['HR-V', 'إتش آر في', ['HRV']], ['Pilot', 'بايلوت', []],
      ['City', 'سيتي', []], ['Odyssey', 'أوديسي', []],
    ]],
    ['acura', 'Acura', 'أكورا', [], []],
    ['mazda', 'Mazda', 'مازدا', [], [
      ['Mazda3', 'مازدا 3', ['Mazda 3']], ['Mazda6', 'مازدا 6', ['Mazda 6']], ['CX-3', '', ['CX3']], ['CX-5', '', ['CX5']], ['CX-9', '', ['CX9']],
      ['CX-30', '', ['CX30']], ['CX-60', '', ['CX60']], ['CX-90', '', ['CX90']], ['MX-5', '', ['MX5', 'Miata']],
    ]],
    ['subaru', 'Subaru', 'سوبارو', [], []],
    ['mitsubishi', 'Mitsubishi', 'ميتسوبيشي', ['متسوبيشي'], [
      ['Pajero', 'باجيرو', ['باجيرو']], ['L200', '', ['Triton']], ['Outlander', 'أوتلاندر', []], ['ASX', '', []], ['Attrage', 'أتراج', []],
      ['Xpander', 'إكسباندر', []], ['Eclipse Cross', 'إكليبس كروس', []], ['Lancer', 'لانسر', []],
    ]],
    ['suzuki', 'Suzuki', 'سوزوكي', [], [
      ['Swift', 'سويفت', []], ['Jimny', 'جيمني', []], ['Vitara', 'فيتارا', []], ['Dzire', 'ديزاير', []], ['Ertiga', 'إرتيجا', []], ['Ciaz', 'سياز', []], ['Baleno', 'بالينو', []],
    ]],
    ['isuzu', 'Isuzu', 'إيسوزو', ['ايسوزو'], [['D-Max', 'دي ماكس', ['DMax']], ['MU-X', '', ['MUX']], ['N-Series', '', []]]],
    ['hyundai', 'Hyundai', 'هيونداي', ['هونداي'], [
      ['Accent', 'أكسنت', []], ['Elantra', 'إلنترا', ['النترا']], ['Sonata', 'سوناتا', []], ['Tucson', 'توسان', []], ['Santa Fe', 'سنتافي', ['سانتافي']],
      ['Palisade', 'باليسيد', []], ['Creta', 'كريتا', []], ['Azera', 'أزيرا', []], ['Kona', 'كونا', []], ['Staria', 'ستاريا', []], ['H-1', 'إتش 1', ['H1']],
    ]],
    ['kia', 'Kia', 'كيا', [], [
      ['Pegas', 'بيجاس', []], ['Rio', 'ريو', []], ['Cerato', 'سيراتو', []], ['K5', '', []], ['K8', '', []], ['Sportage', 'سبورتاج', []],
      ['Sorento', 'سورينتو', []], ['Telluride', 'تيلورايد', []], ['Carnival', 'كرنفال', []], ['Seltos', 'سيلتوس', []], ['Picanto', 'بيكانتو', []],
    ]],
    ['genesis', 'Genesis', 'جينيسيس', [], [['G70', '', []], ['G80', '', []], ['G90', '', []], ['GV70', '', []], ['GV80', '', []]]],
    ['mercedes_benz', 'Mercedes-Benz', 'مرسيدس بنز', ['Mercedes', 'Benz', 'مرسيدس', 'مارسيدس'], [
      ['A-Class', '', ['A Class']], ['C-Class', '', ['C Class']], ['E-Class', '', ['E Class']], ['S-Class', '', ['S Class']], ['G-Class', '', ['G Class', 'G-Wagon', 'جي كلاس']],
      ['GLA', '', []], ['GLB', '', []], ['GLC', '', []], ['GLE', '', []], ['GLS', '', []], ['CLA', '', []], ['CLS', '', []], ['SL', '', []],
      ['AMG GT', '', []], ['V-Class', '', ['V Class']], ['Sprinter', 'سبرينتر', []], ['EQS', '', []], ['Mercedes-Maybach S-Class', '', ['Maybach']],
    ]],
    ['bmw', 'BMW', 'بي إم دبليو', ['بي ام دبليو', 'بمو', 'بي ام'], [
      ['1 Series', '', []], ['2 Series', '', []], ['3 Series', '', []], ['4 Series', '', []], ['5 Series', '', []], ['7 Series', '', []], ['8 Series', '', []],
      ['X1', '', []], ['X2', '', []], ['X3', '', []], ['X4', '', []], ['X5', '', []], ['X6', '', []], ['X7', '', []], ['Z4', '', []],
      ['M3', '', []], ['M5', '', []], ['i4', '', []], ['i7', '', []], ['iX', '', []],
    ]],
    ['mini', 'MINI', 'ميني', ['Mini'], [['Cooper', 'كوبر', []], ['Countryman', 'كنتريمان', []]]],
    ['audi', 'Audi', 'أودي', ['اودي'], [
      ['A3', '', []], ['A4', '', []], ['A5', '', []], ['A6', '', []], ['A7', '', []], ['A8', '', []], ['Q3', '', []], ['Q5', '', []],
      ['Q7', '', []], ['Q8', '', []], ['e-tron GT', '', []], ['R8', '', []],
    ]],
    ['volkswagen', 'Volkswagen', 'فولكس فاجن', ['VW', 'فولكس واجن'], [
      ['Golf', 'جولف', []], ['Passat', 'باسات', []], ['Jetta', 'جيتا', []], ['Tiguan', 'تيغوان', []], ['Touareg', 'طوارق', []], ['Teramont', 'تيرامونت', []], ['T-Roc', '', []],
    ]],
    ['porsche', 'Porsche', 'بورشه', ['بورش'], [
      ['911', '', []], ['Cayenne', 'كايين', []], ['Macan', 'ماكان', []], ['Panamera', 'باناميرا', []], ['Taycan', 'تايكان', []], ['718 Cayman', '', ['Cayman']], ['718 Boxster', '', ['Boxster']],
    ]],
    ['bentley', 'Bentley', 'بنتلي', [], [['Bentayga', 'بنتايجا', []], ['Continental GT', 'كونتيننتال', []], ['Flying Spur', 'فلاينج سبير', []]]],
    ['rolls_royce', 'Rolls-Royce', 'رولز رويس', ['Rolls Royce', 'رولزرويس'], [
      ['Phantom', 'فانتوم', []], ['Ghost', 'جوست', []], ['Cullinan', 'كولينان', []], ['Wraith', 'رايث', []], ['Dawn', 'داون', []], ['Spectre', 'سبكتر', []],
    ]],
    ['ferrari', 'Ferrari', 'فيراري', [], [
      ['296 GTB', '', []], ['Roma', '', []], ['SF90 Stradale', '', ['SF90']], ['812 Superfast', '', []], ['Purosangue', '', []], ['F8 Tributo', '', []], ['488 GTB', '', []], ['LaFerrari', '', []],
    ]],
    ['lamborghini', 'Lamborghini', 'لامبورغيني', ['لمبرجيني'], [['Urus', 'أوروس', []], ['Huracán', 'هوراكان', ['Huracan']], ['Aventador', 'أفينتادور', []], ['Revuelto', '', []]]],
    ['maserati', 'Maserati', 'مازيراتي', [], [['Ghibli', '', []], ['Levante', '', []], ['Quattroporte', '', []], ['MC20', '', []], ['Grecale', '', []]]],
    ['mclaren', 'McLaren', 'ماكلارين', [], [['720S', '', []], ['750S', '', []], ['Artura', '', []], ['GT', '', []]]],
    ['aston_martin', 'Aston Martin', 'أستون مارتن', [], [['DB11', '', []], ['DB12', '', []], ['Vantage', '', []], ['DBX', '', []]]],
    ['alfa_romeo', 'Alfa Romeo', 'ألفا روميو', [], []],
    ['fiat', 'Fiat', 'فيات', [], []],
    ['peugeot', 'Peugeot', 'بيجو', [], [['208', '', []], ['2008', '', []], ['3008', '', []], ['5008', '', []], ['508', '', []]]],
    ['citroen', 'Citroën', 'سيتروين', ['Citroen'], []],
    ['renault', 'Renault', 'رينو', [], [['Duster', 'داستر', []], ['Koleos', 'كوليوس', []], ['Megane', 'ميجان', []]]],
    ['volvo', 'Volvo', 'فولفو', [], [['XC40', '', []], ['XC60', '', []], ['XC90', '', []], ['S60', '', []], ['S90', '', []], ['EX30', '', []]]],
    ['polestar', 'Polestar', 'بولستار', [], []],
    ['land_rover', 'Land Rover', 'لاند روفر', ['لاندروفر', 'رنج روفر'], [
      ['Range Rover', 'رنج روفر', ['رينج روفر']], ['Range Rover Sport', 'رنج روفر سبورت', []], ['Range Rover Velar', 'فيلار', []], ['Range Rover Evoque', 'إيفوك', []],
      ['Defender', 'ديفندر', []], ['Discovery', 'ديسكفري', []], ['Discovery Sport', 'ديسكفري سبورت', []],
    ]],
    ['jaguar', 'Jaguar', 'جاكوار', [], []],
    ['ford', 'Ford', 'فورد', [], [
      ['F-150', '', ['F150']], ['Explorer', 'إكسبلورر', []], ['Expedition', 'إكسبديشن', []], ['Mustang', 'موستنج', ['موستانج']], ['Ranger', 'رينجر', []],
      ['Taurus', 'توروس', []], ['Edge', 'إيدج', []], ['Bronco', 'برونكو', []], ['Escape', 'إسكيب', []], ['Territory', 'تيريتوري', []],
    ]],
    ['lincoln', 'Lincoln', 'لينكولن', [], []],
    ['chevrolet', 'Chevrolet', 'شيفروليه', ['شفروليه', 'شفر', 'Chevy'], [
      ['Tahoe', 'تاهو', []], ['Suburban', 'سوبربان', ['سبربن']], ['Silverado', 'سلفرادو', []], ['Camaro', 'كامارو', []], ['Corvette', 'كورفيت', []],
      ['Malibu', 'ماليبو', []], ['Captiva', 'كابتيفا', []], ['Traverse', 'ترافيرس', []], ['Groove', 'جروف', []], ['Spark', 'سبارك', []], ['Blazer', 'بليزر', []],
    ]],
    ['gmc', 'GMC', 'جي إم سي', ['جمس', 'جي ام سي'], [['Yukon', 'يوكن', []], ['Sierra', 'سييرا', []], ['Acadia', 'أكاديا', []], ['Terrain', 'تيرين', []], ['Hummer EV', 'همر', []]]],
    ['cadillac', 'Cadillac', 'كاديلاك', [], [['Escalade', 'إسكاليد', []], ['CT4', '', []], ['CT5', '', []], ['XT4', '', []], ['XT5', '', []], ['XT6', '', []], ['Lyriq', '', []]]],
    ['jeep', 'Jeep', 'جيب', [], [['Wrangler', 'رانجلر', []], ['Grand Cherokee', 'جراند شيروكي', []], ['Cherokee', 'شيروكي', []], ['Compass', 'كومباس', []], ['Gladiator', 'جلادياتور', []], ['Renegade', 'رينيجيد', []]]],
    ['dodge', 'Dodge', 'دودج', [], [['Charger', 'تشارجر', []], ['Challenger', 'تشالنجر', []], ['Durango', 'دورانجو', []]]],
    ['ram', 'Ram', 'رام', [], [['1500', '', []], ['2500', '', []], ['3500', '', []]]],
    ['chrysler', 'Chrysler', 'كرايسلر', [], [['300', '', ['300C']], ['Pacifica', '', []]]],
    ['buick', 'Buick', 'بيوك', [], []],
    ['tesla', 'Tesla', 'تسلا', [], [['Model S', '', []], ['Model 3', '', []], ['Model X', '', []], ['Model Y', '', []], ['Cybertruck', '', []]]],
    ['lucid', 'Lucid', 'لوسيد', [], [['Air', '', ['Lucid Air']], ['Gravity', '', []]]],
    ['rivian', 'Rivian', 'ريفيان', [], [['R1T', '', []], ['R1S', '', []]]],
    ['byd', 'BYD', 'بي واي دي', [], [['Atto 3', '', []], ['Seal', '', []], ['Han', '', []], ['Tang', '', []], ['Song', '', []]]],
    ['geely', 'Geely', 'جيلي', [], [['Coolray', 'كولراي', []], ['Monjaro', 'مونجارو', []], ['Emgrand', 'امجراند', []], ['Tugella', 'توجيلا', []], ['Okavango', 'أوكافانجو', []]]],
    ['zeekr', 'Zeekr', 'زيكر', [], []],
    ['chery', 'Chery', 'شيري', [], [['Tiggo 4', '', []], ['Tiggo 7', '', []], ['Tiggo 8', '', []]]],
    ['exeed', 'Exeed', 'إكسيد', [], []],
    ['jetour', 'Jetour', 'جيتور', [], []],
    ['gwm', 'GWM', 'جريت وول', ['Great Wall'], []],
    ['haval', 'Haval', 'هافال', [], [['H6', '', []], ['Jolion', '', []], ['H9', '', []]]],
    ['tank', 'Tank', 'تانك', [], []],
    ['changan', 'Changan', 'شانجان', [], [['CS35', '', []], ['CS75', '', []], ['UNI-K', '', []], ['Eado', '', []]]],
    ['hongqi', 'Hongqi', 'هونشي', [], []],
    ['mg', 'MG', 'إم جي', ['ام جي'], [['ZS', '', []], ['HS', '', []], ['RX5', '', []], ['MG5', '', []]]],
    ['skoda', 'Škoda', 'سكودا', ['Skoda'], []],
    ['seat', 'SEAT', 'سيات', [], []],
    ['opel', 'Opel', 'أوبل', [], []],
    ['proton', 'Proton', 'بروتون', [], []],
    ['tata', 'Tata Motors', 'تاتا', ['Tata'], []],
    ['mahindra', 'Mahindra', 'ماهيندرا', [], []],
    ['daihatsu', 'Daihatsu', 'دايهاتسو', [], []],
    ['hino', 'Hino', 'هينو', [], []],
    ['scania', 'Scania', 'سكانيا', [], []],
    ['man', 'MAN', 'مان', ['MAN Truck & Bus'], []],
    ['daf', 'DAF', 'داف', [], []],
    ['iveco', 'Iveco', 'إيفيكو', [], []],
    ['volvo_trucks', 'Volvo Trucks', 'فولفو للشاحنات', [], []],
    ['mercedes_benz_trucks', 'Mercedes-Benz Trucks', 'مرسيدس للشاحنات', ['Actros'], []],
    ['harley_davidson', 'Harley-Davidson', 'هارلي ديفيدسون', ['Harley'], []],
    ['ducati', 'Ducati', 'دوكاتي', [], []],
    ['yamaha_motor', 'Yamaha', 'ياماها', [], []],
    ['kawasaki', 'Kawasaki', 'كاواساكي', [], []],
    ['triumph', 'Triumph', 'تريومف', [], []],
    ['ktm', 'KTM', 'كي تي إم', [], []],
    ['bmw_motorrad', 'BMW Motorrad', 'بي إم دبليو موتوراد', [], []],
  ];
}
