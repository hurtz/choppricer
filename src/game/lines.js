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

// RETIRED IN ROUND 9 — ALERT_FALSE, four ways for the box to say it had seen
// something. They were good lines and they had no business being a full-width
// flashing red bar: measured, something soft was on that bar 27.3% of an IDLE
// shift, and every one of these sentences was already being told by the red pip
// on the monitor and the red row in the roster. Deleted rather than demoted,
// because a fourth telling of a thing said three times is not copy, it is
// volume. The bar that remains says one sentence, and it is VESTIBULE below.

// -------------------------------------------------------------- the one alarm
// A man is in the doorway with a number counting down beside him. This is the
// only line in the game that expires, which is the only reason it gets to
// interrupt. Kept word for word from the bar the client called obnoxious — the
// sentence was never the problem, the flashing full-width red plate was.
export const VESTIBULE = '%D — SUBJECT IN THE VESTIBULE';

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
  'SUBJECT ESCORTED TO %D',
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

// ---- ROUND 11: AND HE ALSO NOTICES THE OTHER KIND OF SHIFT ---------------
// The block above is Dale M. after an arrest, laid on until it is
// uncomfortable, and it has been the centrepiece since round 1. It is also,
// until this round, the ONLY thing he ever says — so a player who spends four
// minutes shouting at eleven strangers and catches nobody gets the manager's
// complete silence, and the announcement scores zero.
//
// A silence is not a joke. Zero points is the correct economics (agents.js
// deters a man for free and pays nothing for it, deliberately) and it is a
// perfectly good punchline that nobody is currently delivering. Dale is the
// man to deliver it, because he is the only character in this game who has
// opinions about your work, and because the disappointment is much funnier
// coming from the same person who wanted to walk your last incident report to
// the district office himself.
//
// DISAPPOINTED, NOT ANGRY, and that is a writing rule rather than a mood. An
// angry manager is a scene; a disappointed one is a man who has come to your
// desk to say a supportive thing and cannot find one, so he says the only
// three facts available: how many times you did it, that nobody was written
// up, and that he is not angry. Nobody who has ever said "I'm not angry" out
// loud was having a good day, and the store's own log records the visit in
// the same flat voice it uses for a door sensor.
//
// ONE LINE, AND THAT WAS A MEASUREMENT RATHER THAN A PREFERENCE. This was
// written as two — a machine line saying he had come over (DALE M. CAME BY THE
// DESK. HE DID NOT SIT DOWN.) and then the quote under it, which is how a
// caption reads and which is in character for a man who cannot stop talking.
// The capture says no. hud.js's ticker draws three lines at 15 px leading from
// y=616 and the MOTION ANALYTICS panel is drawn over it starting at y=624, so
// the second line was 60% behind a panel and the third was entirely behind it;
// on the floor the baselines are 700/715/730 on a 720 px canvas. See the
// ROUND 11 note at ticker() — the element is fixed to draw only what fits, and
// what fits at the desk is ONE LINE.
//
// So the attribution rides on the front of the quote and the beat is one
// entry in the log. It is tighter than the two-line version was, which is the
// usual outcome of being told how much room there actually is.
export const MANAGER_PA = [
  'DALE M. — "%N ANNOUNCEMENTS. NOBODY IN THE OFFICE."',
  'DALE M. — "ASSOCIATES ARE ASKING WHO KEEPS TALKING."',
  'DALE M. — "THE PA WORKS. I WANTED TO SAY THAT FIRST."',
  'DALE M. — "%N TIMES. AND NOBODY HAS BEEN WRITTEN UP."',
  'DALE M. — "I AM NOT ANGRY. I WANT YOU TO HEAR THAT."',
  'DALE M. — "I CAN HEAR YOU FROM THE DELI. ALL SHIFT."',
];

