# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A classic Tetris implementation in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no package.json — just static files served or opened directly.

## Running the game

```bash
open index.html                # macOS, opens directly in the browser
python3 -m http.server 8000    # or any static file server, then visit localhost:8000
```

There is no build, lint, test, or install step — the three files (`index.html`, `style.css`, `game.js`) are loaded as-is.

## Architecture

Everything lives in `game.js` (~300 lines) as top-level state and functions — there are no classes, modules, or bundler. Global mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) is declared once and reset by `init()`.

Key pieces:

- **Board model**: a `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: defined as small square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + reverse), not by storing pre-rotated states.
- **Collision** (`collide`): the single source of truth for whether a shape can occupy a board position; used by movement, rotation, spawn, and ghost-piece projection.
- **Wall kicks** (`tryRotate`): on rotation collision, tries offsetting the piece by `[0, -1, 1, -2, 2]` columns before giving up on the rotation.
- **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and advances the piece one row once `dropInterval` is exceeded.
- **Locking & scoring** (`lockPiece` → `merge` + `clearLines`): merges the current piece into `board`, clears completed rows (scored via `LINE_SCORES` × `level`), and recalculates `level`/`dropInterval` (drop speed increases every 10 lines relative to the chosen starting level: `level = startLevel + floor(lines / 10)`, `dropInterval = computeDropInterval(level) = max(100, 1000 - (level-1)*90)` ms).
- **Rendering** (`draw`, `drawNext`): redraws the full board and next-piece preview each frame onto two separate `<canvas>` elements (`#board`, `#next-canvas`); there is no diffing/dirty-rect optimization.
- **Input**: a single `keydown` listener switches on `e.code` for movement/rotation/soft-drop/hard-drop, plus `KeyP`/`Escape` for pause (handled first, works even while paused, and takes priority over `gameOver`/movement keys).

When tuning gameplay constants (`COLS`, `ROWS`, `BLOCK`), keep the `<canvas id="board">` `width`/`height` attributes in `index.html` in sync — they must equal `COLS × BLOCK` and `ROWS × BLOCK` respectively, since nothing computes them dynamically.

### Pause menu

`KeyP` or `Escape` toggles a dedicated pause menu (`#pause-menu` in `index.html`), separate from the game-over overlay (`#overlay`) — they don't share markup so the two flows can't interfere with each other. `togglePause()` shows/hides `#pause-menu` and cancels/restarts the `requestAnimationFrame` loop; it still no-ops when `gameOver` is true.

The menu has two views inside the same box, toggled via `.hidden` on `#pause-main-view` / `#pause-controls-view` (`showPauseMainView`/`showPauseControlsView`):

- **Main view**: Reanudar (calls `togglePause`), Reiniciar (calls `init()` directly, no page reload), Ver controles (switches view), and a "Nivel inicial" `<select>` (1–15).
- **Controls view**: a read-only key list plus a "Volver" button that returns to the main view without resuming. Its `<ul>` content is copied at load time from the sidebar's controls list (`.controls ul`) so the two lists can't drift out of sync.

While the pause menu is open, `paused` is `true` and the `keydown` listener's `if (paused || gameOver) return;` guard blocks all gameplay keys (movement/rotation/drop) from queuing up — only `KeyP`/`Escape` (checked before that guard) still work, closing the menu and resuming.

The starting-level preference persists to `localStorage` under `tetris.startLevel` (`getStoredStartLevel`/`setStoredStartLevel`, both wrapped in try/catch for environments where storage is unavailable, e.g. `file://`). `init()` seeds `startLevel`/`level` from it and computes `dropInterval` via `computeDropInterval(level)`; `clearLines()` reuses the same helper so level-up speed stays consistent whichever level the run started at.
