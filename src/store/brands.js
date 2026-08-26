// OWNER: builder-store. Invented grocery brands + the copy that goes on a package.
//
// Round-2 finding: the single most identifying property of a real grocery aisle
// is that it is a WALL OF SMALL HIGH-CONTRAST LETTERING. Flat colour fields with
// grey bars have the wrong spatial frequency. So every facing now carries real
// glyphs drawn with fillText, and the words come from here.
//
// Everything is invented. No real trademarks.
//
// =========================================================================
// ROUND 15 — THE COPY IS THE CUE, AND IT WAS INCOHERENT ON THREE AXES.
//
// Rounds 12-14 each moved a colour statistic and the blind A/B went
// 12/12 -> 35/36 -> 36/36. It got WORSE. The round-14 critic, scoring 36/36
// with 18/18 render recall, named what it was actually calling on, and the
// first item was not lighting: "generated package copy that is legible and
// CATEGORY-INCOHERENT — PENNYWHISTLE MARINARA SAUCE / KETTLE COOKED FOR EXTRA
// CRUNCH. A human reads one facing and knows."
//
// Read against the atlases this round, the defect is worse than that example
// and it fails on three INDEPENDENT axes, not one. Four facings, transcribed
// off the round-14 carton atlas (cells 0, 1, 6, 7) and the can and bottle
// atlases, in shots/r15_r14copy_*.png:
//
//   EVERY DAY / FACIAL TISSUE / RESEALABLE STAY-FRESH POUCH / HONEY /
//     SEE SIDE PANEL FOR RECIPES / NET WT 12 OZ (340g)
//   GRISWOLD / MULTIVITAMIN / READY IN 5 MINUTES / HOT /
//     CERTIFIED SUSTAINABLY SOURCED / NET WT 14.5 OZ (411g)
//   KIRBY'S / PURE CANE SUGAR / RESEALABLE STAY-FRESH POUCH / MILD
//   BRIGHTWATER / HAMBURGER BUNS / NO SUGAR ADDED      <- printed on a CAN
//   PRAIRIE GOLD / YELLOW CAKE MIX / THICK CUT         <- printed on a BOTTLE
//
// The three axes:
//
//   1. PRODUCT CLASS. The descriptor was department-correct, and every band
//      around it — flash, sub-descriptor, claim, net weight, nutrition badge,
//      legal block — was drawn from ONE GLOBAL POOL. Honey facial tissue with
//      recipes on the side panel is that pool, not a bad roll.
//   2. FOOD vs NON-FOOD. A food ingredients panel and a calorie badge were
//      printed on tissue and on a multivitamin. pack.js gated the PHOTO on
//      food-ness (round 5) and never gated the WORDS.
//   3. PACKAGE FORM. Nothing anywhere connected the product noun to the shape
//      it was printed on, so the can atlas drew bakery descriptors and the
//      bottle atlas drew boxed-cake-mix descriptors. This axis had never been
//      considered at all.
//
// THE FIX, AND WHY IT IS SHAPED LIKE THIS. The words a package carries are a
// property OF THE PRODUCT, not of the aisle it sits in: MILD is right on salsa
// and absurd on sugar, and both are in the same department in a real store.
// So the source of truth below is one row per SKU carrying its department, its
// product class and the package FORMS it is sold in, and every band is chosen
// from that class. DESC is derived from that table rather than being a second
// copy of the word list — CLAUDE.md's one-owner rule, applied to prose.
//
// It is a TABLE and not a regex on purpose. foodBand() in pack.js classifies by
// regex and that is fine for a palette, where a miss costs one wrong-coloured
// blob. A miss here prints a sentence a shopper would stop and frown at, which
// is the exact defect being fixed. copyCheck() below asserts every SKU is
// classified and every class is reachable, in the lungCheck() style, so adding
// a product without classifying it fails loudly instead of silently falling
// back to crackers.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it does not reduce legibility. Making the
// type smaller or blurrier would also close the critic's item 1, and it is a
// retreat — the round-3 note below records that an illegible panel reads as
// MORE artificial than a blank one, and a critic will treat a legibility cut as
// what it is. Every band below is the same size it was; it just says something
// the product could actually say.
// =========================================================================

// --- display faces available on any macOS/Chrome canvas without a webfont ----
// Grocery wordmarks are overwhelmingly heavy grotesques and fat slabs, with the
// occasional script for "premium" lines and a serif for anything "traditional".
export const FACE = {
  fat:    '"Arial Black", "Helvetica Neue", Impact, sans-serif',
  impact: 'Impact, "Arial Black", sans-serif',
  grot:   '"Helvetica Neue", Helvetica, Arial, sans-serif',
  geo:    'Futura, "Avenir Next", "Century Gothic", sans-serif',
  human:  'Optima, "Gill Sans", "Trebuchet MS", sans-serif',
  serif:  'Georgia, "Hoefler Text", "Times New Roman", serif',
  didone: 'Didot, "Bodoni 72", Georgia, serif',
  slab:   '"American Typewriter", Rockwell, Courier, serif',
  script: '"Snell Roundhand", "Brush Script MT", "Apple Chancery", cursive',
  plate:  'Copperplate, "Copperplate Gothic Light", Optima, serif',
  mono:   '"Courier New", Menlo, monospace',
};

// --- brand names ------------------------------------------------------------
// Two-word "place" names and possessive family names are the two dominant
// shapes on a real shelf. Kept short so they fit a facing at display size.
export const BRANDS = [
  'VALEBROOK', 'GOLDEN MEADOW', 'HARVEST LANE', "KIRBY'S", 'NORTHFIELD',
  'SUNCREST', 'MAPLERIDGE', 'HOLLOWAY', 'PRAIRIE GOLD', 'BRIGHTWATER',
  'OAKHAVEN', 'CEDAR MILL', 'TOLLIVER', 'MARCHETTI', 'PENNYWHISTLE',
  'DUNMORE', 'ASHFORD', 'LARKSPUR', 'BELLWOOD', 'RIVERMONT',
  'THISTLEDOWN', 'WHITTAKER', 'COPPER KETTLE', 'MORNING FIELD', 'HEARTHSTONE',
  'GRANDVIEW', 'SILVERTON', 'WESTBURY', 'FAIRMONT', 'CORNERSTONE',
  'BLUE HERON', 'ORCHARD ROW', 'STONEBRIDGE', 'RED BARN', 'HOLLIS',
  'MERRIWEATHER', 'TALLGRASS', 'WINDROW', 'CALDWELL', 'BRAMBLE & CO',
  'OLD MILLPOND', 'SUMMERLIN', 'DEEPWATER', 'GRISWOLD', 'FAIRVIEW FARMS',
  'ROSEMONT', 'KETTLE CREEK', 'HAVENWOOD', 'PIKE STREET', 'ELDERBERRY',
];

// Short store-brand marks — the value tier that fills the bottom shelf.
export const VALUE_BRANDS = [
  'THRIFT KING', 'EVERY DAY', 'PLAIN LABEL', 'BUDGET BIN', 'BASIC CHOICE',
  'SAVER', 'VALUE FIRST', 'NO FRILLS',
];

// ---------------------------------------------------------------------------
// THE SKU TABLE — the one owner of "what is this thing".
//
// [ name, department key, product class, package forms ]
//
// FORMS are the four package geometries ../store.js actually builds, so a form
// letter here is a physical claim, not a taxonomy:
//   C  carton / box / sleeve / shrink multipack     (K.*Box, K.sleeve, K.multi)
//   P  bag / pouch / stand-up gusset                (K.bag, K.pouch, K.standUp)
//   N  can / jar / tub / canister — anything with a cylindrical wrap label
//   B  bottle / jug / spray                         (K.bottle, K.jug, K.sodaBtl)
//
// A jar is N and not B on purpose: a jar of marinara wears the same wrap label
// a can wears, and store.js draws both from the can atlas.
export const SKUS = [
  // --- bakery / baking -----------------------------------------------------
  ['ALL PURPOSE FLOUR',     'bakery', 'flour',        'CP'],
  ['PURE CANE SUGAR',       'bakery', 'sweetener',    'CP'],
  ['BROWN SUGAR',           'bakery', 'sweetener',    'CP'],
  ['POWDERED SUGAR',        'bakery', 'sweetener',    'CP'],
  ['BAKING SODA',           'bakery', 'leavening',    'C'],
  ['YELLOW CAKE MIX',       'bakery', 'mix',          'C'],
  ['BROWNIE MIX',           'bakery', 'mix',          'C'],
  ['PANCAKE MIX',           'bakery', 'mix',          'CP'],
  ['CORN MUFFIN MIX',       'bakery', 'mix',          'C'],
  ['GRAHAM WAFERS',         'bakery', 'cookie',       'C'],
  ['FUDGE STRIPE COOKIES',  'bakery', 'cookie',       'CP'],
  ['SANDWICH CREMES',       'bakery', 'cookie',       'CP'],
  ['VANILLA WAFERS',        'bakery', 'cookie',       'CP'],
  ['CHOCOLATE CHIPS',       'bakery', 'bakingChip',   'P'],
  ['SANDWICH BREAD',        'bakery', 'slicedLoaf',   'P'],
  ['HAMBURGER BUNS',        'bakery', 'bunRoll',      'P'],
  // --- canned --------------------------------------------------------------
  ['WHOLE KERNEL CORN',     'canned', 'cannedVeg',    'N'],
  ['CUT GREEN BEANS',       'canned', 'cannedVeg',    'N'],
  ['SWEET PEAS',            'canned', 'cannedVeg',    'N'],
  ['DICED TOMATOES',        'canned', 'cannedVeg',    'N'],
  ['SLICED CARROTS',        'canned', 'cannedVeg',    'N'],
  ['TOMATO PASTE',          'canned', 'redSauce',     'N'],
  ['CHICKEN NOODLE',        'canned', 'soup',         'N'],
  ['CREAM OF MUSHROOM',     'canned', 'soup',         'N'],
  ['TOMATO SOUP',           'canned', 'soup',         'N'],
  ['BEEF BROTH',            'canned', 'broth',        'NC'],
  ['PORK & BEANS',          'canned', 'beans',        'N'],
  ['KIDNEY BEANS',          'canned', 'beans',        'N'],
  ['SLICED PEACHES',        'canned', 'cannedFruit',  'N'],
  ['MANDARIN ORANGES',      'canned', 'cannedFruit',  'N'],
  ['FRUIT COCKTAIL',        'canned', 'cannedFruit',  'N'],
  ['CHUNK LIGHT TUNA',      'canned', 'cannedFish',   'NP'],
  // --- pasta / rice / sauce ------------------------------------------------
  ['ELBOW MACARONI',        'pasta',  'pasta',        'CP'],
  ['THIN SPAGHETTI',        'pasta',  'pasta',        'CP'],
  ['PENNE RIGATE',          'pasta',  'pasta',        'CP'],
  ['EGG NOODLES',           'pasta',  'pasta',        'CP'],
  ['LASAGNA',               'pasta',  'pasta',        'C'],
  ['MARINARA SAUCE',        'pasta',  'redSauce',     'N'],
  ['ALFREDO SAUCE',         'pasta',  'whiteSauce',   'N'],
  ['SALSA VERDE',           'pasta',  'salsa',        'N'],
  ['SOY SAUCE',             'pasta',  'asianSauce',   'B'],
  ['LONG GRAIN RICE',       'pasta',  'rice',         'CP'],
  ['INSTANT RICE',          'pasta',  'rice',         'CP'],
  ['RICE PILAF',            'pasta',  'rice',         'C'],
  ['REFRIED BEANS',         'pasta',  'beans',        'N'],
  ['BLACK BEANS',           'pasta',  'beans',        'N'],
  ['CHILI BEANS',           'pasta',  'beans',        'N'],
  ['TACO SHELLS',           'pasta',  'taco',         'C'],
  // --- snacks --------------------------------------------------------------
  ['KETTLE CHIPS',          'snacks', 'chip',         'P'],
  ['TORTILLA ROUNDS',       'snacks', 'chip',         'P'],
  ['PRETZEL TWISTS',        'snacks', 'chip',         'P'],
  ['CHEESE PUFFS',          'snacks', 'chip',         'P'],
  ['CARAMEL POPCORN',       'snacks', 'chip',         'PC'],
  ['ROASTED PEANUTS',       'snacks', 'nuts',         'NP',  'p7'],
  ['MIXED NUTS',            'snacks', 'nuts',         'NP',  'p7'],
  ['TRAIL MIX',             'snacks', 'nuts',         'P'],
  ['BUTTER CRACKERS',       'snacks', 'cracker',      'C'],
  ['SALTINE CRACKERS',      'snacks', 'cracker',      'C'],
  ['SANDWICH CRACKERS',     'snacks', 'cracker',      'CP'],
  ['CHEESE CRACKERS',       'snacks', 'cracker',      'CP'],
  ['FRUIT CHEWS',           'snacks', 'candy',        'P'],
  ['GUMMI BEARS',           'snacks', 'candy',        'P'],
  ['MILK CHOCOLATE BARS',   'snacks', 'candy',        'CP'],
  ['BEEF STICKS',           'snacks', 'meatSnack',    'P'],
  // --- soda / juice --------------------------------------------------------
  ['COLA',                  'soda',   'soda',         'BNC'],
  ['DIET COLA',             'soda',   'soda',         'BNC', 'nosugar'],
  ['LEMON LIME SODA',       'soda',   'soda',         'BNC', 'nocaf'],
  ['ROOT BEER',             'soda',   'soda',         'BNC', 'nocaf'],
  ['ORANGE SODA',           'soda',   'soda',         'BNC', 'nocaf'],
  ['GINGER ALE',            'soda',   'soda',         'BNC', 'nocaf'],
  ['GRAPE SODA',            'soda',   'soda',         'BNC', 'nocaf'],
  ['CLUB SODA',             'soda',   'soda',         'BNC', 'nosugar nocaf'],
  ['SPRING WATER',          'soda',   'water',        'B',   'nosugar nocaf'],
  ['SPARKLING WATER',       'soda',   'water',        'BNC', 'nosugar nocaf'],
  ['FRUIT PUNCH',           'soda',   'juice',        'BC'],
  ['ORANGE JUICE',          'soda',   'juice',        'BC'],
  ['APPLE JUICE',           'soda',   'juice',        'BC'],
  ['LEMON ICED TEA',        'soda',   'rtdTea',       'BC'],
  ['SPORTS DRINK',          'soda',   'sportsDrink',  'B'],
  ['ENERGY DRINK',          'soda',   'sportsDrink',  'NB'],
  // --- breakfast -----------------------------------------------------------
  ['TOASTED OAT SQUARES',   'breakfast', 'cereal',    'C'],
  ['HONEY BRAN FLAKES',     'breakfast', 'cereal',    'C'],
  ['CORN FLAKES',           'breakfast', 'cereal',    'C'],
  ['CRISP RICE',            'breakfast', 'cereal',    'C'],
  ['FROSTED WHEAT',         'breakfast', 'cereal',    'C'],
  ['RAISIN BRAN',           'breakfast', 'cereal',    'C'],
  ['GRANOLA CLUSTERS',      'breakfast', 'cereal',    'CP'],
  ['INSTANT OATMEAL',       'breakfast', 'oatmeal',   'CN'],
  ['GROUND COFFEE',         'breakfast', 'coffee',    'NP'],
  ['INSTANT COFFEE',        'breakfast', 'coffee',    'N'],
  ['ORANGE PEKOE TEA',      'breakfast', 'tea',       'C'],
  ['HERBAL TEA',            'breakfast', 'tea',       'C',   'nocaf'],
  ['MAPLE SYRUP',           'breakfast', 'tableSyrup','B'],
  ['GRAPE JELLY',           'breakfast', 'fruitSpread','N'],
  ['PEANUT BUTTER',         'breakfast', 'nutSpread', 'N'],
  ['STRAWBERRY PRESERVES',  'breakfast', 'fruitSpread','N'],
  // --- paper / cleaning ----------------------------------------------------
  ['PAPER TOWELS',          'paper',  'towel',        'CP'],
  ['NAPKINS',               'paper',  'towel',        'CP'],
  ['BATH TISSUE',           'paper',  'bathTissue',   'CP'],
  ['FACIAL TISSUE',         'paper',  'facialTissue', 'C'],
  ['LAUNDRY DETERGENT',     'paper',  'laundry',      'BCP'],
  ['FABRIC SOFTENER',       'paper',  'laundry',      'BP'],
  ['DISH SOAP',             'paper',  'dishwash',     'B'],
  ['DISHWASHER PACS',       'paper',  'dishwash',     'CP'],
  ['ALL PURPOSE CLEANER',   'paper',  'cleaner',      'B'],
  ['GLASS CLEANER',         'paper',  'cleaner',      'B'],
  ['BLEACH',                'paper',  'disinfect',    'B'],
  ['DISINFECTING WIPES',    'paper',  'disinfect',    'N'],
  ['TALL KITCHEN BAGS',     'paper',  'wrap',         'C'],
  ['FOOD STORAGE BAGS',     'paper',  'wrap',         'C'],
  ['ALUMINUM FOIL',         'paper',  'wrap',         'C'],
  ['PLASTIC WRAP',          'paper',  'wrap',         'C'],
  // --- health & beauty -----------------------------------------------------
  ['PAIN RELIEVER',         'health', 'analgesic',    'CN'],
  ['ANTACID TABLETS',       'health', 'antacid',      'CN'],
  ['COUGH SYRUP',           'health', 'coughCold',    'B'],
  ['ALLERGY RELIEF',        'health', 'allergy',      'C'],
  ['MULTIVITAMIN',          'health', 'vitamin',      'N'],
  ['VITAMIN C 500MG',       'health', 'vitamin',      'N'],
  ['CALCIUM + D3',          'health', 'vitamin',      'N'],
  ['FISH OIL',              'health', 'vitamin',      'N'],
  ['SHAMPOO',               'health', 'hairCare',     'B'],
  ['CONDITIONER',           'health', 'hairCare',     'B'],
  ['BODY WASH',             'health', 'skinCare',     'B'],
  ['BAR SOAP',              'health', 'skinCare',     'C'],
  ['TOOTHPASTE',            'health', 'toothpaste',   'C'],
  ['MOUTHWASH',             'health', 'rinse',        'B'],
  ['BABY WIPES',            'health', 'babyWipe',     'CP'],
  ['DIAPERS SIZE 3',        'health', 'diaper',       'CP'],
  // --- frozen --------------------------------------------------------------
  ['GARDEN PEAS',           'frozen', 'frozenVeg',    'P'],
  ['BROCCOLI FLORETS',      'frozen', 'frozenVeg',    'P'],
  ['STIR FRY BLEND',        'frozen', 'frozenVeg',    'P'],
  ['CORN ON THE COB',       'frozen', 'frozenVeg',    'P'],
  ['MIXED BERRIES',         'frozen', 'frozenFruit',  'P'],
  ['FRENCH FRIES',          'frozen', 'frozenMeal',   'P'],
  ['CHICKEN TENDERS',       'frozen', 'frozenMeal',   'CP'],
  ['FISH STICKS',           'frozen', 'frozenMeal',   'C'],
  ['PEPPERONI PIZZA',       'frozen', 'frozenMeal',   'C'],
  ['WAFFLES',               'frozen', 'frozenMeal',   'C'],
  ['VANILLA ICE CREAM',     'frozen', 'iceCream',     'N'],
  ['FUDGE BARS',            'frozen', 'novelty',      'C'],
];

