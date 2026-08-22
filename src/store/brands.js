// OWNER: builder-store. Invented grocery brands + the copy that goes on a package.
//
// Round-2 finding: the single most identifying property of a real grocery aisle
// is that it is a WALL OF SMALL HIGH-CONTRAST LETTERING. Flat colour fields with
// grey bars have the wrong spatial frequency. So every facing now carries real
// glyphs drawn with fillText, and the words come from here.
//
// Everything is invented. No real trademarks.

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

// --- product descriptors, grouped so a department reads coherently ----------
export const DESC = {
  bakery: [
    'ALL PURPOSE FLOUR', 'PURE CANE SUGAR', 'BROWN SUGAR', 'BAKING SODA',
    'YELLOW CAKE MIX', 'BROWNIE MIX', 'PANCAKE MIX', 'CORN MUFFIN MIX',
    'GRAHAM WAFERS', 'FUDGE STRIPE COOKIES', 'SANDWICH CREMES', 'VANILLA WAFERS',
    'POWDERED SUGAR', 'CHOCOLATE CHIPS', 'SANDWICH BREAD', 'HAMBURGER BUNS',
  ],
  canned: [
    'WHOLE KERNEL CORN', 'CUT GREEN BEANS', 'SWEET PEAS', 'DICED TOMATOES',
    'TOMATO PASTE', 'CHICKEN NOODLE', 'CREAM OF MUSHROOM', 'TOMATO SOUP',
    'PORK & BEANS', 'KIDNEY BEANS', 'SLICED PEACHES', 'MANDARIN ORANGES',
    'CHUNK LIGHT TUNA', 'BEEF BROTH', 'SLICED CARROTS', 'FRUIT COCKTAIL',
  ],
  pasta: [
    'ELBOW MACARONI', 'THIN SPAGHETTI', 'PENNE RIGATE', 'EGG NOODLES',
    'MARINARA SAUCE', 'ALFREDO SAUCE', 'LONG GRAIN RICE', 'INSTANT RICE',
    'REFRIED BEANS', 'TACO SHELLS', 'SALSA VERDE', 'SOY SAUCE',
    'LASAGNA', 'RICE PILAF', 'BLACK BEANS', 'CHILI BEANS',
  ],
  snacks: [
    'KETTLE CHIPS', 'TORTILLA ROUNDS', 'PRETZEL TWISTS', 'CHEESE PUFFS',
    'ROASTED PEANUTS', 'MIXED NUTS', 'BUTTER CRACKERS', 'SALTINE CRACKERS',
    'SANDWICH CRACKERS', 'CARAMEL POPCORN', 'FRUIT CHEWS', 'GUMMI BEARS',
    'MILK CHOCOLATE BARS', 'TRAIL MIX', 'BEEF STICKS', 'CHEESE CRACKERS',
  ],
  soda: [
    'COLA', 'DIET COLA', 'LEMON LIME SODA', 'ROOT BEER',
    'ORANGE SODA', 'GINGER ALE', 'SPRING WATER', 'SPARKLING WATER',
    'FRUIT PUNCH', 'ORANGE JUICE', 'APPLE JUICE', 'LEMON ICED TEA',
    'SPORTS DRINK', 'ENERGY DRINK', 'GRAPE SODA', 'CLUB SODA',
  ],
  breakfast: [
    'TOASTED OAT SQUARES', 'HONEY BRAN FLAKES', 'CORN FLAKES', 'CRISP RICE',
    'FROSTED WHEAT', 'RAISIN BRAN', 'GRANOLA CLUSTERS', 'INSTANT OATMEAL',
    'GROUND COFFEE', 'INSTANT COFFEE', 'ORANGE PEKOE TEA', 'HERBAL TEA',
    'MAPLE SYRUP', 'GRAPE JELLY', 'PEANUT BUTTER', 'STRAWBERRY PRESERVES',
  ],
  paper: [
    'PAPER TOWELS', 'BATH TISSUE', 'FACIAL TISSUE', 'NAPKINS',
    'LAUNDRY DETERGENT', 'FABRIC SOFTENER', 'DISH SOAP', 'DISHWASHER PACS',
    'ALL PURPOSE CLEANER', 'GLASS CLEANER', 'BLEACH', 'DISINFECTING WIPES',
    'TALL KITCHEN BAGS', 'FOOD STORAGE BAGS', 'ALUMINUM FOIL', 'PLASTIC WRAP',
  ],
  health: [
    'PAIN RELIEVER', 'ANTACID TABLETS', 'COUGH SYRUP', 'ALLERGY RELIEF',
    'MULTIVITAMIN', 'VITAMIN C 500MG', 'CALCIUM + D3', 'FISH OIL',
    'SHAMPOO', 'CONDITIONER', 'BODY WASH', 'BAR SOAP',
    'TOOTHPASTE', 'MOUTHWASH', 'BABY WIPES', 'DIAPERS SIZE 3',
  ],
  frozen: [
    'GARDEN PEAS', 'BROCCOLI FLORETS', 'STIR FRY BLEND', 'FRENCH FRIES',
    'PEPPERONI PIZZA', 'CHICKEN TENDERS', 'FISH STICKS', 'WAFFLES',
    'VANILLA ICE CREAM', 'FUDGE BARS', 'MIXED BERRIES', 'CORN ON THE COB',
  ],
};