export const PROMO_SUB = [
  'EFFECTIVE IMMEDIATELY. NO PAY ADJUSTMENT.',
  'NEW VEST WILL BE ORDERED. ALLOW 6-8 WEEKS.',
  'YOUR NAME TAG WILL BE UPDATED AT NEXT PRINTING.',
  'THIS TITLE IS INTERNAL AND NOT LEGALLY MEANINGFUL.',
];

// ------------------------------------------------------------------- failures
export const ESCAPE_LOG = [
  'SUBJECT EXITED VIA %D. NO PURSUIT LOGGED.',
  'MERCHANDISE LOSS RECORDED AGAINST THIS SHIFT.',
  'SUBJECT REACHED THE PARKING LOT. LOT IS NOT OURS.',
  '%D SENSOR DID NOT ALARM. THAT SENSOR IS OUT.',
];

// ------------------------------------------------------------- the two doors
// ROUND 3: there are two ways out of this building and the subject picks one.
// Everything here is the DVR reporting an observation, not a prediction — the
// box does not know which door he came in by and neither do you. It only ever
// says what the geometry can still allow. Machine voice, no editorialising.
export const DOOR_OPEN = 'BOTH DOORS LIVE';
export const DOOR_LOCK = 'ROUTE COMMITTED';

// He has turned and gone for the rear cross-aisle. This is the one decision in
// the chase that is irreversible and worth thirty metres, and the player used to
// find out about it by losing. Say it out loud, and say what to do about it.
export const VIA_BACK = 'SUBJECT BREAKING FOR THE REAR';
export const VIA_BACK_SUB = 'HE IS NOT GOING TO THE FRONT — CUT ACROSS';
export const VIA_BACK_PROMPT = 'HE IS GOING ROUND THE BACK — TAKE ANOTHER AISLE';
export const VIA_BACK_LOG = [
  'SUBJECT TURNED. SUBJECT IS RUNNING THE OTHER WAY.',
  'SUBJECT BROKE FOR THE REAR CROSS-AISLE. DELIBERATE.',
  'SUBJECT HEADED AWAY FROM BOTH DOORS. NOT A MISTAKE.',
];
// He was going to one door and now he is going to the other one.
export const DOOR_SWITCH = 'SUBJECT CHANGED DOORS — NOW %D';

// -------------------------------------------------- the case is over, sir
// Whatever happened has happened. The prompt band must stop telling a man to
// walk at an aisle that no longer contains anybody.
export const STAND_DOWN = 'SUBJECT GONE — [Q] RETURN TO POST';
export const STAND_DOWN_DEST = 'STAND DOWN';

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

// ---------------------------------------------------- ROUND 7: the quiet shift
// agents.js's one-exit design punishes camping the door by REMOVING THE CRIME:
// stand on the way out long enough and nobody commits, so the shift produces no
// incidents and the player earns nothing. That is the correct punishment and it
// works — but a player punished by an absence has to be TOLD, or a shift with
// no income reads as a broken game rather than as a consequence.
//
// The register is the fiction, never the mechanic. Not "deterrence active", not
// "thieves suppressed" — the store noticing that nothing is happening, in the
// voice of a man who has been stood in a doorway for a while. If the player
// works out the rule from this, he worked it out; nobody told him.
export const POSTED_QUIET = [
  "FLOOR IS QUIET — NOBODY'S GOING TO TRY IT WITH YOU STOOD THERE",
  'NOBODY IS SHOPLIFTING IN FRONT OF THE DOOR YOU ARE STANDING IN',
  'NOTHING IS HAPPENING. THAT IS BECAUSE OF WHERE YOU ARE STANDING.',
  'EVERYONE IS BEHAVING BEAUTIFULLY. YOU ARE VERY VISIBLE.',
];
// He had it in his hand and put it back rather than walk past you. No arrest,
// no loss, no points. The log has to make it sound like a win, because it is
// one — it is just a win that pays nothing, which is the joke.
export const ABORT_BALK = [
  '%S PUT IT BACK. HE HAD A LOOK AT THE DOOR FIRST.',
  '%S RETURNED THE ITEM TO THE SHELF. UNPROMPTED.',
  '%S CHANGED HIS MIND ABOUT SOMETHING.',
  'CONCEALMENT ABANDONED — %S. NO OFFENCE COMMITTED.',
];
// He waited you out, you did not move, so it went on a shelf and he left.
export const ABORT_DUMP = [
  '%S PUT IT ON A SHELF AND WALKED OUT A CUSTOMER.',
  '%S DITCHED THE ITEM. RESTOCK LOGGED. NO POINTS.',
  '%S GAVE UP WAITING FOR YOU TO MOVE.',
];
export const ABORT_STAMP = 'HE PUT IT BACK';
export const ABORT_SUB = 'NO OFFENCE. NO ARREST. NO POINTS.';

