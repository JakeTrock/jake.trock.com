const SYMS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [6, 3, 0, 7, 4, 1, 8, 5, 2],
  [8, 7, 6, 5, 4, 3, 2, 1, 0],
  [2, 5, 8, 1, 4, 7, 0, 3, 6],
  [2, 1, 0, 5, 4, 3, 8, 7, 6],
  [6, 7, 8, 3, 4, 5, 0, 1, 2],
  [0, 3, 6, 1, 4, 7, 2, 5, 8],
  [8, 5, 2, 7, 4, 1, 6, 3, 0],
];

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function canonicalize(board) {
  let bestKey = null;
  let bestSym = SYMS[0];
  for (const sym of SYMS) {
    const key = sym.map(i => board[i]).join('');
    if (bestKey === null || key < bestKey) {
      bestKey = key;
      bestSym = sym;
    }
  }
  return { key: bestKey, sym: bestSym };
}

function initBeads(key) {
  const ply = [...key].filter(c => c !== '.').length;
  const count = Math.max(1, 4 - Math.floor(ply / 2));
  return [...key].map(c => (c === '.' ? count : 0));
}

function checkWinner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] !== '.' && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return board.includes('.') ? null : { winner: 'D', line: [] };
}

function weightedPick(beads, rng = Math.random) {
  const total = beads.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < beads.length; i++) {
    if (beads[i] > 0) {
      r -= beads[i];
      if (r <= 0) return i;
    }
  }
  return beads.findIndex(b => b > 0);
}

function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

function createInitialState() {
  const empty = '.........';
  return {
    board: empty,
    boxes: { [empty]: initBeads(empty) },
    trail: [], // [{ ply, key, canonMove, realMove, delta }]
    stats: { W: 0, D: 0, L: 0, games: 0 },
    result: null, // { winner: 'X'|'O'|'D', line: [], delta: number }
    turn: 'X',
    desc: 'Initial state — click "MENACE Move" or a cell after MENACE plays.',
  };
}

function ensureBox(boxes, key) {
  if (!boxes[key]) boxes[key] = initBeads(key);
  if (boxes[key].reduce((a, b) => a + b, 0) === 0) {
    boxes[key] = initBeads(key);
  }
  return boxes[key];
}

function applyFinish(state, res) {
  const delta = res.winner === 'X' ? 3 : res.winner === 'D' ? 1 : -1;
  state.result = { ...res, delta };
  state.stats.games++;
  if (res.winner === 'X') state.stats.W++;
  else if (res.winner === 'D') state.stats.D++;
  else state.stats.L++;

  for (const step of state.trail) {
    const box = state.boxes[step.key];
    box[step.canonMove] = Math.max(0, box[step.canonMove] + delta);
    if (box.reduce((a, b) => a + b, 0) === 0) {
      state.boxes[step.key] = initBeads(step.key);
      step.reset = true;
    }
    step.delta = delta;
  }
}

function stepMenace(prevState, rng = Math.random) {
  const s = cloneState(prevState);
  if (s.result || s.turn !== 'X') return s;
  const { key, sym } = canonicalize(s.board);
  const box = ensureBox(s.boxes, key);
  const canonMove = weightedPick(box, rng);
  const realMove = sym[canonMove];
  const ply = [...s.board].filter(c => c !== '.').length + 1;

  s.board = s.board.slice(0, realMove) + 'X' + s.board.slice(realMove + 1);
  s.trail.push({ ply, key, canonMove, realMove, delta: 0 });
  s.turn = 'O';

  const res = checkWinner(s.board);
  if (res) {
    applyFinish(s, res);
    s.desc = `Game #${s.stats.games}: MENACE plays ${realMove + 1} and ${res.winner === 'X' ? 'WINS (+3 beads)' : 'DRAWS (+1 bead)'}`;
  } else {
    s.desc = `Turn ${ply}: MENACE drew cell ${canonMove + 1} from box [${key}] → played cell ${realMove + 1}`;
  }
  return s;
}

