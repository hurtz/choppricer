// OWNER: builder-game. All player-facing copy.
// Tone: deadpan workplace humiliation. Nobody in this world thinks any of this is
// funny. Do not add jokes that wink. The straightest possible delivery IS the joke.

// ---------------------------------------------------------------- DVR analytics
// Machine output. Terse. Must render inside ~40 characters at 12px mono.
export const BEHAVIOUR_BENIGN = [
  'DWELL 04:12 — CATEGORY: SOUP',
  'READING A LABEL. STILL READING IT.',
  'CART PRESENT. CART EMPTY.',
  'PICKED UP ITEM / PUT IT BACK / x6',
  'COMPARING TWO (2) IDENTICAL ITEMS',
  'STANDING VERY STILL',
  'SMELLED A MELON',
  'TALKING. NO SECOND PARTY DETECTED.',
  'ASKED WHERE THE BATHROOM IS',
  'MOVING AT NORMAL SPEED',
  'CHILD PRESENT. CHILD IS SHOUTING.',
  'HAS A LIST. CONSULTS THE LIST.',
  'PRICE-CHECKING. AUDIBLY.',
  'BLOCKING THE AISLE. UNAWARE.',
];
// Innocent, but the box flags them anyway. These are the traps.
export const BEHAVIOUR_TRAP = [
  'COAT. INDOORS.',
  'NO CART',
  'FACE NOT MATCHED TO EMPLOYEE OF MTH',
  'REVISITED THIS AISLE 3 TIMES',
  'PHONE HELD AT SUSPICIOUS ANGLE',
  'BACKPACK — VOLUME UNVERIFIED',
  'LOOKED DIRECTLY AT CAMERA 04',
  'MOVING AT NORMAL SPEED (SUSPICIOUS)',
  'POCKETS PRESENT',
  'DID NOT TAKE A BASKET',
  'WEARING SUNGLASSES (WEATHER: RAIN)',
  'LEFT AISLE. RETURNED. LEFT AGAIN.',
];
// Guilty, pre-concealment. Reads normal on purpose.
export const BEHAVIOUR_GUILTY_PRE = [
  'BROWSING. UNREMARKABLE.',
  'DWELL 01:04 — CATEGORY: MEAT',
  'CART PRESENT. CART EMPTY.',
  'SHOULDER CHECK x2',
];
// Guilty, post-concealment. This is the tell. It is the only real tell.
export const BEHAVIOUR_GUILTY = [
  'ITEM LEFT FRAME / NOT IN CART',
  'HAND TO COAT — NO ITEM RETURNED',
  'CONCEALMENT EVENT — LIKELY',
  'ITEM COUNT DOWN 1 / CART COUNT SAME',
];

export const ALERT_FALSE = [
  'MOTION ANOMALY',
  'DWELL THRESHOLD EXCEEDED',
  'LOITER TIMER TRIPPED',
  'ANALYTICS: UNUSUAL',
];

// ------------------------------------------------------------------ merchandise
export const ITEMS = [
  ['ROTISSERIE CHICKEN (1)', 5.99],
  ['AA BATTERIES, 4CT', 4.11],
  ['STICK DEODORANT, UNSCENTED', 3.29],
  ['PRE-COOKED BACON', 6.49],
  ['ONE (1) LIME', 0.33],
  ['ENERGY DRINK, 16OZ', 2.79],
  ['PORK CHOPS, FAMILY PACK', 11.42],
  ['SHREDDED CHEESE, MEXICAN BLEND', 3.88],
  ['DISPOSABLE RAZORS, 5CT', 7.15],
  ['A CANDLE', 4.00],
  ['BABY FORMULA, 12.4OZ', 24.99],
  ['SLICED TURKEY, DELI COUNTER', 8.06],
];

const FIRST = ['DARREN', 'KEVIN', 'PATRICIA', 'MARCUS', 'LINDA', 'TODD', 'SHAWNA',
  'GREG', 'BRENDA', 'ANTHONY', 'CHERYL', 'DUSTIN', 'ROBERTA', 'CRAIG'];
const LAST = ['HOLCOMB', 'PRICE', 'VANDERWAL', 'SEELEY', 'MCKINNEY', 'DOTSON',
  'REINHART', 'BUCK', 'LEDBETTER', 'FRIEND', 'STAMPER', 'OYELOWO', 'KRUSE'];
// Multipliers must be coprime with the list lengths (13 and 14) or every guest
// ends up being the same person, which they very nearly are anyway.
export const name = (r) => `${LAST[(r * 3 + 1) % LAST.length]}, ${FIRST[(r * 5 + 2) % FIRST.length]}`;

// -------------------------------------------------- innocent shopper, harassed
// He got it wrong. They are not scared of him. That is the humiliation.
export const INNOCENT = [
  ["I'm shopping. For my family."],
  ['Do you follow everybody around like this?'],
  ["I'd like to speak to your supervisor.", 'Do you even have a supervisor?'],
  ["You've been behind me since the bread."],
  ['That is a cart. Those are groceries.', "I'm going to pay for them at the front."],
  ['Why are you breathing like that?'],
  ['Sir. This is the tortilla aisle.'],
  ['Is it the coat? It’s the coat.'],
  ['I come here twice a week.', 'Twice a week.'],
  ["You're not a police officer.", "That's a vest. I can read the tag."],
  ['My son is in the car.', "He's nineteen, it's fine, but he's in the car."],
  ['Take your hand off my cart.', 'Thank you. Take it off again.'],
  ['I have a receipt.', "I haven't bought anything yet. But I have a receipt."],
  ['There is a corn dog in your shirt pocket.'],
];

