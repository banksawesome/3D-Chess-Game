/* ============================================================
   CHESSFALL - main.js
   A cinematic 3D chess experience (BTT Web Game Jam, Summer 2026).
   Built on the original 3D-Chess-Game by mrabhin03 (MIT).
   - Three.js scene from assets/ChessGLB.glb (classic B/W board)
   - chess.js for rules, Stockfish.js for the AI
   - Modes: VS AI, Local 1v1, Watch, Challenges
   - Cinematic move/capture animations, replay, clocks, settings
   ============================================================ */

import * as THREE from "three";
import Stats from "three/addons/libs/stats.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "./jsm/loaders/KTX2Loader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

import {
  State,
  setState,
  getState,
  canInteract,
  SETTINGS,
  loadSettings,
  sessionHints,
  markChallengeComplete,
} from "./gameState.js";
import { audioManager } from "./audio.js";
import { cameraManager } from "./camera.js";
import { HighlightManager, CHESS_COLORS } from "./highlights.js?v=1";
import { ui } from "./ui.js";
import { getChallenge } from "./challenges.js";

/* ------------------------------------------------------------
   Constants & shared state
   ------------------------------------------------------------ */

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SMOKE_MODE =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("smoke");

const TYPE_NAME = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };
const PROMO_TYPE = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" };
const CLOCK_SECONDS = { rapid: 600, blitz: 180, bullet: 60 };
const AI_CFG = {
  beginner: { skill: 1, ms: 300 },
  challenger: { skill: 8, ms: 700 },
  expert: { skill: 14, ms: 1200 },
  master: { skill: 20, ms: 2000 },
  watch: { skill: 10, ms: 450 },
};

const links = {
  Github: "https://x.com/awesomebanks12",
  Insta: "https://banksawesome.vercel.app/",
  Linkedin: "https://www.linkedin.com/in/awesomebanks/",
};

let renderer, scene, camera, controls, pmremGenerator, stats;

const Sizes = { Width: window.innerWidth, Height: window.innerHeight };
const targetObjects = [];
const ChessPieces = [];
const Squares = {};
const DiffPieces = {};
const Socials = [];
let chessGroup = null;
let TurnDis = [];

let BlackStorage = [];
let WhiteStorage = [];
let Blackout = 0;
let Whiteout = 0;

let pointer = new THREE.Vector2();
let currentIntersects = [];
let HoveredObject = null;
let selectedPiece = null;
let canMoveTo = [];
let game = null;

let mode = "menu";
let humanSide = "w";
let difficulty = "challenger";
let clockChoice = "casual";
let lastOpts = null;
let clockMs = null;
let gameStartedAt = 0;
let totalCaptures = 0;
let currentThinkMs = 700;

let challenge = null;
let challengeStep = 0;

let pendingPromotion = null;
let pendingPause = false;
let pendingFinalizeMove = null;
let boardReady = false;
let camLocked = false;

const replay = { moves: [], index: 0, playing: false, timer: null, busy: false };

/* ------------------------------------------------------------
   Utilities
   ------------------------------------------------------------ */

const timers = new Set();
function later(fn, ms) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
  return t;
}
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

function pieceAt(sq) {
  return ChessPieces.find((p) => p.userData.NowAt === sq);
}

function squareKeyOf(child) {
  return child.name.includes("Piece")
    ? child.userData.NowAt
    : child.name.includes("Square")
      ? child.name.replace(/_/g, " ").split(" ")[1]
      : null;
}

function findKingSquare(color) {
  for (let r = 1; r <= 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = "abcdefgh"[c] + r;
      const p = game.get(sq);
      if (p && p.type === "k" && p.color === color) return sq;
    }
  }
  return null;
}

function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function formatElapsed(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  if (m >= 60) {
    return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function removeFromArrays(p) {
  let i = ChessPieces.indexOf(p);
  if (i >= 0) ChessPieces.splice(i, 1);
  i = targetObjects.indexOf(p);
  if (i >= 0) targetObjects.splice(i, 1);
}

/* ------------------------------------------------------------
   Engine (Stockfish with simple fallback)
   ------------------------------------------------------------ */

let engine = null;
let engineOk = false;
try {
  engine = new Worker("stockfish/stockfish.js");
  engineOk = true;
} catch (e) {
  engineOk = false;
}

function setEngineDifficulty() {
  const cfg = AI_CFG[mode === "watch" ? "watch" : difficulty] || AI_CFG.challenger;
  currentThinkMs = cfg.ms;
  if (engineOk) {
    engine.postMessage("setoption name Skill Level value " + cfg.skill);
  }
}

function askStockfishMove(fen) {
  return new Promise((resolve) => {
    if (!engineOk) {
      const fb = pickFallbackMove();
      resolve(fb ? fb.from + fb.to + (fb.promotion || "") : null);
      return;
    }
    let done = false;
    const finish = (mv) => {
      if (!done) {
        done = true;
        resolve(mv);
      }
    };
    engine.postMessage("position fen " + fen);
    engine.postMessage("go movetime " + currentThinkMs);
    engine.onmessage = (e) => {
      if (typeof e.data === "string" && e.data.startsWith("bestmove")) {
        const best = e.data.split(" ")[1];
        finish(best && best !== "(none)" ? best : null);
      }
    };
    setTimeout(() => finish(null), currentThinkMs + 1500);
  });
}

function pickFallbackMove() {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;
  const value = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    let score = 0;
    if (m.captured) score += (value[m.captured] || 0) * 10 - (value[m.piece] || 0);
    if (m.san.includes("+")) score += 2;
    if (m.san.includes("#")) score += 100;
    if (m.san === "O-O" || m.san === "O-O-O") score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/* ------------------------------------------------------------
   Scene setup (three.js)
   ------------------------------------------------------------ */

function initializeCamera() {
  camera = new THREE.PerspectiveCamera(45, Sizes.Width / Sizes.Height, 0.02, 100);
  camera.position.set(0, 1.9, -2.4);
}

function initializeRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(Sizes.Width, Sizes.Height);
  renderer.toneMappingExposure = 2.5;
}

function initializeScene() {
  const container = document.getElementById("container");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7692e7);
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffe4b6, 0.5);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffe4b6, 1);
  dirLight.position.set(18.13, 15.78, 17.951);
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  dirLight.castShadow = !isMobile;
  if (!isMobile) {
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
  }
  scene.add(dirLight);
}

function initializeControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.7, 0);
  controls.enableDamping = true;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 2 - 0.29;
  controls.minDistance = 0.5;
  controls.maxDistance = 3.5;
  controls.zoomSpeed = 2;
  controls.enablePan = false;
  controls.update();
  cameraManager.init(camera, controls);
}

function initializeEnvironment() {
  if (SMOKE_MODE) return;
  pmremGenerator = new THREE.PMREMGenerator(renderer);
  new EXRLoader()
    .setPath("assets/")
    .load("TheHdr.exr", (texture) => {
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      scene.background = envMap;
      texture.dispose();
      pmremGenerator.dispose();
    });
}

