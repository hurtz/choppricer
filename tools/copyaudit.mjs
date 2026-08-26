// OWNER: builder-store (r16). An INDEPENDENT auditor for package copy.
//
// WHY IT IS A SEPARATE FILE AND SHARES NOTHING WITH brands.js
// r16 fixes the copy contradictions with a tag/conflict system that lives in
// brands.js. If the pass/fail number were computed from those same tags the
// round would be grading its own homework: any coupling I failed to think of
// would be invisible to both the fix AND the measurement, and the report would
// read 0.0% while the shelf still said CRUNCHY GRAPE JELLY.
//
// So every rule below is LEXICAL. It looks at the six emitted strings and the
// product noun, and knows nothing about classes, tags or conflict pairs. It can
// therefore disagree with brands.js, and when it does, brands.js is wrong.
//
// The rule set is written from the round-15 critic's reported emissions plus
// the same reading applied to the rest of the table. Rules are deliberately
// CONSERVATIVE: each one fires only on a pairing a shopper would visibly stop
// at, because a rate inflated by debatable calls is not usable as a target.
//
//   node tools/copyaudit.mjs            # sample 200k draws, print the rate
//   node tools/copyaudit.mjs 500000     # more draws
//   node tools/copyaudit.mjs --exhaust  # every emittable tuple, not a sample

import { copyFor, SKUS, DESC, copyCheck, copyCheckSelfTest, copyStats } from '../src/store/brands.js';

// --- product predicates, by noun. Independent of any table in brands.js. ----
const is = (re) => (t) => re.test(t.desc);

// \b again, and the same bug again: /OIL/ matched the "OIL" inside ALUMINUM
// F-OIL, so a 120 COUNT roll of foil was reported as "a tablet count on a
// liquid". Third substring false positive found in this file; the lesson is
// that a lexical auditor over a 140-noun vocabulary needs word boundaries
// everywhere, not where you happen to think of them.
const LIQUID = /\b(SYRUP|MOUTHWASH|SOAP|SAUCE|BLEACH|COLA|SODA|WATER|JUICE|TEA|DRINK|MILK|DETERGENT|SOFTENER|CLEANER|SHAMPOO|CONDITIONER|BODY WASH|OIL|ALE|PUNCH|BEER)\b/;
const DRY_SOLID = /FLOUR|SUGAR|MIX|CEREAL|FLAKES|SQUARES|WHEAT|BRAN|RICE|PASTA|MACARONI|SPAGHETTI|PENNE|NOODLES|LASAGNA|CRACKER|COOKIE|WAFER|CREMES|CHIPS|PRETZEL|PUFFS|POPCORN|PEANUTS|NUTS|TRAIL MIX|CANDY|CHEWS|GUMMI|CHOCOLATE BARS|BREAD|BUNS|SHELLS|OATMEAL|COFFEE|CLUSTERS|BAKING SODA/;
const TABLET  = /TABLET|CAPLET|PACS|VITAMIN|CALCIUM|FISH OIL|ANTACID|ALLERGY|PAIN RELIEVER/;
const PAPER   = /TOWEL|NAPKIN|TISSUE|WIPES|FOIL|WRAP|BAGS/;
// WORD BOUNDARIES, AND THIS IS AN INSTRUMENT BUG WORTH RECORDING.
// The first pass of these two ran without \b, so /COLA/ matched the "COLA" inside
// CHO-COLA-TE and /SODA/ matched BAKING SODA. form.netwt-on-drink duly reported
// 0.99% of all facings as "a net WEIGHT on a bottled drink", every one of them a
// chocolate bar, a bag of chocolate chips or a box of bicarbonate. Two of the
// eleven surviving rule hits after the r16 copy fix were this, not the table.
const BOTTLED = /\b(COLA|SODA|WATER|JUICE|PUNCH|ICED TEA|SPORTS DRINK|ENERGY DRINK|ALE|BEER|SYRUP|MOUTHWASH|SHAMPOO|CONDITIONER|BODY WASH|DISH SOAP|CLEANER|BLEACH|DETERGENT|SOFTENER)\b/;
const isDrink = (d) => !/BAKING SODA/.test(d)
  && /\b(COLA|SODA|WATER|JUICE|PUNCH|ICED TEA|SPORTS DRINK|ENERGY DRINK|ALE|BEER)\b/.test(d);