function stepHuman(prevState, realMove) {
  const s = cloneState(prevState);
  if (s.result || s.turn !== 'O' || s.board[realMove] !== '.') return s;
  const ply = [...s.board].filter(c => c !== '.').length + 1;
  s.board = s.board.slice(0, realMove) + 'O' + s.board.slice(realMove + 1);
  s.turn = 'X';

  const res = checkWinner(s.board);
  if (res) {
    applyFinish(s, res);
    s.desc = `Game #${s.stats.games}: O plays ${realMove + 1} → ${res.winner === 'O' ? 'O WINS (-1 bead)' : 'DRAW (+1 bead)'}`;
  } else {
    const { key } = canonicalize(s.board);
    ensureBox(s.boxes, key);
    s.desc = `Turn ${ply}: O played cell ${realMove + 1}`;
  }
  return s;
}

function stepNewGame(prevState) {
  const s = cloneState(prevState);
  s.board = '.........';
  s.trail = [];
  s.result = null;
  s.turn = 'X';
  s.desc = `New game started (Matchboxes known: ${Object.keys(s.boxes).length})`;
  return s;
}

// Tactical sparring partner for training: takes 1-move wins, blocks 1-move threats, else random
function pickTrainerMove(board, rng = Math.random) {
  const empty = [...board].map((c, i) => (c === '.' ? i : -1)).filter(i => i >= 0);
  for (const mark of ['O', 'X']) {
    for (const i of empty) {
      const next = board.slice(0, i) + mark + board.slice(i + 1);
      if (checkWinner(next)?.winner === mark) return i;
    }
  }
  return empty[Math.floor(rng() * empty.length)];
}

// Self-check when run via Node
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert');
  // 1. Canonical symmetry check: all 4 corners on empty board canonicalize to 'X........'
  for (const c of [0, 2, 6, 8]) {
    const b = '.........'.slice(0, c) + 'X' + '.........'.slice(c + 1);
    const { key, sym } = canonicalize(b);
    assert.strictEqual(key, '........X', 'Corner canonical key matches');
    assert.strictEqual(sym[8], c, 'Symmetry maps canonical index back to real index');
  }
  // 2. Game progression, reinforcement, and history rewind/replay
  let s0 = createInitialState();
  let s1 = stepMenace(s0, () => 0); // X at 0
  assert.strictEqual(s1.board[0], 'X');
  assert.strictEqual(s1.turn, 'O');
  let s2 = stepHuman(s1, 3); // O at 3
  let s3 = stepMenace(s2, () => 0); // X
  const xMove2 = s3.trail[1].realMove;
  const oMove2 = [0, 1, 2, 3, 4, 5, 6, 7, 8].find(i => s3.board[i] === '.');
  let s4 = stepHuman(s3, oMove2);
  let s5 = stepMenace(s4, () => 0);
  // Test direct win reinforcement (+3 beads)
  let winState = cloneState(s0);
  winState.board = 'XX.OO....';
  winState.trail = [{ ply: 1, key: '.........', canonMove: 0, realMove: 0, delta: 0 }];
  applyFinish(winState, { winner: 'X', line: [0, 1, 2] });
  assert.strictEqual(winState.boxes['.........'][0], 7, 'Win adds +3 beads to 4 = 7');
  assert.strictEqual(winState.stats.W, 1);

  // Test loss reinforcement (-1 bead)
  let lossState = cloneState(s0);
  lossState.trail = [{ ply: 1, key: '.........', canonMove: 0, realMove: 0, delta: 0 }];
  applyFinish(lossState, { winner: 'O', line: [3, 4, 5] });
  assert.strictEqual(lossState.boxes['.........'][0], 3, 'Loss subtracts 1 bead from 4 = 3');
  assert.strictEqual(lossState.stats.L, 1);

  const history = [s0, s1, s2, s3, s4, s5];
  assert.strictEqual(history[1].board, 'X........');
  assert.strictEqual(history[0].board, '.........');
  assert.strictEqual(pickTrainerMove('XX..O....'), 2, 'Trainer blocks X threat at 2');
  assert.strictEqual(pickTrainerMove('XX.OO....'), 5, 'Trainer takes O win at 5 before blocking');
  console.log('menace.js self-check passed');
}