// A flavour flash — the band that changes between varieties of one brand.
export const FLASH = [
  'ORIGINAL', 'HONEY', 'CINNAMON', 'SEA SALT', 'EXTRA CRISPY', 'LOW SODIUM',
  'FAMILY SIZE', 'VALUE PACK', 'WHOLE GRAIN', 'NO SUGAR ADDED', 'MILD',
  'MEDIUM', 'HOT', 'UNSALTED', 'LIGHTLY SALTED', 'DOUBLE STUFFED',
  'REDUCED FAT', 'ORGANIC', 'THICK CUT', 'CLASSIC', 'HOMESTYLE', 'SHARP',
];

export const BURST = ['NEW!', 'SALE', '25% MORE', 'SAVE 50¢', 'TRY IT!', '2 FOR $5', 'BONUS'];

export const NUTRI = [
  ['140', 'CALORIES'], ['0g', 'TRANS FAT'], ['12g', 'PROTEIN'], ['3g', 'FIBER'],
  ['100%', 'WHOLE GRAIN'], ['0g', 'ADDED SUGAR'], ['5g', 'FIBER'], ['90', 'CALORIES'],
];

export const WEIGHTS = [
  'NET WT 12 OZ (340g)', 'NET WT 16 OZ (453g)', 'NET WT 8 OZ (227g)',
  'NET WT 10.5 OZ (298g)', 'NET WT 6 OZ (170g)', 'NET WT 14.5 OZ (411g)',
  'NET WT 18 OZ (510g)', 'NET WT 1 LB 4 OZ (567g)', '2 QT (1.89 L)',
  '64 FL OZ (1.89 L)', '20 FL OZ (591 mL)', 'NET WT 32 OZ (907g)',
];

// Tiny legal type. Never read at display size — its job is to produce the
// dense luminance noise that a photograph of a package has and a flat fill
// does not. Kept plausible so it survives a close crop.
export const LEGAL = [
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
];

export const PANEL_HEAD = ['NUTRITION FACTS', 'INGREDIENTS', 'DIRECTIONS', 'NUTRITION'];

// Shelf-tag description lines — caps, abbreviated, the way a real tag prints.
export const TAG_DESC = [
  'ASST VARIETIES', 'FAMILY SIZE', 'SELECTED VAR', 'ALL VARIETIES',
  'REG OR LIGHT', '12 CT PKG', '2 LB BAG', 'LIMIT 4 PLEASE',
];