// DESC is DERIVED, not typed twice. pack.js and foodBand() still see exactly
// the shape they saw in round 14 — { deptKey: string[] } — but there is now one
// place where a product noun exists.
export const DESC = (() => {
  const d = {};
  for (const [n, dept] of SKUS) (d[dept] || (d[dept] = [])).push(n);
  return d;
})();

// ---------------------------------------------------------------------------
// SHARED BANDS. A weight format, a nutrition badge and a legal block are
// properties of a FAMILY of products, so they live once and classes name them.
// Naming them by key rather than copying the arrays into 41 classes is what
// keeps this table auditable at a glance.

const WT = {
  dryBox:   ['NET WT 12 OZ (340g)', 'NET WT 16 OZ (453g)', 'NET WT 14.5 OZ (411g)',
             'NET WT 18 OZ (510g)', 'NET WT 10.5 OZ (298g)'],
  bigBag:   ['NET WT 2 LB (907g)', 'NET WT 4 LB (1.81 kg)', 'NET WT 5 LB (2.27 kg)',
             'NET WT 32 OZ (907g)'],
  snackBag: ['NET WT 8 OZ (227g)', 'NET WT 9.5 OZ (269g)', 'NET WT 11 OZ (312g)',
             'NET WT 6 OZ (170g)', 'PARTY SIZE 13 OZ (369g)'],
  can:      ['NET WT 15 OZ (425g)', 'NET WT 14.5 OZ (411g)', 'NET WT 10.75 OZ (305g)',
             'NET WT 8 OZ (227g)', 'NET WT 28 OZ (794g)'],
  jar:      ['NET WT 24 OZ (680g)', 'NET WT 16 OZ (453g)', 'NET WT 26 OZ (737g)',
             'NET WT 18 OZ (510g)'],
  tin:      ['NET WT 5 OZ (142g)', 'NET WT 12 OZ (340g)', 'NET WT 30.5 OZ (864g)'],
  bev:      ['2 LITER (67.6 FL OZ)', '20 FL OZ (591 mL)', '12 FL OZ (355 mL)',
             '64 FL OZ (1.89 L)', '1 GAL (3.78 L)'],
  bigBottle:['64 FL OZ (1.89 L)', '100 FL OZ (2.95 L)', '121 FL OZ (3.57 L)',
             '32 FL OZ (946 mL)', '46 FL OZ (1.36 L)'],
  smBottle: ['16 FL OZ (473 mL)', '12 FL OZ (355 mL)', '8 FL OZ (236 mL)',
             '25.4 FL OZ (750 mL)'],
  // NOT a net weight. A paper good is sold by count and a real pack says so —
  // this is one of the loudest wrong notes in the round-14 atlas.
  count:    ['6 BIG ROLLS', '12 DOUBLE ROLLS', '2 PLY · 110 SHEETS EACH',
             '200 COUNT', '8 MEGA ROLLS'],
  roll:     ['200 SQ FT · 75 YD', '100 CT · 13 GAL', '75 SQ FT ROLL', '120 COUNT'],
  dose:     [['24 CAPLETS', 'ct24'], ['50 TABLETS', 'ct50'], '100 COUNT',
             '60 SOFTGELS', '30 TABLETS'],
  care:     ['13.5 FL OZ (400 mL)', '22 FL OZ (650 mL)', '15 FL OZ (443 mL)',
             '3 BARS · 4 OZ EACH'],
  oralSz:   ['4.6 OZ (130g)', '5.7 OZ (161g)', '33.8 FL OZ (1 L)',
             '2 TUBES · 4.6 OZ EACH'],
  babyCt:   ['44 COUNT', '216 WIPES · 3 PACKS', '80 WIPES', '92 COUNT'],
  frozen:   ['NET WT 12 OZ (340g)', 'NET WT 16 OZ (453g)', 'NET WT 24 OZ (680g)',
             'NET WT 10 OZ (283g)'],
  pint:     ['1.5 QT (1.41 L)', '48 FL OZ (1.41 L)', '1 PINT (473 mL)'],
  // ---- ROUND 16. New sets for the split classes. Each one exists because the
  // set it was carved out of stated the contents of a DIFFERENT product: a
  // tablet count on a bottle of syrup, a sheet count on a roll of towel, a
  // per-loaf slice count on a pack of buns.
  loaf:     ['NET WT 20 OZ (567g)', 'NET WT 24 OZ (680g)', 'NET WT 16 OZ (453g)'],
  bunCt:    ['8 BUNS · 15 OZ (425g)', '8 BUNS · 12 OZ (340g)', '6 ROLLS · 11 OZ (312g)'],
  rollCt:   ['6 BIG ROLLS', '12 DOUBLE ROLLS', '8 MEGA ROLLS', '4 GIANT ROLLS'],
  sheetCt:  ['160 SHEETS · 2 PLY', '85 SHEETS · 3 PLY', '4 BOXES · 120 EACH',
             '210 SHEETS · 2 PLY'],
  // FORM GATED. `dishwash` holds a bottle of dish soap and a box of dishwasher
  // pacs; a 60 COUNT on the bottle read as a tablet count on a liquid.
  dishSz:   [['19.4 FL OZ (573 mL)', '@B'], ['38 FL OZ (1.12 L)', '@B'],
             ['60 COUNT', '@CP'], ['32 COUNT', '@CP']],
  doseLiq:  ['4 FL OZ (118 mL)', '8 FL OZ (236 mL)', '12 FL OZ (355 mL)'],
  careSk:   ['16 FL OZ (473 mL)', '22 FL OZ (650 mL)', '3 BARS · 4 OZ EACH',
             '8 BARS · 3.7 OZ EACH'],
  tube:     ['4.6 OZ (130g)', '5.7 OZ (161g)', '2 TUBES · 4.6 OZ EACH'],
  rinseSz:  ['33.8 FL OZ (1 L)', '16.9 FL OZ (500 mL)', '50.7 FL OZ (1.5 L)'],
  wipeCt:   ['216 WIPES · 3 PACKS', '80 WIPES', '432 WIPES · 6 PACKS'],
  diaperCt: ['44 COUNT', '92 COUNT', '124 COUNT · VALUE BOX'],
  barCt:    ['6 BARS · 2.5 FL OZ EACH', '12 BARS · 1.65 FL OZ EACH',
             '6 BARS · 3 FL OZ EACH'],
  doseVit:  ['100 TABLETS', '60 SOFTGELS', '250 TABLETS · VALUE SIZE', '90 TABLETS'],
  teaCt:    [['100 TEA BAGS', 'ct100'], ['48 TEA BAGS', 'ct48'],
             ['20 TEA BAGS · INDIVIDUALLY WRAPPED', 'ct20']],
};

// The circular badge. Pairs are [big, small]. Non-food classes get a badge that
// is not a nutrient — a real bleach bottle does not claim grams of protein.
const BADGE = {
  // A roundel entry is [big, small] or [big, small, 'tags'] — see band() and
  // CONFLICTS. `hascal` is the tag the whole soda fix turns on.
  cal:    [['140', 'CALORIES', 'hascal'], ['90', 'CALORIES', 'hascal'],
           ['0g', 'TRANS FAT'], ['110', 'CALORIES', 'hascal']],
  grain:  [['100%', 'WHOLE GRAIN'], ['3g', 'FIBER'], ['5g', 'FIBER'],
           ['12', 'VITAMINS']],
  protein:[['12g', 'PROTEIN', 'p12'], ['7g', 'PROTEIN', 'p7'],
           ['0g', 'ADDED SUGAR', 'nosugar']],
  veg:    [['1/2 CUP', 'VEGETABLES'], ['NO', 'SALT ADDED'], ['0g', 'FAT']],
  fruit:  [['100%', 'JUICE'], ['1/2 CUP', 'FRUIT'], ['NO', 'SUGAR ADDED', 'nosugar']],
  // A JAR OF JELLY IS NOT JUICE. `fruit` served both the juice class and the
  // fruit-spread class, so a 100% JUICE roundel reached GRAPE JELLY on 0.67% of
  // all facings after the r16 split — the split fixed the words and left the
  // roundel behind, which is its own small lesson about doing one axis at a time.
  spreadB: [['1/2 CUP', 'FRUIT'], ['NO', 'SUGAR ADDED', 'nosugar'],
            ['MADE WITH', 'REAL FRUIT']],
  // ...and half a cup of vegetables is a serving claim a salsa cannot make.
  salsaB:  [['NO', 'SALT ADDED'], ['0g', 'FAT'], ['FIRE', 'ROASTED']],
  // ROUND 16 — `clean` was one roundel set covering laundry, dish, bleach and
  // glass, so a wash-load count landed on ALL PURPOSE CLEANER. Four sets now.
  clean:  [['2X', 'CONCENTRATED'], ['64', 'LOADS'], ['HE', 'COMPATIBLE'],
           ['NEW', 'SCENT']],
  cleanB: [['2X', 'CONCENTRATED'], ['STREAK', 'FREE'], ['NEW', 'SCENT']],
  dishB:  [['2X', 'CONCENTRATED'], ['CUTS', 'GREASE'], ['NEW', 'SCENT']],
  germB:  [['99.9%', 'OF GERMS'], ['30 SEC', 'DISINFECT'], ['EPA', 'REGISTERED']],
  ply:    [['2', 'PLY'], ['110', 'SHEETS'], ['+30%', 'MORE ABSORBENT']],
  drug:     [['500', 'MG'], ['FAST', 'ACTING'], ['8', 'HOUR']],
  antacidB: [['750', 'MG'], ['FAST', 'RELIEF'], ['WITH', 'CALCIUM']],
  coldB:    [['8', 'HOUR'], ['SOOTHING', 'RELIEF'], ['ALCOHOL', 'FREE']],
  allergyB: [['24', 'HOUR'], ['NON', 'DROWSY'], ['10', 'MG']],
  vitB:     [['ONE', 'A DAY'], ['100%', 'DAILY VALUE'], ['NO', 'GLUTEN']],
  diaperB:  [['12H', 'PROTECTION'], ['SIZE', '3'], ['WETNESS', 'INDICATOR']],
  care2:  [['pH', 'BALANCED'], ['24H', 'MOISTURE'], ['0%', 'PARABENS']],
  oral2:  [['FIGHTS', 'CAVITIES'], ['12H', 'FRESH BREATH'], ['WITH', 'FLUORIDE']],
  none:   null,
};