const R = [];
const rule = (id, why, test) => R.push({ id, why, test });

// ---- 1. PACKAGE FORM vs the words on it -----------------------------------
rule('form.caplet-on-liquid', 'caplet/tablet language on a liquid product',
  (t) => LIQUID.test(t.desc) && !TABLET.test(t.desc)
    && /CAPLET|TABLET|SOFTGEL|EASY TO SWALLOW|RAPID RELEASE|\d+ COUNT\b/.test(t.mkt));
rule('form.count-on-liquid', 'a tablet count as the net contents of a liquid',
  (t) => LIQUID.test(t.desc) && !TABLET.test(t.desc)
    && /^\d+\s*(COUNT|TABLETS|CAPLETS|SOFTGELS)/.test(t.wt));
rule('form.floz-on-dry', 'a fluid measure as the net contents of a dry solid',
  (t) => DRY_SOLID.test(t.desc) && !LIQUID.test(t.desc) && /FL OZ|LITER|\bL\)|GAL/.test(t.wt));
rule('form.netwt-on-drink', 'a net WEIGHT as the contents of a bottled drink',
  (t) => isDrink(t.desc) && /NET WT/.test(t.wt));
rule('form.slices-on-nonloaf', 'a per-loaf slice count on something that is not a loaf',
  (t) => !/SANDWICH BREAD|LOAF/.test(t.desc) && /SLICES PER LOAF/.test(t.mkt));
rule('form.sheets-on-nonpaper', 'a sheet/roll/ply count on something that is not paper',
  (t) => !PAPER.test(t.desc) && /SHEETS|BIG ROLLS|DOUBLE ROLLS|MEGA ROLLS|\bPLY\b/.test(t.mkt));
rule('form.paper-needs-count', 'a net weight in grams on a paper good sold by count',
  (t) => PAPER.test(t.desc) && /NET WT/.test(t.wt));
rule('form.deposit-on-nonbottle', 'a container-deposit or bottle-recycling line off a bottle',
  (t) => !BOTTLED.test(t.desc) && /CASH REFUND|PLUS DEPOSIT|RECYCLE THE (EMPTY )?BOTTLE|CONTOUR BOTTLE|ON THE NECK|SPORT CAP/.test(t.mkt));
rule('form.pour-spout-on-rigid', 'a resealable pour spout on a rigid can or tub',
  (t) => t.form === 'N' && /POUR SPOUT|RESEALABLE STAY-FRESH POUCH/.test(t.mkt));
rule('form.bag-in-box', 'microwave-in-the-pouch language on a rigid carton',
  (t) => t.form === 'C' && /RIGHT IN THE POUCH|STEAM IN BAG/.test(t.mkt));

// ---- 2. NUTRIENT CLAIMS vs the food ---------------------------------------
rule('nutr.protein-off-protein', 'a protein claim on a product with no meaningful protein',
  (t) => /JELLY|PRESERVES|SYRUP|SUGAR|SODA|COLA|WATER|JUICE|ALE|PUNCH|CANDY|CHEWS|GUMMI|OIL|TEA|COFFEE|FRUIT|PEACHES|ORANGES/.test(t.desc)
    && /PROTEIN/.test(t.mkt));
rule('nutr.wholegrain-off-grain', 'a whole-grain claim on something with no grain in it',
  (t) => /SUGAR|JELLY|PRESERVES|SYRUP|OIL$|SODA|COLA|WATER|JUICE|PEACHES|ORANGES|TUNA|COFFEE|TEA|CANDY|CHEWS|GUMMI|ICE CREAM|SOAP|DETERGENT/.test(t.desc)
    && /WHOLE GRAIN|ENRICHED WITH IRON|\d+g\s*FIBER|SOURCE OF FIBER/.test(t.mkt));
rule('nutr.juice-off-juice', 'a 100% JUICE / fruit-serving roundel on a non-juice',
  (t) => !/JUICE|PUNCH|FRUIT COCKTAIL|PEACHES|ORANGES|BERRIES|JELLY|PRESERVES|MARMALADE/.test(t.desc)
    && /100%\s*JUICE|1\/2 CUP FRUIT|CUP OF FRUIT/.test(t.mkt));