// ---------------------------------------------- ROUND 7: the beat before a form
// A guest who has been crowded turns and says something. He does not reach for
// a complaint form in the same instant — he waits to see whether you are going
// to keep standing there. That gap is the only place in the game where a
// misread can be UNMADE, so the HUD names it plainly rather than in character:
// it is an instruction, and it has about a second and a half to be obeyed.
//
// It does NOT name a key. Movement is WASD relative to a chase camera that
// yaws, so which key walks the cop away from this particular guest depends on
// where the camera happens to be pointing — and a HUD that confidently says [S]
// while [S] walks you further into him is worse than one that says nothing.
export const BACK_OFF = 'GET OUT OF HIS FACE — BACK AWAY';
// He got out of the way in time. Ticker only, and deliberately not a
// congratulation: nothing happened, which is the best outcome available.
export const BACK_OFF_OK = [
  '%S — NO COMPLAINT FILED. GUEST RESUMED SHOPPING.',
  '%S DECLINED TO MAKE A THING OF IT.',
  'GUEST RELATIONS DE-ESCALATED — %S. NOT LOGGED.',
];

// ================= ROUND 8: "HEY, PUT THAT BACK" =========================
// Client: "If I see them doing something suspicious, I can go, 'Hey, put that
// back,' and then they look around, like, 'What the fuck?' ... But if it's a
// criminal doing it, they might reconsider, they might put it back, and then
// just leave the store peacefully."
//
// THE WRITING PROBLEM IS THE WHOLE MECHANIC. Both populations produce both
// visible outcomes on purpose — that is agents.js's anti-oracle guarantee and
// it is worth more than any line in this file. Copy is the easiest place in the
// project to give it away: one adjective that only fits a thief, one that only
// fits a guest, and the player stops reading the man and starts reading me.
//
// So there are exactly two outcome pools and neither knows anything. Both are
// written from the DVR's side of the glass, which can see a body and cannot see
// an intention, and both had to survive the same test — read the line, then ask
// whether it would be strange printed under the other kind of person. Anything
// that failed is in the graveyard at the bottom.
//
// He keyed the handset. Store-wide, because a PA is a loudspeaker and not a
// laser: everybody in that aisle heard it, which is exactly why "somebody
// looked around" is worth nothing. The content is not logged because the
// content is the player's own voice and this file has a standing position on
// that (see game.js: no recognition, no storage, deliberately).
//
// LENGTH. The floor ticker is 480 px at 11 px mono and clips with an ellipsis,
// which after the HH:MM:SS stamp leaves about 55 characters with %S expanded to
// a real code. Every line below is measured against that with SUBJ-05 filled
// in. (Round 7 left three over the limit — ABORT_DUMP's first two and
// BACK_OFF_OK's third, at 61-64 — and they ellipse on the floor while reading
// fine on the desk's 700 px band, which is why nobody caught them. Not touched
// this round; flagged for whoever owns the next one.)
//
// ROUND 11 COLLECTED THAT FLAG, AND THERE WERE FOUR OF THEM RATHER THAN THREE.
// Measured properly this time — every array in this file, every line, through
// the real canvas at 11 px with the HH:MM:SS stamp and %S expanded, against
// the floor ticker's 480 px rather than against a character count. ABORT_BALK's
// last line was over too and round 8 missed it. All four are trimmed rather
// than rewritten; the sentence each one was making is the sentence it still
// makes, minus the words that were being replaced by an ellipsis anyway:
//
//     ATTEMPTED CONCEALMENT ABANDONED …    542 -> 469  CONCEALMENT ABANDONED
//     %S LEFT IT ON THE WRONG SHELF …      520 -> 454  PUT IT ON A SHELF
//     … RECOVERY LOGGED AS RESTOCK …       542 -> 454  RESTOCK LOGGED
//     GUEST RELATIONS EVENT DE-ESCALATED   491 -> 447  GUEST RELATIONS
//
// The other three over 480 are NOT ticker lines and are correct where they
// are: HR_BODY renders in the demotion form at its own width and POSTED_QUIET
// renders in the prompt band, which is 900 px.
//
// ---- ROUND 11: THE STORE'S OWN WORD FOR IT ------------------------------
// A supermarket does not have a "PA event". It has a COURTESY ANNOUNCEMENT,
// and a courtesy announcement is addressed to a PLACE — aisle four — because a
// loudspeaker cannot be addressed to a person. Two of the four lines below say
// it that way now, and both halves of that are load-bearing rather than
// decorative:
//
//   THE REGISTER  the comedy of this key is a formal retail system being used
//                 to nag a stranger. `PA KEYED` is a machine noticing a switch
//                 close; `COURTESY ANNOUNCEMENT — AISLE 4` is the same event
//                 written up by somebody who has been to the training.
//   THE AIM       naming the aisle instead of the man is the anti-oracle said
//                 in the store's own vocabulary. It is TRUE of everybody who
//                 heard it, which the %S lines are not, and it is the honest
//                 description of what the player just did: he did not speak to
//                 that man, he spoke to aisle four.
//
// CONTENT NOT LOGGED stays and is the whole privacy position in three words.
// The player's actual voice goes out over the store on [F] and this game will
// never know what he said — no recognition, no storage, deliberately, see
// game.js's `talk`. A HUD that described the CONTENT would be lying about a
// thing it cannot know; a HUD that describes the EVENT and refuses to describe
// the content is funnier and is also the truth.
//
// RETIRED HERE, and only because four lines is a pool and six is a shuffle:
//   'PA KEYED — DIRECTED AT %S. STORE-WIDE.'          — 'DIRECTED AT' is the
//     claim the spill exists to deny. A PA is not directed at anybody.
//   'PA — ANNOUNCEMENT MADE. AUDIBLE IN %S\'S AISLE.' — good line, and the
//     courtesy pair says the same thing in the store's own words.
export const PA_PUTBACK = [
  'COURTESY ANNOUNCEMENT — %A. CONTENT NOT LOGGED.',
  'PA — COURTESY ANNOUNCEMENT, %A. STORE-WIDE.',
  'PA KEYED. CONTENT NOT LOGGED. SUBJECT %S.',
  'ANNOUNCEMENT — %S AND EVERYONE IN EARSHOT.',
];
// HE PUT SOMETHING BACK. The identical clip plays on a thief ditching a steak
// and on a man who was holding a jar when a voice told him off in public, so
// the line has to be true of both and flattering to neither.
export const PA_HEED = [
  '%S PUT SOMETHING BACK.',
  '%S PUT AN ITEM ON SOME SHELF OR OTHER.',
  '%S PUT IT DOWN. ANALYTICS CANNOT SAY WHAT IT WAS.',
  '%S COMPLIED WITH SOMETHING. UNCLEAR WHAT.',
  'ITEM RETURNED TO SHELF — %S. NO OFFENCE ON FILE.',
];
// He heard it and he is carrying on. This is the "what the fuck?" the client
// described, and it is the same shrug whether he has a chicken in his coat or a
// list in his hand.
export const PA_SHRUG = [
  '%S LOOKED UP. %S LOOKED AT THE CEILING.',
  '%S LOOKED AROUND FOR WHOEVER SAID THAT.',
  '%S ACKNOWLEDGED THE PA. RESUMED SHOPPING.',
  '%S CHECKED OVER HIS SHOULDER. CONTINUED.',
  'NO BEHAVIOURAL CHANGE LOGGED — %S.',
];
// ==========================================================================
// ROUND 11 — THE SECOND TIME, AND THE THIRD TIME
// ==========================================================================
// Client: "Refine the comedy mechanics of speaking on the intercom and the
// reaction — maybe even the customer flips the bird at the security camera."
//
// The bodies are agents.js's. The RUNG is `s.annN`, which is how many times
// this store has shouted at this body, and it is the only number any line
// below is allowed to know:
//
//   1  he has no idea who said that                 (round 8's pool, unchanged)
//   2  he finds the camera, and holds it too long
//   3  the finger
//
// WHY THE COUNT IS SAFE, said once and then relied on everywhere. announceAt()
// increments annN on the man you aimed at AND on every body inside annSpill,
// so it is a fact about a loudspeaker and not about a person: an innocent
// stood next to your subject climbs the ladder at exactly the same rate as
// your subject, and the fourth shout at a flagged row is the fourth shout at
// the three people beside him too. There is no guilt in it and no line below
// reaches for any. The round-10 test is unchanged and every rung had to pass
// it: read the line, then ask whether it would be strange printed under the
// other kind of person. If anything the innocent gets there FIRST, because a
// man reading a soup label is still in the aisle when you key the handset
// again and a man who has concealed something is walking towards a door.
//
// AND THE REGISTER DOES NOT ESCALATE WITH THE BEHAVIOUR — that is the joke.
// He gets progressively less polite; the terminal stays exactly as polite as
// it was on the first announcement, because a form does not have a temper.
// Nothing below is a wisecrack. Every one of them is a system filling in a
// field correctly about something undignified.

