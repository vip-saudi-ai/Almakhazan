// Built-in catalogs for jewellery houses, gemstones, gem laboratories,
// artists, furniture makers and fashion houses.
//
// Provenance (developer note): house and collection names as published by the
// houses; gemstone species and variety names as used in standard gemmological
// nomenclature; laboratory names as the laboratories publish them; artists
// are a small starting set of widely documented artists, not an art-history
// database. Compiled 2026-09. No report data, grades or origins are catalog
// data — those belong to the customer's item. See CATALOG-DATA.md.

/** [slug, English, Arabic, aliases, collections[]] */
export function jewelleryHouses() {
  return [
    ['cartier', 'Cartier', 'كارتييه', ['كارتير'], ['Love', 'Juste un Clou', 'Panthère de Cartier', 'Trinity', 'Clash de Cartier']],
    ['van_cleef_arpels', 'Van Cleef & Arpels', 'فان كليف آند آربلز', ['VCA', 'فان كليف'], ['Alhambra', 'Perlée', 'Frivole']],
    ['bulgari', 'Bulgari', 'بولغاري', ['Bvlgari', 'بلغاري'], ['Serpenti', 'B.zero1', "Divas' Dream"]],
    ['tiffany_co', 'Tiffany & Co.', 'تيفاني', ['Tiffany'], ['Tiffany T', 'HardWear', 'Tiffany Setting', 'Return to Tiffany']],
    ['harry_winston', 'Harry Winston', 'هاري ونستون', [], []],
    ['graff', 'Graff', 'جراف', [], []],
    ['boucheron', 'Boucheron', 'بوشرون', [], ['Quatre', 'Serpent Bohème']],
    ['chaumet', 'Chaumet', 'شوميه', [], ['Joséphine', 'Bee My Love', 'Liens']],
    ['chopard', 'Chopard', 'شوبارد', [], ['Happy Diamonds', 'Ice Cube']],
    ['piaget', 'Piaget', 'بياجيه', [], ['Possession']],
    ['buccellati', 'Buccellati', 'بوتشيلاتي', [], []],
    ['david_webb', 'David Webb', 'ديفيد ويب', [], []],
    ['de_beers', 'De Beers', 'دي بيرز', [], []],
    ['messika', 'Messika', 'ميسيكا', [], ['Move']],
    ['pomellato', 'Pomellato', 'بوميلاتو', [], ['Nudo']],
    ['mikimoto', 'Mikimoto', 'ميكيموتو', [], []],
    ['damiani', 'Damiani', 'دامياني', [], []],
    ['faberge', 'Fabergé', 'فابرجيه', ['Faberge'], []],
    ['repossi', 'Repossi', 'ريبوسي', [], []],
    ['david_yurman', 'David Yurman', 'ديفيد يورمان', [], []],
    ['fred', 'Fred', 'فريد', [], []],
    ['mouawad', 'Mouawad', 'معوض', [], []],
    ['damas', 'Damas', 'داماس', [], []],
    ['lazurde', "L'azurde", 'لازوردي', ['Lazurde'], []],
    ['tabbah', 'Tabbah', 'طبّاع', [], []],
  ];
}