// The system's response to a complaint. HR voice, instant, no sympathy.
export const COMPLAINT_STAMP = [
  'GUEST COMPLAINT FILED',
  'GUEST CONTACT — UNFAVORABLE',
  'GUEST COMPLAINT FILED (2ND)',
];
export const COMPLAINT_SUB = [
  'GUEST DECLINED TO PROVIDE NAME. COMPLAINT STANDS.',
  'GUEST PROVIDED NAME AND SPELLED IT. TWICE.',
  'GUEST HAS ASKED FOR THE DISTRICT NUMBER.',
];

// ----------------------------------------------------- the write-up, his lines
export const COP_WARNING = [
  ["You're going to sign this. It's a form."],
  ['This is a trespass warning.', 'It is verbal. It counts.'],
  ["You're not to come back here.", 'The one on Ridgeway is a franchise. Separate conversation.'],
  ['I am not a police officer.', 'I want to be clear about that. I am also not not one.'],
  ['Do you want the receipt for your other items?', 'You paid for those. Those are yours.'],
];

export const ESCORT = [
  'SUBJECT ESCORTED TO DOOR 1',
  'SUBJECT DECLINED A BAG',
  'SUBJECT LEFT ON FOOT, NORTHBOUND',
  'SUBJECT SAID SOMETHING AT THE DOOR. UNCLEAR.',
];

// -------------------------------------------------------- the manager, after
// This is the centerpiece. Lay it on until it is uncomfortable.
export const MANAGER_NAME = 'DALE M. — STORE MANAGER';
export const MANAGER = [
  ['Officer. Officer.', "What you did today... I've never seen anything like it.",
   "I've been in grocery twenty-two years. Twenty-two.",
   "I'm putting this in the shift log. The real one."],

  ['I watched the whole thing on the monitor. I did not blink.',
   "There's no medal for this. There should be. There isn't.",
   'Take a soda. From the cold case.',
   'Not the warm ones by the register. The cold case.'],

  ['Do you know what my wife is going to hear about at dinner tonight?',
   'This. She is going to hear about this.',
   "I'd like you to have this pen. It's from the district meeting.",
   "It's a good pen."],

  ['Somebody get this man a chair.', 'Somebody get this man a chair.',
   'That was — and I want to be careful with my words — that was police work.',
   "I'm authorizing your break. Take the full fifteen. Take sixteen."],

  ["I'm shaking. Look at my hand. Look at it.",
   'The deli saw the whole thing. The deli is talking about it right now.',
   'You are not a security guard. You are Loss Prevention.',
   'There is a difference, and today you were the difference.'],

  ['In 2011 a man walked out of this store with a ham.',
   'He is still out there.',
   'Today, that does not happen. Today that does not happen.',
   'Thank you. On behalf of the store. And personally.'],

  ['They told me not to hire a full-time LP. They said the numbers.',
   'I want you to know I have printed this incident out.',
   'I am going to walk it to the district office myself.',
   "It's forty minutes. I have the time."],
];

export const PROMO_SUB = [
  'EFFECTIVE IMMEDIATELY. NO PAY ADJUSTMENT.',
  'NEW VEST WILL BE ORDERED. ALLOW 6-8 WEEKS.',
  'YOUR NAME TAG WILL BE UPDATED AT NEXT PRINTING.',
  'THIS TITLE IS INTERNAL AND NOT LEGALLY MEANINGFUL.',
];

// ------------------------------------------------------------------- failures
export const ESCAPE_LOG = [
  'SUBJECT EXITED VIA DOOR 1. NO PURSUIT LOGGED.',
  'MERCHANDISE LOSS RECORDED AGAINST THIS SHIFT.',
  'SUBJECT REACHED THE PARKING LOT. LOT IS NOT OURS.',
  'DOOR SENSOR DID NOT ALARM. DOOR SENSOR IS OUT.',
];

// -------------------------------------------------------------- the demotion
export const HR_HEAD = ['CHOP FOODS #4417 — PERSONNEL ACTION',
  'FORM 11-B / REASSIGNMENT (NON-DISCIPLINARY)'];
export const HR_BODY = [
  'Three (3) guest complaints were logged against you',
  'during this shift.',
  '',
  'Per Policy 4.2, guest complaints are not appealable and',
  'do not require the guest to remain on the premises.',
  '',
  'Effective immediately you are reassigned to Traffic Duty',
  '(parking lot; cart retrieval as needed).',
  '',
  'Your vest will be collected at end of shift. The vest is',
  'store property.',
  '',
  'This is not a disciplinary action. It is a reassignment.',
  'It will be recorded as a reassignment.',
  '',
  'We appreciate your enthusiasm.',
];
export const HR_SIGN = '— DENISE R., HR PARTNER (SHARED, 3 STORES)';

// -------------------------------------------------------------- desk chatter
export const RADIO_DISPATCH = [
  'UNIT 1 RESPONDING.',
  'UNIT 1 EN ROUTE. UNIT 1 ACKNOWLEDGING UNIT 1.',
  'I HAVE THE AISLE.',
  'LEAVING POST. POST IS UNMANNED. NOTED.',
];
export const AISLE_CLEAR = [
  'AISLE CLEAR. NO SUBJECT.',
  'NOTHING HERE. SOMEBODY MOVED.',
  'AISLE CLEAR. THE FEED WAS FOUR SECONDS OLD.',
];

export const pick = (a, r) => a[Math.floor((r === undefined ? Math.random() : r) * a.length) % a.length];
