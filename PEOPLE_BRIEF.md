# CHOP PRICER — the character bar

The client, after playing the current build:

> "When I am the police officer and I dispatch and I walk around the store, you've
> captured really, really well what it means to walk around a grocery store like
> that. I almost want to change the game around some... I would love if we could
> spend a lot of time making the characters in this game **much, much more
> detailed**: their movements, their characteristics, their facial features, the
> way they move, their sizes. Their movements in general should be **very
> believable**, and **when they pick something up off of the shelf, they really
> should remove it from the shelf.** Those are details that are important."

The store is the thing that works. The people are now the weakest thing in every
frame, and they are what the whole game asks the player to read.

## The bar
`reference/people/*.jpg` — real photographs of people shopping. Same method as the
store: crops of a render placed beside crops of a photograph, normalised to identical
size and encoding, judged blind by a critic with no knowledge of which is which.
The harness is `tools/people_blindset.py`; read its header before trusting a score
out of it, because cropping reopens five of the eight leaks the store harness
catalogued and it says which are closed and which are merely declared.

**The set is small, and every photograph in it was looked at by a human first.**
Automated category harvesting produced a Ryanair 737, two black-and-white 1955
Amsterdam street scenes and a half-resolution duplicate before anyone opened them;
those sit in `_rejected/` with a note. Searching on phrasings that name both a
person and a store interior does better than any category will. Two consequences
that matter more than the inconvenience:

- **Nothing joins the bar unlooked-at.** A reference set nobody has opened is worse
  than no reference set, because it launders a bad comparison through a real-looking
  score. A critic scoring our shoppers against an airliner learns nothing and
  reports a number anyway.
- **The blind harness is built but not yet seeded, deliberately.**
  `tools/people_blindset.py` needs `reference/people/boxes.json` — a hand
  annotation of where the people are in each photograph — and at eight
  photographs a blind score would be a number with nothing behind it. The
  informative pass at this n is a critic looking at the photographs and naming
  what a real shopper does that ours does not. Seed the harness when the set is
  large enough to survive being asked for a percentage.
- **n is small enough to constrain what may be claimed.** The set answers "what does
  a real shopper do that ours does not", which is the question these rounds are for.
  It does not support a population statistic. If a report wants to say "N% of real
  shoppers do X", it does not have the denominator — say what was seen, in how many
  photographs, and let the observation carry itself.

Two things that bar does NOT cover, so they get their own tests:
- **Movement** cannot be judged in a still. It is judged from a strip of frames at a
  stated interval, and from a critic driving the sim and watching.
- **Interaction** is judged by whether the world changes: if a shopper takes a box,
  the shelf has one fewer box.

## What "believable" means here, concretely
Not "high poly". The store round learned this the hard way over ten rounds: detail
that changes a **silhouette** pays at every distance; detail that only exists at 3x
zoom is wasted. The cop's hanging gut turned a rectangle into a pear at 20 px and
that is worth more than any texture.

For people specifically, in rough order of how much each is worth:
1. **Weight and balance.** Where the mass is, and what it does when they move.
   People shift, lean, brace, and put a hand out. Nothing in this game has weight yet.
2. **Size range.** Real crowds vary enormously — height, girth, age, posture. Ours
   are variations on one build.
3. **Purposeful motion.** People in shops are doing something: reading a label,
   deciding, reaching past something, backing up to see better. Idle animation that
   loops is the tell.
4. **Faces**, last and least — at the distances this game is played, a face is a few
   pixels. It matters at the checkout and on the spot monitor, nowhere else.

## The constraint that outranks all of it
**The decoy system must survive.** Eleven gestures share one code path, the scheduler
never reads `s.guilty`, and a concealment is provably indistinguishable from an
innocent reach out to 0.50 s. If any new pose, gait, build, face or interaction
correlates with guilt, the game's best idea is dead. Every character round reports
the put-back likelihood ratio and the bird's alongside its visual claims.

## Measuring
Report profiles and error against a named reference file, not single extrema, and
name the instruments you distrusted — see AGENTS_BRIEF.md. Bench with `difficulty`
passed explicitly — see CLAUDE.md.
