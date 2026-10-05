const TOTAL_CARDS = 500;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function cardFor(no) {
  const rng = mulberry32(no * 9973);
  const cols = [
    { min: 1, max: 15 }, { min: 16, max: 30 }, { min: 31, max: 45 },
    { min: 46, max: 60 }, { min: 61, max: 75 }
  ];
  const rows = [];
  for (let r = 0; r < 5; r++) {
    const row = [];
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) { row.push(0); continue; }
      const pool = [];
      for (let n = cols[c].min; n <= cols[c].max; n++) {
        const used = rows.some(rr => rr[c] === n);
        if (!used) pool.push(n);
      }
      row.push(pool[Math.floor(rng() * pool.length)]);
    }
    rows.push(row);
  }
  return rows;
}

export const WIN_PATTERNS = [
  { id: 'row', name: 'Any Row', lines: [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24]] },
  { id: 'column', name: 'Any Column', lines: [[0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24]] },
  { id: 'main-diagonal', name: 'Main Diagonal', lines: [[0,6,12,18,24]] },
  { id: 'reverse-diagonal', name: 'Reverse Diagonal', lines: [[4,8,12,16,20]] },
  { id: 'four-corners', name: 'Four Corners', lines: [[0,4,20,24]] }
];

export function winningResult(card, drawnSet) {
  for (const pattern of WIN_PATTERNS) {
    for (const line of pattern.lines) {
      let complete = true, real = false;
      for (const idx of line) {
        const n = card[Math.floor(idx / 5)][idx % 5];
        if (n === 0) continue;
        if (!drawnSet.has(n)) { complete = false; break; }
        real = true;
      }
      if (complete && real) return { pattern, line };
    }
  }
  return null;
}

export { TOTAL_CARDS };