rule('nutr.veg-off-veg', 'a vegetable-serving roundel on a non-vegetable',
  (t) => !/CORN|BEANS|PEAS|CARROTS|TOMATO|BROCCOLI|STIR FRY|VEG|MARINARA|PASTA SAUCE|SALSA/.test(t.desc)
    && /CUP VEGETABLES|CUP OF VEGETABLES|HALF A CUP OF VEGETABLES/.test(t.mkt));
rule('nutr.zerosugar-vs-calories', 'a zero-sugar / diet flash against a positive calorie count',
  (t) => /ZERO SUGAR|\bDIET\b(?! COLA)|NO SUGAR ADDED|UNSWEETENED|SUGAR FREE|0g ADDED SUGAR/.test(t.mkt)
    && /\b([1-9]\d{1,3})\s*CALORIES/.test(t.mkt));
rule('nutr.zerosugar-vs-cane', 'a zero-sugar claim against a real-sugar claim',
  (t) => /ZERO SUGAR|SUGAR FREE|NO SUGAR ADDED|UNSWEETENED/.test(t.mkt)
    && /REAL CANE SUGAR|PURE CANE SUGAR/.test(t.mkt));
rule('nutr.caffeine-free-vs-caffeine', 'a caffeine-free flash against a caffeine declaration',
  (t) => /CAFFEINE FREE|DECAF/.test(t.mkt) && /\d+\s*MG CAFFEINE|CONTAINS CAFFEINE/.test(t.mkt));
rule('nutr.caffeine-on-acaffeinated', 'a caffeine declaration on a product that has none',
  (t) => /WATER|JUICE|PUNCH|HERBAL/.test(t.desc) && /MG CAFFEINE/.test(t.mkt));
rule('nutr.calories-on-nonfood', 'a calorie or nutrient roundel on a non-food',
  (t) => !t.food && /CALORIES|TRANS FAT|\d+g\s*PROTEIN|\d+g\s*FIBER|SOURCE OF FIBER|WHOLE GRAIN|CUP VEGETABLES|100%\s*JUICE/.test(t.mkt));
rule('nutr.nutrition-panel-on-nonfood', 'a NUTRITION FACTS heading on a non-food',
  (t) => !t.food && /NUTRITION/.test(t.panel || ''));

// ---- 3. THE SMALL PRINT vs the product ------------------------------------
rule('legal.hair-on-oral', 'a hair-care ingredient list / directions on an oral-care product',
  (t) => /TOOTHPASTE|MOUTHWASH/.test(t.desc) && /WET HAIR|LATHER|SODIUM LAURETH/.test(t.legal));
rule('legal.hair-on-skin', 'apply-to-wet-hair directions on a product that is not for hair',
  (t) => /BAR SOAP|BODY WASH|WIPES|DIAPERS|TOOTHPASTE|MOUTHWASH/.test(t.desc)
    && /APPLY TO WET HAIR/.test(t.legal));
rule('legal.food-panel-on-nonfood', 'a food ingredients panel on a non-food',
  (t) => !t.food && /ENRICHED WHEAT FLOUR|PERCENT DAILY VALUES|CONTAINS WHEAT AND SOY/.test(t.legal));
rule('legal.drug-panel-on-food', 'a Drug Facts / acetaminophen panel on a food',
  (t) => t.food && /ACETAMINOPHEN|DRUG FACTS|PAIN RELIEVER \/ FEVER/.test(t.all));
rule('legal.wheat-on-singleingredient', 'an enriched-wheat-flour ingredient list on a single-ingredient product',
  (t) => /PURE CANE SUGAR|BROWN SUGAR|POWDERED SUGAR|SPRING WATER|SPARKLING WATER|GROUND COFFEE|INSTANT COFFEE|ALUMINUM FOIL|OLIVE OIL|FISH OIL/.test(t.desc)
    && /ENRICHED WHEAT FLOUR/.test(t.legal));
rule('legal.canned-on-drybox', 'do-not-use-if-the-can-is-dented on something with no can',
  (t) => t.form !== 'N' && /CAN IS DENTED|END OF CAN/.test(t.all));