// RUNG 2. He has worked out where the voice comes from. `STILL LOOKING AT IT`
// is deliberately the same construction as BEHAVIOUR_BENIGN's 'READING A
// LABEL. STILL READING IT.' — the box has exactly one way of saying that a
// person has not stopped doing a thing, and it uses it here too.
export const PA_SEEN = [
  '%S HAS FOUND THE CAMERA.',
  'EYE CONTACT WITH DOME — %S. HELD FOUR SECONDS.',
  '%S IS LOOKING AT THE CAMERA. STILL LOOKING.',
];
// RUNG 3. THE BIRD.
//
// Written as an incident report, because the funniest available version of a
// man giving a camera the finger is the paperwork it generates. Three rules
// held while writing these and each one killed a draft:
//
//   NO PUNCHLINE. The gesture is the funny thing; a line that comments on it
//   is a second comedian talking over the first. Every rejected draft in the
//   graveyard below is me being funnier than the store.
//   THE SYSTEM DOES NOT MIND. It has no field for offence. It has a field for
//   whether a complaint was filed and a field for whether the guest is still
//   in the building, and it fills both in accurately.
//   IT IS NOT A VERDICT. A man who has been shouted at three times has told
//   you something about being shouted at three times and nothing whatsoever
//   about his coat.
//
// The 'NO COMPLAINT WAS FILED' line is round 8's guarantee said out loud, and
// it is the funniest sentence in this file for exactly that reason: the
// announce path cannot reach onHarass BY CONSTRUCTION, so the store is
// truthfully recording that nobody was upset enough to fill in a form, under a
// photograph of a man in aisle four with his middle finger up at the ceiling.
// The gap between those two facts is the whole joke and neither half of it is
// a joke on its own.
export const PA_BIRD = [
  'OBSCENE GESTURE — %S. NO COMPLAINT WAS FILED.',
  '%S — GESTURE AT DOME. GUEST REMAINS ON PREMISES.',
  '%S GESTURED AT CAMERA, THEN RESUMED SHOPPING.',
];
// One pool per rung, indexed by the count and clamped at the top. A fourth
// announcement gets the third rung again, which is correct: there is nothing
// ruder than the finger and a store that escalated past it would be writing a
// different game's copy.
export const PA_SHRUG_RUNGS = [PA_SHRUG, PA_SEEN, PA_BIRD];
// REJECTED, all three for the same reason — the store noticing:
//   '%S IS NOT SORRY.'                        — a verdict on a state of mind
//     the DVR cannot see, and it is only sayable about somebody who did
//     something wrong. Guilt, in an adjective.
//   'THAT WAS DELIBERATE — %S.'               — same. Everything a camera sees
//     is deliberate; the word is doing editorial work.
//   '%S HAS AN OPINION ABOUT LOSS PREVENTION.' — funny, and it is the file
//     laughing at its own gag. The store does not think this is funny. That
//     is the entire register and it survives exactly as long as nothing in
//     here winks.
// He ran. onBolt() already puts SUBJ-xx IS RUNNING in the ticker the same
// frame, so this pool exists for the chip and for the desk, where there is no
// chip — and never fires alongside the other one. Machine voice; the box is
// reporting a body accelerating, not awarding the player a point.
// LENGTH, and the round-8 note above is the reason: the floor ticker is 480 px
// at 11 px mono and clips with an ellipsis, which after the HH:MM:SS stamp
// leaves about 55 characters with %S expanded. The first cut of these ran to 58
// and printed "...THE LAST THING HE HE…" on the capture. Measured with SUBJ-12
// filled in: 43 / 40 / 38.
export const PA_BOLT = [
  '%S RAN. THE PA WAS THE LAST THING HE HEARD.',
  '%S IS RUNNING. HE WAS NOT BEFORE THE PA.',
  'SUBJECT ACCELERATED AFTER THE PA — %S.',
];
// The floor chip. Three states, and the middle one is load-bearing: between
// keying the handset and him reacting there is up to a second where the honest
// readout is that nothing has happened yet. Filling it with a guess is the one
// thing agents.js explicitly built its return value to prevent.
export const PA_CHIP_AIM = 'ANNOUNCEMENT — %S';
export const PA_CHIP_WAIT = 'WAITING FOR A REACTION';
export const PA_CHIP_HEED = 'HE PUT SOMETHING BACK';
// ROUND 11: the same three rungs, in the chip's four-word voice. The floor
// chip is the one readout in the game that is allowed to use a pronoun,
// because on the floor the man is eight metres away and being pointed at by a
// bracket — there is no ambiguity about who `HE` is. Indexed by annN, same as
// the roster row and the ticker, and the third one is the whole round.
export const PA_CHIP_SHRUG = ['HE LOOKED AROUND', 'HE FOUND THE CAMERA', 'HE GESTURED AT THE CAMERA'];
// ROUND 9 — THE THIRD THING HE CAN DO IS RUN.
// agents.js added 'bolt': you shouted at him and he panicked. Unlike the other
// two this one IS a confession, and the writing job is therefore the opposite
// of PA_HEED's — not to keep the outcome ambiguous (the man is sprinting past
// a cheese counter, nobody is in any doubt) but to refuse to CELEBRATE it.
// Being right is worth nothing here: you are stood in an aisle with a head
// start you did not choose, and the only number that matters now is the gap.
// So the chip states the gap and gets out of the way, and there is no
// congratulation anywhere in this pool.
export const PA_CHIP_BOLT = 'HE RAN';
export const PA_CHIP_GAP = '%N M HEAD START';
// The footnote that keeps the whole thing honest, printed on the chip every
// time. You did not speak to him. You spoke to the shop.
export const PA_CHIP_HEARD = '%N OTHERS IN EARSHOT';
export const PA_CHIP_ALONE = 'NOBODY ELSE IN EARSHOT';
// What [F] does when there is nobody to say it to. Not an error — a PA with
// nothing to announce is still a PA, and this is the funnier half of the key.
export const PA_IDLE = 'PA — OPEN CHANNEL';
export const PA_AT = 'PA — SAY SOMETHING TO %S';

