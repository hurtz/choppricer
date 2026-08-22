Build a game called CHOP PRICER.

You're the fat cop working security at a discount grocery store. You sit at the
customer service desk watching a wall of security monitors, trying to tell
shoplifters from people just buying groceries. Spot something, you get an aisle
number, and you waddle out onto the floor. Walk up on them — if they bolt, they
were stealing, and now you have to catch them before they hit the exit. You're
fat, so you gas out in seconds. Grab an energy drink or a box of donuts off the
shelf for a few seconds of speed. Catch them, write them up, the manager thanks
you, you get points. Roll up on an innocent shopper and you eat a harassment
complaint — enough of those and they bust you back down to traffic duty.

The bar is real supermarket security footage. Go find actual grocery-store CCTV
stills and real store interior photos, put them in reference/, and make the game
look like that: the grain, the fisheye, the timestamp burn-in, the blown-out
fluorescents, the glare on the floor wax, shelves packed edge to edge with
product. Screenshot your own game and compare it against the references blind.
It should be hard to tell which is which.

Second bar, matters just as much: it has to feel like a chase you're barely
losing. Play it. If you catch him without a powerup it's too easy. If you can't
catch him with one it's broken. You should lose by a few feet, not half a store.

Break this into the smallest pieces that can be built and judged on their own.
For each one, fan out a builder sub-agent and a separate, harsh critic sub-agent
with fresh context. The critic runs the real game, looks at the real output,
compares it to the bar side by side, names the single biggest remaining gap, and
sends it back. Loop until it wins.

Runs in a browser, so your critics can screenshot it and play it.

Keep a live progress page open the whole time showing every piece, where it
stands, and the before/afters as it improves.

Use ultracode. Don't ask me how to build it — decide.