rule('legal.chem-on-food', 'a household-chemical warning on a food',
  (t) => t.food && /DO NOT MIX WITH OTHER|AMMONIA|UNSEALED WOOD|HARMFUL IF SWALLOWED/.test(t.all));
rule('legal.septic-on-towel', 'septic-safe / flushability language on paper towels or napkins',
  (t) => /TOWEL|NAPKIN/.test(t.desc)
    && /SEPTIC SAFE|BREAKS DOWN AFTER FLUSHING|FLUSHABLE|SAFE FOR SEPTIC/.test(t.all));
rule('legal.external-on-food', 'for-external-use-only on something edible',
  (t) => t.food && /FOR EXTERNAL USE ONLY|DO NOT SWALLOW|NOT TESTED ON ANIMALS/.test(t.all));

// ---- 4. FLAVOUR / VARIETY FLASH vs the product -----------------------------
rule('flash.texture-on-jam', 'a nut-butter texture flash on a jelly, preserve or syrup',
  (t) => /JELLY|PRESERVES|SYRUP/.test(t.desc) && /CRUNCHY|CREAMY|EXTRA CRUNCH|CHUNKY/.test(t.mkt));
rule('flash.nutty-on-jam', 'a peanut claim on a fruit spread',
  (t) => /JELLY|PRESERVES|SYRUP/.test(t.desc) && /PEANUT|NUT/.test(t.flash + ' ' + t.sub));
rule('flash.stir-on-jelly', 'stir-before-serving separation language on a set jelly',
  (t) => /JELLY/.test(t.desc) && /STIR BEFORE/.test(t.mkt));
rule('flash.hair-on-nonhair', 'a hair flash on something that is not for hair',
  (t) => !/SHAMPOO|CONDITIONER/.test(t.desc)
    && /VOLUMIZING|FOR DRY HAIR|2 IN 1|DETANGL/.test(t.mkt));
rule('flash.baking-on-nonbaking', 'a milling / sifting flash on something that is not a milled staple',
  (t) => !/FLOUR|MIX|CORNMEAL/.test(t.desc) && /PRE-SIFTED|UNBLEACHED|NO BLEACHING|MILLED FOR/.test(t.mkt));
rule('flash.seeded-on-nonbread', 'a bread-crust flash on something that is not bread',
  (t) => !/BREAD|BUNS|ROLLS|BAGEL/.test(t.desc) && /SEEDED|20 SLICES|SOFT CRUST/.test(t.mkt));
rule('flash.roast-on-nonroast', 'a coffee roast flash on something that is not coffee',
  (t) => !/COFFEE/.test(t.desc) && /MEDIUM ROAST|DARK ROAST|FRENCH ROAST|BREAKFAST BLEND|ARABICA|AUTO DRIP/.test(t.mkt));
rule('flash.steep-on-nontea', 'a tea steeping / pekoe flash on something that is not tea',
  (t) => !/TEA/.test(t.desc) && /ORANGE PEKOE|EARL GREY|STEEP \d|CHAMOMILE|FOIL WRAPPED/.test(t.mkt));
rule('flash.mild-on-nonsavoury', 'a heat-level flash on something with no heat scale',
  (t) => !/SALSA|SAUCE|CHILI|TACO|PEPPER|BEANS|VERDE|STICKS|JERKY|WINGS/.test(t.desc) && /^(MILD|HOT|MEDIUM HEAT)$/.test(t.flash));
rule('flash.diaper-size-on-nondiaper', 'a diaper size band on something that is not a diaper',
  (t) => !/DIAPER/.test(t.desc) && /SIZE \d+\s*·?\s*\d+-\d+ LB|OVERNIGHT/.test(t.mkt));
rule('flash.frozen-on-ambient', 'keep-frozen language on an ambient shelf-stable product',
  (t) => !/FROZEN|ICE CREAM|PIZZA|FRIES|WAFFLES|TENDERS|FISH STICKS|PEAS|BROCCOLI|BERRIES|STIR FRY|CORN ON THE COB|FUDGE BARS/.test(t.desc)
    && /KEEP FROZEN|DO NOT REFREEZE|FLASH FROZEN|BAKE FROM FROZEN/.test(t.mkt));