// ============== ROUND 10: THE BUTTON WAS ON THE WRONG SCREEN ==============
// The client's sentence, in full, because round 8 acted on the second half of
// it and dropped the first:
//
//   "IF HE'S VIEWING A CAMERA and he says 'hey, excuse me, return that item',
//    there's some interaction. They look around, they're not sure where the
//    sound is coming from... unless they're a real thief, and then the thief
//    is like 'oh shit', and gets scared and starts running."
//
// He is at the desk, watching a monitor. Round 8 put the line on the floor at
// the reticle instead, and the chase builder's bolt gate is geometric — it
// returns zero unless the subject beats the cop to a door — so at the mouth of
// the aisle dispatch drops you in, the third outcome measures 0.0%. The man
// who "gets scared and starts running" could not run. From the service desk,
// forty metres back, he runs 29.2% of the time.
//
// ---- THE ROSTER ROW IS THE READOUT, AND IT COST NOTHING -------------------
// The floor has a chip because the floor has no list. The desk has a list, and
// every row on it is already a sentence about what one body is doing. So an
// announcement does not get a panel here; it REPLACES the behaviour line on
// the row of everybody it reached, for a few seconds, and then the row goes
// back to being a row. Nothing new is drawn at all.
//
// And it reaches more than one. Every body inside agents' annSpill hears it
// and reacts, which is the property that stops "somebody looked around" being
// worth anything — so the same three lines are used for the man you aimed at
// and for the three people who happened to be in his aisle, because the box
// cannot tell those apart either. Round 8 paid for that guarantee with a
// footnote counting the bystanders. It is cheaper and better to just show them.
//
// Machine voice, no pronoun — these sit in the same column as
// 'STANDING VERY STILL' and 'SMELLED A MELON' and have to read as the same
// instrument. Same anti-oracle test as PA_HEED: would this line be strange
// printed under the other kind of person? None of the three would.
//
// ---- ROUND 11: AND THE ROW IS WHERE THE LADDER IS ACTUALLY READ ----------
// Three rungs each, indexed by annN, and this is the channel the round-10
// guarantee lives on: the man you aimed at and the three people who merely
// happened to be in his aisle get the IDENTICAL line at whatever rung each of
// them has reached. It survives the new copy because the rung is a count of
// announcements and not a judgement — a bystander on his third shout prints
// the same OBSCENE GESTURE row as the subject on his third shout, and the
// player cannot tell from the list which of the four was aimed at.
//
// THE COUNT IN THE WAIT AND HEED ROWS IS DOING WORK, not decoration. It is the
// only place the player is TOLD there is a ladder, and it is told in the
// prissiest available form — an ordinal, on a row, in the same column as
// SMELLED A MELON. A player who reads `3RD ANNOUNCEMENT — NO REACTION YET`
// knows two things he was never told: that the store is counting, and that the
// counting is his own doing.
//
// THE GESTURE ROW IS THE FORM AND FORMS DO NOT VARY. One line, every time,
// with only the event number moving — which is why the ticker pools above get
// three lines each and this one gets exactly one. `%N` is the store's own
// analytics event counter, the SAME counter that numbers a concealment (see
// game.js's nextEvt), and that is the whole gag: a man's middle finger and a
// steak going into a coat are the same kind of row to this building, filed
// four apart.
export const PA_ROW_WAIT = [
  'HEARD THE PA — NO REACTION YET',
  '2ND ANNOUNCEMENT — NO REACTION YET',
  '3RD ANNOUNCEMENT — NO REACTION YET',
];
export const PA_ROW_HEED = [
  'PUT SOMETHING BACK AFTER THE PA',
  'PUT SOMETHING BACK. 2ND ANNOUNCEMENT.',
  'PUT SOMETHING BACK. 3RD ANNOUNCEMENT.',
];
export const PA_ROW_SHRUG = [
  'LOOKED AROUND FOR WHOEVER SAID THAT',
  'FOUND THE CAMERA. STILL LOOKING AT IT.',
  'OBSCENE GESTURE AT CAMERA — EVENT %N',
];

