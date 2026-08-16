/* ============================================================
   CHESSFALL - gameState.js
   Central input/flow state machine + persistent settings.
   Single source of truth for "is the player allowed to act?".
   ============================================================ */

export const State = Object.freeze({
  LOADING: "LOADING",
  MENU: "MENU",
  PLAYING: "PLAYING",
  ANIMATING: "ANIMATING",
  AI_THINKING: "AI_THINKING",
  PROMOTION: "PROMOTION",
  PAUSED: "PAUSED",
  GAME_OVER: "GAME_OVER",
  REPLAY: "REPLAY",
  CHALLENGE: "CHALLENGE",
});

let currentState = State.LOADING;

export function setState(next) {
  currentState = next;
  if (typeof window !== "undefined") window.__CF_STATE__ = next;
}

export function getState() {
  return currentState;
}

/* Board interaction is allowed only while actively playing
   (never during animations, AI thinking, promotion, pause...).
   Challenges behave like normal play for the human side. */
export function canInteract() {
  return currentState === State.PLAYING || currentState === State.CHALLENGE;
}

/* ------------------------------------------------------------
   Settings (persisted to localStorage)
   ------------------------------------------------------------ */

const SETTINGS_KEYS = {
  musicEnabled: "chessfall_music_enabled",
  sfxEnabled: "chessfall_sfx_enabled",
  musicVolume: "chessfall_music_volume",
  sfxVolume: "chessfall_sfx_volume",
  cinematicCamera: "chessfall_cinematic_camera",
  cameraShake: "chessfall_camera_shake",
  showLegalMoves: "chessfall_show_legal_moves",
};

const DEFAULT_SETTINGS = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.4,
  sfxVolume: 0.7,
  cinematicCamera: true,
  cameraShake: true,
  showLegalMoves: true,
};

export const SETTINGS = { ...DEFAULT_SETTINGS };

function readSetting(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const val = JSON.parse(raw);
    return typeof val === typeof fallback ? val : fallback;
  } catch (e) {
    return fallback;
  }
}

export function loadSettings() {
  for (const key of Object.keys(SETTINGS_KEYS)) {
    SETTINGS[key] = readSetting(SETTINGS_KEYS[key], DEFAULT_SETTINGS[key]);
  }
}

export function saveSettings() {
  try {
    for (const key of Object.keys(SETTINGS_KEYS)) {
      localStorage.setItem(SETTINGS_KEYS[key], JSON.stringify(SETTINGS[key]));
    }
  } catch (e) {
    /* storage unavailable - settings stay in-memory */
  }
}

export function resetSettings() {
  Object.assign(SETTINGS, DEFAULT_SETTINGS);
  saveSettings();
}

/* ------------------------------------------------------------
   Completed challenges
   ------------------------------------------------------------ */

const CHALLENGES_KEY = "chessfall_completed_challenges";

export function getCompletedChallenges() {
  try {
    const raw = localStorage.getItem(CHALLENGES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function markChallengeComplete(id) {
  const list = getCompletedChallenges();
  if (!list.includes(id)) {
    list.push(id);
    try {
      localStorage.setItem(CHALLENGES_KEY, JSON.stringify(list));
    } catch (e) {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------
   Per-session helpers
   ------------------------------------------------------------ */

export const sessionHints = { firstGameHintShown: false };