rule('flash.laundry-on-nonlaundry', 'a wash-load claim on something that is not a laundry product',
  (t) => !/DETERGENT|SOFTENER|BLEACH/.test(t.desc) && /LOADS PER BOTTLE|\d+ LOADS|HE COMPATIBLE|PER LOAD/.test(t.mkt));
rule('flash.germ-on-nondisinfectant', 'a germ-kill claim on something that does not disinfect',
  (t) => !/CLEANER|BLEACH|WIPES|DISH SOAP|DISINFECT/.test(t.desc) && /99\.9% OF|KILLS 99/.test(t.mkt));

// ---- 5. INTERNAL CONSISTENCY of the emitted tuple --------------------------
rule('self.wt-vs-claim-count', 'the weight band and the claim band state different counts',
  (t) => {
    const a = t.wt.match(/(\d+)\s*(COUNT|TABLETS|CAPLETS|SOFTGELS|SHEETS|WIPES|BAGS|TEA BAGS|PACKETS)/);
    const b = t.claim.match(/(\d+)\s*(COUNT|TABLETS|CAPLETS|SOFTGELS|SHEETS|WIPES|BAGS|TEA BAGS|PACKETS)/);
    return !!(a && b && a[2] === b[2] && a[1] !== b[1]);
  });
rule('self.badge-vs-claim-protein', 'the roundel and the claim state different protein figures',
  (t) => {
    const a = t.mkt.match(/(\d+)g\s*PROTEIN/g);
    return !!(a && new Set(a).size > 1);
  });
rule('self.two-panels', 'a drug-facts heading over a nutrition ingredient list, or the reverse',
  (t) => (/DRUG FACTS/.test(t.panel || '') && !/ACETAMINOPHEN|ACTIVE INGREDIENT/.test(t.legal))
      || (/NUTRITION/.test(t.panel || '') && /ACTIVE INGREDIENT|ALKYL DIMETHYL/.test(t.legal)));

// ---------------------------------------------------------------------------
export function auditTuple(cp, form) {
  const t = {
    desc: cp.desc, flash: cp.flash, sub: cp.sub, claim: cp.claim, wt: cp.wt,
    panel: cp.panel, food: cp.food, form,
    badge: cp.badge ? cp.badge.join(' ') : '',
    legal: (cp.legal || []).join(' '),
  };
  // THE BOILERPLATE IS NOT A MARKETING CLAIM. First pass of this auditor read
  // 58.7% and two of its top three rules were false: 'DIET' matched "2,000
  // CALORIE DIET" in the food legal block, and 'FIBER' matched "RESPONSIBLY
  // SOURCED FIBER" on a roll of paper towels. A rule about what the package
  // CLAIMS must read the bands the package claims in. t.all is kept for the
  // legal.* rules, which are the only ones entitled to it.
  t.mkt = [t.flash, t.sub, t.claim, t.wt, t.badge, t.panel].join(' · ');
  t.all = [t.mkt, t.legal].join(' · ');
  const hits = [];
  for (const r of R) { try { if (r.test(t)) hits.push(r.id); } catch { /* rule bug */ } }
  return hits;
}
export const RULE_COUNT = R.length;