/** [slug, English, Arabic, aliases, varieties: [English, Arabic, aliases][]] — ids `gem_<slug>`. */
export function gemTypes() {
  return [
    ['diamond', 'Diamond', 'ألماس', ['الماس', 'الماسة'], []],
    ['ruby', 'Ruby', 'ياقوت أحمر', ['ياقوت', 'روبي'], []],
    ['sapphire', 'Sapphire', 'ياقوت أزرق', ['صفير', 'سفير'], [
      ['Blue Sapphire', 'ياقوت أزرق', []], ['Pink Sapphire', 'ياقوت وردي', []], ['Yellow Sapphire', 'ياقوت أصفر', []],
      ['Padparadscha', 'بادبارادشا', []], ['Star Sapphire', 'ياقوت نجمي', []],
    ]],
    ['emerald', 'Emerald', 'زمرد', ['زمرّد'], []],
    ['spinel', 'Spinel', 'إسبنيل', ['سبينل'], []],
    ['alexandrite', 'Alexandrite', 'ألكسندريت', [], []],
    ['chrysoberyl', 'Chrysoberyl', 'كريزوبريل', [], [["Cat's Eye Chrysoberyl", 'عين القط', ['Cats Eye']]]],
    ['garnet', 'Garnet', 'غارنيت', ['عقيق احمر', 'جارنت'], [
      ['Tsavorite', 'تسافوريت', []], ['Demantoid', 'ديمانتويد', []], ['Rhodolite', 'رودوليت', []],
      ['Spessartine', 'سبيسارتين', ['Spessartite']], ['Almandine', 'ألماندين', []], ['Pyrope', 'بايروب', []],
    ]],
    ['tourmaline', 'Tourmaline', 'تورمالين', [], [['Paraíba Tourmaline', 'تورمالين بارايبا', ['Paraiba']], ['Rubellite', 'روبيليت', []], ['Indicolite', 'إنديكوليت', []]]],
    ['aquamarine', 'Aquamarine', 'أكوامارين', [], []],
    ['morganite', 'Morganite', 'مورجانيت', [], []],
    ['topaz', 'Topaz', 'توباز', [], []],
    ['zircon', 'Zircon', 'زركون', [], []],
    ['jadeite', 'Jadeite', 'يشم جاديت', ['Jade', 'يشم'], []],
    ['nephrite', 'Nephrite', 'يشم نفريت', [], []],
    ['opal', 'Opal', 'أوبال', ['اوبال'], []],
    ['pearl', 'Pearl', 'لؤلؤ', ['لولو'], [
      ['Natural Pearl', 'لؤلؤ طبيعي', []], ['Cultured Pearl', 'لؤلؤ مستزرع', []], ['Akoya Pearl', 'لؤلؤ أكويا', ['Akoya']],
      ['South Sea Pearl', 'لؤلؤ البحار الجنوبية', ['South Sea']], ['Tahitian Pearl', 'لؤلؤ تاهيتي', ['Tahitian']],
    ]],
    ['coral', 'Coral', 'مرجان', [], []],
    ['amber', 'Amber', 'كهرمان', [], []],
    ['turquoise', 'Turquoise', 'فيروز', [], []],
    ['tanzanite', 'Tanzanite', 'تنزانيت', [], []],
    ['peridot', 'Peridot', 'زبرجد', [], []],
    ['amethyst', 'Amethyst', 'جمشت', ['أماتيست'], []],
    ['citrine', 'Citrine', 'سترين', [], []],
    ['lapis_lazuli', 'Lapis Lazuli', 'لازورد', [], []],
    ['moonstone', 'Moonstone', 'حجر القمر', [], []],
    ['agate', 'Agate', 'عقيق', ['عقيق يماني'], []],
    ['onyx', 'Onyx', 'جزع', ['أونيكس'], []],
  ];
}

/** [slug, English, Arabic, aliases] — ids `gemlab_<slug>`. */
export function gemLaboratories() {
  return [
    ['gia', 'GIA', 'المعهد الأمريكي لعلوم الأحجار', ['Gemological Institute of America']],
    ['ssef', 'SSEF', '', ['Swiss Gemmological Institute']],
    ['gubelin', 'Gübelin Gem Lab', '', ['Gubelin', 'Gübelin']],
    ['grs', 'GRS', '', ['GemResearch Swisslab']],
    ['agl', 'AGL', '', ['American Gemological Laboratories']],
    ['igi', 'IGI', '', ['International Gemological Institute']],
    ['hrd', 'HRD Antwerp', '', ['HRD']],
    ['lotus', 'Lotus Gemology', '', ['Lotus']],
    ['git', 'GIT', '', ['Gem and Jewelry Institute of Thailand']],
    ['egl', 'EGL', '', ['European Gemological Laboratory']],
    ['bellerophon', 'Bellerophon Gemlab', '', ['Bellerophon']],
    ['cisgem', 'CISGEM', '', []],
  ];
}

