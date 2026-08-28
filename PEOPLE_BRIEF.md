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