// --- driver -----------------------------------------------------------------
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (import.meta.url === `file://${process.argv[1]}` && !process.argv.includes('--selftest')) {
  const args = process.argv.slice(2);
  const N = Number(args.find((a) => /^\d+$/.test(a))) || 200000;
  const depts = Object.keys(DESC);
  const forms = ['C', 'P', 'N', 'B'];
  const byRule = new Map(); let bad = 0; const examples = new Map();
  const rng = mulberry(0x5EED16);
  for (let i = 0; i < N; i++) {
    const dept = depts[(rng() * depts.length) | 0];
    const form = forms[(rng() * 4) | 0];
    const cp = copyFor(rng, dept, form);
    const hits = auditTuple(cp, form);
    if (hits.length) {
      bad++;
      for (const h of hits) {
        byRule.set(h, (byRule.get(h) || 0) + 1);
        if (!examples.has(h)) {
          examples.set(h, [cp.desc, cp.flash, cp.sub, cp.claim, cp.wt,
            cp.badge ? cp.badge.join(' ') : '—'].join(' · '));
        }
      }
    }
  }
  // Run the table's OWN check in its deep form first, and its self-test, so a
  // run of this tool exercises both instruments and they can disagree in public.
  const deep = copyCheck(null, true);
  console.log(`brands.js copyCheck(deep) ${deep.length ? deep.length + ' ISSUES' : 'clean'}`);
  deep.slice(0, 5).forEach((m) => console.log('    ' + m));
  const st = copyCheckSelfTest();
  console.log(`brands.js copyCheck selftest ${st.ok ? 'ok' : 'FAILED'}`);
  st.log.forEach((l) => console.log('    ' + l));
  console.log(`  ${JSON.stringify(copyStats())}`);
  console.log('');
  console.log(`rules declared           ${RULE_COUNT}`);
  console.log(`draws                    ${N}`);
  console.log(`facings with >=1 contradiction  ${bad}  (${(100 * bad / N).toFixed(2)}%)`);
  console.log('');
  const rows = [...byRule.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, n] of rows) {
    console.log(`  ${(100 * n / N).toFixed(3).padStart(7)}%  ${id.padEnd(32)} ${examples.get(id)}`);
  }
  const silent = R.filter((r) => !byRule.has(r.id)).map((r) => r.id);
  console.log(`\nrules that never fired   ${silent.length}/${RULE_COUNT}`);
  if (silent.length) console.log('  ' + silent.join('\n  '));
}

