# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A classic Tetris implementation in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no package.json — just static files served or opened directly.

## Running the game

```bash
open index.html                # macOS, opens directly in the browser
python3 -m http.server 8000    # or any static file server, then visit localhost:8000
```

There is no build, lint, test, or install step — the files (`index.html`, `style.css`, `game.js`, `highscores.js`) are loaded as-is.

## Architecture

Everything lives in `game.js` (~300 lines) as top-level state and functions — there are no classes, modules, or bundler. Global mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) is declared once and reset by `init()`.

Key pieces:

- **Board model**: a `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: defined as small square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + reverse), not by storing pre-rotated states.
- **Collision** (`collide`): the single source of truth for whether a shape can occupy a board position; used by movement, rotation, spawn, and ghost-piece projection.
- **Wall kicks** (`tryRotate`): on rotation collision, tries offsetting the piece by `[0, -1, 1, -2, 2]` columns before giving up on the rotation.
- **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and advances the piece one row once `dropInterval` is exceeded.
- **Locking & scoring** (`lockPiece` → `merge` + `clearLines`): merges the current piece into `board`, clears completed rows (scored via `LINE_SCORES` × `level`), and recalculates `level`/`dropInterval` (drop speed increases every 10 lines: `max(100, 1000 - (level-1)*90)` ms).
- **Rendering** (`draw`, `drawNext`): redraws the full board and next-piece preview each frame onto two separate `<canvas>` elements (`#board`, `#next-canvas`); there is no diffing/dirty-rect optimization.
- **Input**: a single `keydown` listener switches on `e.code` for movement/rotation/soft-drop/hard-drop, plus `KeyP` for pause (handled first, works even while paused).
- **High scores** (`highscores.js`): standalone, DOM-free module loaded via `<script src="highscores.js"></script>` **before** `game.js`, and self-registers on `window.HighScores` (IIFE, no ES modules/bundler). Persists a top-5 leaderboard plus historical `bestCombo`/`maxLines` aggregates to `localStorage` under the key `tetris.highscores`, versioned (`{ v, scores, bestCombo, maxLines }`) for future migrations. Public API: `load()` reads the current state, `qualifies(score)` checks if a score would enter the top 5, `add(entry)` inserts/reorders/trims and updates aggregates then persists, `reset()` clears everything. All `localStorage` access is wrapped in `try/catch` with an in-memory fallback (needed for `file://` usage), and malformed/corrupt stored JSON is treated as "no data" rather than thrown. Not wired into `game.js` yet — UI that reads scores on game over / shows a start-screen leaderboard consumes this API separately.

When tuning gameplay constants (`COLS`, `ROWS`, `BLOCK`), keep the `<canvas id="board">` `width`/`height` attributes in `index.html` in sync — they must equal `COLS × BLOCK` and `ROWS × BLOCK` respectively, since nothing computes them dynamically.