/** [slug, English, Arabic, aliases] — ids `artist_<slug>`. A starting set, not a database. */
export function artists() {
  return [
    ['pablo_picasso', 'Pablo Picasso', 'بابلو بيكاسو', ['Picasso', 'بيكاسو']],
    ['vincent_van_gogh', 'Vincent van Gogh', 'فينسنت فان جوخ', ['Van Gogh', 'فان غوخ']],
    ['claude_monet', 'Claude Monet', 'كلود مونيه', ['Monet']],
    ['rembrandt', 'Rembrandt van Rijn', 'رامبرانت', ['Rembrandt']],
    ['leonardo_da_vinci', 'Leonardo da Vinci', 'ليوناردو دافنشي', ['Da Vinci', 'دافنشي']],
    ['salvador_dali', 'Salvador Dalí', 'سلفادور دالي', ['Dali']],
    ['andy_warhol', 'Andy Warhol', 'آندي وارهول', ['Warhol']],
    ['henri_matisse', 'Henri Matisse', 'هنري ماتيس', ['Matisse']],
    ['mahmoud_said', 'Mahmoud Saïd', 'محمود سعيد', ['Mahmoud Said']],
    ['abdulhalim_radwi', 'Abdulhalim Radwi', 'عبدالحليم رضوي', ['Radwi']],
    ['mohammed_alsaleem', 'Mohammed Al Saleem', 'محمد السليم', []],
    ['safeya_binzagr', 'Safeya Binzagr', 'صفية بن زقر', []],
    ['mahmoud_mokhtar', 'Mahmoud Mokhtar', 'محمود مختار', []],
    ['jewad_selim', 'Jewad Selim', 'جواد سليم', []],
    ['shakir_hassan_al_said', 'Shakir Hassan Al Said', 'شاكر حسن آل سعيد', []],
    ['dia_azzawi', 'Dia Azzawi', 'ضياء العزاوي', []],
    ['paul_guiragossian', 'Paul Guiragossian', 'بول غيراغوسيان', []],
    ['fateh_moudarres', 'Fateh Moudarres', 'فاتح المدرس', []],
    ['louay_kayyali', 'Louay Kayyali', 'لؤي كيالي', []],
    ['ahmed_mater', 'Ahmed Mater', 'أحمد ماطر', []],
    ['abdulnasser_gharem', 'Abdulnasser Gharem', 'عبدالناصر غارم', []],
    ['hussein_bicar', 'Hussein Bicar', 'حسين بيكار', []],
  ];
}

/** [slug, English, Arabic, aliases] — ids `furniture_<slug>`. */
export function furnitureMakers() {
  return [
    ['herman_miller', 'Herman Miller', 'هيرمان ميلر', []], ['steelcase', 'Steelcase', 'ستيل كيس', []], ['knoll', 'Knoll', 'نول', []],
    ['vitra', 'Vitra', 'فيترا', []], ['ikea', 'IKEA', 'ايكيا', ['Ikea', 'إيكيا']], ['haworth', 'Haworth', 'هاوورث', []],
    ['humanscale', 'Humanscale', '', []], ['poltrona_frau', 'Poltrona Frau', 'بولترونا فراو', []], ['cassina', 'Cassina', 'كاسينا', []],
    ['bb_italia', 'B&B Italia', 'بي آند بي إيطاليا', ['B and B Italia']], ['kartell', 'Kartell', 'كارتيل', []], ['fritz_hansen', 'Fritz Hansen', 'فريتز هانسن', []],
    ['ligne_roset', 'Ligne Roset', 'لين روزيه', []], ['roche_bobois', 'Roche Bobois', 'روش بوبوا', []], ['minotti', 'Minotti', 'مينوتي', []],
    ['natuzzi', 'Natuzzi', 'ناتوزي', []],
  ];
}

/** [slug, English, Arabic, aliases] — ids `fashion_<slug>`. */
export function fashionHouses() {
  return [
    ['louis_vuitton', 'Louis Vuitton', 'لويس فيتون', ['LV']], ['hermes', 'Hermès', 'هيرميس', ['Hermes']], ['chanel', 'Chanel', 'شانيل', []],
    ['gucci', 'Gucci', 'غوتشي', ['قوتشي', 'جوتشي']], ['prada', 'Prada', 'برادا', []], ['dior', 'Dior', 'ديور', ['Christian Dior']],
    ['burberry', 'Burberry', 'بربري', []], ['balenciaga', 'Balenciaga', 'بالنسياغا', []], ['saint_laurent', 'Saint Laurent', 'سان لوران', ['YSL']],
    ['fendi', 'Fendi', 'فندي', []], ['givenchy', 'Givenchy', 'جيفنشي', []], ['valentino', 'Valentino', 'فالنتينو', []],
    ['versace', 'Versace', 'فيرساتشي', []], ['bottega_veneta', 'Bottega Veneta', 'بوتيغا فينيتا', []], ['loewe', 'Loewe', 'لويفي', []],
    ['celine', 'Celine', 'سيلين', []], ['zara', 'Zara', 'زارا', []], ['hm', 'H&M', 'إتش آند إم', []], ['uniqlo', 'Uniqlo', 'يونيكلو', []],
    ['nike', 'Nike', 'نايكي', []], ['adidas', 'Adidas', 'أديداس', []], ['puma', 'Puma', 'بوما', []], ['ray_ban', 'Ray-Ban', 'راي بان', ['Ray Ban']],
    ['oakley', 'Oakley', 'أوكلي', []], ['montblanc', 'Montblanc', 'مونت بلانك', []],
  ];
}
