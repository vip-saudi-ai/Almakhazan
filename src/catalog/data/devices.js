// Built-in electronics and laboratory-instrument catalogs:
// brand/manufacturer → product family → model.
//
// Provenance (developer note): product-family and model names as the
// manufacturers publish them. Compiled 2026-09; models are included only
// where the compiler was confident of the exact public name. Specifications
// (processor, memory, measurement range…) are never catalog data here.
// See CATALOG-DATA.md.

/** [slug, English, Arabic, aliases, families: [familyName, models[], aliases?]] */
export function electronicsBrands() {
  return [
    ['apple', 'Apple', 'أبل', ['ابل', 'آبل'], [
      ['iPhone', ['iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max', 'iPhone 12', 'iPhone 12 mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
        'iPhone 13', 'iPhone 13 mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max', 'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
        'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max', 'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max', 'iPhone 16e',
        'iPhone SE (2nd generation)', 'iPhone SE (3rd generation)'], ['آيفون', 'ايفون']],
      ['iPad', ['iPad Pro', 'iPad Air', 'iPad mini', 'iPad'], ['آيباد', 'ايباد']],
      ['MacBook Air', ['MacBook Air 13-inch (M1)', 'MacBook Air 13-inch (M2)', 'MacBook Air 15-inch (M2)', 'MacBook Air 13-inch (M3)', 'MacBook Air 15-inch (M3)'], ['ماك بوك اير']],
      ['MacBook Pro', ['MacBook Pro 13-inch', 'MacBook Pro 14-inch', 'MacBook Pro 16-inch'], ['ماك بوك برو']],
      ['iMac', [], ['آي ماك']], ['Mac mini', [], []], ['Mac Studio', [], []], ['Mac Pro', [], []],
      ['Apple Watch', ['Apple Watch Series 9', 'Apple Watch Series 10', 'Apple Watch Ultra', 'Apple Watch Ultra 2', 'Apple Watch SE'], ['ساعة ابل']],
      ['AirPods', ['AirPods Pro', 'AirPods Pro (2nd generation)', 'AirPods Max'], ['ايربودز']],
      ['Vision Pro', ['Apple Vision Pro'], []], ['Apple TV', ['Apple TV 4K'], []],
    ]],
    ['samsung', 'Samsung', 'سامسونج', ['سامسونغ'], [
      ['Galaxy S', ['Galaxy S22', 'Galaxy S22 Ultra', 'Galaxy S23', 'Galaxy S23 Ultra', 'Galaxy S24', 'Galaxy S24+', 'Galaxy S24 Ultra', 'Galaxy S25', 'Galaxy S25 Ultra'], ['جالكسي']],
      ['Galaxy Z', ['Galaxy Z Fold5', 'Galaxy Z Flip5', 'Galaxy Z Fold6', 'Galaxy Z Flip6'], ['فولد', 'فليب']],
      ['Galaxy A', ['Galaxy A54', 'Galaxy A55'], []], ['Galaxy Tab', ['Galaxy Tab S9'], []], ['Galaxy Watch', [], []], ['Galaxy Book', [], []],
    ]],
    ['dell', 'Dell', 'ديل', [], [['Latitude', [], []], ['Precision', [], []], ['XPS', [], []], ['OptiPlex', [], []], ['PowerEdge', [], []], ['Inspiron', [], []], ['Vostro', [], []], ['Alienware', [], []]]],
    ['hp', 'HP', 'إتش بي', ['اتش بي', 'Hewlett-Packard'], [['EliteBook', [], []], ['ProBook', [], []], ['ZBook', [], []], ['Pavilion', [], []], ['Spectre', [], []], ['ENVY', [], []], ['EliteDesk', [], []], ['LaserJet', [], []], ['OfficeJet', [], []], ['DesignJet', [], []]]],
    ['hpe', 'Hewlett Packard Enterprise', 'إتش بي إي', ['HPE'], [['ProLiant', [], []], ['Aruba', [], []]]],
    ['lenovo', 'Lenovo', 'لينوفو', [], [['ThinkPad', ['ThinkPad X1 Carbon', 'ThinkPad T14', 'ThinkPad T14s'], ['ثينك باد']], ['ThinkCentre', [], []], ['ThinkStation', [], []], ['IdeaPad', [], []], ['Legion', [], []], ['Yoga', [], []], ['ThinkSystem', [], []]]],
    ['microsoft', 'Microsoft', 'مايكروسوفت', [], [['Surface Pro', [], []], ['Surface Laptop', [], []], ['Surface Book', [], []], ['Xbox', ['Xbox Series X', 'Xbox Series S'], []]]],
    ['sony', 'Sony', 'سوني', [], [['PlayStation', ['PlayStation 5', 'PlayStation 4'], ['بلايستيشن', 'بلاي ستيشن']], ['Alpha', [], []], ['BRAVIA', [], []]]],
    ['canon', 'Canon', 'كانون', [], [['EOS', ['EOS R5', 'EOS R6', 'EOS 5D Mark IV'], []], ['PowerShot', [], []], ['imageRUNNER', [], []]]],
    ['nikon', 'Nikon', 'نيكون', [], [['Z series', [], []], ['D series', ['D850'], []]]],
    ['google', 'Google', 'جوجل', [], [['Pixel', [], ['بكسل']]]],
    ['lg', 'LG', 'إل جي', ['ال جي'], []], ['huawei', 'Huawei', 'هواوي', [], []], ['xiaomi', 'Xiaomi', 'شاومي', [], []],
    ['asus', 'ASUS', 'أسوس', ['Asus'], []], ['acer', 'Acer', 'أيسر', [], []], ['fujifilm', 'Fujifilm', 'فوجي فيلم', [], []],
    ['cisco', 'Cisco', 'سيسكو', [], []], ['epson', 'Epson', 'إبسون', [], []], ['brother', 'Brother', 'براذر', [], []],
    ['garmin', 'Garmin', 'جارمن', [], []], ['dji', 'DJI', 'دي جي آي', [], []], ['bose', 'Bose', 'بوز', [], []],
    ['dyson', 'Dyson', 'دايسون', [], []], ['philips', 'Philips', 'فيليبس', [], []], ['panasonic', 'Panasonic', 'باناسونيك', [], []],
    ['toshiba', 'Toshiba', 'توشيبا', [], []], ['seagate', 'Seagate', 'سيجيت', [], []], ['western_digital', 'Western Digital', 'ويسترن ديجيتال', ['WD'], []],
    ['synology', 'Synology', 'سينولوجي', [], []], ['ubiquiti', 'Ubiquiti', 'يوبيكويتي', [], []], ['zebra', 'Zebra Technologies', 'زيبرا', ['Zebra'], []],
    ['hikvision', 'Hikvision', 'هيك فيجن', [], []], ['dahua', 'Dahua', 'داهوا', [], []], ['motorola', 'Motorola', 'موتورولا', [], []],
    ['nokia', 'Nokia', 'نوكيا', [], []], ['oppo', 'OPPO', 'أوبو', [], []], ['vivo', 'vivo', 'فيفو', [], []], ['oneplus', 'OnePlus', 'ون بلس', [], []],
  ];
}