// ---------------------------------------------------------------------------
// SELF-TEST — a rule that has never fired is not evidence of correctness.
// AGENTS_BRIEF: "it must fire on a synthetic break AND stay silent on a healthy
// build." 20 of these 45 stayed silent on the r15 tree, which is the good
// direction and tells you nothing about whether they work. Each entry below is
// a hand-built tuple that the named rule MUST catch, plus a clean tuple every
// rule must ignore. Run: node tools/copyaudit.mjs --selftest
const T = (o) => ({
  desc: 'BUTTER CRACKERS', flash: 'ORIGINAL', sub: 'BAKED NOT FRIED',
  claim: 'ABOUT 8 SERVINGS PER BOX', wt: 'NET WT 12 OZ (340g)', panel: 'INGREDIENTS',
  food: true, badge: ['3g', 'FIBER'], legal: LEGALISH.food, ...o,
});
const LEGALISH = {
  food: ['INGREDIENTS: ENRICHED WHEAT FLOUR (NIACIN, REDUCED IRON, THIAMIN',
    'PERCENT DAILY VALUES ARE BASED ON A 2,000 CALORIE DIET. YOUR'],
  care: ['DIRECTIONS: APPLY TO WET HAIR. LATHER. RINSE. REPEAT IF DESIRED.',
    'INGREDIENTS: WATER, SODIUM LAURETH SULFATE, COCAMIDOPROPYL'],
  clean: ['DO NOT MIX WITH OTHER HOUSEHOLD CHEMICALS OR AMMONIA PRODUCTS.'],
  drug: ['ACTIVE INGREDIENT (IN EACH CAPLET): ACETAMINOPHEN 500 MG.'],
  wet: ['DO NOT USE IF SEAL IS BROKEN OR CAN IS DENTED OR BULGING.'],
  paper: ['SEPTIC SAFE. BREAKS DOWN AFTER FLUSHING. NOT A FLUSHABLE WIPE.'],
};
const CASES = {
  'form.caplet-on-liquid':        [T({ desc: 'COUGH SYRUP', flash: 'RAPID RELEASE' }), 'B'],
  'form.count-on-liquid':         [T({ desc: 'COUGH SYRUP', wt: '100 COUNT' }), 'B'],
  'form.floz-on-dry':             [T({ desc: 'KETTLE CHIPS', wt: '2 LITER (67.6 FL OZ)' }), 'P'],
  'form.netwt-on-drink':          [T({ desc: 'ORANGE SODA', wt: 'NET WT 15 OZ (425g)' }), 'B'],
  'form.slices-on-nonloaf':       [T({ desc: 'HAMBURGER BUNS', claim: '20 SLICES PER LOAF' }), 'P'],
  'form.sheets-on-nonpaper':      [T({ desc: 'TOMATO SOUP', wt: '8 MEGA ROLLS' }), 'N'],
  'form.paper-needs-count':       [T({ desc: 'PAPER TOWELS', food: false, wt: 'NET WT 12 OZ (340g)' }), 'C'],
  'form.pour-spout-on-rigid':     [T({ desc: 'SWEET PEAS', sub: 'RESEALABLE POUR SPOUT', formName: 'CAN' }), 'N'],
  'form.bag-in-box':              [T({ desc: 'FISH STICKS', sub: 'MICROWAVE RIGHT IN THE POUCH' }), 'C'],
  'form.deposit-on-nonbottle':    [T({ desc: 'CORN FLAKES', claim: 'CA CASH REFUND' }), 'C'],
  'nutr.protein-off-protein':     [T({ desc: 'GRAPE JELLY', claim: '7g PROTEIN PER SERVING' }), 'N'],
  'nutr.wholegrain-off-grain':    [T({ desc: 'PURE CANE SUGAR', badge: ['100%', 'WHOLE GRAIN'] }), 'P'],
  'nutr.juice-off-juice':         [T({ desc: 'BAR SOAP', food: false, badge: ['100%', 'JUICE'] }), 'C'],
  'nutr.veg-off-veg':             [T({ desc: 'MILK CHOCOLATE BARS', badge: ['1/2 CUP', 'VEGETABLES'] }), 'C'],
  'nutr.zerosugar-vs-calories':   [T({ desc: 'GRAPE SODA', flash: 'ZERO SUGAR', badge: ['110', 'CALORIES'] }), 'B'],
  'nutr.zerosugar-vs-cane':       [T({ desc: 'COLA', flash: 'ZERO SUGAR', sub: 'MADE WITH REAL CANE SUGAR' }), 'B'],
  'nutr.caffeine-free-vs-caffeine': [T({ desc: 'COLA', flash: 'CAFFEINE FREE', claim: 'CONTAINS 34 MG CAFFEINE' }), 'B'],
  'nutr.caffeine-on-acaffeinated': [T({ desc: 'SPRING WATER', claim: 'CONTAINS 34 MG CAFFEINE' }), 'B'],
  'nutr.calories-on-nonfood':     [T({ desc: 'BLEACH', food: false, badge: ['140', 'CALORIES'] }), 'B'],
  'nutr.nutrition-panel-on-nonfood': [T({ desc: 'BLEACH', food: false, panel: 'NUTRITION FACTS' }), 'B'],
  'legal.hair-on-oral':           [T({ desc: 'TOOTHPASTE', food: false, legal: LEGALISH.care }), 'C'],
  'legal.hair-on-skin':           [T({ desc: 'BAR SOAP', food: false, legal: LEGALISH.care }), 'C'],
  'legal.food-panel-on-nonfood':  [T({ desc: 'BLEACH', food: false, legal: LEGALISH.food }), 'B'],
  'legal.drug-panel-on-food':     [T({ desc: 'CORN FLAKES', legal: LEGALISH.drug }), 'C'],
  'legal.wheat-on-singleingredient': [T({ desc: 'GROUND COFFEE', legal: LEGALISH.food }), 'N'],
  'legal.canned-on-drybox':       [T({ desc: 'SOY SAUCE', legal: LEGALISH.wet }), 'B'],
  'legal.chem-on-food':           [T({ desc: 'TOMATO SOUP', legal: LEGALISH.clean }), 'N'],
  'legal.septic-on-towel':        [T({ desc: 'PAPER TOWELS', food: false, legal: LEGALISH.paper }), 'C'],
  'legal.external-on-food':       [T({ desc: 'CORN FLAKES', claim: 'FOR EXTERNAL USE ONLY' }), 'C'],
  'flash.texture-on-jam':         [T({ desc: 'GRAPE JELLY', flash: 'CRUNCHY' }), 'N'],
  'flash.nutty-on-jam':           [T({ desc: 'GRAPE JELLY', flash: 'PEANUT' }), 'N'],
  'flash.stir-on-jelly':          [T({ desc: 'GRAPE JELLY', sub: 'STIR BEFORE SERVING' }), 'N'],
  'flash.hair-on-nonhair':        [T({ desc: 'BAR SOAP', food: false, flash: 'VOLUMIZING' }), 'C'],
  'flash.baking-on-nonbaking':    [T({ desc: 'PURE CANE SUGAR', flash: 'PRE-SIFTED' }), 'P'],
  'flash.seeded-on-nonbread':     [T({ desc: 'KETTLE CHIPS', flash: 'SEEDED' }), 'P'],
  'flash.roast-on-nonroast':      [T({ desc: 'ORANGE PEKOE TEA', flash: 'DARK ROAST' }), 'C'],
  'flash.steep-on-nontea':        [T({ desc: 'GROUND COFFEE', flash: 'ORANGE PEKOE' }), 'N'],
  'flash.mild-on-nonsavoury':     [T({ desc: 'PURE CANE SUGAR', flash: 'MILD' }), 'P'],
  'flash.diaper-size-on-nondiaper': [T({ desc: 'BABY WIPES', food: false, flash: 'SIZE 3 · 16-28 LB' }), 'P'],
  'flash.frozen-on-ambient':      [T({ desc: 'BUTTER CRACKERS', claim: 'KEEP FROZEN UNTIL READY TO USE' }), 'C'],
  'flash.laundry-on-nonlaundry':  [T({ desc: 'DISH SOAP', food: false, badge: ['64', 'LOADS'] }), 'B'],
  'flash.germ-on-nondisinfectant': [T({ desc: 'SHAMPOO', food: false, sub: 'KILLS 99.9% OF HOUSEHOLD GERMS' }), 'B'],
  'self.wt-vs-claim-count':       [T({ desc: 'ALLERGY RELIEF', food: false, wt: '24 CAPLETS', claim: '50 CAPLETS' }), 'C'],
  'self.badge-vs-claim-protein':  [T({ desc: 'PEANUT BUTTER', claim: '7g PROTEIN PER SERVING', badge: ['12g', 'PROTEIN'] }), 'N'],
  'self.two-panels':              [T({ desc: 'ALLERGY RELIEF', food: false, panel: 'DRUG FACTS', legal: LEGALISH.food }), 'C'],
};

