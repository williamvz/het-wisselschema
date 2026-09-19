// Hongaars algoritme (Kuhn-Munkres, O(n^3) variant met potentialen).
// Lost het toewijzingsprobleem exact op: welke speler op welke positie,
// zodanig dat de totale "kosten" minimaal zijn.
//
// cost: matrix van n rijen x m kolommen (m >= n), getallen.
// Retourneert een array `assign` waarbij assign[rij] = kolom.

export function hungarian(cost) {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0].length;
  if (m < n) throw new Error('hungarian: meer rijen dan kolommen');

  const INF = Infinity;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0); // p[kolom] = gekoppelde rij (1-based)
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] > 0) assign[p[j] - 1] = j - 1;
  return assign;
}