// ---- WHAT IT COSTS, SAID BEFORE IT IS SPENT -------------------------------
// The chase builder priced it: announcing at a subject you have already made
// is worth 8.4 expected points against a dispatch's 77.0, and it turns a
// 6.22 s median chase into a 10.6 s one. That is not a line the DVR can say —
// it does not know about points — but the FACT under it is one the terminal
// knows exactly: this row is flagged, and the PA is about to tell the man on
// it that somebody is watching this row.
//
// Guilt-blind by construction: `flagged` is the analytics box's opinion and
// 30% of the rows carrying it are traps. It is a statement about the terminal,
// not about him. And it is not advice — it does not say don't, it says what
// the key does.
//
// Printed ONCE, when the aim lands on a flagged row, and then it goes: see the
// duty-cycle note at tickCost() in game.js. As a permanent state it censused
// at 63.1% of desk frames, which is the thing round 9 spent a whole round
// deleting.
//
// LENGTH: the strip it goes on is 332 px at 11 px bold mono, which is 44
// characters. The first cut ran to 49 and printed
// "...HE IS BEING W…" on the capture — the same mistake round 8 made with
// PA_BOLT and round 7 made with ABORT_DUMP. Measured at 40.
export const PA_COST = 'FLAGGED ROW — DISPATCH DOES NOT WARN HIM';
// The desk handset's two verbs, on the button, so [F] says what it would do.
// `WARN` is the deterrence line at the man in the big picture. `PRICE CHK` is
// the round-7 line, unchanged, and it is what is left to say about a man no
// camera can currently see — see game.js deskVerb().
export const PA_BTN_WARN = 'WARN %S';
export const PA_BTN_HOLD = 'PRICE CHK';
// REJECTED, and each of these is the same mistake:
//   '%S PUT IT BACK AND THOUGHT BETTER OF IT'   — 'thought better of it' is only
//     sayable about somebody who was doing something wrong. Guilt, in a verb.
//   '%S DID NOT REACT. HE IS GOOD.'             — same in the other direction:
//     'good' is a verdict on a man who might have been reading a soup label.
//   '%S IS UNBOTHERED BY LOSS PREVENTION'       — funny, and it flatters the
//     thief specifically. Innocent men are unbothered by loss prevention
//     because they are shopping, which is a different joke and not this one.
//   'SUBJECT COMPLIED'                          — 'complied' with the subject
//     alone reads as an admission. Kept only in the form 'COMPLIED WITH
//     SOMETHING. UNCLEAR WHAT.', where the box is admitting it cannot tell.

export const pick = (a, r) => a[Math.floor((r === undefined ? Math.random() : r) * a.length) % a.length];
// %D is the door somebody actually used. There are two of them now; a log line
// that always says DOOR 1 is a log line that is wrong half the time.
export const fill = (s, door) => String(s).replace(/%D/g, door || 'DOOR 1');
// %S is a subject code — SUBJ-04. Same shape as fill(), different hole.
export const fillS = (s, code) => String(s).replace(/%S/g, code || 'SUBJECT');
// %N is a count. Round 8's chip needs one and there was no third hole.
export const fillN = (s, n) => String(s).replace(/%N/g, String(n | 0));
// %A is a PLACE — AISLE 4, FRONT END. Round 11's courtesy announcements are
// addressed to one, because that is what a loudspeaker is addressed to.
export const fillA = (s, where) => String(s).replace(/%A/g, where || 'THE SALES FLOOR');
