// OWNER: builder-game. Mode flow, scoring, rank, harassment complaints, HUD copy.
// CONTRACT — must keep exporting exactly this:
//   createGame(hudEl) -> { mode, update(dt), enterFloor(aisleIndex), enterDesk(),
//                          score(evt), render() }
// Modes: 'desk' (monitor wall) | 'floor' (on foot) | 'writeup' | 'demoted'
export const RANKS = ['Traffic Duty', 'Cart Corral', 'Loss Prevention', 'Senior LP', 'Chief of Chops'];

export function createGame(hudEl) {
  const st = { mode: 'desk', points: 0, complaints: 0, rank: 2, caught: 0, escaped: 0 };
  return {
    st,
    get mode() { return st.mode; },
    enterFloor(i) { st.mode = 'floor'; st.aisle = i; },
    enterDesk() { st.mode = 'desk'; },
    score(evt) {
      if (evt === 'catch') { st.points += 100; st.caught++; }
      if (evt === 'escape') { st.escaped++; }
      if (evt === 'harass') { st.complaints++; if (st.complaints >= 3) st.rank = 0; }
    },
    update() {},
    render() {
      hudEl.textContent = `${RANKS[st.rank]}  ·  ${st.points} pts  ·  ${st.complaints} complaints`;
    },
  };
}