// Legal type. Never read at display size — its job is to produce the dense
// luminance noise that a photograph of a package has and a flat fill does not.
// Kept plausible so it survives a close crop, which is exactly why it has to be
// the RIGHT small print: an enriched-wheat-flour ingredients panel on a bottle
// of bleach is legible nonsense at 3x, and 3x is where a critic looks.
export const LEGAL_SETS = {
  food: [
    'INGREDIENTS: ENRICHED WHEAT FLOUR (NIACIN, REDUCED IRON, THIAMIN',
    'MONONITRATE, RIBOFLAVIN, FOLIC ACID), SUGAR, VEGETABLE OIL, SALT,',
    'LEAVENING (BAKING SODA, MONOCALCIUM PHOSPHATE), NATURAL FLAVOR.',
    'CONTAINS WHEAT AND SOY. MAY CONTAIN TRACES OF MILK AND TREE NUTS.',
    'DISTRIBUTED BY VALEBROOK FOODS CO., DES MOINES IA 50266 U.S.A.',
    'QUESTIONS OR COMMENTS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CT.',
    'PERCENT DAILY VALUES ARE BASED ON A 2,000 CALORIE DIET. YOUR',
    'DAILY VALUES MAY BE HIGHER OR LOWER DEPENDING ON CALORIE NEEDS.',
    'STORE IN A COOL DRY PLACE. RESEAL LINER AFTER OPENING. BEST IF',
    'USED BY DATE STAMPED ON TOP PANEL. PRODUCT OF U.S.A.',
    'NO ARTIFICIAL COLORS OR FLAVORS. GLUTEN FREE INGREDIENTS USED.',
    'SATISFACTION GUARANTEED OR YOUR MONEY BACK. SEE PANEL FOR DETAILS.',
  ],
  // ROUND 16 — `wet` no longer says CAN. It was the auditor's single biggest
  // hit at 8.81% of all facings: "DO NOT USE IF... CAN IS DENTED" and "BEST BY
  // DATE ON END OF CAN" were printed on a BOTTLE of soy sauce and a JAR of
  // marinara, because one legal set served every wet food whatever it came in.
  // The can-only lines moved to `canned`, which a class reaches through the
  // optional legalN key and only on package form N.
  wet: [
    'INGREDIENTS: WATER, TOMATO PUREE, SUGAR, SALT, ONION POWDER,',
    'CITRIC ACID, NATURAL FLAVOR, SPICE. CONTAINS NO PRESERVATIVES.',
    'REFRIGERATE AFTER OPENING. USE WITHIN 7 DAYS FOR BEST QUALITY.',
    'DO NOT USE IF THE SAFETY SEAL IS BROKEN OR MISSING.',
    'PACKED BY VALEBROOK FOODS CO., DES MOINES IA 50266 U.S.A.',
    'HEAT AND SERVE. STIR OCCASIONALLY. DO NOT BOIL DRY.',
    'PERCENT DAILY VALUES ARE BASED ON A 2,000 CALORIE DIET.',
    'QUESTIONS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CENTRAL TIME.',
  ],
  canned: [
    'INGREDIENTS: WATER, TOMATO PUREE, SUGAR, SALT, ONION POWDER,',
    'CITRIC ACID, NATURAL FLAVOR, SPICE. CONTAINS NO PRESERVATIVES.',
    'REFRIGERATE AFTER OPENING. USE WITHIN 7 DAYS FOR BEST QUALITY.',
    'DO NOT USE IF SEAL IS BROKEN OR CAN IS DENTED OR BULGING.',
    'PACKED BY VALEBROOK FOODS CO., DES MOINES IA 50266 U.S.A.',
    'BEST BY DATE ON END OF CAN. HEAT AND SERVE. STIR OCCASIONALLY.',
    'PERCENT DAILY VALUES ARE BASED ON A 2,000 CALORIE DIET.',
    'QUESTIONS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CENTRAL TIME.',
  ],
  bev: [
    'INGREDIENTS: CARBONATED WATER, HIGH FRUCTOSE CORN SYRUP, CITRIC',
    'ACID, NATURAL FLAVOR, SODIUM BENZOATE (PRESERVES FRESHNESS).',
    'VERY LOW SODIUM. CONTAINS NO JUICE. REFRIGERATE AFTER OPENING.',
    'BEST TASTE BY DATE ON NECK. SERVE CHILLED OVER ICE.',
    'BOTTLED UNDER AUTHORITY OF VALEBROOK BEVERAGES, DES MOINES IA.',
    'CA CASH REFUND. RECYCLE THE EMPTY BOTTLE WHERE FACILITIES EXIST.',
    'CAUTION: CONTENTS UNDER PRESSURE. DO NOT SHAKE OR FREEZE.',
    'QUESTIONS OR COMMENTS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CT.',
  ],
  clean: [
    'ACTIVE INGREDIENT: ALKYL DIMETHYL BENZYL AMMONIUM CHLORIDE 0.14%',
    'OTHER INGREDIENTS 99.86%. TOTAL 100%. SEE BACK PANEL FOR USE.',
    'KEEP OUT OF REACH OF CHILDREN. HARMFUL IF SWALLOWED. AVOID',
    'CONTACT WITH EYES. IF IN EYES, RINSE WITH WATER FOR 15 MINUTES.',
    'DO NOT MIX WITH OTHER HOUSEHOLD CHEMICALS OR AMMONIA PRODUCTS.',
    'DIRECTIONS: SPRAY SURFACE UNTIL WET. LET STAND 30 SECONDS. WIPE.',
    'NOT FOR USE ON UNSEALED WOOD OR NATURAL STONE SURFACES.',
    'STORE UPRIGHT IN A COOL DRY PLACE AWAY FROM DIRECT SUNLIGHT.',
    'DISTRIBUTED BY VALEBROOK HOUSEHOLD, DES MOINES IA 50266 U.S.A.',
    'QUESTIONS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CENTRAL TIME.',
  ],
  drug: [
    'ACTIVE INGREDIENT (IN EACH CAPLET): ACETAMINOPHEN 500 MG.',
    'PURPOSE: PAIN RELIEVER / FEVER REDUCER. USES: TEMPORARILY',
    'RELIEVES MINOR ACHES AND PAINS DUE TO HEADACHE, BACKACHE,',
    'THE COMMON COLD, TOOTHACHE, MUSCULAR ACHES, MENSTRUAL CRAMPS.',
    'WARNINGS: LIVER WARNING. THIS PRODUCT CONTAINS ACETAMINOPHEN.',
    'DO NOT EXCEED 6 CAPLETS IN 24 HOURS UNLESS DIRECTED BY A DOCTOR.',
    'KEEP OUT OF REACH OF CHILDREN. IN CASE OF OVERDOSE, GET MEDICAL',
    'HELP OR CONTACT A POISON CONTROL CENTER RIGHT AWAY.',
    'INACTIVE INGREDIENTS: CELLULOSE, CORN STARCH, MAGNESIUM STEARATE.',
    'DO NOT USE IF PRINTED SAFETY SEAL UNDER CAP IS BROKEN OR MISSING.',
  ],
  care: [
    'INGREDIENTS: WATER, SODIUM LAURETH SULFATE, COCAMIDOPROPYL',
    'BETAINE, GLYCERIN, FRAGRANCE, CITRIC ACID, SODIUM CHLORIDE,',
    'GUAR HYDROXYPROPYLTRIMONIUM CHLORIDE, TOCOPHERYL ACETATE.',
    'FOR EXTERNAL USE ONLY. AVOID CONTACT WITH EYES. IF CONTACT',
    'OCCURS, RINSE THOROUGHLY WITH WATER. DISCONTINUE IF IRRITATION.',
    'DIRECTIONS: APPLY TO WET HAIR. LATHER. RINSE. REPEAT IF DESIRED.',
    'DISTRIBUTED BY VALEBROOK PERSONAL CARE, DES MOINES IA 50266.',
    'NOT TESTED ON ANIMALS. RECYCLE THE EMPTY BOTTLE WHERE ACCEPTED.',
  ],
  paper: [
    'MADE FROM RESPONSIBLY SOURCED FIBER. SEE PACK FOR SHEET COUNT.',
    'SHEET SIZE 11 IN X 11 IN. TOTAL 110 SHEETS PER ROLL, 2 PLY.',
    'SEPTIC SAFE. BREAKS DOWN AFTER FLUSHING. NOT A FLUSHABLE WIPE.',
    'STORE IN A DRY PLACE. KEEP PLASTIC WRAP AWAY FROM CHILDREN.',
    'DISTRIBUTED BY VALEBROOK HOUSEHOLD, DES MOINES IA 50266 U.S.A.',
    'PACKAGING IS RECYCLABLE WHERE FACILITIES EXIST. PRODUCT OF U.S.A.',
    'QUESTIONS OR COMMENTS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CT.',
  ],
  // ==== ROUND 16 ============================================================
  // Nine new small-print sets. Every one of them is here because the set it
  // replaces described a different product, and the small print is where that
  // shows worst: it survives a 3x crop, which is exactly where a critic looks.
  //
  // `paper` above is now bath tissue only. `care` is split into hair and skin.
  // `drug` is split four ways. `food` no longer reaches a single-ingredient
  // product. Each split closes a rule the independent auditor was firing on.
  bath: [
    'MADE FROM RESPONSIBLY SOURCED FIBER. SEE PACK FOR ROLL COUNT.',
    'SHEET SIZE 4.0 IN X 4.0 IN. 2 PLY. SEE PACK FOR SHEETS PER ROLL.',
    'SEPTIC SAFE. BREAKS DOWN AFTER FLUSHING. NOT A FLUSHABLE WIPE.',
    'STORE IN A DRY PLACE. KEEP PLASTIC WRAP AWAY FROM CHILDREN.',
    'DISTRIBUTED BY VALEBROOK HOUSEHOLD, DES MOINES IA 50266 U.S.A.',
    'PACKAGING IS RECYCLABLE WHERE FACILITIES EXIST. PRODUCT OF U.S.A.',
  ],
  // NO septic or flushing language: a towel, a facial tissue and a diaper are
  // the three things in this store you must NOT put down a drain.
  dryPaper: [
    'MADE FROM RESPONSIBLY SOURCED FIBER. SEE PACK FOR SHEET COUNT.',
    'DO NOT FLUSH. DISPOSE OF IN A WASTE BIN.',
    'STORE IN A DRY PLACE. KEEP PLASTIC WRAP AWAY FROM CHILDREN.',
    'DISTRIBUTED BY VALEBROOK HOUSEHOLD, DES MOINES IA 50266 U.S.A.',
    'PACKAGING IS RECYCLABLE WHERE FACILITIES EXIST. PRODUCT OF U.S.A.',
    'QUESTIONS OR COMMENTS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CT.',
  ],
  hair: [
    'INGREDIENTS: WATER, SODIUM LAURETH SULFATE, COCAMIDOPROPYL',
    'BETAINE, GLYCERIN, FRAGRANCE, CITRIC ACID, SODIUM CHLORIDE,',
    'GUAR HYDROXYPROPYLTRIMONIUM CHLORIDE, TOCOPHERYL ACETATE.',
    'FOR EXTERNAL USE ONLY. AVOID CONTACT WITH EYES. IF CONTACT',
    'OCCURS, RINSE THOROUGHLY WITH WATER. DISCONTINUE IF IRRITATION.',
    'DIRECTIONS: APPLY TO WET HAIR. LATHER. RINSE. REPEAT IF DESIRED.',
    'DISTRIBUTED BY VALEBROOK PERSONAL CARE, DES MOINES IA 50266.',
    'NOT TESTED ON ANIMALS. RECYCLE THE EMPTY BOTTLE WHERE ACCEPTED.',
  ],
  skin: [
    'INGREDIENTS: WATER, SODIUM COCOYL ISETHIONATE, GLYCERIN,',
    'STEARIC ACID, COCAMIDOPROPYL BETAINE, FRAGRANCE, ALOE',
    'BARBADENSIS LEAF JUICE, TOCOPHERYL ACETATE, CITRIC ACID.',
    'FOR EXTERNAL USE ONLY. AVOID CONTACT WITH EYES. IF CONTACT',
    'OCCURS, RINSE THOROUGHLY WITH WATER. DISCONTINUE IF IRRITATION.',
    'DIRECTIONS: WET SKIN, LATHER, RINSE THOROUGHLY. FOR DAILY USE.',
    'DISTRIBUTED BY VALEBROOK PERSONAL CARE, DES MOINES IA 50266.',
    'HYPOALLERGENIC. DERMATOLOGIST TESTED. NOT TESTED ON ANIMALS.',
  ],
  oralCare: [
    'ACTIVE INGREDIENT: SODIUM FLUORIDE 0.24% (0.15% W/V FLUORIDE ION).',
    'PURPOSE: ANTICAVITY. USE: AIDS IN THE PREVENTION OF DENTAL CAVITIES.',
    'INACTIVE INGREDIENTS: SORBITOL, WATER, HYDRATED SILICA, GLYCERIN,',
    'SODIUM LAURYL SULFATE, CELLULOSE GUM, SODIUM SACCHARIN, FLAVOR.',
    'WARNINGS: KEEP OUT OF REACH OF CHILDREN UNDER 6 YEARS OF AGE.',
    'IF MORE THAN USED FOR BRUSHING IS SWALLOWED, GET MEDICAL HELP.',
    'DIRECTIONS: ADULTS AND CHILDREN 2 YEARS AND OLDER, BRUSH TWICE',
    'DAILY. SUPERVISE CHILDREN UNDER 6 TO MINIMIZE SWALLOWING.',
  ],
  antacid: [
    'ACTIVE INGREDIENT (IN EACH TABLET): CALCIUM CARBONATE 750 MG.',
    'PURPOSE: ANTACID. USES: RELIEVES HEARTBURN, ACID INDIGESTION,',
    'SOUR STOMACH AND UPSET STOMACH ASSOCIATED WITH THESE SYMPTOMS.',
    'WARNINGS: DO NOT TAKE MORE THAN 10 TABLETS IN 24 HOURS.',
    'DO NOT USE THE MAXIMUM DOSAGE FOR MORE THAN 2 WEEKS.',
    'KEEP OUT OF REACH OF CHILDREN. IN CASE OF OVERDOSE, GET MEDICAL',
    'HELP OR CONTACT A POISON CONTROL CENTER RIGHT AWAY.',
    'INACTIVE INGREDIENTS: SUCROSE, CORN STARCH, FLAVOR, MINERAL OIL.',
  ],
  cough: [
    'ACTIVE INGREDIENTS (IN EACH 15 mL): DEXTROMETHORPHAN HBr 20 MG,',
    'GUAIFENESIN 200 MG. PURPOSES: COUGH SUPPRESSANT, EXPECTORANT.',
    'USES: TEMPORARILY RELIEVES COUGH DUE TO MINOR THROAT AND',
    'BRONCHIAL IRRITATION AS MAY OCCUR WITH THE COMMON COLD.',
    'WARNINGS: DO NOT EXCEED 6 DOSES IN ANY 24 HOUR PERIOD.',
    'DIRECTIONS: ADULTS AND CHILDREN 12 YEARS AND OVER, 15 mL EVERY',
    '4 HOURS. USE THE DOSING CUP PROVIDED. DO NOT USE A SPOON.',
    'KEEP OUT OF REACH OF CHILDREN. DO NOT USE IF SEAL IS BROKEN.',
  ],
  supp: [
    'SUPPLEMENT FACTS. SERVING SIZE: 1 TABLET. SERVINGS PER CONTAINER:',
    'SEE PACK. AMOUNT PER SERVING AND % DAILY VALUE ON SIDE PANEL.',
    'OTHER INGREDIENTS: CELLULOSE, STEARIC ACID, SILICA, MAGNESIUM',
    'STEARATE, FILM COAT (HYPROMELLOSE, TITANIUM DIOXIDE).',
    'THESE STATEMENTS HAVE NOT BEEN EVALUATED BY THE FOOD AND DRUG',
    'ADMINISTRATION. NOT INTENDED TO DIAGNOSE, TREAT, CURE OR PREVENT.',
    'KEEP OUT OF REACH OF CHILDREN. STORE AT ROOM TEMPERATURE.',
    'DO NOT USE IF PRINTED SAFETY SEAL UNDER CAP IS BROKEN OR MISSING.',
  ],
  antihist: [
    'ACTIVE INGREDIENT (IN EACH TABLET): CETIRIZINE HCl 10 MG.',
    'PURPOSE: ANTIHISTAMINE. USES: TEMPORARILY RELIEVES RUNNY NOSE,',
    'SNEEZING, ITCHY WATERY EYES AND ITCHING OF THE NOSE OR THROAT.',
    'WARNINGS: DO NOT TAKE MORE THAN ONE TABLET IN 24 HOURS.',
    'DROWSINESS MAY OCCUR. AVOID ALCOHOLIC DRINKS. BE CAREFUL WHEN',
    'DRIVING A MOTOR VEHICLE OR OPERATING MACHINERY.',
    'KEEP OUT OF REACH OF CHILDREN. IN CASE OF OVERDOSE, GET MEDICAL',
    'HELP OR CONTACT A POISON CONTROL CENTER RIGHT AWAY.',
  ],
  // A single-ingredient pantry good has no enriched-wheat-flour panel on it.
  // The auditor caught that on sugar and on coffee at 4.13% of all facings.
  sweet: [
    'INGREDIENTS: SUGAR.',
    'THIS PRODUCT CONTAINS NO ALLERGENS AND NO ADDED INGREDIENTS.',
    'PERCENT DAILY VALUES ARE BASED ON A 2,000 CALORIE DIET. YOUR',
    'DAILY VALUES MAY BE HIGHER OR LOWER DEPENDING ON CALORIE NEEDS.',
    'STORE IN A COOL DRY PLACE. RESEAL AFTER OPENING TO KEEP DRY.',
    'PACKED BY VALEBROOK FOODS CO., DES MOINES IA 50266 U.S.A.',
    'QUESTIONS OR COMMENTS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CT.',
  ],
  water: [
    'INGREDIENTS: PURIFIED WATER, MINERALS ADDED FOR TASTE.',
    'NO CALORIES. NO SODIUM. NO SWEETENERS OF ANY KIND.',
    'BOTTLED AT THE SOURCE BY VALEBROOK SPRINGS, DES MOINES IA.',
    'BEST TASTE BY DATE ON THE NECK. KEEP AWAY FROM DIRECT SUNLIGHT.',
    'RECYCLE THE EMPTY BOTTLE WHERE FACILITIES EXIST.',
    'QUESTIONS OR COMMENTS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CT.',
  ],
  bean: [
    'INGREDIENTS: 100% ROASTED COFFEE.',
    'PACKED IN A PROTECTIVE ATMOSPHERE TO PRESERVE FRESHNESS.',
    'STORE IN A COOL DRY PLACE. RESEAL THE LID AFTER EACH USE.',
    'BEST IF USED WITHIN 14 DAYS OF OPENING. DO NOT REFRIGERATE.',
    'ROASTED AND PACKED BY VALEBROOK COFFEE CO., DES MOINES IA.',
    'CERTIFIED SUSTAINABLY SOURCED. SEE SIDE PANEL FOR THE SEAL.',
    'QUESTIONS OR COMMENTS? CALL 1-800-555-0148 WEEKDAYS 9AM-5PM CT.',
  ],
};

// Round-14 name, kept so nothing outside this file breaks: the food set is what
// LEGAL always was.
export const LEGAL = LEGAL_SETS.food;

// The heading over the small-print panel, per legal set. A cleaner has
// DIRECTIONS and CAUTION; only a food has NUTRITION FACTS.
const PANEL = {
  food:  ['NUTRITION FACTS', 'INGREDIENTS', 'NUTRITION'],
  wet:    ['NUTRITION FACTS', 'INGREDIENTS', 'DIRECTIONS'],
  canned: ['NUTRITION FACTS', 'INGREDIENTS', 'DIRECTIONS'],
  bev:   ['NUTRITION FACTS', 'INGREDIENTS'],
  clean: ['DIRECTIONS', 'CAUTION', 'HOW TO USE'],
  drug:  ['DRUG FACTS', 'DIRECTIONS', 'WARNINGS'],
  care:  ['DIRECTIONS', 'INGREDIENTS'],
  paper: ['ABOUT THIS PACK', 'DIRECTIONS'],
  // ROUND 16. A heading is part of the small print and splits with it. Note
  // every drug-derived set keeps DRUG FACTS and no food set can reach it —
  // the auditor has a rule in each direction and both stay silent now.
  bath:     ['ABOUT THIS PACK', 'DIRECTIONS'],
  dryPaper: ['ABOUT THIS PACK', 'DIRECTIONS'],
  hair:     ['DIRECTIONS', 'INGREDIENTS'],
  skin:     ['DIRECTIONS', 'INGREDIENTS'],
  oralCare: ['DRUG FACTS', 'DIRECTIONS', 'WARNINGS'],
  antacid:  ['DRUG FACTS', 'DIRECTIONS', 'WARNINGS'],
  cough:    ['DRUG FACTS', 'DIRECTIONS', 'WARNINGS'],
  antihist: ['DRUG FACTS', 'DIRECTIONS', 'WARNINGS'],
  supp:     ['SUPPLEMENT FACTS', 'DIRECTIONS'],
  sweet:    ['NUTRITION FACTS', 'INGREDIENTS'],
  bean:     ['INGREDIENTS', 'DIRECTIONS'],
  water:    ['NUTRITION FACTS', 'INGREDIENTS'],
};
// Kept for compatibility with anything still reaching for the flat list.
export const PANEL_HEAD = ['NUTRITION FACTS', 'INGREDIENTS', 'DIRECTIONS', 'NUTRITION'];

// A price-burst is the one band that genuinely is category-free: a supermarket
// prints SALE on anything it wants to move.
export const BURST = ['NEW!', 'SALE', '25% MORE', 'SAVE 50¢', 'TRY IT!', '2 FOR $5', 'BONUS'];

// ---------------------------------------------------------------------------
// ROUND 16 — A BAND CAN NOW CARRY FLAGS, AND FLAGS ARE WHY THE POOL STOPPED
// BEING THE PROBLEM.
//
// Round 15 replaced one global pool with 44 class pools, and the round-16 brief
// put the result plainly: "Enlarging a pool is not the same as fixing it. 36 of
// 44 classes hold more than one distinct product, and 132 of 140 SKUs share all
// six copy bands with a different product." An independent lexical auditor
// (tools/copyaudit.mjs, 45 rules, none of which can see this table) measured
// 35.64% of facings carrying at least one contradiction over 200k draws.
//
// Two things were wrong and they need two different fixes:
//
//   A. CLASSES THAT HOLD DIFFERENT PRODUCTS. `spread` held peanut butter, grape
//      jelly and maple syrup, so CRUNCHY landed on jelly and 12g PROTEIN landed
//      on syrup. No amount of flagging fixes that — the class is just wrong.
//      Those are split below, and the count is in copyStats().
//
//   B. COUPLINGS *INSIDE* ONE PRODUCT. Every soda genuinely can be ZERO SUGAR
//      or 140 CALORIES, and the class is right; what is wrong is drawing the
//      two INDEPENDENTLY. The brief measured this one: "the soda class pairs 2
//      of 5 flash values implying zero sugar against 3 of 4 badges that are
//      calorie counts — 30% of every soda facing in the store." Splitting soda
//      into DietSoda and RegularSoda would double the table to encode one bit.
//
// So a band entry is either a plain string or ['TEXT', 'flags'], where flags is
// space separated and a token is:
//     @NB     this band only exists on package forms N and B
//     word    a tag, checked against CONFLICTS below
// A SKU row may carry its own tags in an optional 5th column, and they join the
// set before any band is drawn — which is what stops CRUNCHY reaching a jelly
// even where the two share a class.
const BAND_CACHE = new Map();
function band(entry) {
  if (typeof entry === 'string') return { text: entry, forms: null, tags: [] };
  let c = BAND_CACHE.get(entry);
  if (c) return c;
  const tags = []; let forms = null;
  for (const t of String(entry[1]).split(/\s+/)) {
    if (!t) continue;
    if (t[0] === '@') forms = t.slice(1);
    else tags.push(t);
  }
  c = { text: entry[0], forms, tags };
  BAND_CACHE.set(entry, c);
  return c;
}