/* ------------------------------------------------------------
   Board construction from GLB
   ------------------------------------------------------------ */

function squareColor(key) {
  const file = key.charCodeAt(0) - 97;
  const rank = parseInt(key[1], 10);
  return (file + rank) % 2 === 1 ? CHESS_COLORS.BLACK_SQUARE : CHESS_COLORS.WHITE_SQUARE;
}

function addShadowPlane(child) {
  const shadowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(0x000000) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      uniform vec3 uColor;
      void main() {
        float dist = distance(vUv, vec2(0.5));
        float alpha = smoothstep(0.5, 0.0, dist);
        gl_FragColor = vec4(uColor, alpha * uOpacity);
      }
    `,
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.047, 0.047), shadowMaterial);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.001;
  shadowPlane.name = "shadowPlane";
  child.add(shadowPlane);
}

function duplicatePiece(original) {
  original.updateMatrixWorld(true);
  const copy = original.clone(true);
  copy.traverse((child) => {
    if (child.isMesh) {
      child.material = Array.isArray(child.material)
        ? child.material.map((m) => m.clone())
        : child.material.clone();
    }
  });
  try {
    copy.userData = JSON.parse(JSON.stringify(original.userData));
  } catch (e) {
    copy.userData = { ...original.userData };
  }
  const parent = original.parent;
  if (parent) parent.add(copy);
  copy.position.copy(original.position);
  copy.quaternion.copy(original.quaternion);
  copy.scale.copy(original.scale);
  return copy;
}

function placeFromFEN(fen) {
  game = new Chess(fen);

  for (const p of [...ChessPieces]) {
    if (p.userData.isTemplate) {
      p.visible = false;
    } else {
      if (p.parent) p.parent.remove(p);
      removeFromArrays(p);
    }
  }
  ChessPieces.length = 0;
  targetObjects.length = 0;
  Blackout = 0;
  Whiteout = 0;
  selectedPiece = null;
  canMoveTo = [];
  pendingPromotion = null;

  for (let r = 1; r <= 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = "abcdefgh"[c] + r;
      const piece = game.get(sq);
      if (!piece) continue;
      const tpl = DiffPieces[piece.color === "w" ? "White" : "Black"]?.[TYPE_NAME[piece.type]];
      if (!tpl) continue;
      const clone = duplicatePiece(tpl);
      clone.userData.isTemplate = false;
      clone.userData.captured = false;
      clone.userData.NowAt = sq;
      clone.position.copy(Squares[sq].userData.MainPosition);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.visible = true;
      ChessPieces.push(clone);
      targetObjects.push(clone);
    }
  }

  if (ui) {
    ui.renderHistory([]);
    ui.hidePromotion();
  }
  if (highlights) {
    highlights.clear();
    highlights.clearCheck();
  }
}

/* ------------------------------------------------------------
   Piece movement & cinematics
   ------------------------------------------------------------ */

function animatePieceTo(piece, from, to, duration, jump) {
  const target = Squares[to].userData.MainPosition;
  gsap.killTweensOf(piece.position);
  if (jump) {
    gsap.to(piece.position, {
      x: target.x,
      z: target.z,
      duration,
      ease: "power2.inOut",
    });
    gsap.to(piece.position, {
      y: target.y + 0.08,
      duration: duration / 2,
      yoyo: true,
      repeat: 1,
      ease: "power1.out",
    });
  } else {
    gsap.to(piece.position, {
      x: target.x,
      z: target.z,
      duration,
      ease: "power4",
    });
    gsap.to(piece.position, {
      y: target.y + 0.02,
      duration: duration / 3.5,
      yoyo: true,
      repeat: 1,
      ease: "power1",
    });
  }
}

function animateMove(piece, from, to, isKnight, delay) {
  const fromWorld = new THREE.Vector3();
  const toWorld = new THREE.Vector3();
  Squares[from].getWorldPosition(fromWorld);
  Squares[to].getWorldPosition(toWorld);
  const distance = Math.min(0.3, Math.max(0.15, fromWorld.distanceTo(toWorld)));
  const duration = distance * 4;
  const target = Squares[to].userData.MainPosition;
  gsap.killTweensOf(piece.position);
  if (isKnight) {
    gsap.to(piece.position, {
      x: target.x,
      z: target.z,
      duration,
      delay,
      ease: "power2.inOut",
    });
    gsap.to(piece.position, {
      y: target.y + 0.06,
      duration: duration / 2,
      delay: delay + 0.1,
      yoyo: true,
      repeat: 1,
      ease: "power1.out",
    });
  } else {
    gsap.to(piece.position, {
      x: target.x,
      z: target.z,
      duration,
      delay,
      ease: "power4",
    });
    gsap.to(piece.position, {
      y: target.y + 0.02,
      duration: duration / 3.5,
      delay,
      yoyo: true,
      repeat: 1,
      ease: "power1",
    });
  }
  return duration;
}

function animateCapture(piece) {
  gsap.killTweensOf(piece.scale);
  gsap.to(piece.scale, {
    x: 0,
    y: 0,
    z: 0,
    duration: 0.45,
    ease: "back.inOut",
  });
}

function finalizeCaptureToTray(piece) {
  let tray = null;
  if (piece.userData.color === "Black") {
    if (BlackStorage.length > Blackout) {
      Blackout++;
      tray = BlackStorage[Blackout];
    }
  } else {
    if (WhiteStorage.length > Whiteout) {
      Whiteout++;
      tray = WhiteStorage[Whiteout];
    }
  }
  if (tray) {
    gsap.to(piece.position, {
      x: tray.position.x,
      y: tray.position.y,
      z: tray.position.z,
      duration: 0.55,
      ease: "power2.inOut",
      delay: 0.15,
    });
    gsap.to(piece.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 0.4,
      ease: "back.inOut",
      delay: 0.4,
    });
  } else {
    gsap.to(piece.scale, { x: 0, y: 0, z: 0, duration: 0.4, ease: "back.inOut" });
    later(() => {
      if (piece.parent) piece.parent.remove(piece);
    }, 450);
  }
  removeFromArrays(piece);
}

function finalizePromotion(move, pawn) {
  const color = move.color === "w" ? "White" : "Black";
  const tpl = DiffPieces[color]?.[PROMO_TYPE[move.promotion]];
  if (tpl) {
    const clone = duplicatePiece(tpl);
    clone.userData.isTemplate = false;
    clone.userData.captured = false;
    clone.userData.NowAt = move.to;
    clone.position.copy(Squares[move.to].userData.MainPosition);
    clone.scale.set(0.001, 0.001, 0.001);
    clone.visible = true;
    ChessPieces.push(clone);
    targetObjects.push(clone);
    gsap.to(clone.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 0.45,
      ease: "back.inOut",
      delay: 0.1,
    });
    audioManager.playSfx("promotion");
  }
  if (pawn.parent) pawn.parent.remove(pawn);
  removeFromArrays(pawn);
}

function MoveTo(from, To, promoPiece) {
  if (game.game_over()) return;
  if (!Squares[To]) return;
  const piece = pieceAt(from);
  if (!piece) return;

  clearSelectPiece();
  const move = game.move({ from, to: To, promotion: promoPiece || "q" });
  if (!move) return;

  const isKnight = piece.userData.Name === "Knight";
  piece.userData.NowAt = To;

  let delay = 0;
  let captured = null;
  if (move.captured) {
    const capSq = move.flags.includes("e") ? To[0] + from[1] : To;
    captured = pieceAt(capSq);
    if (captured) {
      captured.userData.captured = true;
      animateCapture(captured);
    }
    totalCaptures++;
    audioManager.playSfx("capture");
  } else {
    audioManager.playSfx("move");
  }

  setState(State.ANIMATING);
  ui.showSkip(true);
  const duration = animateMove(piece, from, To, isKnight, delay);

  if (move.flags.includes("k") || move.flags.includes("q")) {
    let rookFrom = null;
    let rookTo = null;
    if (move.flags.includes("k")) {
      rookFrom = move.color === "w" ? "h1" : "h8";
      rookTo = move.color === "w" ? "f1" : "f8";
    } else {
      rookFrom = move.color === "w" ? "a1" : "a8";
      rookTo = move.color === "w" ? "d1" : "d8";
    }
    const rook = pieceAt(rookFrom);
    if (rook) {
      rook.userData.NowAt = rookTo;
      animatePieceTo(rook, rookFrom, rookTo, duration, false);
    }
  }

  pendingFinalizeMove = () => finalizeMove(move, piece, captured);
  later(pendingFinalizeMove, (delay + duration + 0.25) * 1000);
}

function finalizeMove(move, movedPiece, captured) {
  pendingFinalizeMove = null;
  window.__CF_HISTORY_LEN__ = game.history().length;
  window.__CF_LAST_SAN__ = move ? move.san : null;
  window.__CF_TURN__ = game.turn();

  if (captured) finalizeCaptureToTray(captured);
  if (move.promotion) finalizePromotion(move, movedPiece);

  /* ---- challenge flow (handled entirely here) ---- */
  if (mode === "challenge") {
    const handled = challengeEval(move);
    if (handled || game.game_over()) {
      ui.showSkip(false);
      setState(State.CHALLENGE);
      return;
    }
    ui.showSkip(false);
    setState(State.CHALLENGE);
    return;
  }

  if (move.san) ui.renderHistory(game.history());

  TurnDisplay(game.turn() === "w" ? 0 : 1);
  ui.setTurn(game.turn() === "w" ? "WHITE'S TURN" : "BLACK'S TURN", game.turn());
  ui.setActiveClock(game.turn());

  if (game.in_check()) {
    audioManager.playSfx("check");
    ui.showCheck(true);
    const ksq = findKingSquare(game.turn());
    if (ksq) highlights.showCheck(ksq);
  } else {
    highlights.clearCheck();
  }
  highlights.showMovePair(move.from, move.to);

  if (game.game_over()) {
    handleGameOver();
    return;
  }

  setState(State.PLAYING);
  ui.showSkip(false);

  if (pendingPause) {
    pendingPause = false;
    openPauseMenu();
    return;
  }

  botChecker();
}

function skipCinematic() {
  if (getState() !== State.ANIMATING) return;
  for (const p of ChessPieces) {
    gsap.killTweensOf(p.position);
    gsap.killTweensOf(p.scale);
    if (p.userData.captured) {
      p.scale.set(0, 0, 0);
      p.visible = false;
    } else if (Squares[p.userData.NowAt]) {
      p.position.copy(Squares[p.userData.NowAt].userData.MainPosition);
    }
  }
  clearTimers();
  const fn = pendingFinalizeMove;
  pendingFinalizeMove = null;
  if (fn) fn();
}

/* ------------------------------------------------------------
   Selection & interaction
   ------------------------------------------------------------ */

function clearSelectPiece() {
  if (selectedPiece) {
    gsap.killTweensOf(selectedPiece.scale);
    gsap.to(selectedPiece.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 0.2,
      ease: "power4",
    });
    ShadowAnimation(selectedPiece, 1, { r: 0, g: 0, b: 0 }, -1, 0.5, 0);
    selectedPiece = null;
  }
  canMoveTo = [];
  if (highlights) highlights.clear();
}

function ShadowAnimation(obj, opacity, color, scale, duration, delay) {
  const shadow = obj.getObjectByName("shadowPlane", true);
  if (shadow && shadow.material.uniforms) {
    if (scale >= 0) {
      gsap.to(shadow.scale, { x: scale, y: scale, duration, delay });
    } else {
      gsap.to(shadow.scale, { x: 1, y: 1, duration, delay });
    }
    gsap.to(shadow.material.uniforms.uOpacity, { value: opacity, duration, delay });
    const colorObj = {
      r: shadow.material.uniforms.uColor.value.r,
      g: shadow.material.uniforms.uColor.value.g,
      b: shadow.material.uniforms.uColor.value.b,
    };
    gsap.to(colorObj, {
      r: color.r,
      g: color.g,
      b: color.b,
      duration,
      delay,
      onUpdate: () => {
        shadow.material.uniforms.uColor.value.setRGB(colorObj.r, colorObj.g, colorObj.b);
      },
    });
  }
}

function sideKey(name) {
  return name.toLowerCase() === "white" ? "w" : "b";
}

function colorCheck(obj, mover) {
  const sq = squareKeyOf(obj);
  const p = sq ? pieceAt(sq) : null;
  if (!p) return false;
  return sideKey(p.userData.color) === mover;
}

function isHumanTurn() {
  if (!game || game.game_over()) return false;
  if (mode === "ai") return game.turn() === humanSide;
  if (mode === "challenge") return game.turn() === challenge.side;
  if (mode === "watch") return false;
  return true;
}

function canActForCurrentTurn() {
  return canInteract() && isHumanTurn();
}

function PromotionCheck(from, To, promo) {
  if (promo) {
    MoveTo(from, To, promo);
    return;
  }
  const piece = game.get(from);
  if (
    piece &&
    piece.type === "p" &&
    ((piece.color === "w" && To[1] === "8") || (piece.color === "b" && To[1] === "1"))
  ) {
    pendingPromotion = { from, to: To };
    setState(State.PROMOTION);
    ui.showPromotion();
    return;
  }
  MoveTo(from, To, "q");
}

function handlePointerMove(e) {
  const x = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
  const y = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
  pointer.x = (x / window.innerWidth) * 2 - 1;
  pointer.y = -(y / window.innerHeight) * 2 + 1;
}

function handlePointerClick(e) {
  if (!e.target.closest("#container")) return;
  e.preventDefault();

  if (currentIntersects.length > 0) {
    const obj = resolveIntersect();
    for (const [key, url] of Object.entries(links)) {
      if (obj.name.includes(key)) {
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (win) {
          win.opener = null;
          win.location = url;
        }
        return;
      }
    }
  }

  if (!canActForCurrentTurn()) return;
  if (getState() !== State.PLAYING && getState() !== State.CHALLENGE) return;

  if (currentIntersects.length > 0) {
    const obj = resolveIntersect();
    const isBoard = obj.name.includes("Square") || obj.name.includes("Piece");
    if (!isBoard) {
      clearSelectPiece();
      return;
    }
    if (selectedPiece && !colorCheck(obj, game.turn())) {
      const nextMove = squareKeyOf(obj);
      if (nextMove && canMoveTo.some((m) => m.to === nextMove)) {
        PromotionCheck(selectedPiece.userData.NowAt, nextMove);
        return;
      }
    }
    trySelectPiece(squareKeyOf(obj));
  } else {
    clearSelectPiece();
  }
}

function trySelectPiece(squareKey) {
  if (!squareKey) {
    clearSelectPiece();
    return false;
  }
  const mover = game.turn();
  const picked = pieceAt(squareKey);
  if (picked && sideKey(picked.userData.color) === mover) {
    clearSelectPiece();
    selectedPiece = picked;
    audioManager.playSfx("select");
    gsap.to(picked.scale, {
      x: 1.3,
      y: 1.3,
      z: 1.3,
      duration: 0.2,
      ease: "power4",
    });
    ShadowAnimation(picked, 1, { r: 1, g: 1, b: 1 }, 1.1, 0.5, 0);
    canMoveTo = game.moves({ square: picked.userData.NowAt, verbose: true });
    highlights.showMoves(canMoveTo, SETTINGS.showLegalMoves);
    return true;
  }
  clearSelectPiece();
  return false;
}

function resolveIntersect() {
  const o = currentIntersects[0].object;
  return o.name.includes("shadowPlane") ? o.parent : o;
}

/* ------------------------------------------------------------
   Turn display (3D markers) & bot scheduling
   ------------------------------------------------------------ */

function TurnDisplay(turn) {
  if (!TurnDis[0] || !TurnDis[1]) return;
  if (turn === -1) {
    TurnDis[0].position.y = TurnDis[0].userData.MainPosition.y;
    TurnDis[1].position.y = TurnDis[1].userData.MainPosition.y;
    return;
  }
  gsap.to(TurnDis[turn % 2].position, {
    y: TurnDis[turn % 2].userData.MainPosition.y + 0.01,
    duration: 0.2,
    ease: "power2.inOut",
  });
  gsap.to(TurnDis[(turn + 1) % 2].position, {
    y: TurnDis[(turn + 1) % 2].userData.MainPosition.y,
    duration: 0.2,
    ease: "power2.inOut",
  });
}

function botChecker() {
  if (!game || game.game_over()) return;
  if (mode === "watch") {
    if (getState() === State.PLAYING) later(botMove, 450);
    return;
  }
  if (mode === "ai" && game.turn() !== humanSide) {
    if (getState() === State.PLAYING) later(botMove, 450);
  }
}

async function botMove() {
  if (!game || game.game_over()) return;
  const shouldRun = mode === "watch" || (mode === "ai" && game.turn() !== humanSide);
  if (!shouldRun || getState() !== State.PLAYING) return;

  setState(State.AI_THINKING);
  ui.showThinking(true);

  const fen = game.fen();
  const uci = await askStockfishMove(fen);

  ui.showThinking(false);
  if (game.game_over()) {
    setState(State.PLAYING);
    return;
  }

  let move = null;
  if (uci && uci.length >= 4) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const legal = game
      .moves({ square: from, verbose: true })
      .some((m) => m.to === to);
    if (legal) move = { from, to, promotion: uci.length >= 5 ? uci[4] : "q" };
  }
  if (!move) move = pickFallbackMove();

  if (move) {
    MoveTo(move.from, move.to, move.promotion || "q");
  } else {
    setState(mode === "challenge" ? State.CHALLENGE : State.PLAYING);
  }
}

function challengeOpponentMove() {
  const moves = game.moves();
  if (!moves.length) return;
  const m = moves[Math.floor(Math.random() * moves.length)];
  MoveTo(m.from, m.to, m.promotion || "q");
}

/* ------------------------------------------------------------
   Challenge mode
   ------------------------------------------------------------ */

function challengeEval(move) {
  if (move.color === challenge.side) {
    if (move.san === challenge.solution[challengeStep]) {
      challengeStep++;
      if (challengeStep >= challenge.solution.length) {
        challengeSolved();
        return true;
      }
    } else {
      challengeFailed();
      return true;
    }
  }

  if (!game.game_over() && game.turn() !== challenge.side) {
    later(challengeOpponentMove, 250);
  }
  return false;
}

function challengeSolved() {
  markChallengeComplete(challenge.id);
  audioManager.playSfx("victory");
  TurnDisplay(-1);
  later(() => {
    ui.showChallengeResult(true, "Perfect move — " + challenge.title + " solved!");
  }, 900);
}

function challengeFailed() {
  audioManager.playSfx("defeat");
  placeFromFEN(challenge.fen);
  challengeStep = 0;
  later(() => {
    ui.showChallengeResult(false, "Not quite. Hint: " + (challenge.hint || "keep thinking."));
  }, 900);
}

/* ------------------------------------------------------------
   Game over & showcase
   ------------------------------------------------------------ */

function victoryShowcase(winner) {
  for (const ele of [...ChessPieces]) {
    if (ele.userData.color !== winner) {
      gsap.to(ele.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 0.7,
        ease: "back.inOut",
      });
      later(() => {
        if (ele.parent) ele.parent.remove(ele);
        removeFromArrays(ele);
      }, 800);
    }
  }
  const king = ChessPieces.find((p) => p.userData.color === winner && p.userData.Name === "King");
  if (king) {
    const center = new THREE.Vector3()
      .addVectors(Squares.d4.userData.MainPosition, Squares.e5.userData.MainPosition)
      .multiplyScalar(0.5);
    gsap.to(king.position, {
      x: center.x,
      y: king.userData.MainPosition.y + 0.05,
      z: center.z,
      duration: 1,
      ease: "back.inOut",
    });
    gsap.to(king.rotation, { y: "+=" + Math.PI * 2, duration: 1.6, repeat: -1, ease: "linear" });
    gsap.to(king.position, {
      y: king.userData.MainPosition.y + 0.05,
      duration: 1.6,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  }
}

function drawShowcase() {
  const kings = ChessPieces.filter((p) => p.userData.Name === "King");
  kings.forEach((king, i) => {
    const center = new THREE.Vector3()
      .addVectors(Squares.d4.userData.MainPosition, Squares.e5.userData.MainPosition)
      .multiplyScalar(0.5);
    const target = center.clone().add(new THREE.Vector3(i === 0 ? -0.18 : 0.18, king.userData.MainPosition.y + 0.04, 0));
    gsap.to(king.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 1,
      ease: "back.inOut",
    });
    gsap.to(king.rotation, { y: "+=" + Math.PI * 2, duration: 2, repeat: -1, ease: "linear" });
    gsap.to(king.position, {
      y: target.y + 0.03,
      duration: 1.8,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  });
}

function handleGameOver() {
  setState(State.GAME_OVER);
  ui.showSkip(false);
  highlights.clear();
  highlights.clearCheck();
  TurnDisplay(-1);

  const mover = game.turn();
  const winner = mover === "w" ? "Black" : "White";
  let title;
  let subtitle;

  if (game.in_checkmate()) {
    audioManager.playSfx("checkmate");
    title = "CHECKMATE";
    if (mode === "ai") {
      subtitle = sideKey(winner) === humanSide ? "YOU WIN" : "YOU LOSE";
      if (sideKey(winner) === humanSide) audioManager.playSfx("victory");
      else audioManager.playSfx("defeat");
    } else if (mode === "challenge") {
      subtitle = winner + " WINS";
    } else {
      subtitle = winner.toUpperCase() + " WINS";
    }
    victoryShowcase(winner);
  } else {
    title = "DRAW";
    subtitle = game.in_stalemate()
      ? "STALEMATE"
      : game.is_insufficient_material()
        ? "INSUFFICIENT MATERIAL"
        : "DRAW";
    drawShowcase();
  }

  audioManager.playMusic("victory");

  const elapsed = Math.max(0, Math.round((Date.now() - gameStartedAt) / 1000));
  later(() => {
    ui.showResult({
      title,
      subtitle,
      moves: game.history().length,
      captures: totalCaptures,
      time: formatElapsed(elapsed),
      canReplay: true,
    });
  }, 2600);
}

function flagFall(loser) {
  if (getState() === State.GAME_OVER) return;
  setState(State.GAME_OVER);
  ui.showSkip(false);
  highlights.clear();
  highlights.clearCheck();
  TurnDisplay(-1);
  const winner = loser === "w" ? "Black" : "White";
  if (mode === "ai") {
    if (sideKey(winner) === humanSide) audioManager.playSfx("victory");
    else audioManager.playSfx("defeat");
  }
  ui.showResult({
    title: "TIME UP",
    subtitle: winner.toUpperCase() + " WINS ON TIME",
    moves: game.history().length,
    captures: totalCaptures,
    time: formatElapsed(Math.max(0, Math.round((Date.now() - gameStartedAt) / 1000))),
    canReplay: true,
  });
}

/* ------------------------------------------------------------
   Clocks
   ------------------------------------------------------------ */

function initClocks() {
  if (clockChoice === "casual" || !CLOCK_SECONDS[clockChoice]) {
    clockMs = null;
    ui.setClock("w", "∞");
    ui.setClock("b", "∞");
    ui.setClockLow("w", false);
    ui.setClockLow("b", false);
    return;
  }
  const secs = CLOCK_SECONDS[clockChoice] * 1000;
  clockMs = { w: secs, b: secs };
  ui.setClock("w", formatClock(clockMs.w));
  ui.setClock("b", formatClock(clockMs.b));
  ui.setClockLow("w", false);
  ui.setClockLow("b", false);
}

function tickClocks(dt) {
  if (!clockMs || !game) return;
  if (getState() !== State.PLAYING && getState() !== State.CHALLENGE) return;
  if (getState() === State.AI_THINKING || getState() === State.ANIMATING) return;
  const side = game.turn();
  clockMs[side] = Math.max(0, clockMs[side] - dt);
  const low = clockMs[side] < 30000;
  ui.setClock(side, formatClock(clockMs[side]));
  ui.setClockLow(side, low);
  if (clockMs[side] <= 0) flagFall(side);
}

/* ------------------------------------------------------------
   Replay
   ------------------------------------------------------------ */

function startReplay() {
  replay.moves = game.history({ verbose: true }) || [];
  replay.index = 0;
  replay.playing = false;
  replay.busy = false;
  stopReplayAuto();
  placeFromFEN(START_FEN);
  ui.showReplayControls(true);
  ui.setReplayLabel("MOVE 0 / " + replay.moves.length);
  setState(State.REPLAY);
  ui.hidePromotion();
}

function stopReplayAuto() {
  if (replay.timer) {
    clearInterval(replay.timer);
    replay.timer = null;
  }
  replay.playing = false;
}

function replayApplyMove(mv) {
  const piece = pieceAt(mv.from);
  if (!piece) return false;
  let captured = null;
  if (mv.captured) {
    const capSq = mv.flags.includes("e") ? mv.to[0] + mv.from[1] : mv.to;
    captured = pieceAt(capSq);
    if (captured) {
      gsap.to(captured.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 0.25,
        ease: "back.inOut",
        onComplete: () => {
          captured.visible = false;
        },
      });
    }
  }
  piece.userData.NowAt = mv.to;
  animatePieceTo(piece, mv.from, mv.to, 0.3, piece.userData.Name === "Knight");
  if (mv.flags.includes("k") || mv.flags.includes("q")) {
    let rookFrom = null;
    let rookTo = null;
    if (mv.flags.includes("k")) {
      rookFrom = mv.color === "w" ? "h1" : "h8";
      rookTo = mv.color === "w" ? "f1" : "f8";
    } else {
      rookFrom = mv.color === "w" ? "a1" : "a8";
      rookTo = mv.color === "w" ? "d1" : "d8";
    }
    const rook = pieceAt(rookFrom);
    if (rook) {
      rook.userData.NowAt = rookTo;
      animatePieceTo(rook, rookFrom, rookTo, 0.3, false);
    }
  }
  return true;
}

function replayStep(delta) {
  if (replay.busy) return;
  replay.busy = true;
  const target = replay.index + delta;
  const applyTo = Math.max(0, Math.min(replay.moves.length, target));
  if (delta < 0 || applyTo === 0) placeFromFEN(START_FEN);
  replay.index = 0;
  const next = () => {
    if (replay.index < applyTo) {
      const mv = replay.moves[replay.index];
      replayApplyMove(mv);
      replay.index++;
      later(next, 320);
    } else {
      replay.busy = false;
      ui.setReplayLabel("MOVE " + replay.index + " / " + replay.moves.length);
      if (replay.playing && replay.index >= replay.moves.length) {
        replay.playing = false;
        stopReplayAuto();
        ui.setReplayPlayIcon(false);
      }
    }
  };
  next();
}

function replayAction(action) {
  switch (action) {
    case "restart":
      stopReplayAuto();
      replayStep(-replay.index);
      break;
    case "prev":
      stopReplayAuto();
      replayStep(-1);
      break;
    case "next":
      stopReplayAuto();
      replayStep(1);
      break;
    case "toggle":
      replay.playing = !replay.playing;
      ui.setReplayPlayIcon(replay.playing);
      if (replay.playing) {
        replay.timer = setInterval(() => replayStep(1), 600);
      } else {
        stopReplayAuto();
      }
      break;
    case "exit":
      stopReplayAuto();
      exitToMenu();
      break;
  }
  ui.setReplayPlayIcon(replay.playing);
}

/* ------------------------------------------------------------
   Camera helpers
   ------------------------------------------------------------ */

function rotateSocials(angle) {
  Socials.forEach((ele) => {
    ele.rotation.y += angle;
  });
}

function cancelCamPulse() {
  if (camLocked) {
    camLocked = false;
    cameraManager.stopTransitions();
  }
}

function cinematicPulse(squareKey) {
  if (!SETTINGS.cinematicCamera || camLocked || mode === "watch") return;
  if (getState() === State.REPLAY) return;
  const sq = Squares[squareKey];
  if (!sq) return;
  camLocked = true;
  const world = new THREE.Vector3();
  sq.getWorldPosition(world);
  const dir = new THREE.Vector3().subVectors(world, camera.position).normalize();
  const targetPos = camera.position.clone().addScaledVector(dir, -0.15);
  const look = world.clone();
  look.y = world.y + 0.1;
  cameraManager.save();
  cameraManager.moveTo(targetPos, look, 0.8, { ease: "power2.inOut" });
  later(() => {
    if (camLocked) {
      camLocked = false;
      cameraManager.restore(1);
    }
  }, 1100);
}

/* ------------------------------------------------------------
   Game flow (start / pause / menu / result)
   ------------------------------------------------------------ */

function startGame(opts) {
  lastOpts = opts;
  mode = opts.mode;
  humanSide = opts.humanSide === "black" || opts.humanSide === "b" ? "b" : "w";
  difficulty = opts.difficulty || "challenger";
  clockChoice = opts.clock || "casual";
  challenge = null;
  challengeStep = 0;

  clearTimers();
  pendingPause = false;
  pendingPromotion = null;
  stopReplayAuto();

  audioManager.playMusic("gameplay");
  placeFromFEN(START_FEN);
  initClocks();
  gameStartedAt = Date.now();
  totalCaptures = 0;

  ui.hideAll();
  ui.showHud(true);
  ui.hideHistory();
  ui.showReplayControls(false);
  ui.setTurn("WHITE'S TURN", "w");
  ui.setActiveClock("w");
  ui.renderHistory([]);
  TurnDisplay(0);

  cameraManager.stopIdle();
  if (mode === "ai" && humanSide === "b") {
    cameraManager.flipTable();
    cameraManager.snap(cameraManager.defaultPosition, cameraManager.defaultTarget);
    rotateSocials(Math.PI);
  } else {
    cameraManager.resetFlip();
    cameraManager.resetToDefault(1);
  }

  setState(State.PLAYING);

  if (mode === "watch") {
    ui.setTurn("WATCHING...", "w");
  }
  if (!sessionHints.firstGameHintShown) {
    sessionHints.firstGameHintShown = true;
    ui.showHint("Select a piece to see its legal moves.");
  }

  setEngineDifficulty();
  botChecker();
}

function startChallenge(id) {
  const c = getChallenge(id);
  if (!c) return;

  lastOpts = { mode: "challenge", id };
  mode = "challenge";
  challenge = c;
  challengeStep = 0;
  clockChoice = "casual";

  clearTimers();
  pendingPause = false;
  pendingPromotion = null;
  stopReplayAuto();

  audioManager.playMusic("gameplay");
  placeFromFEN(c.fen);
  initClocks();
  gameStartedAt = Date.now();
  totalCaptures = 0;

  ui.hideAll();
  ui.showHud(true);
  ui.hideHistory();
  ui.showReplayControls(false);
  const sideName = c.side === "w" ? "WHITE" : "BLACK";
  ui.setTurn(sideName + " TO MOVE", c.side);
  ui.setActiveClock(c.side);
  TurnDisplay(c.side === "w" ? 0 : 1);

  cameraManager.stopIdle();
  if (c.side === "b") {
    cameraManager.flipTable();
    cameraManager.snap(cameraManager.defaultPosition, cameraManager.defaultTarget);
    rotateSocials(Math.PI);
  } else {
    cameraManager.resetFlip();
    cameraManager.resetToDefault(1);
  }

  setState(State.CHALLENGE);
  ui.showHint(c.hint);
}

function restartGame() {
  if (mode === "challenge" && challenge) {
    startChallenge(challenge.id);
    return;
  }
  if (lastOpts) startGame(lastOpts);
}

function openPauseMenu() {
  if (getState() === State.REPLAY) return;
  setState(State.PAUSED);
  audioManager.pauseMusic();
  ui.closeSettings();
  ui.closeHelp();
  ui.openPause();
}

function resumeGame() {
  ui.closePause();
  audioManager.resumeMusic();
  const next = mode === "challenge" ? State.CHALLENGE : State.PLAYING;
  setState(next);
  botChecker();
}

function exitToMenu() {
  cleanupGame();
  ui.showMenu();
}

function cleanupGame() {
  if (mode === "menu" && !boardReady) return;
  clearTimers();
  stopReplayAuto();
  pendingPause = false;
  pendingPromotion = null;
  pendingFinalizeMove = null;
  mode = "menu";
  ui.showReplayControls(false);
  ui.showSkip(false);
  ui.showThinking(false);
  ui.showCheck(false);
  ui.closePause();
  ui.closeSettings();
  ui.closeHelp();
  ui.hideHistory();
  ui.hidePromotion();
  ui.showHud(false);

  if (highlights) {
    highlights.clear();
    highlights.clearCheck();
  }
  for (const p of [...ChessPieces]) {
    gsap.killTweensOf(p.position);
    gsap.killTweensOf(p.scale);
  }
  if (boardReady && Object.keys(Squares).length) placeFromFEN(START_FEN);

  cameraManager.stopTransitions();
  cameraManager.resetFlip();
  cameraManager.resetToDefault(0.8);
  cameraManager.startIdle();
  audioManager.playMusic("menu");
  setState(State.MENU);
}

/* ------------------------------------------------------------
   UI callback wiring
   ------------------------------------------------------------ */

function wireCallbacks() {
  ui.callbacks.onStartAI = (sel) => startGame({ mode: "ai", humanSide: sel.side, difficulty: sel.difficulty, clock: sel.clock });
  ui.callbacks.onStartLocal = (sel) => startGame({ mode: "local", clock: sel.clock });
  ui.callbacks.onStartWatch = () => startGame({ mode: "watch" });
  ui.callbacks.onStartChallenge = (id) => startChallenge(id);
  ui.callbacks.onPromotion = (piece) => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    pendingPromotion = null;
    MoveTo(from, to, piece);
  };
  ui.callbacks.onPauseResume = resumeGame;
  ui.callbacks.onPauseRestart = restartGame;
  ui.callbacks.onPauseSettings = () => ui.openSettings(true);
  ui.callbacks.onPauseMenu = () => exitToMenu();
  ui.callbacks.onResultReplay = startReplay;
  ui.callbacks.onResultAgain = restartGame;
  ui.callbacks.onResultMenu = () => exitToMenu();
  ui.callbacks.onSettingsOpen = () => {};
  ui.callbacks.onSettingsClose = () => {};
  ui.callbacks.onReplayAction = replayAction;
  ui.callbacks.onEscape = () => {
    if (getState() === State.REPLAY) return;
    if (getState() === State.PLAYING || getState() === State.CHALLENGE) {
      openPauseMenu();
    } else if (getState() === State.ANIMATING || getState() === State.AI_THINKING) {
      pendingPause = true;
    }
  };
  ui.callbacks.onCameraTop = () => cameraManager.goTopView();
  ui.callbacks.onCameraReset = () => cameraManager.resetToDefault();
  ui.callbacks.onMenu = cleanupGame;
  ui.callbacks.onChallengeExit = () => exitToMenu();

  document.getElementById("skip").addEventListener("click", skipCinematic);
}

/* ------------------------------------------------------------
   Main load
   ------------------------------------------------------------ */

function initializeEventListeners() {
  ["mousemove", "touchstart"].forEach((evt) =>
    window.addEventListener(evt, handlePointerMove, { passive: false })
  );
  ["click", "touchend"].forEach((evt) =>
    window.addEventListener(evt, handlePointerClick, { passive: false })
  );
  window.addEventListener("pointerdown", cancelCamPulse, { capture: true });
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
}

function handleContextLost(event) {
  event.preventDefault();
  clearScene();
  window.location.reload();
}

function handleResize() {
  Sizes.Width = window.innerWidth;
  Sizes.Height = window.innerHeight;
  camera.aspect = Sizes.Width / Sizes.Height;
  camera.updateProjectionMatrix();
  renderer.setSize(Sizes.Width, Sizes.Height);
}

function clearScene() {
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement = null;
  }
  if (scene) {
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      if (object.material.isMaterial) {
        cleanMaterial(object.material);
      } else {
        for (const material of object.material) cleanMaterial(material);
      }
    });
  }
}

function cleanMaterial(material) {
  material.dispose();
  for (const key in material) {
    const value = material[key];
    if (value && typeof value === "object" && "minFilter" in value) {
      value.dispose();
    }
  }
}

let texturesToLoad = 0;
let texturesLoaded = 0;
let glbDone = false;

function onAllLoaded() {
  const squareCount = Object.keys(Squares).length;
  const pieceCount = ChessPieces.length;
  window.__CF_DIAG__ = {
    glbDone,
    texturesToLoad,
    texturesLoaded,
    squares: squareCount,
    pieces: pieceCount,
  };
  if (squareCount !== 64 || pieceCount < 32) {
    const firstNames = Object.keys(Squares).slice(0, 8).join(", ") || "(none found)";
    ui.showFatalError(
      `The board failed to load: found ${squareCount}/64 squares and ` +
        `${pieceCount}/32 pieces. Expected names like "Square a1". ` +
        `Found: ${firstNames}`
    );
    return;
  }
  boardReady = true;
  ui.setLoadingStatus("Ready");
  ui.showLoadingFact("Tip: drag to orbit · scroll to zoom · black kings start on dark squares");
  ui.setLoadingProgress(1);
  ui.showEnterButton();
  cameraManager.startIdle();
  setState(State.MENU);
  window.__CHESSFALL_READY__ = true;
  window.__CF_GLB_OK__ = true;
  window.__CF_PIECES__ = pieceCount;
  window.__CF_SQUARES__ = squareCount;
}

function checkReady() {
  window.__CF_DIAG__ = {
    glbDone,
    texturesToLoad,
    texturesLoaded,
    squares: Object.keys(Squares).length,
    pieces: ChessPieces.length,
  };
  if (glbDone && texturesLoaded >= texturesToLoad) onAllLoaded();
}

function load3D() {
  loadSettings();
  audioManager.init();
  ui.init();
  wireCallbacks();

  initializeCamera();
  initializeRenderer();
  initializeScene();
  initializeControls();
  initializeEnvironment();

  pointer = new THREE.Vector2();
  window.addEventListener("resize", handleResize);
  window.addEventListener("beforeunload", clearScene);

  const dracoLoader = new DRACOLoader().setDecoderPath("jsm/libs/draco/gltf/");
  const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath("jsm/libs/basis/")
    .detectSupport(renderer);

  const raycaster = new THREE.Raycaster();
  stats = new Stats();

  loader.load(
    "assets/ChessGLB.glb",
    (gltf) => {
      const model = gltf.scene;
      model.position.set(0, -1, 0);
      scene.add(model);
      chessGroup = model.getObjectByName("Chess");

      const textureKey = {
        Floor: "ktx2/Background.ktx2",
        Black: "ktx2/BlackPiece.ktx2",
        Others: "ktx2/Others.ktx2",
        Tables: "ktx2/TheWoods.ktx2",
        White: "ktx2/WhitePicese.ktx2",
        TheFlowers: "ktx2/SideItemsGrass.ktx2",
        SideItems: "ktx2/NewSideItems.ktx2",
      };

      model.traverse((child) => {
        if (!child.isMesh) return;
        for (const key of Object.keys(textureKey)) {
          if (child.name.includes(key)) {
            texturesToLoad++;
            break;
          }
        }
      });

      model.traverse((child) => {
        if (!child.isMesh) return;

        for (const [key, path] of Object.entries(textureKey)) {
          if (!child.name.includes(key)) continue;
          if (SMOKE_MODE) {
            texturesLoaded++;
            checkReady();
            break;
          }
          try {
            ktx2Loader.load(
              path,
              (tex) => {
                tex.encoding = THREE.sRGBEncoding;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.magFilter = THREE.LinearFilter;

              if (child.name.includes("Floor") || child.name.includes("Tables_Side")) {
                child.material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex });
              } else if (child.name.includes("Piece")) {
                child.material = new THREE.MeshPhysicalMaterial({
                  color: 0xffffff,
                  map: tex,
                  roughness: 0,
                  metalness: 0.4,
                  clearcoat: 1,
                });
              } else if (
                child.name.includes("obj") ||
                child.name.includes("Leg") ||
                child.name.includes("Chair") ||
                child.name.includes("Outer_Frame")
              ) {
                child.material = new THREE.MeshStandardMaterial({
                  color: 0xffffff,
                  map: tex,
                  roughness: child.name.includes("Chair") || child.name.includes("Leg") ? 0.7 : 0.05,
                  metalness: 0,
                });
              } else if (
                child.name.includes("Github") ||
                child.name.includes("Insta") ||
                child.name.includes("Linkedin")
              ) {
                if (Socials.indexOf(child) === -1) Socials.push(child);
                child.material = new THREE.MeshStandardMaterial({
                  color: 0xffffff,
                  map: tex,
                  roughness: 0.3,
                  metalness: 0,
                });
                if (targetObjects.indexOf(child) === -1) {
                  targetObjects.push(child);
                  child.userData.MainPosition = child.position.clone();
                }
              } else {
                child.material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1 });
              }

              if (child.geometry) child.geometry.computeVertexNormals();
              texturesLoaded++;
              checkReady();
            },
            undefined,
            (err) => {
              console.warn("[CHESSFALL] texture load failed: " + child.name + " <- " + path, err);
              texturesLoaded++;
              checkReady();
            }
          );
          } catch (e) {
            console.error("[CHESSFALL] ktx2 load threw for " + child.name + ": " + e.message);
            texturesLoaded++;
            checkReady();
          }
          break;
        }

        /* ----- metadata & square/piece setup (texture-independent) ----- */
        if (child.name.includes("WTurn") || child.name.includes("BTurn")) {
          child.material = child.material.clone();
          child.material.color.set(0xefefef);
          TurnDis[child.name.includes("WTurn") ? 0 : 1] = child;
          child.userData.MainPosition = child.position.clone();
        } else if (child.name.includes("ChessBack")) {
          child.material = child.material.clone();
          child.material.color.set(0x000000);
        } else if (child.name.includes("Piece")) {
          const parts = child.name.replace(/_/g, " ").split(" ");
          const color = parts[0].split("-")[0];
          const type = parts[1];
          child.userData.NowAt = parts[2];
          child.userData.color = color;
          child.userData.Name = type;
          child.userData.isTemplate = true;
          child.userData.MainPosition = child.position.clone();
          if (!DiffPieces[color]) DiffPieces[color] = {};
          DiffPieces[color][type] = child;
          ChessPieces.push(child);
          targetObjects.push(child);
          addShadowPlane(child);
        } else if (child.name.includes("Square")) {
          const m = child.name.replace(/_/g, " ").match(/^Square\s+([a-h][1-8])$/);
          if (m) {
            const key = m[1];
            Squares[key] = child;
            child.userData.MainPosition = child.position.clone();
            targetObjects.push(child);
            child.material = new THREE.MeshStandardMaterial({
              color: squareColor(key),
              roughness: 0.9,
              metalness: 0,
            });
            child.userData.originalColor = child.material.color.clone();
          }
        } else if (child.name.includes("Storage")) {
          const m = child.name.match(/Storage(\d+)/);
          if (m) {
            if (child.name.includes("BStorage")) BlackStorage[parseInt(m[1], 10)] = child;
            else WhiteStorage[parseInt(m[1], 10)] = child;
          }
        } else if (child.name.includes("Flower") || child.name.includes("vaze")) {
          targetObjects.push(child);
          child.userData.MainPosition = child.position.clone();
        }
      });

      glbDone = true;
      highlights = new HighlightManager(scene, Squares);
      initializeEventListeners();
      checkReady();
    },
    (xhr) => {
      if (xhr.lengthComputable && xhr.total) {
        ui.setLoadingProgress(0.1 + 0.9 * (xhr.loaded / xhr.total));
      }
    },
    (err) => {
      console.error("[CHESSFALL] GLB load failed", err);
      ui.setLoadingStatus("Failed to load the board. Reload to try again.");
    }
  );

  let lastFrameTime = 0;

  function animate() {
    const now = performance.now();
    if (lastFrameTime) tickClocks(now - lastFrameTime);
    lastFrameTime = now;

    cameraManager.applyShake();

    if (boardReady) {
      raycaster.setFromCamera(pointer, camera);
      currentIntersects = raycaster.intersectObjects(targetObjects);
      if (currentIntersects.length > 0) {
        const selected = currentIntersects[0].object;
        const isSocial =
          selected.name.includes("Github") ||
          selected.name.includes("Insta") ||
          selected.name.includes("Linkedin");
        if (isSocial) {
          if (HoveredObject !== selected) {
            if (HoveredObject) playHoverAnimation(HoveredObject, false);
            playHoverAnimation(selected, true);
            HoveredObject = selected;
          }
          document.body.style.cursor = "pointer";
        } else if (selected.name.includes("Piece")) {
          if (HoveredObject) playHoverAnimation(HoveredObject, false);
          HoveredObject = null;
          document.body.style.cursor = canActForCurrentTurn() ? "pointer" : "default";
        } else {
          if (HoveredObject) playHoverAnimation(HoveredObject, false);
          HoveredObject = null;
          document.body.style.cursor = "default";
        }
      } else {
        if (HoveredObject) playHoverAnimation(HoveredObject, false);
        HoveredObject = null;
        document.body.style.cursor = "default";
      }
    }

    controls.update();
    if (stats) stats.update();
    renderer.render(scene, camera);
  }

  function playHoverAnimation(obj, isPlaying) {
    const dur = 0.8;
    if (obj.name.includes("Tables")) {
      gsap.to(obj.position, {
        y: (obj.userData.MainPosition ? obj.userData.MainPosition.y : obj.position.y) + (isPlaying ? 0.01 : 0),
        duration: dur,
        ease: "power4",
      });
      gsap.to(obj.scale, { y: isPlaying ? 3 : 1, duration: dur, ease: "power4" });
    } else {
      gsap.to(obj.scale, {
        x: isPlaying ? 1.2 : 1,
        y: isPlaying ? 1.2 : 1,
        z: isPlaying ? 1.2 : 1,
        duration: dur,
        ease: "power4",
      });
    }
  }

  renderer.setAnimationLoop(animate);
}

let highlights = null;

setTimeout(() => {
  if (!boardReady && glbDone && texturesLoaded < texturesToLoad) {
    console.warn("[CHESSFALL] texture loading timed out — continuing with GLB materials");
    texturesLoaded = texturesToLoad;
    checkReady();
  }
}, 20000);

window.load3D = load3D;

window.__CF_ERRORS__ = window.__CF_ERRORS__ || [];
function reportError(label, err) {
  const text = String((err && err.message) || err || "Unknown error");
  window.__CF_ERRORS__.push(label + ": " + text);
  console.error("[CHESSFALL]", label, err);
  try {
    ui.showFatalError(label + ": " + text);
  } catch (e) {
    /* ui not ready yet */
  }
}
window.addEventListener("error", (e) => reportError("Uncaught error", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => reportError("Unhandled rejection", e.reason));

window.__CF_DEBUG__ = () => {
  let dots = 0;
  if (highlights) {
    for (const key of Object.keys(highlights.dots)) {
      if (highlights.dots[key].material.opacity > 0.1) dots++;
      if (highlights.rings[key].material.opacity > 0.1) dots++;
    }
  }
  let sqSize = null;
  if (Squares && Squares.e4) {
    const g = Squares.e4.geometry;
    sqSize = g.parameters && g.parameters.width ? g.parameters.width : null;
    if (sqSize == null && Squares.f4) sqSize = Math.abs(Squares.e4.position.x - Squares.f4.position.x);
  }
  return {
    state: getState(),
    mode,
    humanSide,
    turn: game ? game.turn() : null,
    selected: selectedPiece ? selectedPiece.userData.NowAt : null,
    canMoveTo: canMoveTo.map((m) => m.san),
    dotsVisible: dots,
    sqSize,
  };
};
window.__cfPick = (sq) => trySelectPiece(sq);
window.__cfPiece = (sq) => {
  const p = pieceAt(sq);
  return p ? { c: p.userData.color, n: p.userData.Name } : null;
};
window.__cfProject = (sq) => {
  const m = Squares && Squares[sq];
  if (!m || !camera || !renderer) return null;
  const v = new THREE.Vector3();
  m.getWorldPosition(v);
  v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + ((v.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - v.y) / 2) * rect.height,
    w: rect.width,
    h: rect.height,
  };
};

load3D();