/** [slug, English, Arabic, aliases, families: [familyName, models[], aliases?]] */
export function labManufacturers() {
  return [
    ['thermo_fisher', 'Thermo Fisher Scientific', 'ثيرمو فيشر', ['Thermo', 'Thermo Fisher', 'Thermo Scientific', 'ثيرمو'], [
      ['Nicolet', [['Nicolet iS50', ['iS50', 'i50', 'iS 50']], ['Nicolet iS20', ['iS20']], ['Nicolet iS10', ['iS10']], ['Nicolet iS5', ['iS5']], 'Nicolet Summit'], ['FTIR']],
      ['Orbitrap', ['Orbitrap Exploris 480', 'Q Exactive'], []], ['NanoDrop', ['NanoDrop One'], []],
    ]],
    ['renishaw', 'Renishaw', 'رينيشو', [], [['inVia', ['inVia Qontor', 'inVia Reflex'], ['Raman']]]],
    ['shimadzu', 'Shimadzu', 'شيمادزو', [], [
      ['UV-Vis', ['UV-1900i', 'UV-2600i', 'UV-3600i Plus'], ['UV']], ['FTIR', ['IRTracer-100', 'IRSpirit'], []],
      ['HPLC', ['Nexera', 'Prominence'], []], ['GC', ['GC-2030'], []], ['EDX', ['EDX-7000'], ['XRF']],
    ]],
    ['bruker', 'Bruker', 'بروكر', [], [['FT-IR', ['ALPHA II', 'INVENIO', 'VERTEX 70v'], ['FTIR']], ['XRF', ['S2 PUMA'], []], ['XRD', ['D8 ADVANCE'], []]]],
    ['agilent', 'Agilent', 'أجيلنت', ['Agilent Technologies'], [
      ['UV-Vis', ['Cary 60', 'Cary 3500'], []], ['FTIR', ['Cary 630'], []], ['GC', ['8890', '7890B'], []], ['ICP-MS', ['7900'], []], ['HPLC', ['1260 Infinity II'], []],
    ]],
    ['perkinelmer', 'PerkinElmer', 'بيركن إلمر', [], [['FT-IR', ['Spectrum Two', 'Spectrum 3'], []], ['UV-Vis', ['LAMBDA 365'], []]]],
    ['jeol', 'JEOL', 'جيول', [], [['SEM', ['JSM-IT500'], []], ['NMR', [], []]]],
    ['zeiss', 'Zeiss', 'زايس', ['Carl Zeiss', 'ZEISS'], [['Axio', ['Axio Imager', 'Axio Observer'], []], ['SEM', ['Sigma', 'GeminiSEM'], []]]],
    ['leica_microsystems', 'Leica Microsystems', 'لايكا', ['Leica'], [['Compound microscopes', ['DM2500'], []]]],
    ['evident', 'Evident', 'إيفيدنت', ['Olympus', 'Olympus / Evident', 'أوليمبوس'], [['Microscopes', ['BX53', 'CX23'], []]]],
    ['malvern_panalytical', 'Malvern Panalytical', 'مالفرن باناليتكال', ['Malvern', 'PANalytical'], [['Zetasizer', [], []], ['Mastersizer', ['Mastersizer 3000'], []], ['Empyrean', [], ['XRD']]]],
    ['horiba', 'Horiba', 'هوريبا', [], [['Raman', ['LabRAM HR Evolution', 'XploRA'], []]]],
    ['hitachi_hightech', 'Hitachi High-Tech', 'هيتاشي', ['Hitachi'], [['SEM', ['TM4000Plus'], []]]],
    ['mettler_toledo', 'Mettler Toledo', 'ميتلر توليدو', ['Mettler'], [['Balances', [], []]]],
    ['sartorius', 'Sartorius', 'سارتوريوس', [], []],
    ['eppendorf', 'Eppendorf', 'إيبندورف', [], []],
  ];
}
