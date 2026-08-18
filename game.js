'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const THEMES = {
  retro: {
    name: 'Retro',
    colors: COLORS,
    gridColor: '#22222e',
    bg: '#1a1a25',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    name: 'Neon',
    colors: [
      null,
      '#00e5ff', // I
      '#ffee00', // O
      '#e040fb', // T
      '#00ff6a', // S
      '#ff1744', // Z
      '#3d5cff', // J
      '#ff9100', // L
    ],
    gridColor: '#141420',
    bg: '#000000',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = color;
      context.shadowBlur = size * 0.6;
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      // reset shadow so the glow doesn't leak into subsequent draws (grid, text, etc.)
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.globalAlpha = 1;
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#a8dadc', // I
      '#fff3b0', // O
      '#d8bbff', // T
      '#b8e6b8', // S
      '#ffb3ba', // Z
      '#bcd4ff', // J
      '#ffd9b3', // L
    ],
    gridColor: '#3a3a4a',
    bg: '#26262f',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const w = size - 2;
      const h = size - 2;
      const radius = Math.min(6, w / 3, h / 3);
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.beginPath();
      if (typeof context.roundRect === 'function') {
        context.roundRect(px, py, w, h, radius);
      } else {
        // manual rounded-rect fallback for browsers without roundRect support
        context.moveTo(px + radius, py);
        context.arcTo(px + w, py, px + w, py + h, radius);
        context.arcTo(px + w, py + h, px, py + h, radius);
        context.arcTo(px, py + h, px, py, radius);
        context.arcTo(px, py, px + w, py, radius);
        context.closePath();
      }
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: COLORS,
    gridColor: '#22222e',
    bg: '#1a1a25',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      // 3x3 sub-block texture to fake 8-bit pixel art shading
      const sub = s / 3;
      const lightShade = 'rgba(255,255,255,0.2)';
      const darkShade = 'rgba(0,0,0,0.18)';
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const parity = (r + c) % 3;
          if (parity === 1) continue; // leave some cells as the base color
          context.fillStyle = parity === 0 ? lightShade : darkShade;
          context.fillRect(px + c * sub, py + r * sub, sub, sub);
        }
      }
      context.globalAlpha = 1;
    },
  },
};

let currentTheme = THEMES.retro;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const comboMaxEl = document.getElementById('combo-max');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

const pauseMenu = document.getElementById('pause-menu');
const pauseMainView = document.getElementById('pause-main-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const resumeBtn = document.getElementById('resume-btn');
const restartPauseBtn = document.getElementById('restart-pause-btn');
const controlsBtn = document.getElementById('controls-btn');
const backBtn = document.getElementById('back-btn');
const startLevelSelect = document.getElementById('start-level-select');
const pauseControlsList = document.querySelector('.pause-controls-list');
const sidebarControlsList = document.querySelector('.controls ul');

const START_LEVEL_KEY = 'tetris.startLevel';

let board, current, next, score, lines, level, startLevel, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function computeDropInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}
// combo: -1 = sin racha activa, 0 = primera línea de una racha,
// N = N líneas consecutivas limpiadas justo después de la primera.
// maxCombo / maxLinesAtOnce son los máximos alcanzados durante la partida
// (se leen desde fuera, p.ej. por la pantalla de game over / records).
let board, current, next, score, lines, level, combo, maxCombo, maxLinesAtOnce, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = computeDropInterval(level);
    updateHUD();
    combo++; // -1 -> 0 en la primera línea de la racha, sube en cada limpieza consecutiva
    if (combo > 0) score += 50 * combo * level; // bonus de combo a partir de la 2ª limpieza consecutiva
    if (combo > maxCombo) maxCombo = combo;
    if (cleared > maxLinesAtOnce) maxLinesAtOnce = cleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  } else {
    combo = -1; // lock sin limpiar ninguna línea rompe la racha
  }
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo > 0 ? combo : 0;
  comboMaxEl.textContent = `Máx: ${maxCombo}`; // maxCombo nunca es negativo: solo sube desde 0
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  currentTheme.drawBlock(context, x, y, colorIndex, size, alpha);
}

function applyTheme(id) {
  const themeId = Object.prototype.hasOwnProperty.call(THEMES, id) ? id : 'retro';
  currentTheme = THEMES[themeId];
  try {
    localStorage.setItem('tetris.skin', themeId);
  } catch (e) {
    // localStorage unavailable (file://, private mode, quota, etc.) — ignore
  }
  document.body.dataset.skin = themeId;
  const skinSelect = document.getElementById('skin-select');
  if (skinSelect) skinSelect.value = themeId;
  if (board) {
    draw();
    drawNext();
  }
}

function drawGrid() {
  ctx.strokeStyle = currentTheme.gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function getStoredStartLevel() {
  try {
    const n = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
    if (n >= 1 && n <= 15) return n;
  } catch (e) {
    // localStorage no disponible (p.ej. abierto con file://)
  }
  return 1;
}

function setStoredStartLevel(n) {
  try {
    localStorage.setItem(START_LEVEL_KEY, String(n));
  } catch (e) {
    // localStorage no disponible (p.ej. abierto con file://)
  }
}

function showPauseMainView() {
  pauseMainView.classList.remove('hidden');
  pauseControlsView.classList.add('hidden');
}

function showPauseControlsView() {
  pauseMainView.classList.add('hidden');
  pauseControlsView.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMainView();
    pauseMenu.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  startLevel = getStoredStartLevel();
  level = startLevel;
  level = 1;
  combo = -1;
  maxCombo = 0;
  maxLinesAtOnce = 0;
  paused = false;
  gameOver = false;
  dropInterval = computeDropInterval(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  startLevelSelect.value = String(level);
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  // ignore game shortcuts while a form control (e.g. #skin-select) has focus,
  // so arrow keys/space there change the control instead of moving the piece
  const tag = e.target && e.target.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
restartPauseBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', showPauseControlsView);
backBtn.addEventListener('click', showPauseMainView);
startLevelSelect.addEventListener('change', () => {
  setStoredStartLevel(parseInt(startLevelSelect.value, 10));
});

// El sub-panel "Ver controles" del menú de pausa reutiliza la misma lista
// de teclas que el panel lateral, para no mantener dos copias sincronizadas.
pauseControlsList.innerHTML = sidebarControlsList.innerHTML;

const skinSelect = document.getElementById('skin-select');
if (skinSelect) {
  skinSelect.addEventListener('change', function () {
    applyTheme(this.value);
  });
}

let savedSkin = 'retro';
try {
  savedSkin = localStorage.getItem('tetris.skin') || 'retro';
} catch (e) {
  savedSkin = 'retro';
}
applyTheme(savedSkin);

init();
