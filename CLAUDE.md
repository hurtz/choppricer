# CHOP PRICER

Browser game. You're the fat cop working loss prevention at a discount grocery
store: watch the monitor wall, spot a shoplifter, waddle out, chase them down
before the exit. See PROMPT.md for the original brief, AGENTS_BRIEF.md for the
quality bar and the harness.

## Running it
No build step. Plain ESM + three.js vendored in `vendor/`.

    python3 tools/serve.py 8171

Game: http://127.0.0.1:8171/index.html
Live gauntlet progress: http://127.0.0.1:8171/progress/index.html

## Layout
- `src/config.js`  — shared world contract (aisle math, TUNING, camera rig). LEAD-OWNED.
- `src/main.js`    — bootstrap + wiring, and the agent test surface. LEAD-OWNED.
- `src/store.js`   — the supermarket: shelving, product density, ceiling, signage.
- `src/cctv.js`    — monitor wall + the security-footage grade.
- `src/agents.js`  — cop, shoppers, thieves, stamina, powerups. Owns the chase feel.
- `src/game.js`    — modes, scoring, complaints, rank, HUD.
- `reference/`     — real supermarket photos. The visual bar. Not shipped in the game.
- `shots/`         — screenshots agents capture as evidence each round.

## Test surface
Everything renders at a fixed 1280x720 so screenshots are comparable between agents,
and `snap()`/`run()` work with the tab backgrounded (they never depend on rAF).

    const C = window.__CHOP;
    C.pause();
    await C.snap('name');                        // -> shots/name.png
    C.run(4, { keys: ['KeyW','ShiftLeft'] });    // deterministic sim steps