// ===========================================================================
// ROUND 17 — THE DISPLAY-TYPE AXIS. A DIFFERENT AXIS FROM TAG CONFLICT, AND
// copyCheck() IS RIGHT TO RETURN [] ON IT.
//
// r16's critic measured 11.66% over 500,000 draws on a 26-rule auditor, and
// singled out the number that matters: 3.04% of facings CONTRADICT THEMSELVES
// IN DISPLAY-SIZE TYPE — the flash flag against the product noun, the two
// largest pieces of type on the pack:
//
//     RISING CRUST / FISH STICKS        NO BOIL / THIN SPAGHETTI
//     ORANGE MARMALADE / GRAPE JELLY    NEAPOLITAN / VANILLA ICE CREAM
//
// copyCheck() cannot see these and is not broken. It asks whether two BANDS
// carry clashing tags. This is a band clashing with the SKU'S OWN NAME, which
// is not a band at all — it is the row. Extending the tag machinery to cover it
// would mean inventing a tag per product noun, i.e. re-encoding the SKU table
// in the conflict table, which is the duplication this project keeps losing to.
//
// So the gate is the row itself. A band may name the SKUs it belongs to, and
// pickBand() will not draw it for anything else.
//
// WHY THE GATE LIVES IN A TABLE AND NOT IN THE BAND LITERALS. 155 flash entries
// sit in 33 multi-SKU classes. Editing 155 array literals to add a third slot is
// 155 chances to typo a product noun into a silently-dead band — and a band that
// can never be emitted is exactly the failure copyCheck's rule (3) exists to
// catch, which it would NOT catch here because the gate is applied after
// bandsOf(). Keyed by class and by band text, every key is asserted against the
// real table by displayCheck() below, so a rename throws instead of unhooking a
// gate. That is CLAUDE.md's rule for an unavoidable second copy.
//
// WHAT THIS DOES NOT CLAIM. It is not a proof that no contradiction remains.
// It gates the identity claims that were found by reading the whole
// flash x SKU matrix, and displayCheck() reports how many entries were left
// generic so the exposure is a number rather than a silence.
//
// ===========================================================================
// ROUND 18 — THE 87 GENERIC ENTRIES WERE THE EXPOSURE, AND EIGHT OF THEM WERE
// FALSE. r17 read the matrix far enough to gate 80 bands and stopped; the
// other 87 were left generic without being read, which the round said plainly.
// Read class by class this round, they split three ways:
//
//   8 WERE FALSE OF A SKU AND ARE NOW GATED. The largest was CINNAMON on CORN
//     FLAKES (32.7% of that SKU's facings). Then MILD / PORK & BEANS 25.0%,
//     CHERRY / ROOT BEER 21.4%, EXTRA STRENGTH / SPORTS DRINK 20.1%, PURIFIED
//     / SPRING WATER 20.0%, EARL GREY / HERBAL TEA 23.6%, CHAMOMILE / ORANGE
//     PEKOE TEA 19.8%, STRAWBERRY / GRAPE JELLY 20.8%.
//
//   3 WERE TRUE OF NOTHING IN THEIR CLASS AND LEFT THE POOL. A gate names the
//     SKUs a band belongs to; a band that belongs to NO SKU in its class has
//     no gate that can save it, and an empty gate is dead copy displayCheck()
//     already rejects. GREEN (tea) and RED RASPBERRY / ORANGE MARMALADE
//     (fruitSpread) were removed at the CL entry, where the reason is written.
//     ORANGE MARMALADE / GRAPE JELLY is the pair r16's critic printed in the
//     brief. It was still emitting on 19.8% of GRAPE JELLY facings with the
//     r17 gate ON — the headline defect of two rounds ago, surviving inside
//     the residual that r17 correctly labelled and did not read.
//
//   76 ARE GENUINELY GENERIC and each now carries its reason in the table
//     below. The test applied was FALSE, not unusual and not redundant:
//     CAFFEINE FREE on a ROOT BEER is redundant and stays; CHERRY on one is
//     false and is gated. A store shelf is full of redundant copy.
//
// WHAT THIS ROUND STILL DOES NOT CLAIM. `ungated` is 76 and every one of them
// is now a judgement someone can read and overturn, which is a different thing
// from proof. Two were left generic knowing they are marginal, on the `thin`
// number rather than on taste — FRENCH ROAST and TRADITIONAL; both would have
// left a SKU printing one band on every facing, and the reasons sit next to
// them. displayCheck() reports `unreviewed` so the next class added here
// cannot skip the sweep silently.
export const FLASH_SKU = {
  // ROUND 18 — EVERY MULTI-SKU CLASS HAS NOW BEEN READ, AND "LEFT GENERIC" IS
  // A DECISION ON THE RECORD. r17 gated 80 bands and left 87 generic WITHOUT
  // reading them; that residual was exposure, not innocence, and eight of the
  // 87 were false. So each class below carries a `generic:` line naming the
  // bands that stayed ungated and why. A band with no reason next to it has
  // not been reviewed — REVIEWED below makes that a number rather than a
  // silence, and displayCheck() reports it.
  //
  // THE TEST FOR A GATE, applied to all 87: is the band FALSE of a SKU in the
  // class? Not "unusual for", not "redundant on" — false. CAFFEINE FREE on a
  // ROOT BEER is redundant and stays generic; CHERRY on one is false and is
  // gated. Redundant copy reads as a real package. False copy is the defect.
  pasta: {
    // generic: ORIGINAL, WHOLE GRAIN — every shape here is sold as both, whole
    // grain egg noodles included.
    'NO BOIL': ['LASAGNA'],
    'THIN CUT': ['THIN SPAGHETTI'],
    'EXTRA WIDE': ['EGG NOODLES'],
  },
  frozenMeal: {
    // generic: ORIGINAL, FAMILY SIZE — pack level, not identity.
    'RISING CRUST': ['PEPPERONI PIZZA'],
    CRISPY: ['FRENCH FRIES', 'CHICKEN TENDERS', 'FISH STICKS', 'WAFFLES'],
    'EXTRA CRISPY': ['FRENCH FRIES', 'CHICKEN TENDERS', 'FISH STICKS'],
  },
  fruitSpread: {
    // generic: NO SUGAR ADDED — both jars are sold in a no-sugar-added line.
    // r18 — STRAWBERRY gated. The other two flavour nouns left the pool
    // entirely; see the class in CL for why a gate could not fix them.
    'CONCORD GRAPE': ['GRAPE JELLY'],
    STRAWBERRY: ['STRAWBERRY PRESERVES'],
  },
  cannedFruit: {
    // generic: IN 100% JUICE, IN LIGHT SYRUP, NO SUGAR ADDED — packing medium,
    // and all three fruits are canned in each of them.
    SLICED: ['SLICED PEACHES', 'FRUIT COCKTAIL'], HALVES: ['MANDARIN ORANGES'],
  },
  cannedVeg: {
    // generic: NO SALT ADDED — sold in all five.
    CUT: ['CUT GREEN BEANS', 'SLICED CARROTS'],
    WHOLE: ['WHOLE KERNEL CORN'],
    'FRENCH STYLE': ['CUT GREEN BEANS'],
    PETITE: ['SWEET PEAS'],
  },
  frozenVeg: {
    // generic: STEAM IN BAG, NO SAUCE — pack and prep facts, not identity;
    // steam-in-bag corn on the cob is a real freezer item.
    CUT: ['BROCCOLI FLORETS', 'STIR FRY BLEND'],
    WHOLE: ['CORN ON THE COB'],
    PETITE: ['GARDEN PEAS'],
  },
  sweetener: {
    'PURE CANE': ['PURE CANE SUGAR'],
    'FINE GRANULATED': ['PURE CANE SUGAR'],
    'EXTRA FINE': ['POWDERED SUGAR'],
    GOLDEN: ['BROWN SUGAR'],
    'LIGHT BROWN': ['BROWN SUGAR'],
  },
  mix: {
    'CLASSIC YELLOW': ['YELLOW CAKE MIX'],
    'DEVILS FOOD': ['BROWNIE MIX'],
    'DOUBLE CHOCOLATE': ['BROWNIE MIX'],
    'BUTTER RECIPE': ['YELLOW CAKE MIX', 'CORN MUFFIN MIX'],
    HOMESTYLE: ['PANCAKE MIX', 'CORN MUFFIN MIX'],
  },
  cookie: {
    // generic: ORIGINAL, FAMILY SIZE, REDUCED FAT — recipe and pack level; all
    // four of these are sold reduced fat.
    'DOUBLE STUFFED': ['SANDWICH CREMES'],
    'FUDGE DIPPED': ['FUDGE STRIPE COOKIES'],
  },
  redSauce: {
    // generic: TRADITIONAL, NO SUGAR ADDED. TRADITIONAL is the recipe, not a
    // sauce style a paste cannot have, and it is one of only TWO bands TOMATO
    // PASTE can still draw — gating it would leave that SKU printing NO SUGAR
    // ADDED on every facing. See `thin` in displayCheck().
    'GARLIC & BASIL': ['MARINARA SAUCE'],
    'ROASTED GARLIC': ['MARINARA SAUCE'],
    CHUNKY: ['MARINARA SAUCE'],
  },
  rice: {
    // generic: WHOLE GRAIN — a brown/whole-grain version of all three is real,
    // instant included.
    'LONG GRAIN': ['LONG GRAIN RICE'],
    JASMINE: ['RICE PILAF'],
    PARBOILED: ['LONG GRAIN RICE'],
    'READY IN 5 MIN': ['INSTANT RICE'],
  },
  chip: {
    // generic: ORIGINAL — flavour-neutral.
    'THICK CUT': ['KETTLE CHIPS'],
    'SEA SALT': ['KETTLE CHIPS', 'TORTILLA ROUNDS', 'PRETZEL TWISTS'],
    'LIGHTLY SALTED': ['KETTLE CHIPS', 'TORTILLA ROUNDS'],
    'SOUR CREAM & ONION': ['KETTLE CHIPS', 'TORTILLA ROUNDS', 'CHEESE PUFFS'],
    JALAPENO: ['KETTLE CHIPS', 'TORTILLA ROUNDS', 'CHEESE PUFFS'],
    BARBECUE: ['KETTLE CHIPS', 'TORTILLA ROUNDS', 'CHEESE PUFFS'],
  },
  nuts: {
    // generic: LIGHTLY SALTED, UNSALTED — salt level, true of all three
    // including trail mix.
    'DRY ROASTED': ['ROASTED PEANUTS', 'MIXED NUTS'],
    'HONEY ROASTED': ['ROASTED PEANUTS', 'MIXED NUTS'],
    'DELUXE MIX': ['MIXED NUTS', 'TRAIL MIX'],
  },
  cracker: {
    // generic: ORIGINAL, SEA SALT, WHOLE GRAIN, REDUCED FAT — topping and
    // recipe claims every cracker in this class carries in a real aisle.
    'UNSALTED TOPS': ['SALTINE CRACKERS'],
    CHEDDAR: ['CHEESE CRACKERS', 'SANDWICH CRACKERS'],
  },
  candy: {
    // generic: ORIGINAL, SHARE PACK — pack level.
    'ASSORTED FRUIT': ['FRUIT CHEWS', 'GUMMI BEARS'],
    SOUR: ['FRUIT CHEWS', 'GUMMI BEARS'],
    'KING SIZE': ['MILK CHOCOLATE BARS'],
  },
  cereal: {
    // generic: ORIGINAL, FAMILY SIZE — pack level.
    // r18 — CINNAMON gated. It was printing on 32.7% of CORN FLAKES facings,
    // and there is no cinnamon corn flake or cinnamon crisp rice; the three
    // named below are all real cinnamon lines.
    FROSTED: ['FROSTED WHEAT'],
    HONEY: ['HONEY BRAN FLAKES', 'TOASTED OAT SQUARES', 'GRANOLA CLUSTERS'],
    CINNAMON: ['TOASTED OAT SQUARES', 'FROSTED WHEAT', 'GRANOLA CLUSTERS'],
    'WITH REAL FRUIT': ['RAISIN BRAN', 'GRANOLA CLUSTERS'],
  },
  tea: {
    // generic: DECAF — decaf black tea is real, and an herbal box printing it
    // is redundant rather than false.
    // r18 — CHAMOMILE and EARL GREY gated: chamomile is herbal and orange
    // pekoe is a black-tea grade, so each was landing on the other's SKU
    // (CHAMOMILE on 19.8% of ORANGE PEKOE facings, EARL GREY on 23.6% of
    // HERBAL TEA). EARL GREY carries no `nocaf` tag, which is why the tag
    // machinery let it onto a row that declares itself caffeine-free — the
    // display axis and the tag axis are genuinely different questions.
    'ORANGE PEKOE': ['ORANGE PEKOE TEA'],
    CHAMOMILE: ['HERBAL TEA'],
    'EARL GREY': ['ORANGE PEKOE TEA'],
  },
  juice: {
    // generic: 100% JUICE, NO SUGAR ADDED, CALCIUM ADDED — all three are sold
    // as 100% juice (fruit punch blends included) and calcium-fortified.
    'NO PULP': ['ORANGE JUICE'], 'SOME PULP': ['ORANGE JUICE'],
  },
  soda: {
    // generic: ORIGINAL, ZERO SUGAR, DIET, CAFFEINE FREE — every one is a real
    // line extension of all eight, and the `nosugar`/`nocaf` tags on the bands
    // and on the rows already keep them off the SKUs they would contradict.
    // r18 — CHERRY gated. It is a FLAVOUR, and it was printing on 21.4% of
    // ROOT BEER and 18.2% of GINGER ALE facings. Cherry cola is real; cherry
    // ginger ale on a can that says GINGER ALE is the RISING CRUST defect.
    CHERRY: ['COLA', 'DIET COLA'],
  },
  water: {
    // generic: SPRING, LEMON, LIME, UNSWEETENED — sparkling spring water and
    // flavoured still water are both real shelf items.
    // r18 — PURIFIED gated. Purified and spring are mutually exclusive water
    // types on a real label; it was printing on 20.0% of SPRING WATER facings.
    PURIFIED: ['SPARKLING WATER'],
  },
  sportsDrink: {
    // generic: ORIGINAL, ZERO SUGAR, BERRY, CITRUS — flavour and sugar lines
    // both drinks carry.
    // r18 — EXTRA STRENGTH gated: it is an energy-drink claim, and it was
    // printing on 20.1% of SPORTS DRINK facings.
    'EXTRA STRENGTH': ['ENERGY DRINK'],
  },
  towel: {
    // generic: ULTRA ABSORBENT, ULTRA STRONG, PRINTS — true of towels and
    // napkins alike.
    'SELECT-A-SIZE': ['PAPER TOWELS'], 'FULL SHEET': ['PAPER TOWELS'],
  },
  laundry: {
    // generic: ORIGINAL SCENT, FREE & CLEAR, SPRING MEADOW — scent lines both
    // products carry.
    'OXI BOOST': ['LAUNDRY DETERGENT'], 'HE COMPATIBLE': ['LAUNDRY DETERGENT'],
  },
  dishwash: {
    // generic: ORIGINAL SCENT, LEMON, FREE & CLEAR — scent lines both carry.
    'ULTRA CONCENTRATED': ['DISH SOAP'],
  },
  cleaner: {
    // generic: ORIGINAL SCENT, LEMON, FRESH LINEN, UNSCENTED — scent lines
    // both carry.
    'STREAK FREE': ['GLASS CLEANER'],
  },
  wrap: {
    // generic: STANDARD — the not-heavy-duty grade of all four.
    'NON-STICK': ['ALUMINUM FOIL', 'PLASTIC WRAP'],
    'SLIDER SEAL': ['FOOD STORAGE BAGS'],
    'EXTRA STRONG': ['TALL KITCHEN BAGS', 'FOOD STORAGE BAGS'],
    'HEAVY DUTY': ['TALL KITCHEN BAGS', 'ALUMINUM FOIL'],
  },
  vitamin: {
    'ADULTS 50+': ['MULTIVITAMIN'],
    'ONE DAILY': ['MULTIVITAMIN', 'FISH OIL'],
    'WOMENS FORMULA': ['MULTIVITAMIN'],
    'HIGH POTENCY': ['VITAMIN C 500MG', 'CALCIUM + D3'],
    CHEWABLE: ['MULTIVITAMIN', 'VITAMIN C 500MG'],
  },
  hairCare: {
    // generic: DAILY MOISTURE, FOR DRY HAIR — both are shampoo AND conditioner
    // lines. COLOR PROTECT names every SKU in the class, so it is a no-op gate
    // kept for the same reason: see `noop` in displayCheck().
    VOLUMIZING: ['SHAMPOO'],
    '2 IN 1': ['SHAMPOO'],
    'COLOR PROTECT': ['SHAMPOO', 'CONDITIONER'],
  },
  coffee: {
    // generic: DECAF, FRENCH ROAST. FRENCH ROAST is the one place this round
    // knowingly left a roast band ungated while gating its three siblings:
    // instant French roast is a real product, and gating it would leave
    // INSTANT COFFEE printing DECAF on 100% of its facings. A one-band pool is
    // not a contradiction but it is not a shelf either — `thin` reports it.
    'MEDIUM ROAST': ['GROUND COFFEE'], 'DARK ROAST': ['GROUND COFFEE'], 'BREAKFAST BLEND': ['GROUND COFFEE'],
  },
  soup: {
    // generic: LOW SODIUM, HOMESTYLE, READY TO SERVE — all three soups ship in
    // each. CONDENSED names all three SKUs, so it is a no-op gate: it reads as
    // documentation and counts toward `gated`, which is why displayCheck()
    // now reports `noop` separately.
    CONDENSED: ['CHICKEN NOODLE', 'CREAM OF MUSHROOM', 'TOMATO SOUP'], CHUNKY: ['CHICKEN NOODLE'],
  },
  beans: {
    // generic: ORIGINAL, LOW SODIUM — true of all five cans.
    // r18 — MILD gated. It is a HEAT LEVEL, and it was printing on 25.0% of
    // PORK & BEANS facings; only chili beans and refried beans are sold mild.
    'IN TOMATO SAUCE': ['PORK & BEANS'],
    'CHILI STYLE': ['CHILI BEANS', 'KIDNEY BEANS'],
    MILD: ['CHILI BEANS', 'REFRIED BEANS'],
  },
};

// Every multi-SKU class whose whole flash pool has been read band by band.
// displayCheck() reports any multi-SKU class MISSING from this set, so adding
// a class or a SKU without doing the sweep is a number and not a silence.
// The two classes with no gate at all are here on purpose:
//   disinfect  — ORIGINAL SCENT / LEMON / FRESH / ANTIBACTERIAL: scent lines
//                bleach and wipes both carry, and both are antibacterial.
//   skinCare   — FRESH SCENT / MOISTURIZING / SENSITIVE SKIN / UNSCENTED /
//                DEEP CLEAN: body wash and bar soap are both sold in all five.
const REVIEWED = new Set([
  'pasta', 'frozenMeal', 'fruitSpread', 'cannedFruit', 'cannedVeg', 'frozenVeg',
  'sweetener', 'mix', 'cookie', 'redSauce', 'rice', 'chip', 'nuts', 'cracker',
  'candy', 'cereal', 'tea', 'juice', 'soda', 'water', 'sportsDrink', 'towel',
  'laundry', 'dishwash', 'cleaner', 'disinfect', 'wrap', 'vitamin', 'hairCare',
  'skinCare', 'coffee', 'soup', 'beans',
]);
// Toggleable so the gate can be PRICED rather than asserted. With it off, the
// same deterministic draw sequence reproduces the r16 emission behaviour, which
// is the only way to say what the gate is worth without a second build.
const GATE = { on: true };
export function setDisplayGate(on) { GATE.on = !!on; return GATE.on; }
const flashSku = (cls, text) => (GATE.on && FLASH_SKU[cls] && FLASH_SKU[cls][text]) || null;

