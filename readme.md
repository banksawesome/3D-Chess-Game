# CHESSFALL — A Cinematic 3D Chess Experience

A browser chess game built on **Three.js** and **GSAP** with a photoreal 3D board and pieces, powered by **chess.js** for rules and **Stockfish** for the AI. Built for the BTT Web Game Jam, Summer 2026.

## Features

- **VS AI** — five difficulty levels (Beginner, Challenger, Expert, Master, Watch) with configurable side and clock.
- **Local 1v1** — two players on one board, optional rapid / blitz / bullet clocks.
- **Watch Mode** — let the engine play against itself.
- **6 Challenges** — hand-crafted, chess.js-verified puzzles: mates in one, a forced mate in two, save-the-king, and a winning sacrifice.
- **Cinematic presentation** — smooth move and capture animations, camera fly-ins, skip buttons, victory showcase with falling losing pieces.
- **Full rules support** — castling, en passant, promotion, check and checkmate detection.
- **Replay** — step through any finished game move by move.
- **Settings** — persisted to `localStorage` (music, sound, camera damping, hints, board flip).
- **PWA-ready** — manifest + icons; classic white/black board with themed square colors.

## Getting Started

The game must be served over HTTP (Stockfish workers and KTX2 textures won't load from `file://`).

```bash
# any static server works, e.g. Python:
python -m http.server 8080
# then open http://localhost:8080
```

The main menu is shown after the board finishes loading — click **ENTER** to open it.

## Controls

| Action | Input |
| --- | --- |
| Select piece / make move | Click |
| Orbit camera | Drag |
| Zoom | Scroll / pinch |
| Top-down camera | HUD camera button |
| Reset camera | HUD reset button |
| Pause | Esc or pause button |

## Project Structure

```
index.html          Entry page (importmap, overlays, HUD)
main.js             Scene setup, state machine, AI, cinematics, replay, clocks
gameState.js        Shared state machine + persisted settings
ui.js               DOM overlays, menus, HUD
challenges.js       6 curated challenges + validator
camera.js           Camera manager (flip, cinematics, idle drift)
highlights.js       3D move highlights + check indicator
audio.js            Placeholder audio manager (drop your own files)
assets/             GLB model, EXR environment, favicon, icons
ktx2/               KTX2 textures (git-ignored, from the upstream repo)
lib/                chess.min.js, gsap.min.js
jsm/                Three.js add-ons (GLTF/KTX2/Draco loaders, etc.)
stockfish/          Stockfish (stockfish.js + stockfish.wasm)
```

## Audio

The game ships with no audio assets. `audio.js` logs a silent warning for each missing file and continues. Drop your own files into `assets/audio/` using the paths printed in the console:

- `assets/audio/music/menu.mp3`, `gameplay.mp3`, `victory.mp3`
- `assets/audio/sfx/move.wav`, `capture.wav`, `select.wav`, `check.wav`, `checkmate.wav`, `victory.wav`, `defeat.wav`, `ui-click.wav`, `promotion.wav`

## Technologies

- [Three.js](https://threejs.org/) — 3D rendering (with KTX2 / Draco / GLTF loaders)
- [GSAP](https://greensock.com/gsap/) — animations
- [chess.js](https://github.com/jhlywa/chess.js) — rules and move validation
- [Stockfish](https://stockfishchess.org/) — AI engine (WebAssembly build)

## Screenshots

### Environment
![Environment](screenshots/Image1.png)
### Pieces and Animation
![Pieces and Animation](screenshots/Image2.png)
### Automatic Player
![Automatic Player](screenshots/Image3.png)
### Winner Showcase
![Winner Showcase](screenshots/Image4.png)

## License

MIT — see [LICENSE](LICENSE). Forked from [mrabhin03/3D-Chess-Game](https://github.com/mrabhin03/3D-Chess-Game.git).