function selftest() {
  let miss = 0, cross = 0;
  for (const r of R) {
    const c = CASES[r.id];
    if (!c) { console.log(`  NO CASE      ${r.id}`); miss++; continue; }
    const hits = auditTuple(c[0], c[1]);
    if (!hits.includes(r.id)) { console.log(`  DID NOT FIRE ${r.id}`); miss++; }
  }
  // ...and stay silent on a facing that is right in every band.
  const clean = [
    [T({}), 'C'],
    [T({ desc: 'PEANUT BUTTER', flash: 'CRUNCHY', sub: 'NO HIGH FRUCTOSE CORN SYRUP',
      claim: '7g PROTEIN PER SERVING', wt: 'NET WT 16 OZ (453g)', badge: ['7g', 'PROTEIN'],
      panel: 'NUTRITION FACTS' }), 'N'],
    [T({ desc: 'BATH TISSUE', food: false, flash: '2 PLY', sub: 'SOFT AND STRONG AT THE SAME TIME',
      claim: 'RESPONSIBLY SOURCED FIBER', wt: '12 DOUBLE ROLLS', badge: ['2', 'PLY'],
      panel: 'ABOUT THIS PACK', legal: LEGALISH.paper }), 'C'],
    [T({ desc: 'SPRING WATER', flash: 'PURIFIED', sub: 'BOTTLED AT THE SOURCE',
      claim: 'RECYCLE THE EMPTY BOTTLE', wt: '1 GAL (3.78 L)', badge: null,
      panel: 'NUTRITION FACTS', legal: ['BOTTLED AT THE SOURCE. NO SODIUM PER SERVING.'] }), 'B'],
  ];
  for (const [t, f] of clean) {
    const hits = auditTuple(t, f);
    if (hits.length) { console.log(`  FALSE POSITIVE on a clean facing "${t.desc}": ${hits.join(', ')}`); cross++; }
  }
  console.log(`\nselftest: ${R.length - miss}/${R.length} rules fire on their synthetic break; `
    + `${clean.length - cross}/${clean.length} clean facings pass silently`);
  return miss + cross;
}
if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);