// Pairs of tags that cannot appear on one facing. Symmetric; order irrelevant.
// Every one of these was written against a real emission the auditor caught,
// and copyCheck() proves below that NONE of them can still be emitted.
export const CONFLICTS = [
  // sweetness / calories — the brief's headline case
  ['nosugar', 'hascal'], ['nosugar', 'realsugar'],
  // caffeine
  ['nocaf', 'hascaf'],
  // two different numbers for the same nutrient on one pack
  ['p7', 'p12'],
  // texture and flavour claims that belong to one product in a shared class
  ['nutty', 'fruitspread'], ['pourable', 'setgel'],
  // a serving count and a net-contents count that disagree
  ['ct24', 'ct50'], ['ct80', 'ct216'], ['ct100', 'ct48'], ['ct100', 'ct20'],
  // a dose form claim against the physical dose
  ['solid', 'liquiddose'],
];
function mkConflictMap(pairs) {
  const m = new Map();
  for (const [a, b] of pairs) {
    (m.get(a) || m.set(a, new Set()).get(a)).add(b);
    (m.get(b) || m.set(b, new Set()).get(b)).add(a);
  }
  return m;
}
const CONFLICT_MAP = mkConflictMap(CONFLICTS);
// A local rng so copyCheck can drive copyFor without importing kit.js and
// without depending on whatever seed the atlases happen to be on.
function mkRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let BEHAVIOUR_N = 0;
// text -> declared tags, per class, so the behavioural check can look a printed
// band back up in the table instead of trusting what copyFor said about it.
let TAG_INDEX = null;
function tagIndex(CLS) {
  if (TAG_INDEX) return TAG_INDEX;
  const idx = new Map();
  for (const k of Object.keys(CLS)) {
    const c = CLS[k]; const m = new Map();
    for (const key of ['flash', 'sub', 'claim']) {
      for (const raw of c[key] || []) { const e = band(raw); if (e.tags.length) m.set(key + '\u0001' + e.text, e.tags); }
    }
    for (const raw of WT[c.wt] || []) { const e = band(raw); if (e.tags.length) m.set('wt\u0001' + e.text, e.tags); }
    if (c.badge !== 'none' && BADGE[c.badge]) {
      for (const e of BADGE[c.badge]) {
        if (e[2]) m.set('badge\u0001' + e[0] + '\u0000' + e[1], String(e[2]).split(/\s+/));
      }
    }
    idx.set(k, m);
  }
  TAG_INDEX = idx;
  return idx;
}
const clashes = (tags, have) => {
  for (const t of tags) {
    const bad = CONFLICT_MAP.get(t);
    if (bad) for (const h of have) if (bad.has(h)) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// THE CLASS TABLE. Per product class:
//   flash  the flavour-flash ribbon — the band that changes between varieties
//          of one brand, and the loudest wrong note in round 14 (MILD sugar)
//   sub    the sub-descriptor under the product name
//   claim  the claim line above the weight
//   wt / badge / legal   keys into the shared blocks above
//   food   drives the serving-suggestion photo and the whole nutrition path
const CL = {
  // --- dry grocery ---------------------------------------------------------
  // SPLIT r16 from `bakingStaple`, which held flour AND sugar AND baking soda.
  // The auditor caught PRE-SIFTED / UNBLEACHED / MILLED FOR CONSISTENT BAKING
  // landing on PURE CANE SUGAR at 1.29% of all facings, and a whole-grain
  // roundel on it at 1.51%. Sugar is not milled and has no grain in it.
  flour: { food: 1, wt: 'bigBag', badge: 'grain', legal: 'food',
    flash: ['UNBLEACHED', 'PRE-SIFTED', 'ALL PURPOSE', 'BLEACHED', 'SELF RISING'],
    sub: ['MILLED FOR CONSISTENT BAKING', 'NO BLEACHING AGENTS ADDED',
      'A BAKING STAPLE SINCE 1946', ['RESEALABLE POUR SPOUT', '@CP']],
    claim: ['PACKED BY WEIGHT NOT VOLUME', 'SEE SIDE PANEL FOR RECIPES',
      'ENRICHED WITH IRON & B VITAMINS', 'ABOUT 60 SERVINGS PER PACKAGE'] },
  sweetener: { food: 1, wt: 'bigBag', badge: 'none', legal: 'sweet',
    flash: ['PURE CANE', 'FINE GRANULATED', 'GOLDEN', 'EXTRA FINE', 'LIGHT BROWN'],
    sub: ['ONE INGREDIENT, NOTHING ELSE', 'DISSOLVES CLEAN IN HOT OR COLD',
      'PACKED FIRM FOR MEASURING', ['RESEALABLE POUR SPOUT', '@CP']],
    claim: ['PACKED BY WEIGHT NOT VOLUME', 'SEE SIDE PANEL FOR RECIPES',
      'ABOUT 90 SERVINGS PER PACKAGE', 'STORE IN A COOL DRY PLACE'] },
  leavening: { food: 1, wt: 'dryBox', badge: 'none', legal: 'sweet',
    flash: ['PURE', 'DOUBLE ACTING', 'ALUMINUM FREE'],
    sub: ['FOR BAKING, CLEANING AND DEODORIZING', 'KEEP THE BOX DRY AND CLOSED',
      'ONE INGREDIENT, NOTHING ELSE'],
    claim: ['HUNDREDS OF USES — SEE SIDE PANEL', 'STORE IN A COOL DRY PLACE',
      'REPLACE EVERY 30 DAYS FOR ODOR CONTROL'] },
  mix: { food: 1, wt: 'dryBox', badge: 'cal', legal: 'food',
    flash: ['CLASSIC YELLOW', 'DEVILS FOOD', 'BUTTER RECIPE', 'DOUBLE CHOCOLATE',
      'HOMESTYLE'],
    sub: ['JUST ADD EGGS, OIL AND WATER', 'BAKES ONE 9 INCH LAYER',
      'READY IN 30 MINUTES', 'MOIST AND TENDER EVERY TIME'],
    claim: ['MAKES 24 CUPCAKES', 'MIX POUCH SEALED FOR FRESHNESS',
      'SEE SIDE PANEL FOR RECIPES', 'ABOUT 12 SERVINGS PER BOX'] },
  cookie: { food: 1, wt: 'dryBox', badge: 'cal', legal: 'food',
    flash: ['ORIGINAL', 'DOUBLE STUFFED', 'FUDGE DIPPED', 'FAMILY SIZE',
      'REDUCED FAT'],
    sub: ['BAKED IN SMALL BATCHES', 'REAL COCOA IN EVERY BITE',
      'A FAMILY FAVORITE SINCE 1946', 'RESEALABLE STAY-FRESH TRAY'],
    claim: ['3 STAY-FRESH SLEEVES', 'ABOUT 30 COOKIES PER PACKAGE',
      '0g TRANS FAT PER SERVING', 'NO HIGH FRUCTOSE CORN SYRUP'] },
  bakingChip: { food: 1, wt: 'snackBag', badge: 'cal', legal: 'food',
    flash: ['SEMI-SWEET', 'MILK CHOCOLATE', 'DARK', 'MINI', 'BUTTERSCOTCH'],
    sub: ['HOLDS ITS SHAPE WHEN BAKED', 'MADE WITH REAL COCOA BUTTER',
      'RESEALABLE STAY-FRESH POUCH'],
    claim: ['ORIGINAL COOKIE RECIPE ON BACK', 'ABOUT 2 CUPS PER BAG',
      'NO ARTIFICIAL COLORS'] },
  // SPLIT r16 from `bread`. A loaf is sliced and a bun is not, and the auditor
  // caught SEEDED / 20 SLICES PER LOAF on HAMBURGER BUNS — one of the three
  // emissions quoted verbatim in the r16 brief.
  slicedLoaf: { food: 1, wt: 'loaf', badge: 'grain', legal: 'food',
    flash: ['100% WHOLE WHEAT', 'HONEY WHEAT', 'BUTTERMILK', 'OATNUT', 'WHITE'],
    sub: ['SOFT AND SLICED THICK', 'BAKED FRESH DAILY', 'NO HIGH FRUCTOSE CORN SYRUP'],
    claim: ['20 SLICES PER LOAF', 'SEE END OF BAG FOR FRESHNESS DATE',
      'FREEZES WELL — THAW AT ROOM TEMPERATURE'] },
  bunRoll: { food: 1, wt: 'bunCt', badge: 'grain', legal: 'food',
    flash: ['SEEDED', 'PLAIN', 'BRIOCHE STYLE', 'POTATO', 'WHOLE WHEAT'],
    sub: ['SPLIT AND READY FOR THE GRILL', 'BAKED FRESH DAILY',
      'SOFT ENOUGH TO HOLD TOGETHER'],
    claim: ['8 BUNS PER PACK', 'SEE END OF BAG FOR FRESHNESS DATE',
      'WARM FOR 20 SECONDS BEFORE SERVING'] },
  pasta: { food: 1, wt: 'dryBox', badge: 'grain', legal: 'food',
    flash: ['ORIGINAL', 'WHOLE GRAIN', 'NO BOIL', 'THIN CUT', 'EXTRA WIDE'],
    sub: ['BRONZE CUT FOR BETTER SAUCE HOLD', 'READY IN 9 MINUTES',
      'MADE WITH 100% DURUM SEMOLINA', 'A FAMILY FAVORITE SINCE 1946'],
    claim: ['ABOUT 8 SERVINGS PER BOX', 'SEE SIDE PANEL FOR RECIPES',
      'NO ARTIFICIAL COLORS', 'GOOD SOURCE OF FIBER'] },
  rice: { food: 1, wt: 'bigBag', badge: 'grain', legal: 'food',
    flash: ['LONG GRAIN', 'PARBOILED', 'JASMINE', 'READY IN 5 MIN', 'WHOLE GRAIN'],
    sub: ['COOKS UP LIGHT AND SEPARATE', 'READY IN 5 MINUTES',
      'GROWN AND PACKED IN THE U.S.A.'],
    claim: ['ABOUT 40 SERVINGS PER BAG', 'STOVETOP AND MICROWAVE DIRECTIONS',
      'NATURALLY GLUTEN FREE'] },
  taco: { food: 1, wt: 'dryBox', badge: 'cal', legal: 'food',
    flash: ['CRUNCHY', 'STAND N STUFF', 'MINI', 'WHITE CORN'],
    sub: ['BAKED — NEVER FRIED', 'WARM IN THE OVEN FOR 3 MINUTES',
      'STACKED IN A PROTECTIVE TRAY'],
    claim: ['12 TACO SHELLS', 'SEASONING SOLD SEPARATELY',
      'NATURALLY GLUTEN FREE'] },
  cracker: { food: 1, wt: 'dryBox', badge: 'grain', legal: 'food',
    flash: ['ORIGINAL', 'SEA SALT', 'WHOLE GRAIN', 'UNSALTED TOPS',
      'REDUCED FAT', 'CHEDDAR'],
    sub: ['BAKED — NEVER FRIED', 'CRISP IN EVERY BITE',
      'RESEALABLE STAY-FRESH SLEEVE', 'A FAMILY FAVORITE SINCE 1946'],
    claim: ['4 STAY-FRESH SLEEVES', '0g TRANS FAT PER SERVING',
      'ABOUT 36 CRACKERS PER SERVING', 'NO ARTIFICIAL COLORS'] },
  // --- snacks --------------------------------------------------------------
  chip: { food: 1, wt: 'snackBag', badge: 'cal', legal: 'food',
    flash: ['ORIGINAL', 'SEA SALT', 'BARBECUE', 'SOUR CREAM & ONION',
      'JALAPENO', 'THICK CUT', 'LIGHTLY SALTED'],
    sub: ['KETTLE COOKED FOR EXTRA CRUNCH', 'COOKED IN SMALL BATCHES',
      'NO ARTIFICIAL FLAVORS', 'RESEALABLE STAY-FRESH POUCH'],
    claim: ['ABOUT 8 SERVINGS PER BAG', 'NO HIGH FRUCTOSE CORN SYRUP',
      '0g TRANS FAT PER SERVING', 'PACKED BY WEIGHT NOT VOLUME'] },
  nuts: { food: 1, wt: 'snackBag', badge: 'protein', legal: 'food',
    flash: ['DRY ROASTED', 'LIGHTLY SALTED', 'HONEY ROASTED', 'UNSALTED',
      'DELUXE MIX'],
    sub: ['ROASTED IN SMALL BATCHES', 'RESEALABLE STAY-FRESH LID',
      'NO ARTIFICIAL FLAVORS'],
    claim: [['7g PROTEIN PER SERVING', 'p7'], 'ABOUT 12 SERVINGS PER CONTAINER',
      'STORE IN A COOL DRY PLACE'] },
  candy: { food: 1, wt: 'snackBag', badge: 'cal', legal: 'food',
    flash: ['ORIGINAL', 'ASSORTED FRUIT', 'SOUR', 'KING SIZE', 'SHARE PACK'],
    sub: ['INDIVIDUALLY WRAPPED PIECES', 'MADE WITH REAL COCOA BUTTER',
      'RESEALABLE STAY-FRESH POUCH'],
    claim: ['ABOUT 12 PIECES PER SERVING', 'NO ARTIFICIAL FLAVORS',
      'GREAT FOR THE CANDY DISH'] },
  meatSnack: { food: 1, wt: 'snackBag', badge: 'protein', legal: 'food',
    flash: ['ORIGINAL', 'TERIYAKI', 'HOT & SPICY', 'HICKORY', 'PEPPERED'],
    sub: ['SLOW SMOKED OVER HARDWOOD', 'RESEALABLE STAY-FRESH POUCH',
      'MADE WITH 100% BEEF'],
    claim: [['12g PROTEIN PER SERVING', 'p12'], 'NO ARTIFICIAL FLAVORS',
      'STORE IN A COOL DRY PLACE'] },
  // --- canned / wet --------------------------------------------------------
  cannedVeg: { food: 1, wt: 'can', badge: 'veg', legal: 'wet', legalN: 'canned',
    flash: ['NO SALT ADDED', 'CUT', 'WHOLE', 'FRENCH STYLE', 'PETITE'],
    sub: ['PACKED AT THE PEAK OF SEASON', 'GROWN AND PACKED IN THE U.S.A.',
      'READY TO HEAT AND SERVE'],
    claim: ['ABOUT 3.5 SERVINGS PER CAN', 'HALF A CUP OF VEGETABLES PER SERVING',
      'NO PRESERVATIVES ADDED', 'BEST IF USED BY DATE ON END'] },
  beans: { food: 1, wt: 'can', badge: 'protein', legal: 'wet', legalN: 'canned',
    flash: ['ORIGINAL', 'IN TOMATO SAUCE', 'LOW SODIUM', 'MILD', 'CHILI STYLE'],
    sub: ['SLOW SIMMERED IN SMALL BATCHES', 'A GOOD SOURCE OF FIBER',
      'READY TO HEAT AND SERVE'],
    claim: [['12g PROTEIN PER SERVING', 'p12'], 'ABOUT 3.5 SERVINGS PER CAN',
      'GOOD SOURCE OF FIBER'] },
  soup: { food: 1, wt: 'can', badge: 'cal', legal: 'wet', legalN: 'canned',
    flash: ['CONDENSED', 'LOW SODIUM', 'HOMESTYLE', 'CHUNKY', 'READY TO SERVE'],
    sub: ['SLOW SIMMERED IN SMALL BATCHES', 'JUST ADD ONE CAN OF WATER',
      'READY IN 5 MINUTES'],
    claim: ['ABOUT 2.5 SERVINGS PER CAN', 'GREAT IN CASSEROLES',
      'SEE SIDE PANEL FOR RECIPES'] },
  broth: { food: 1, wt: 'bigBottle', badge: 'protein', legal: 'wet', legalN: 'canned',
    flash: ['LOW SODIUM', 'ORIGINAL', 'UNSALTED', 'ORGANIC'],
    sub: ['SLOW SIMMERED IN SMALL BATCHES', 'NO ADDED MSG',
      'RESEALABLE CAP — REFRIGERATE AFTER OPENING'],
    claim: ['ABOUT 4 SERVINGS PER CARTON', 'KEEP REFRIGERATED AFTER OPENING',
      'NO ARTIFICIAL FLAVORS'] },
  // SPLIT r16 from `sauce`, which held marinara, alfredo, salsa and tomato
  // paste. MILD landed on TOMATO PASTE and a 1/2 CUP VEGETABLES roundel on
  // SALSA VERDE; a white sauce and a green salsa share almost no vocabulary
  // with a red one.
  redSauce: { food: 1, wt: 'jar', badge: 'veg', legal: 'wet', legalN: 'canned',
    flash: ['TRADITIONAL', 'GARLIC & BASIL', 'ROASTED GARLIC', 'CHUNKY', 'NO SUGAR ADDED'],
    sub: ['SLOW SIMMERED IN SMALL BATCHES', 'MADE WITH VINE RIPENED TOMATOES',
      'NO ARTIFICIAL FLAVORS'],
    claim: ['ABOUT 5 SERVINGS PER JAR', 'KEEP REFRIGERATED AFTER OPENING',
      'PACKED AT THE PEAK OF SEASON'] },
  whiteSauce: { food: 1, wt: 'jar', badge: 'none', legal: 'wet', legalN: 'canned',
    flash: ['CLASSIC', 'FOUR CHEESE', 'GARLIC PARMESAN', 'LIGHT'],
    sub: ['MADE WITH REAL CREAM AND BUTTER', 'STIR OVER LOW HEAT',
      'NO ARTIFICIAL FLAVORS'],
    claim: ['ABOUT 5 SERVINGS PER JAR', 'KEEP REFRIGERATED AFTER OPENING',
      'DO NOT BOIL'] },
  salsa: { food: 1, wt: 'jar', badge: 'salsaB', legal: 'wet', legalN: 'canned',
    flash: ['MILD', 'MEDIUM', 'HOT', 'ROASTED', 'VERDE'],
    sub: ['FIRE ROASTED FOR A DEEPER FLAVOR', 'CHUNKY, NOT PUREED',
      'NO ARTIFICIAL FLAVORS'],
    claim: ['ABOUT 8 SERVINGS PER JAR', 'KEEP REFRIGERATED AFTER OPENING',
      'GREAT WITH TORTILLA CHIPS'] },
  // Split out of `sauce` in round 15: the tomato vocabulary is wrong on a soy
  // bottle, which is the same category error one level below the one this round
  // is about. A class is only as good as its narrowest member.
  asianSauce: { food: 1, wt: 'smBottle', badge: 'none', legal: 'wet',
    flash: ['ORIGINAL', 'LESS SODIUM', 'DARK', 'TAMARI'],
    sub: ['NATURALLY BREWED', 'NO ADDED MSG', 'A LITTLE GOES A LONG WAY'],
    claim: ['ABOUT 60 SERVINGS PER BOTTLE', 'REFRIGERATE AFTER OPENING',
      'NO ARTIFICIAL COLORS'] },
  cannedFruit: { food: 1, wt: 'can', badge: 'fruit', legal: 'wet', legalN: 'canned',
    flash: ['IN 100% JUICE', 'IN LIGHT SYRUP', 'NO SUGAR ADDED', 'SLICED',
      'HALVES'],
    sub: ['PACKED AT THE PEAK OF SEASON', 'PEELED AND PITTED FOR YOU',
      'A HALF CUP OF FRUIT PER SERVING'],
    claim: ['ABOUT 3.5 SERVINGS PER CAN', 'NO ARTIFICIAL COLORS',
      'BEST IF USED BY DATE ON END'] },
  cannedFish: { food: 1, wt: 'tin', badge: 'protein', legal: 'wet', legalN: 'canned',
    flash: ['IN WATER', 'IN OIL', 'ALBACORE', 'CHUNK LIGHT', 'NO SALT ADDED'],
    sub: ['WILD CAUGHT', 'EASY OPEN PULL TAB LID', 'DOLPHIN SAFE'],
    claim: [['12g PROTEIN PER SERVING', 'p12'], 'ABOUT 2 SERVINGS PER CAN',
      'REFRIGERATE UNUSED PORTION'] },
  // --- breakfast -----------------------------------------------------------
  cereal: { food: 1, wt: 'dryBox', badge: 'grain', legal: 'food',
    flash: ['ORIGINAL', 'HONEY', 'CINNAMON', 'FROSTED', 'FAMILY SIZE',
      'WITH REAL FRUIT'],
    sub: ['A GOOD SOURCE OF 12 VITAMINS', 'WHOLE GRAIN IS THE FIRST INGREDIENT',
      'STAYS CRISP IN MILK', 'A FAMILY FAVORITE SINCE 1946'],
    claim: ['ABOUT 11 SERVINGS PER BOX', 'NO HIGH FRUCTOSE CORN SYRUP',
      'EXCELLENT SOURCE OF FIBER', 'FREE CEREAL BOWL OFFER INSIDE'] },
  oatmeal: { food: 1, wt: 'dryBox', badge: 'grain', legal: 'food',
    flash: ['ORIGINAL', 'MAPLE & BROWN SUGAR', 'APPLES & CINNAMON',
      'LOWER SUGAR'],
    sub: ['READY IN 90 SECONDS', 'HEART HEALTHY WHOLE GRAIN OATS',
      '10 SINGLE-SERVE PACKETS'],
    claim: ['10 PACKETS PER BOX', 'GOOD SOURCE OF FIBER',
      'MICROWAVE OR ADD HOT WATER'] },
  // legal moves food -> bean. Ground coffee carrying an ENRICHED WHEAT FLOUR
  // ingredient list was 4.13% of every facing in the store.
  coffee: { food: 1, wt: 'tin', badge: 'none', legal: 'bean',
    flash: ['MEDIUM ROAST', 'DARK ROAST', 'BREAKFAST BLEND',
      ['DECAF', 'nocaf'], 'FRENCH ROAST'],
    sub: ['ROASTED IN SMALL BATCHES', '100% ARABICA BEANS',
      'RESEALABLE STAY-FRESH LID', 'GROUND FOR AUTO DRIP'],
    claim: ['MAKES UP TO 240 CUPS', 'AROMA SEAL LID',
      'CERTIFIED SUSTAINABLY SOURCED'] },
  tea: { food: 1, wt: 'teaCt', badge: 'none', legal: 'bean',
    // r18 — 'GREEN' WAS REMOVED, not gated. It is true of NEITHER SKU here:
    // orange pekoe is a grade of BLACK tea, and green tea is not herbal (and
    // is not caffeine-free, which HERBAL TEA's own `nocaf` row tag asserts).
    // A gate can only name SKUs the band is true of, and a gate naming none is
    // dead copy displayCheck() rejects — so a band true of nothing in its
    // class has to leave the pool. It was printing on 25.0% of HERBAL TEA and
    // 20.0% of ORANGE PEKOE TEA facings. Restoring it means adding a GREEN TEA
    // SKU, which also needs a motif in depict.js (pack.js throws without one).
    flash: ['ORANGE PEKOE', ['DECAF', 'nocaf'], ['CHAMOMILE', 'nocaf'],
      'EARL GREY'],
    sub: ['PICKED AND BLENDED FOR STRENGTH', 'INDIVIDUALLY FOIL WRAPPED',
      'STEEP 3 TO 5 MINUTES'],
    claim: [['100 TEA BAGS', 'ct100'], 'NO ARTIFICIAL FLAVORS',
      'CERTIFIED SUSTAINABLY SOURCED'] },
  // SPLIT r16 from `spread`, which held peanut butter, grape jelly, strawberry
  // preserves and maple syrup. This class produced two of the three emissions
  // the r16 brief quoted: "CRUNCHY · GRAPE JELLY · 7g PROTEIN PER SERVING ·
  // 12g PROTEIN". Jelly is not crunchy, has no protein, and the two protein
  // figures on that one facing did not even agree with each other — which is
  // what the p7/p12 conflict pair below now makes unemittable.
  nutSpread: { food: 1, wt: 'jar', badge: 'protein', legal: 'food',
    flash: [['CREAMY', 'nutty'], ['CRUNCHY', 'nutty'], ['NATURAL', 'nutty'],
      ['NO STIR', 'nutty'], ['HONEY ROASTED', 'nutty']],
    sub: ['MADE FROM ROASTED PEANUTS', 'NO HIGH FRUCTOSE CORN SYRUP',
      ['STIR BEFORE SERVING', 'pourable'], 'RESEALABLE TWIST CAP'],
    claim: [['ABOUT 14 SERVINGS PER JAR'], ['7g PROTEIN PER SERVING', 'p7'],
      'KEEP REFRIGERATED AFTER OPENING'] },
  fruitSpread: { food: 1, wt: 'jar', badge: 'spreadB', legal: 'food',
    // r18 — 'RED RASPBERRY' and 'ORANGE MARMALADE' WERE REMOVED, not gated,
    // for the reason above: this class sells grape jelly and strawberry
    // preserves, so neither band is true of any SKU in it and no gate could
    // name one. ORANGE MARMALADE / GRAPE JELLY is the pair r16's critic
    // printed in the brief; it was still emitting on 19.8% of GRAPE JELLY
    // facings WITH THE r17 GATE ON, because r17 gated CONCORD GRAPE and left
    // the other three flavour nouns generic.
    flash: [['CONCORD GRAPE', 'fruitspread'], ['STRAWBERRY', 'fruitspread'],
      ['NO SUGAR ADDED', 'fruitspread nosugar']],
    sub: [['MADE WITH REAL FRUIT', 'setgel'], 'NO HIGH FRUCTOSE CORN SYRUP',
      'SPREADS STRAIGHT FROM THE FRIDGE', 'RESEALABLE TWIST CAP'],
    claim: ['ABOUT 16 SERVINGS PER JAR', 'KEEP REFRIGERATED AFTER OPENING',
      'SET WITH FRUIT PECTIN'] },
  tableSyrup: { food: 1, wt: 'smBottle', badge: 'none', legal: 'food',
    flash: ['ORIGINAL', 'PURE', 'BUTTER FLAVOR', ['LITE', 'nosugar'], 'DARK AMBER'],
    sub: [['POURS THICK AND SLOW', 'pourable'], 'WARM BEFORE SERVING',
      'FLIP-TOP POUR SPOUT'],
    claim: ['ABOUT 12 SERVINGS PER BOTTLE', 'KEEP REFRIGERATED AFTER OPENING',
      'GREAT ON PANCAKES AND WAFFLES'] },
  // --- beverages -----------------------------------------------------------
  // NOTE, and it is the whole discipline of this round one level down: flash,
  // sub and claim are drawn INDEPENDENTLY inside a class, so every pair in a
  // class has to be simultaneously true. Three pairs here were not, and were
  // caught by reading the twelve facings in shots/r15_facings.png rather than
  // by any statistic: ZERO SUGAR against REAL CANE SUGAR, CAFFEINE FREE
  // against a 34 mg caffeine declaration, and EARL GREY against NATURALLY
  // CAFFEINE FREE. Adding a line to one of these arrays means checking it
  // against the other two, not just against the product name.
  // THE ONE THE BRIEF MEASURED: "the soda class pairs 2 of 5 flash values
  // implying zero sugar against 3 of 4 badges that are calorie counts — 30% of
  // every soda facing in the store." The class is RIGHT — a real soda line is
  // exactly these five varieties — so this is fixed with tags rather than by
  // splitting, and the nosugar/hascal pair in CONFLICTS makes the 30% zero.
  // Note DIET COLA and CLUB SODA also carry `nosugar` on the SKU row itself,
  // which is what stops a diet cola drawing a 140-calorie roundel at all.
  soda: { food: 1, wt: 'bev', badge: 'cal', legal: 'bev',
    flash: ['ORIGINAL', ['ZERO SUGAR', 'nosugar'], ['DIET', 'nosugar'],
      ['CAFFEINE FREE', 'nocaf'], 'CHERRY'],
    sub: ['BEST SERVED ICE COLD', 'CRISP AND REFRESHING',
      ['RESEALABLE CONTOUR BOTTLE', '@B']],
    claim: ['SERVE CHILLED OVER ICE', ['CA CASH REFUND · PLUS DEPOSIT', '@BN'],
      ['BEST TASTE BY DATE ON THE NECK', '@B'],
      ['CONTAINS 34 MG CAFFEINE PER SERVING', 'hascaf']] },
  water: { food: 1, wt: 'bev', badge: 'none', legal: 'water',
    flash: [['PURIFIED', 'nosugar'], ['SPRING', 'nosugar'], ['LEMON', 'nosugar'],
      ['LIME', 'nosugar'], ['UNSWEETENED', 'nosugar']],
    sub: ['FILTERED THROUGH LIMESTONE', 'ZERO CALORIES, ZERO SWEETENERS',
      'BOTTLED AT THE SOURCE'],
    claim: ['24 BOTTLES PER CASE', ['RECYCLE THE EMPTY BOTTLE', '@BN'],
      'NO SODIUM PER SERVING'] },
  juice: { food: 1, wt: 'bev', badge: 'fruit', legal: 'bev',
    flash: ['100% JUICE', 'NO PULP', 'SOME PULP', ['NO SUGAR ADDED', 'nosugar'],
      'CALCIUM ADDED'],
    sub: ['NOT FROM CONCENTRATE', 'PRESSED FROM RIPE FRUIT',
      'SHAKE WELL BEFORE POURING'],
    claim: ['KEEP REFRIGERATED AFTER OPENING', 'ABOUT 8 SERVINGS PER BOTTLE',
      'EXCELLENT SOURCE OF VITAMIN C'] },
  rtdTea: { food: 1, wt: 'bev', badge: 'cal', legal: 'bev',
    flash: ['SWEETENED', ['UNSWEETENED', 'nosugar'], 'LEMON', 'HALF & HALF',
      ['DIET', 'nosugar']],
    sub: ['BREWED FROM REAL TEA LEAVES', 'BEST SERVED ICE COLD',
      'SHAKE WELL BEFORE POURING'],
    claim: ['KEEP REFRIGERATED AFTER OPENING', 'ABOUT 8 SERVINGS PER BOTTLE',
      ['CONTAINS 25 MG CAFFEINE PER SERVING', 'hascaf']] },
  sportsDrink: { food: 1, wt: 'smBottle', badge: 'cal', legal: 'bev',
    flash: ['ORIGINAL', ['ZERO SUGAR', 'nosugar'], 'BERRY', 'CITRUS',
      'EXTRA STRENGTH'],
    sub: ['REPLACES ELECTROLYTES LOST IN SWEAT', 'BEST SERVED ICE COLD',
      ['RESEALABLE SPORT CAP', '@B']],
    claim: [['CONTAINS 160 MG CAFFEINE', 'hascaf'],
      'NOT RECOMMENDED FOR CHILDREN', 'SERVE CHILLED OVER ICE'] },
  // --- frozen --------------------------------------------------------------
  frozenVeg: { food: 1, wt: 'frozen', badge: 'veg', legal: 'food',
    flash: ['STEAM IN BAG', 'NO SAUCE', 'CUT', 'PETITE', 'WHOLE'],
    sub: ['FLASH FROZEN AT THE PEAK OF SEASON', 'READY IN 5 MINUTES',
      'MICROWAVE RIGHT IN THE POUCH'],
    claim: ['ABOUT 4 SERVINGS PER BAG', 'HALF A CUP OF VEGETABLES PER SERVING',
      'KEEP FROZEN UNTIL READY TO USE'] },
  // SPLIT r16 — a bag of frozen berries was carrying "HALF A CUP OF VEGETABLES
  // PER SERVING". The last of the eleven rule hits the independent auditor was
  // still firing on after the first pass of the r16 copy work.
  frozenFruit: { food: 1, wt: 'frozen', badge: 'fruit', legal: 'food',
    flash: ['UNSWEETENED', 'WHOLE', 'SLICED', 'MIXED', 'WILD'],
    sub: ['FLASH FROZEN AT THE PEAK OF SEASON', 'NOTHING ADDED BUT FRUIT',
      'GREAT IN SMOOTHIES AND BAKING'],
    claim: ['ABOUT 4 SERVINGS PER BAG', 'HALF A CUP OF FRUIT PER SERVING',
      'KEEP FROZEN UNTIL READY TO USE'] },
  frozenMeal: { food: 1, wt: 'frozen', badge: 'cal', legal: 'food',
    flash: ['ORIGINAL', 'CRISPY', 'EXTRA CRISPY', 'FAMILY SIZE', 'RISING CRUST'],
    sub: ['BAKE FROM FROZEN IN 22 MINUTES', 'CRISPS IN A CONVENTIONAL OVEN',
      'NO ARTIFICIAL FLAVORS'],
    claim: ['ABOUT 4 SERVINGS PER PACKAGE', 'KEEP FROZEN UNTIL READY TO COOK',
      'DO NOT REFREEZE AFTER THAWING'] },
  iceCream: { food: 1, wt: 'pint', badge: 'cal', legal: 'food',
    flash: ['VANILLA BEAN', 'DOUBLE CHOCOLATE', 'NEAPOLITAN', 'COOKIES & CREAM',
      'BUTTER PECAN'],
    sub: ['CHURNED SLOW FOR A DENSER SCOOP', 'MADE WITH REAL CREAM',
      'RESEALABLE LID'],
    claim: ['ABOUT 12 SERVINGS PER CONTAINER', 'KEEP FROZEN AT 0 F OR BELOW',
      'NO ARTIFICIAL COLORS'] },
  novelty: { food: 1, wt: 'barCt', badge: 'cal', legal: 'food',
    flash: ['FUDGE', 'ORANGE CREAM', 'VARIETY PACK', ['NO SUGAR ADDED', 'nosugar']],
    sub: ['ONE BAR PER SERVING', 'MADE WITH REAL CREAM',
      'INDIVIDUALLY WRAPPED'],
    claim: ['6 BARS PER BOX', 'KEEP FROZEN AT 0 F OR BELOW',
      'NO ARTIFICIAL COLORS'] },
  // --- non-food: NO nutrition path at all ----------------------------------
  // paper splits in two. A towel is sold on absorbency and a tissue on
  // softness and septic safety, and no real pack carries the other one's line —
  // "SEPTIC SAFE" on a roll of paper towels is a small version of exactly the
  // defect this round is fixing, so it does not get to survive inside the fix.
  // paper splits three ways now. A towel is sold on absorbency, a bath tissue on
  // softness and septic safety, and a facial tissue on neither — and no real
  // pack carries another one's line. "SEPTIC SAFE" on a roll of paper towels
  // is a small version of the defect this table exists to prevent, and the
  // r15 note here said so while the legal block underneath printed it anyway.
  towel: { food: 0, wt: 'rollCt', badge: 'ply', legal: 'dryPaper',
    flash: ['SELECT-A-SIZE', 'FULL SHEET', 'ULTRA ABSORBENT', 'ULTRA STRONG',
      'PRINTS'],
    sub: ['ABSORBS MORE, USES LESS', 'STRONG WHEN WET',
      'ONE SHEET DOES THE JOB OF TWO'],
    claim: ['110 SHEETS PER ROLL', 'RESPONSIBLY SOURCED FIBER',
      'PACKAGING IS RECYCLABLE'] },
  // SPLIT r16 from `tissue`. Bath tissue is septic-safe and a facial tissue is
  // not flushed at all; the towel/tissue legal split is in LEGAL_SETS above,
  // because the auditor caught SEPTIC SAFE printed on PAPER TOWELS at 1.58%.
  bathTissue: { food: 0, wt: 'rollCt', badge: 'ply', legal: 'bath',
    flash: ['2 PLY', '3 PLY', 'ULTRA SOFT', 'ULTRA STRONG', 'UNSCENTED'],
    sub: ['SOFT AND STRONG AT THE SAME TIME', 'SEPTIC SAFE AND BREAKS DOWN FAST',
      'FITS ANY STANDARD HOLDER'],
    claim: ['RESPONSIBLY SOURCED FIBER', 'SEPTIC SAFE — NOT A FLUSHABLE WIPE',
      'PACKAGING IS RECYCLABLE'] },
  facialTissue: { food: 0, wt: 'sheetCt', badge: 'ply', legal: 'dryPaper',
    flash: ['2 PLY', '3 PLY', 'ULTRA SOFT', 'UNSCENTED', 'WITH LOTION'],
    sub: ['GENTLE ON SENSITIVE SKIN', 'POPS UP ONE AT A TIME',
      'SOFT AND STRONG AT THE SAME TIME'],
    claim: ['RESPONSIBLY SOURCED FIBER', 'DO NOT FLUSH',
      'PACKAGING IS RECYCLABLE'] },
  wrap: { food: 0, wt: 'roll', badge: 'none', legal: 'paper',
    flash: ['HEAVY DUTY', 'STANDARD', 'NON-STICK', 'SLIDER SEAL',
      'EXTRA STRONG'],
    sub: ['CUTTER BAR STAYS ON THE BOX', 'HOLDS A SEAL IN THE FREEZER',
      'OVEN AND GRILL SAFE TO 400 F'],
    claim: ['100 BAGS PER BOX', 'BPA FREE', 'MADE IN THE U.S.A.'] },
  laundry: { food: 0, wt: 'bigBottle', badge: 'clean', legal: 'clean',
    flash: ['ORIGINAL SCENT', 'FREE & CLEAR', 'SPRING MEADOW', 'HE COMPATIBLE',
      'OXI BOOST'],
    sub: ['LIFTS 99 STAINS THE FIRST TIME', 'WORKS IN COLD WATER',
      'CONCENTRATED — USE LESS PER LOAD'],
    claim: ['64 LOADS PER BOTTLE', 'SAFE FOR ALL MACHINES',
      'KEEP OUT OF REACH OF CHILDREN'] },
  // `cleaner` held dish soap, dishwasher pacs, bleach, all-purpose and glass.
  // A 64 LOADS roundel reached ALL PURPOSE CLEANER at 1.49% and a 99.9% OF
  // GERMS claim reached DISHWASHER PACS at 1.14%.
  cleaner: { food: 0, wt: 'bigBottle', badge: 'cleanB', legal: 'clean',
    flash: ['ORIGINAL SCENT', 'LEMON', 'FRESH LINEN', 'UNSCENTED', 'STREAK FREE'],
    sub: ['NO STREAKS ON GLASS', 'CUTS THROUGH BAKED-ON GREASE',
      'SAFE ON SEALED SURFACES'],
    claim: ['SEE BACK PANEL FOR DIRECTIONS', 'KEEP OUT OF REACH OF CHILDREN',
      'DO NOT MIX WITH OTHER CHEMICALS'] },
  dishwash: { food: 0, wt: 'dishSz', badge: 'dishB', legal: 'clean',
    flash: ['ORIGINAL SCENT', 'LEMON', 'FREE & CLEAR', 'ULTRA CONCENTRATED'],
    sub: ['CUTS GREASE ON THE FIRST PASS', 'RINSES CLEAN, NO FILM',
      'A LITTLE GOES A LONG WAY'],
    claim: ['SEE BACK PANEL FOR DIRECTIONS', 'KEEP OUT OF REACH OF CHILDREN',
      'SAFE FOR ALL DISHWASHERS'] },
  disinfect: { food: 0, wt: 'bigBottle', badge: 'germB', legal: 'clean',
    flash: ['ORIGINAL SCENT', 'LEMON', 'FRESH', 'ANTIBACTERIAL'],
    sub: ['KILLS 99.9% OF HOUSEHOLD GERMS', 'DISINFECTS IN 30 SECONDS',
      'SANITIZES HARD NON-POROUS SURFACES'],
    claim: ['SEE BACK PANEL FOR DIRECTIONS', 'KEEP OUT OF REACH OF CHILDREN',
      'DO NOT MIX WITH OTHER CHEMICALS'] },
  // `otc` held a pain reliever, an antacid, a cough syrup and an allergy
  // tablet. It produced the r16 brief's first quoted emission — "RAPID RELEASE
  // · COUGH SYRUP · PAIN RELIEVER / FEVER REDUCER · 100 COUNT · NON DROWSY" —
  // in which a LIQUID carries a caplet release claim and a tablet count.
  analgesic: { food: 0, wt: 'dose', badge: 'drug', legal: 'drug',
    flash: [['EXTRA STRENGTH', 'solid'], ['RAPID RELEASE', 'solid'],
      ['8 HOUR', 'solid'], ['ARTHRITIS FORMULA', 'solid']],
    sub: [['PAIN RELIEVER / FEVER REDUCER', 'solid'],
      ['RELIEF THAT LASTS UP TO 8 HOURS', 'solid'],
      ['EASY TO SWALLOW CAPLETS', 'solid']],
    claim: [['SEE NEW WARNINGS INFORMATION'], ['KEEP OUT OF REACH OF CHILDREN'],
      ['DO NOT USE IF SEAL IS BROKEN']] },
  antacid: { food: 0, wt: 'dose', badge: 'antacidB', legal: 'antacid',
    flash: [['ASSORTED FRUIT', 'solid'], ['PEPPERMINT', 'solid'],
      ['ULTRA STRENGTH', 'solid'], ['BERRY', 'solid']],
    sub: [['RELIEVES HEARTBURN AND ACID INDIGESTION', 'solid'],
      ['CHEWABLE — NO WATER NEEDED', 'solid'], ['WORKS IN SECONDS', 'solid']],
    claim: ['SEE NEW WARNINGS INFORMATION', 'KEEP OUT OF REACH OF CHILDREN',
      'DO NOT USE IF SEAL IS BROKEN'] },
  coughCold: { food: 0, wt: 'doseLiq', badge: 'coldB', legal: 'cough',
    flash: [['NIGHTTIME', 'liquiddose'], ['DAYTIME', 'liquiddose'],
      ['NON-DROWSY', 'liquiddose'], ['CHERRY', 'liquiddose'],
      ['HONEY LEMON', 'liquiddose']],
    sub: [['COUGH SUPPRESSANT / EXPECTORANT', 'liquiddose'],
      ['CONTROLS COUGH FOR UP TO 8 HOURS', 'liquiddose'],
      ['DOSING CUP INCLUDED', 'liquiddose']],
    claim: ['SEE NEW WARNINGS INFORMATION', 'KEEP OUT OF REACH OF CHILDREN',
      'DO NOT USE IF SEAL IS BROKEN'] },
  allergy: { food: 0, wt: 'dose', badge: 'allergyB', legal: 'antihist',
    flash: [['NON-DROWSY', 'solid'], ['24 HOUR', 'solid'],
      ['ORIGINAL PRESCRIPTION STRENGTH', 'solid'], ['INDOOR & OUTDOOR', 'solid']],
    sub: [['ANTIHISTAMINE', 'solid'], ['RELIEVES SNEEZING AND ITCHY EYES', 'solid'],
      ['ONE TABLET A DAY', 'solid']],
    claim: ['SEE NEW WARNINGS INFORMATION', 'KEEP OUT OF REACH OF CHILDREN',
      'DO NOT USE IF SEAL IS BROKEN'] },
  vitamin: { food: 0, wt: 'doseVit', badge: 'vitB', legal: 'supp',
    flash: ['ADULTS 50+', 'ONE DAILY', 'HIGH POTENCY', 'CHEWABLE',
      'WOMENS FORMULA'],
    sub: ['SUPPORTS BONE AND IMMUNE HEALTH', 'ONE TABLET A DAY',
      'NO ARTIFICIAL SWEETENERS'],
    claim: ['ONE TABLET IS ONE DAY SUPPLY', 'KEEP OUT OF REACH OF CHILDREN',
      'THESE STATEMENTS ARE NOT FDA EVALUATED'] },
  // `bodycare` held shampoo, conditioner, body wash and a bar of soap, and it
  // shared its `care` legal set with `oral`. The brief named both siblings:
  // "VOLUMIZING · BAR SOAP" and "THISTLEDOWN TOOTHPASTE carrying a shampoo's
  // ingredient list". The legal split is in LEGAL_SETS above.
  hairCare: { food: 0, wt: 'care', badge: 'care2', legal: 'hair',
    flash: ['DAILY MOISTURE', 'VOLUMIZING', 'FOR DRY HAIR', '2 IN 1',
      'COLOR PROTECT'],
    sub: ['RINSES CLEAN, NO RESIDUE', 'GENTLE ENOUGH FOR EVERY DAY',
      'WITH ARGAN AND VITAMIN E'],
    claim: ['FOR EXTERNAL USE ONLY', 'NOT TESTED ON ANIMALS',
      ['RECYCLE THE EMPTY BOTTLE', '@B']] },
  skinCare: { food: 0, wt: 'careSk', badge: 'care2', legal: 'skin',
    flash: ['FRESH SCENT', 'MOISTURIZING', 'SENSITIVE SKIN', 'UNSCENTED',
      'DEEP CLEAN'],
    sub: ['GENTLE ENOUGH FOR EVERY DAY', 'RINSES CLEAN, NO RESIDUE',
      'pH BALANCED FOR SKIN'],
    claim: ['FOR EXTERNAL USE ONLY', 'NOT TESTED ON ANIMALS',
      'DERMATOLOGIST TESTED'] },
  toothpaste: { food: 0, wt: 'tube', badge: 'oral2', legal: 'oralCare',
    flash: ['FRESH MINT', 'WHITENING', 'SENSITIVE', 'TARTAR CONTROL',
      'COOL PEPPERMINT'],
    sub: ['FIGHTS CAVITIES AND FRESHENS BREATH', 'CLINICALLY PROVEN FORMULA',
      'ANTICAVITY FLUORIDE TOOTHPASTE'],
    claim: ['SUPERVISE CHILDREN UNDER 6', 'DO NOT SWALLOW',
      'SEE CARTON FOR FULL DIRECTIONS'] },
  rinse: { food: 0, wt: 'rinseSz', badge: 'oral2', legal: 'oralCare',
    flash: ['COOL MINT', 'ORIGINAL', 'ALCOHOL FREE', 'WHITENING'],
    sub: ['KILLS THE GERMS THAT CAUSE BAD BREATH', 'RINSE 20 SECONDS TWICE DAILY',
      'DOSING CAP INCLUDED'],
    claim: ['SUPERVISE CHILDREN UNDER 6', 'DO NOT SWALLOW',
      'SEE BOTTLE FOR FULL DIRECTIONS'] },
  // `baby` held wipes and diapers, so a diaper size band reached BABY WIPES at
  // 0.73% and the two count bands disagreed with each other at 0.68%.
  babyWipe: { food: 0, wt: 'wipeCt', badge: 'care2', legal: 'skin',
    flash: ['SENSITIVE', 'FRAGRANCE FREE', 'ALOE & VITAMIN E', 'UNSCENTED'],
    sub: ['GENTLE ON DELICATE SKIN', 'HYPOALLERGENIC AND DERMATOLOGIST TESTED',
      'RESEALABLE STAY-MOIST LID'],
    claim: ['FOR EXTERNAL USE ONLY', 'DO NOT FLUSH', 'THICK AND TEXTURED'] },
  diaper: { food: 0, wt: 'diaperCt', badge: 'diaperB', legal: 'dryPaper',
    flash: ['SIZE 3 · 16-28 LB', 'SIZE 4 · 22-37 LB', 'OVERNIGHT', 'SENSITIVE'],
    sub: ['WETNESS INDICATOR CHANGES COLOR', 'UP TO 12 HOURS OF PROTECTION',
      'SOFT STRETCH SIDES'],
    claim: ['KEEP PLASTIC AWAY FROM CHILDREN', 'DO NOT FLUSH',
      'PACKAGING IS RECYCLABLE'] },
};

// ---------------------------------------------------------------------------
// LOOKUP + THE SELF-CHECK.
//
// CLAUDE.md: exactly one piece of code owns a derivation. copyFor() is that
// piece for "what words go on a package", and pack.js no longer reaches for a
// pool directly. The check below is the lungCheck() pattern from agents.js: a
// deliberate assertion that fails LOUDLY when the table and the code disagree,
// because the failure mode being fixed here is one that produces a plausible
// wrong answer rather than an error.
const BY_NAME = new Map();
const BY_DEPT_FORM = new Map();          // deptKey + form -> SKU rows
for (const row of SKUS) {
  BY_NAME.set(row[0], row);
  for (const f of row[3]) {
    const k = row[1] + f;
    (BY_DEPT_FORM.get(k) || BY_DEPT_FORM.set(k, []).get(k)).push(row);
  }
}

// ===========================================================================
// THE CHECK — REWRITTEN r16 SO IT TESTS THE THING IT IS NAMED FOR.
//
// The r15 version returned [] on a table that was emitting a contradiction on
// 35.64% of facings, and the r16 brief said exactly why: "it asks whether a SKU
// has a class, never whether a band FITS the SKU. That is this brief's own
// 'assertions get written for the bug you just fixed', arriving one round after
// it was written down."
//
// So this is no longer a sampler and no longer a shape check. For every SKU, on
// every package form it is sold in, it ENUMERATES THE ENTIRE CROSS PRODUCT of
// flash x sub x claim x weight x badge and asserts:
//
//   1. no emittable tuple contains a declared CONFLICTS pair          (soundness)
//   2. at least one tuple IS emittable, for every SKU and every form  (liveness)
//   3. every band entry appears in at least one emittable tuple       (no dead copy)
//
// (2) and (3) are not decoration. The cheapest way to make (1) pass is to
// over-declare conflicts until the pools empty out, and (3) is what catches a
// band that has been quietly made unreachable — which is a silent regression
// with exactly the shape of the bugs this project keeps finding.
//
// The whole enumeration is about 190k tuples and runs at module load in a few
// milliseconds. It THROWS via pack.js rather than returning a number, because
// the failure mode is a plausible wrong answer rather than an error.
function bandsOf(c, key, form) {
  return (c[key] || []).map(band).filter((e) => !e.forms || e.forms.includes(form));
}
function badgesOf(c) {
  if (c.badge === 'none' || !BADGE[c.badge]) return [{ text: null, forms: null, tags: [] }];
  return BADGE[c.badge].map((e) => ({
    text: e, forms: null, tags: e[2] ? String(e[2]).split(/\s+/) : [],
  }));
}

// `inject` exists ONLY for copyCheckSelfTest() below: it lets the check be run
// against a deliberately broken copy of the tables without touching the real
// ones. Nothing in the shipped path passes it.
export function copyCheck(inject, deep) {
  const SK = inject && inject.skus ? [...SKUS, ...inject.skus] : SKUS;
  const CLS = inject && inject.cl ? { ...CL, ...inject.cl } : CL;
  const CF = inject && inject.conflicts
    ? mkConflictMap([...CONFLICTS, ...inject.conflicts]) : CONFLICT_MAP;
  const bad = [];
  // ---- shape. A miss here would make the enumeration meaningless.
  for (const [n, dept, cls, forms] of SK) {
    if (!CLS[cls]) bad.push(n + ' -> unknown class ' + cls);
    if (!/^[CPNB]+$/.test(forms)) bad.push(n + ' -> bad forms "' + forms + '"');
    if (!DESC[dept] && !(inject && inject.skus)) bad.push(n + ' -> unknown dept ' + dept);
  }
  for (const k of Object.keys(CLS)) {
    const c = CLS[k];
    if (!WT[c.wt]) bad.push(k + ' -> unknown weight set ' + c.wt);
    if (c.badge !== 'none' && !BADGE[c.badge]) bad.push(k + ' -> unknown badge ' + c.badge);
    if (!LEGAL_SETS[c.legal]) bad.push(k + ' -> unknown legal set ' + c.legal);
    if (c.legalN && !LEGAL_SETS[c.legalN]) bad.push(k + ' -> unknown legalN set ' + c.legalN);
    if (!PANEL[c.legal]) bad.push(k + ' -> legal set ' + c.legal + ' has no PANEL heading');
    if (c.legalN && !PANEL[c.legalN]) bad.push(k + ' -> legalN set ' + c.legalN + ' has no PANEL heading');
    if (!SK.some((r) => r[2] === k)) bad.push(k + ' -> class has no SKU');
  }
  for (const f of 'CPNB') {
    if (!(ALL_BY_FORM.get(f) || []).length) bad.push('no product anywhere in form ' + f);
  }
  for (const [a2, b2] of CONFLICTS) if (a2 === b2) bad.push('CONFLICTS pair with itself: ' + a2);
  if (bad.length) return bad;                // the enumeration would be nonsense

  // ---- (A) BEHAVIOURAL, AND READ OFF THE PRINTED TEXT, NOT OFF copyFor's
  // OWN BOOKKEEPING. This clause was written twice and the FIRST version was
  // vacuous in a way worth recording, because it is the same shape as the r15
  // copyCheck it replaces.
  //
  // Draft 1 read `cp.tags`, the accumulator copyFor returns. Injection test:
  // delete `for (const t of e.tags) have.add(t)` from pickBand — the one line
  // that makes the whole mechanism work, without which every facing is a
  // lottery again — and re-run. It reported ZERO complaints, because with the
  // accumulation gone the tag list it was reading was empty, so of course
  // nothing in it conflicted. The check was reading the output of the bug.
  //
  // So the tags are looked up FRESH from the tables by the printed string. A
  // broken pickBand now prints CRUNCHY on a jelly and this finds it, because
  // it asks the table what CRUNCHY means rather than asking copyFor.
  if (!inject) {
    const idx = tagIndex(CLS);
    const depts = Object.keys(DESC);
    let n = 0;
    for (let seed = 1; seed <= (deep ? 400 : 90); seed++) {
      const rng = mkRng(seed * 2654435761);
      for (const dept of depts) for (const form of 'CPNB') {
        const cp = copyFor(rng, dept, form);
        n++;
        const row = BY_NAME.get(cp.desc);
        const tags = row && row[4] ? String(row[4]).split(/\s+/) : [];
        const im = idx.get(cp.cls);
        if (im) {
          for (const [k, v] of [['flash', cp.flash], ['sub', cp.sub], ['claim', cp.claim],
            ['wt', cp.wt], ['badge', cp.badge ? cp.badge.join('\u0000') : null]]) {
            const t = im.get(k + '\u0001' + v);
            if (t) for (const x of t) tags.push(x);
          }
        }
        for (let i = 0; i < tags.length; i++) {
          const bs = CF.get(tags[i]); if (!bs) continue;
          let done = false;
          for (let j = 0; j < tags.length; j++) {
            if (i !== j && bs.has(tags[j])) {
              bad.push('copyFor PRINTED a conflicting facing: ' + cp.desc + '/' + form
                + ' [' + tags[i] + ' + ' + tags[j] + '] '
                + [cp.flash, cp.sub, cp.claim, cp.wt,
                  cp.badge ? cp.badge.join(' ') : '-'].join(' \u00b7 '));
              done = true; break;
            }
          }
          if (done) break;
        }
      }
    }
    BEHAVIOUR_N = n;
    if (bad.length) return bad;
  }

  // ---- (B) TABLE. Enumerate every tuple copyFor could reach.
  // The full sweep is 169k tuples and costs ~250 ms, which is too much to pay
  // on every page load for a table that only changes when someone edits it.
  // pack.js runs the fast form; tools/copyaudit.mjs and copyCheckSelfTest()
  // run the deep one. Both throw on the same complaints.
  if (!deep && !inject) return bad;
  const reached = new Set(); const declared = new Set();
  let tuples = 0, live = 0;
  for (const row of SK) {
    const [name, , cls, forms] = row;
    const c = CLS[cls];
    const skuTags = row[4] ? String(row[4]).split(/\s+/) : [];
    for (const form of forms) {
      const F = bandsOf(c, 'flash', form), S = bandsOf(c, 'sub', form);
      const A = bandsOf(c, 'claim', form);
      const W = (WT[c.wt] || []).map(band).filter((e) => !e.forms || e.forms.includes(form));
      const B = badgesOf(c);
      for (const [arr, key] of [[F, 'flash'], [S, 'sub'], [A, 'claim'], [W, 'wt'], [B, 'badge']]) {
        if (!arr.length) bad.push(name + '/' + form + ' -> no ' + key + ' band survives the form gate');
        for (const e of arr) declared.add(cls + '|' + key + '|' + JSON.stringify(e.text));
      }
      let anyLive = false;
      for (const f of F) for (const su of S) for (const cl of A) for (const w of W) for (const bg of B) {
        tuples++;
        const tags = [...skuTags, ...f.tags, ...su.tags, ...cl.tags, ...w.tags, ...bg.tags];
        let clash = false;
        outer: for (let i = 0; i < tags.length; i++) {
          const bs = CF.get(tags[i]); if (!bs) continue;
          for (let j = 0; j < tags.length; j++) if (i !== j && bs.has(tags[j])) { clash = true; break outer; }
        }
        if (clash) continue;
        anyLive = true; live++;
        reached.add(cls + '|flash|' + JSON.stringify(f.text));
        reached.add(cls + '|sub|' + JSON.stringify(su.text));
        reached.add(cls + '|claim|' + JSON.stringify(cl.text));
        reached.add(cls + '|wt|' + JSON.stringify(w.text));
        reached.add(cls + '|badge|' + JSON.stringify(bg.text));
      }
      // (C) LIVENESS. Emptying a pool until nothing conflicts is the cheapest
      // way to pass a soundness check, and this is what refuses it.
      if (!anyLive) bad.push(name + '/' + form + ' -> EVERY band combination conflicts; nothing can be printed');
    }
  }
  // (D) NO DEAD COPY — a band nothing can reach is a silent regression.
  for (const d of declared) if (!reached.has(d)) bad.push('unreachable band: ' + d.replace(/\|/g, ' / '));
  if (!inject) COPY_STATS = { tuples, live, dead: declared.size - reached.size, bands: declared.size };
  return bad;
}

// ---------------------------------------------------------------------------
// PROVE THE CHECK FIRES. AGENTS_BRIEF: "An assertion that has never fired is
// not evidence of correctness — test it by breaking the thing it guards."
//
// Each case below seeds ONE defect of the kind copyCheck exists to catch, runs
// the check against the broken table, and requires a complaint naming it. The
// last case is the control: the real table must stay silent.
export function copyCheckSelfTest() {
  const out = [];
  const hit = (label, res, want) => {
    const ok = res.some((m) => m.includes(want));
    out.push((ok ? 'CAUGHT   ' : 'MISSED   ') + label
      + (ok ? '  ->  ' + res.find((m) => m.includes(want)) : ''));
    return ok;
  };
  let ok = true;
  // 1. a product whose every band conflicts — the CRUNCHY GRAPE JELLY shape.
  ok = hit('a SKU tagged so no facing can be printed',
    copyCheck({ skus: [['SEEDED JELLY', 'breakfast', 'nutSpread', 'N', 'fruitspread']] }),
    'EVERY band combination conflicts') && ok;
  // 2. a class pointing at small print that describes another product.
  ok = hit('a class pointing at a legal set that does not exist',
    copyCheck({ cl: { soda: { ...CL.soda, legal: 'shampooPanel' } } }),
    'unknown legal set') && ok;
  // 3. a band made unreachable by an over-broad conflict — the failure mode of
  //    "fix it by deleting things", which check (D) exists to refuse.
  ok = hit('a band no facing can ever reach',
    copyCheck({ conflicts: [['hascal', 'hascal2']],
      cl: { soda: { ...CL.soda, flash: [['ORIGINAL', 'hascal2'], ['ZERO SUGAR', 'nosugar']],
        sub: [['BEST SERVED ICE COLD', 'hascal2']] } } }),
    'unreachable band') && ok;
  // 4. a form gate that removes every band for a form the SKU is sold in.
  ok = hit('a form gate that empties a pool',
    copyCheck({ cl: { soda: { ...CL.soda, sub: [['BEST SERVED ICE COLD', '@B']] } } }),
    'no sub band survives the form gate') && ok;
  // 5. THE CONTROL.
  const clean = copyCheck(null, true);
  out.push((clean.length ? 'FALSE ALARM on the real table: ' + clean[0]
    : 'SILENT   on the real table (' + BEHAVIOUR_N + ' copyFor draws checked)'));
  if (clean.length) ok = false;
  return { ok, log: out };
}

let COPY_STATS = null;
// Quoted in the round report so the next round can see the direction of travel.
export function copyStats() {
  if (!COPY_STATS) copyCheck(null, true);
  const perClass = {};
  for (const [, , cls] of SKUS) perClass[cls] = (perClass[cls] || 0) + 1;
  const multi = Object.keys(perClass).filter((k) => perClass[k] > 1);
  return {
    ...COPY_STATS,
    skus: SKUS.length,
    classes: Object.keys(CL).length,
    classesWithMoreThanOneSku: multi.length,
    conflictPairs: CONFLICTS.length,
  };
}

// NOT an error, and deliberately not in copyCheck(): a department that has no
// product in some form. bakery has no bottled SKU and frozen has no bottled
// SKU, because a real bakery aisle has no bottles in it. Those cells fall
// through to the store-wide pool for that form, which is a real endcap, not a
// lie. Listed so a future round can SEE the fallbacks rather than discover one
// as a surprise.
export function copyGaps() {
  const gaps = [];
  for (const dept of Object.keys(DESC)) {
    for (const f of 'CPNB') if (!BY_DEPT_FORM.has(dept + f)) gaps.push(dept + '/' + f);
  }
  return gaps;
}

// The soft-fallback ladder, stated once. A department with no product in this
// form borrows from the whole store rather than printing a lie: real endcaps
// carry stock from other aisles, and that is a far smaller error than a can of
// bread. ALL_BY_FORM is built the same way from the same table.
const ALL_BY_FORM = new Map();
for (const row of SKUS) for (const f of row[3]) {
  (ALL_BY_FORM.get(f) || ALL_BY_FORM.set(f, []).get(f)).push(row);
}

const pk1 = (rng, a) => a[Math.floor(rng() * a.length) % a.length];

// THE ONE ENTRY POINT. form is one of 'C' 'P' 'N' 'B' (see SKUS above).
// Returns every band a facing can print, all of them belonging to one product
// AND all of them simultaneously true of it.
//
// ROUND 16. Two filters now sit between the pool and the pick, and the order
// matters: the FORM gate is static and is applied first, then bands are drawn
// one at a time with the accumulated tag set narrowing what is still legal.
// Drawing sequentially rather than solving is deliberate — it cannot emit a
// conflicting tuple (a pairwise constraint is enforced by every step), it is
// O(bands), and copyCheck() proves exhaustively that it never paints itself
// into a corner on any SKU in any form.
// ROUND 17 — `cls` and `desc`. The SKU gate (see FLASH_SKU) is applied here,
// as a third filter alongside the form gate and the tag clash, in that order.
// It is deliberately applied to EVERY band pool and not only to flash: the
// mechanism is "this phrase belongs to this product", which is as true of a
// subhead as of a flag. Only flash is populated today.
function pickBand(rng, pool, form, have, cls, desc) {
  const ok = [];
  for (const raw of pool) {
    const e = band(raw);
    if (e.forms && !e.forms.includes(form)) continue;
    if (clashes(e.tags, have)) continue;
    const gate = cls ? flashSku(cls, e.text) : null;
    if (gate && !gate.includes(desc)) continue;
    ok.push(e);
  }
  // The fallback can only be reached if copyCheck() is failing, and pack.js
  // throws on that at module load — so this is a belt, not a route.
  const e = ok.length ? ok[Math.floor(rng() * ok.length) % ok.length] : band(pool[0]);
  for (const t of e.tags) have.add(t);
  return e.text;
}

export function copyFor(rng, deptKey, form) {
  const pool = BY_DEPT_FORM.get(deptKey + form)
    || ALL_BY_FORM.get(form) || SKUS;
  return copyForSku(rng, pk1(rng, pool), form);
}

// Is this product food? The one owner of that question — it is a property of
// the SKU's CLASS and nothing else. plan.js derives which DEPARTMENTS are
// non-food from it rather than declaring the answer a second time, which is
// how round 5's `(idx % 8) >= 6` came to be true only by the ordering of an
// array in another file.
export function skuFood(name) {
  const row = BY_NAME.get(name);
  return !!(row && CL[row[2]] && CL[row[2]].food);
}

// ROUND 17 — THE PINNED ENTRY POINT, and it is the half of the atlas fix that
// widening the pipe does not buy you.
//
// copyFor() picks a RANDOM row from the department pool. That is right for a
// shelf tag or a dangler, where the store wants a plausible product and does
// not care which. It is wrong for baking an atlas cell, because a random deal
// draws WITH REPLACEMENT: 24 carton cells drawing from a 74-SKU pool land ~21
// distinct products, and even at 48 cells they land ~38. Widening a pipe fed
// by a random draw buys roughly the square root of what you paid for.
//
// plan.js deals each cell an explicit SKU by greedy motif coverage. This is
// where that SKU enters the copy machinery. Everything below the pick — the
// tag seeding, the sequential band draw, the form gate, the legal set — is
// unchanged and is still the only path to a printed band.
export function copyForSku(rng, row, form) {
  const [desc, dept, cls] = row;
  const c = CL[cls];
  // The SKU's own facts go in FIRST, before any band is drawn. This is what
  // stops CRUNCHY reaching GRAPE JELLY and a 140-calorie roundel reaching a
  // DIET COLA even though each shares a class with something the band fits.
  const have = new Set(row[4] ? String(row[4]).split(/\s+/) : []);
  const flash = pickBand(rng, c.flash, form, have, cls, desc);
  const sub = pickBand(rng, c.sub, form, have, cls, desc);
  const claim = pickBand(rng, c.claim, form, have, cls, desc);
  const wt = pickBand(rng, WT[c.wt], form, have, cls, desc);
  // null badge means DRAW NO BADGE. A coffee tin and a box of foil do not
  // carry a nutrient roundel, and printing one was half of what made the
  // non-food facings read as food.
  let badge = null;
  if (c.badge !== 'none' && BADGE[c.badge]) {
    const ok = BADGE[c.badge].filter(
      (e) => !clashes(e[2] ? String(e[2]).split(/\s+/) : [], have));
    const chosen = ok.length ? pk1(rng, ok) : null;
    if (chosen) {
      badge = [chosen[0], chosen[1]];
      if (chosen[2]) for (const t of String(chosen[2]).split(/\s+/)) have.add(t);
    }
  }
  // The small print follows the PACKAGE as well as the product: a jar of
  // marinara must not carry "do not use if the CAN is dented". legalN is the
  // one place a band depends on form rather than on the SKU.
  const lkey = (c.legalN && form === 'N') ? c.legalN : c.legal;
  return {
    desc,
    dept,
    cls,
    food: !!c.food,
    flash,
    sub,
    claim,
    wt,
    badge,
    tags: [...have],
    // Both the LINES and the KEY. pack.js keys its ruled-panel row set off the
    // same name, so the two halves of the small print cannot drift apart into
    // a drug-facts heading over nutrition rows.
    legal: LEGAL_SETS[lkey],
    legalKey: lkey,
    panel: pk1(rng, PANEL[lkey]),
  };
}

// ROUND 3. Mid-size copy that is meant to be genuinely READ at a metre. The
// round-2 face had a legible wordmark sitting over a grey smear, and the blind
// critic's sharpest note was that a logo on an otherwise-illegible panel reads
// as MORE artificial than a blank panel would. These two bands sit between the
// display type and the unreadable legal block and fill exactly that hole.
//
// ROUND 15 — SUBDESC / CLAIMS / FLASH ARE GONE AS FLAT POOLS. The bands are
// still there and still the same size; they are now per-class, in CL above.
// The three names are kept only as this note, so the next round does not
// reintroduce a global pool by reaching for a familiar identifier.

// Shelf-tag description lines — caps, abbreviated, the way a real tag prints.
// These stay category-free on purpose: a shelf tag is printed by the STORE, not
// by the manufacturer, and its vocabulary genuinely is this small in real life.
export const TAG_DESC = [
  'ASST VARIETIES', 'FAMILY SIZE', 'SELECTED VAR', 'ALL VARIETIES',
  'REG OR LIGHT', '12 CT PKG', '2 LB BAG', 'LIMIT 4 PLEASE',
];

// ===========================================================================
// ROUND 17 — displayCheck(). THE CHECK THAT OWNS THE DISPLAY-TYPE AXIS.
//
// It is a second check rather than an extension of copyCheck() because it is a
// different question with a different failure mode, and r16's brief is explicit
// that copyCheck() returning [] on RISING CRUST / FISH STICKS is correct
// behaviour for what copyCheck asks. Merging them would have made one of the
// two answers wrong.
//
// What it asserts:
//   1. WELL-FORMEDNESS. Every FLASH_SKU key names a real class; every band text
//      inside it is really in that class's flash pool; every SKU named is
//      really in that class. This is the assertion that makes a table keyed by
//      strings safe — rename a product and this throws instead of unhooking a
//      gate silently.
//   2. LIVENESS, BOTH WAYS. No gate may empty a SKU's flash pool (a product
//      with nothing it can say in display type), and no gate may be
//      unsatisfiable (a band no SKU can ever draw — dead copy that copyCheck's
//      own rule 3 structurally cannot see, because the gate runs after
//      bandsOf()).
//   3. THE GATE ACTUALLY BITES. It counts the (SKU, band) pairs the gate
//      removes. AGENTS_BRIEF: "before quoting a rate, report how many of your
//      rules ever fire." A gate table that removes zero pairs is a table that
//      is not wired up, which is how this project has shipped three checks that
//      passed while the defect was live.
//
// What it does NOT assert, stated plainly because a check that overclaims is
// worse than none: it does not prove the remaining ungated bands are innocent.
// `ungated` in the return value is the exposure, and it is a number so that the
// next round can move it rather than re-derive it.
//
// ROUND 18 adds four numbers, three of which exist because r17's own residual
// hid a live defect for a whole round:
//   `unreviewed` — multi-SKU classes missing from REVIEWED. r17's 87 generic
//      entries were unread, and nothing said so except prose. Now a class
//      added without the sweep is named by the check.
//   `thin`       — SKU x form whose live flash pool is exactly ONE. Liveness
//      fails only at ZERO, so r17 could gate a product down to printing the
//      same flash on 100% of its facings and pass. Nine already exist. This is
//      a PRICE, not a failure, so it is not in `bad` — but it is what decides
//      a marginal gate, and it is why FRENCH ROAST and TRADITIONAL are still
//      generic.
//   `noop`       — gates naming every SKU in their class. They remove nothing
//      while counting toward `gated`, i.e. they flatter coverage. Two exist.
//   and rule 2's FORM half is now actually checked: a gate can name real SKUs
//      of the right class and still be dead if none of them is SOLD in a form
//      the band allows. That was claimed in this header from the start and not
//      implemented. It needs the clInject seam to fire, because no flash band
//      carries an @form today — which is exactly why it was never noticed.
export function displayCheck(inject, clInject, reviewedInject) {
  const bad = [];
  const byCls = new Map();
  for (const r of SKUS) (byCls.get(r[2]) || byCls.set(r[2], []).get(r[2])).push(r);
  const table = inject || FLASH_SKU;
  // ROUND 18 — the CL seam. r17 could inject a table but not a class pool, and
  // the form half of rule 2 (below) is unreachable without one: no flash band
  // carries an @form today, so the only way to prove that check fires is to
  // synthesise a class where one does. A check that cannot be fired in the
  // self-test is what AGENTS_BRIEF means by a guard nobody tested.
  const cl = clInject || CL;
  const reviewed = reviewedInject || REVIEWED;
  let gated = 0, ungated = 0, removedPairs = 0, noop = 0;
  const thin = [];

  for (const cls of Object.keys(table)) {
    const rows = byCls.get(cls);
    if (!rows) { bad.push('FLASH_SKU names class "' + cls + '", which no SKU uses'); continue; }
    const skus = rows.map((r) => r[0]);
    const c = cl[cls];
    if (!c) { bad.push('FLASH_SKU class "' + cls + '" has no CL entry'); continue; }
    const pool = new Map((c.flash || []).map(band).map((e) => [e.text, e]));
    for (const t of Object.keys(table[cls])) {
      const e = pool.get(t);
      if (!e) bad.push(cls + ': gated band "' + t + '" is not in that class\'s flash pool');
      const list = table[cls][t];
      if (!Array.isArray(list) || !list.length) { bad.push(cls + '/' + t + ': gate names no SKU — dead copy'); continue; }
      for (const n of list) {
        if (!skus.includes(n)) bad.push(cls + '/' + t + ': gate names "' + n + '", not a SKU of that class');
      }
      // A gate naming every SKU in its class removes nothing. It is legal and
      // sometimes wanted as documentation, but it counts toward `gated`, so it
      // flatters coverage unless it is also reported on its own.
      if (skus.every((n) => list.includes(n))) noop++;
      // The form half of rule 2. A non-empty list of real SKUs is NOT enough to
      // make a gate satisfiable: gate an @C band to a SKU sold only in P and
      // the band is dead, which is the exact failure rule 3 of copyCheck()
      // exists to catch and structurally cannot see here.
      if (e && e.forms && !rows.some((r) => list.includes(r[0]) && [...r[3]].some((f) => e.forms.includes(f)))) {
        bad.push(cls + '/' + t + ': gate is unsatisfiable — no SKU it names is sold in a form that band allows');
      }
    }
  }
  // liveness + how hard the gate bites, over every SKU x form it is sold in
  for (const row of SKUS) {
    const [desc, , cls, forms] = row;
    const c = cl[cls];
    if (!c || !c.flash) continue;
    for (const form of forms) {
      const pool = c.flash.map(band).filter((e) => !e.forms || e.forms.includes(form));
      let live = 0;
      for (const e of pool) {
        const g = (table[cls] && table[cls][e.text]) || null;
        if (g && !g.includes(desc)) { removedPairs++; continue; }
        live++;
      }
      if (!live) bad.push(desc + '/' + form + ': the SKU gate removed EVERY flash band — nothing can be printed in display type');
      // ROUND 18 — THE COST OF GATING, WHICH r17 COULD NOT SEE. Liveness only
      // fails at ZERO, so a gate that leaves a SKU exactly one band passes
      // while making that product print the same flash on 100% of its facings.
      // That is not a contradiction and is NOT in `bad` — it is a price, and
      // it is reported because it is what decides the marginal gate. FRENCH
      // ROAST and TRADITIONAL were both left generic on this number alone.
      else if (live === 1) thin.push(desc + '/' + form);
    }
  }
  const unreviewed = [];
  for (const cls of Object.keys(cl)) {
    const skus = byCls.get(cls) || [];
    if (skus.length < 2) continue;                 // single-SKU class cannot contradict
    if (!reviewed.has(cls)) unreviewed.push(cls);
    for (const e of (cl[cls].flash || []).map(band)) {
      if (table[cls] && table[cls][e.text]) gated++; else ungated++;
    }
  }
  return {
    bad, gated, ungated, removedPairs, noop, thin, unreviewed,
    multiSkuClasses: [...byCls.values()].filter((v) => v.length > 1).length,
  };
}

// Proof it fires, in both directions. AGENTS_BRIEF: "test a new guard in both
// directions against the real tree — it must fire on a synthetic break AND stay
// silent on a healthy build."
export function displayCheckSelfTest() {
  const out = [];
  const real = displayCheck();
  out.push(['healthy tree is silent', real.bad.length === 0, real.bad.slice(0, 2).join(' | ')]);
  out.push(['the gate actually removes pairs', real.removedPairs > 0, 'removed ' + real.removedPairs]);
  const hit = (label, inj, want) => {
    const r = displayCheck(inj);
    const ok = r.bad.some((s) => s.includes(want));
    out.push([label, ok, r.bad.find((s) => s.includes(want)) || '(silent) ' + r.bad.slice(0, 1)]);
    return ok;
  };
  const clone = () => JSON.parse(JSON.stringify(FLASH_SKU));
  let inj = clone(); inj.notAClass = { X: ['Y'] };
  hit('a gate on a class that does not exist', inj, 'which no SKU uses');
  inj = clone(); inj.pasta['NOT A BAND'] = ['LASAGNA'];
  hit('a gate on a band text not in the pool', inj, 'is not in that class');
  inj = clone(); inj.pasta['NO BOIL'] = ['PEPPERONI PIZZA'];
  hit('a gate naming a SKU from another class', inj, 'not a SKU of that class');
  inj = clone(); inj.pasta['NO BOIL'] = [];
  hit('a gate that names no SKU', inj, 'dead copy');
  // and the liveness direction: gate every flash in a class to one SKU, and
  // every OTHER SKU in it loses its display type entirely.
  inj = clone(); inj.cookie = {};
  for (const t of ['ORIGINAL', 'DOUBLE STUFFED', 'FUDGE DIPPED', 'FAMILY SIZE', 'REDUCED FAT']) {
    inj.cookie[t] = ['GRAHAM WAFERS'];
  }
  hit('a gate that empties a SKU display pool', inj, 'removed EVERY flash band');

  // ROUND 18 — the four things this check learned to say, each fired.
  //
  // (1) THE FORM HALF OF LIVENESS. A gate can name real SKUs of the right
  // class and still be dead, if none of them is SOLD in a form the band
  // allows. No flash band carries an @form today, so this is unreachable
  // against the real CL — it needs the clInject seam, which is the whole
  // reason that seam exists.
  const clClone = JSON.parse(JSON.stringify(CL));
  clClone.pasta.flash = clClone.pasta.flash.map((e) => (e === 'NO BOIL' ? ['NO BOIL', '@P'] : e));
  out.push(['a gate no SKU it names is sold in the right form for',
    displayCheck(null, clClone).bad.some((s) => s.includes('unsatisfiable')),
    'LASAGNA is C-only; the band was made P-only']);
  out.push(['...and that is NOT reported against the real class table',
    real.bad.length === 0, real.bad.slice(0, 1).join('')]);

  // (2) THIN POOLS, which are a PRICE and not a failure — so this fires `thin`
  // while leaving `bad` empty. Three of BUTTER CRACKERS' four generic bands
  // gated away leaves it exactly one, which liveness (fails only at zero)
  // cannot see.
  inj = clone();
  for (const t of ['SEA SALT', 'WHOLE GRAIN', 'REDUCED FAT']) {
    inj.cracker[t] = ['SALTINE CRACKERS', 'SANDWICH CRACKERS', 'CHEESE CRACKERS'];
  }
  const t1 = displayCheck(inj);
  out.push(['a gate that leaves a SKU ONE band is reported as thin, not as bad',
    t1.thin.includes('BUTTER CRACKERS/C') && t1.bad.length === 0,
    'thin ' + t1.thin.length + ', bad ' + t1.bad.length]);

  // (3) A NO-OP GATE — one that names every SKU in its class — is counted
  // apart from `gated`, because it removes nothing while reading as coverage.
  inj = clone(); inj.soup.CONDENSED = ['CHICKEN NOODLE'];
  out.push(['a gate naming every SKU of its class is counted as a no-op',
    displayCheck(inj).noop === real.noop - 1, 'real ' + real.noop]);

  // (4) THE SWEEP ITSELF. With an empty REVIEWED set every multi-SKU class is
  // reported unreviewed; with the real one, none is.
  const none = displayCheck(null, null, new Set());
  out.push(['an unswept multi-SKU class is named',
    none.unreviewed.length === real.multiSkuClasses, none.unreviewed.length + ' of ' + real.multiSkuClasses]);
  out.push(['every multi-SKU class in the real tree has been swept',
    real.unreviewed.length === 0, real.unreviewed.join(', ')]);
  return out;
}
