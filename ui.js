/* ============================================================
   CHESSFALL - ui.js
   UIManager: all DOM overlays (menu, setup, HUD, promotion,
   pause, settings, result, replay, help, indicators).
   The 3D canvas stays untouched; this layer sits on top of it.
   ============================================================ */

import { CHALLENGES, getChallenge } from "./challenges.js";
import {
  SETTINGS,
  loadSettings,
  saveSettings,
  resetSettings,
  getCompletedChallenges,
} from "./gameState.js";
import { audioManager } from "./audio.js";

const $ = (id) => document.getElementById(id);

class UIManager {
  constructor() {
    this.callbacks = {
      onStartAI: null,
      onStartLocal: null,
      onStartWatch: null,
      onStartChallenge: null,
      onPromotion: null,
      onPauseResume: null,
      onPauseRestart: null,
      onPauseSettings: null,
      onPauseMenu: null,
      onResultReplay: null,
      onResultAgain: null,
      onResultMenu: null,
      onSettingsOpen: null,
      onSettingsClose: null,
      onReplayAction: null,
      onEscape: null,
      onCameraTop: null,
      onCameraReset: null,
      onHistoryToggle: null,
      onMenu: null,
      onChallengeExit: null,
    };

    this.menuItems = [];
    this.hintTimer = null;
    this.checkTimer = null;
  }

  /* ---------------------------------------------------------- */
  init() {
    this.$loading = $("loading-screen");
    this.$loadingStatus = $("loading-status");
    this.$loadingBar = $("loading-bar-fill");
    this.$loadingFacts = $("loading-facts");
    this.$loadingEnter = $("loading-enter");

    this.$menu = $("menu");
    this.$setupAI = $("setup-ai");
    this.$setupLocal = $("setup-local");
    this.$challengesMenu = $("challenges-menu");
    this.$challengeInfo = $("challenge-info");
    this.$challengeResult = $("challenge-result");
    this.$hud = $("hud");
    this.$history = $("move-history");
    this.$thinking = $("thinking");
    this.$check = $("check-indicator");
    this.$hint = $("hint");
    this.$audioNote = $("audio-note");
    this.$skip = $("skip");
    this.$promotion = $("promotion");
    this.$pause = $("pause-menu");
    this.$settings = $("settings");
    this.$result = $("result");
    this.$help = $("help");
    this.$replay = $("replay-controls");
    this.$fatalError = $("fatal-error");
    this.$fatalMsg = $("fatal-error-msg");

    this.selectedAI = { side: "white", difficulty: "challenger", clock: "casual" };
    this.selectedLocal = { clock: "casual" };

    this._wireMenu();
    this._wireSetup();
    this._wireChallenges();
    this._wirePromotion();
    this._wirePause();
    this._wireSettings();
    this._wireResult();
    this._wireHelp();
    this._wireReplay();
    this._wireHud();
    this._wireGlobal();

    const reloadBtn = $("fatal-error-reload");
    if (reloadBtn) reloadBtn.addEventListener("click", () => location.reload());
  }

  /* ---------------------------------------------------------- */
  _wireMenu() {
    const wire = (id, cb) =>
      $(id).addEventListener("click", () => {
        audioManager.playSfx("click");
        cb();
      });
    wire("menu-vsai", () => this.openSetup("ai"));
    wire("menu-local", () => this.openSetup("local"));
    wire("menu-challenges", () => this.openChallenges());
    wire("menu-watch", () => this.callbacks.onStartWatch && this.callbacks.onStartWatch());
    wire("menu-settings", () => this.openSettings(true));
    wire("menu-help", () => this.openHelp());
    $("loading-enter").addEventListener("click", () => this.enterGame());
  }

  enterGame() {
    audioManager.unlock();
    audioManager.playSfx("click");
    audioManager.playMusic("menu");
    this.hideAll();
    this.showMenu();
  }

  _wireSetup() {
    const group = (container, selector, apply) => {
      const btns = container.querySelectorAll(selector);
      btns.forEach((b) => {
        b.addEventListener("click", () => {
          btns.forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          audioManager.playSfx("click");
          apply(b);
        });
      });
    };

    group(this.$setupAI, "#ai-side-white, #ai-side-black", (b) => {
      this.selectedAI.side = b.dataset.side;
    });
    group(this.$setupAI, ".diff-btn", (b) => {
      this.selectedAI.difficulty = b.dataset.difficulty;
    });
    group(this.$setupAI, ".clock-btn", (b) => {
      this.selectedAI.clock = b.dataset.clock;
    });
    group(this.$setupLocal, ".clock-btn", (b) => {
      this.selectedLocal.clock = b.dataset.clock;
    });

    $("ai-start").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.callbacks.onStartAI && this.callbacks.onStartAI(this.selectedAI);
    });
    $("local-start").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.callbacks.onStartLocal && this.callbacks.onStartLocal(this.selectedLocal);
    });
    $("ai-back").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.showMenu();
    });
    $("local-back").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.showMenu();
    });
  }

  /* ---------------------------------------------------------- */
  _wireChallenges() {
    $("challenges-back").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.showMenu();
    });
    $("challenge-cancel").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.openChallenges();
    });
    $("challenge-start").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.callbacks.onStartChallenge && this.callbacks.onStartChallenge(this.activeChallengeId);
    });
    $("challenge-next").addEventListener("click", () => {
      audioManager.playSfx("click");
      const idx = CHALLENGES.findIndex((c) => c.id === this.activeChallengeId);
      const next = CHALLENGES[(idx + 1) % CHALLENGES.length];
      this.showChallengeInfo(next.id);
    });
    $("challenge-retry").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.callbacks.onStartChallenge && this.callbacks.onStartChallenge(this.activeChallengeId);
    });
    $("challenge-exit").addEventListener("click", () => {
      audioManager.playSfx("click");
      if (this.callbacks.onChallengeExit) {
        this.callbacks.onChallengeExit();
      } else {
        this.showMenu();
      }
    });
  }

  openChallenges() {
    this.hideOverlays();
    const done = getCompletedChallenges();
    const list = $("challenge-list");
    list.innerHTML = "";
    CHALLENGES.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "challenge-item";
      const num = document.createElement("span");
      num.className = "ch-num";
      num.textContent = String(i + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.className = "ch-name";
      name.textContent = c.title;
      const check = document.createElement("span");
      check.className = "ch-done";
      check.textContent = done.includes(c.id) ? "✓" : "";
      btn.appendChild(num);
      btn.appendChild(name);
      btn.appendChild(check);
      btn.addEventListener("click", () => {
        audioManager.playSfx("click");
        this.showChallengeInfo(c.id);
      });
      list.appendChild(btn);
    });
    $("challenges-progress").textContent = `${done.length} / ${CHALLENGES.length} COMPLETED`;
    this._show(this.$challengesMenu);
  }

  showChallengeInfo(id) {
    const c = getChallenge(id);
    if (!c) return;
    this.activeChallengeId = id;
    this.hideOverlays();
    $("challenge-title").textContent = c.title;
    $("challenge-desc").textContent = c.description;
    $("challenge-meta").textContent = `${c.side === "w" ? "White" : "Black"} to move`;
    this._show(this.$challengeInfo);
  }

  showChallengeResult(solved, text) {
    this.hideOverlays();
    $("challenge-result-title").textContent = solved ? "SOLVED" : "NOT QUITE";
    $("challenge-result-title").style.color = solved ? "" : "var(--cf-danger)";
    $("challenge-result-text").textContent = text;
    this._show(this.$challengeResult);
  }

  /* ---------------------------------------------------------- */
  _wirePromotion() {
    const btns = this.$promotion.querySelectorAll(".promo-btn");
    btns.forEach((b) => {
      b.addEventListener("click", () => {
        audioManager.playSfx("click");
        this.hideOverlays();
        this.callbacks.onPromotion && this.callbacks.onPromotion(b.dataset.piece);
      });
    });
  }

  showPromotion() {
    this._show(this.$promotion);
  }

  hidePromotion() {
    this._hide(this.$promotion);
  }

  /* ---------------------------------------------------------- */
  _wirePause() {
    const wire = (id, cb) =>
      $(id).addEventListener("click", () => {
        audioManager.playSfx("click");
        cb();
      });
    wire("pause-resume", () => this.callbacks.onPauseResume && this.callbacks.onPauseResume());
    wire("pause-restart", () => this.callbacks.onPauseRestart && this.callbacks.onPauseRestart());
    wire("pause-settings", () => this.callbacks.onPauseSettings && this.callbacks.onPauseSettings());
    wire("pause-mainmenu", () => this.callbacks.onPauseMenu && this.callbacks.onPauseMenu());
  }

  openPause() {
    this._show(this.$pause);
  }

  closePause() {
    this._hide(this.$pause);
  }

  /* ---------------------------------------------------------- */
  _wireSettings() {
    $("settings-close").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.callbacks.onSettingsClose && this.callbacks.onSettingsClose();
      this.closeSettings();
    });
    $("settings-reset").addEventListener("click", () => {
      audioManager.playSfx("click");
      resetSettings();
      loadSettings();
      audioManager.setMusicEnabled(SETTINGS.musicEnabled);
      audioManager.setSfxEnabled(SETTINGS.sfxEnabled);
      audioManager.setMusicVolume(SETTINGS.musicVolume);
      audioManager.setSfxVolume(SETTINGS.sfxVolume);
      this.refreshSettingsUI();
    });

    $("set-music").addEventListener("click", () => {
      audioManager.setMusicEnabled(!audioManager.isMusicEnabled());
      this.refreshSettingsUI();
    });
    $("set-sfx").addEventListener("click", () => {
      audioManager.setSfxEnabled(!audioManager.isSfxEnabled());
      this.refreshSettingsUI();
    });
    $("set-cine").addEventListener("click", () => {
      SETTINGS.cinematicCamera = !SETTINGS.cinematicCamera;
      saveSettings();
      this.refreshSettingsUI();
    });
    $("set-shake").addEventListener("click", () => {
      SETTINGS.cameraShake = !SETTINGS.cameraShake;
      saveSettings();
      this.refreshSettingsUI();
    });
    $("set-legal").addEventListener("click", () => {
      SETTINGS.showLegalMoves = !SETTINGS.showLegalMoves;
      saveSettings();
      this.refreshSettingsUI();
    });
    $("set-music-vol").addEventListener("input", (e) => {
      audioManager.setMusicVolume(Number(e.target.value) / 100);
      this.refreshSettingsUI();
    });
    $("set-sfx-vol").addEventListener("input", (e) => {
      audioManager.setSfxVolume(Number(e.target.value) / 100);
      this.refreshSettingsUI();
    });
  }

  openSettings(fromGame) {
    if (this.callbacks.onSettingsOpen) this.callbacks.onSettingsOpen(fromGame);
    this.refreshSettingsUI();
    this._show(this.$settings);
  }

  closeSettings() {
    this._hide(this.$settings);
  }

  refreshSettingsUI() {
    loadSettings();
    const toggle = (id, on) => $(id).classList.toggle("on", !!on);
    toggle("set-music", SETTINGS.musicEnabled);
    toggle("set-sfx", SETTINGS.sfxEnabled);
    toggle("set-cine", SETTINGS.cinematicCamera);
    toggle("set-shake", SETTINGS.cameraShake);
    toggle("set-legal", SETTINGS.showLegalMoves);
    $("set-music-vol").value = Math.round(SETTINGS.musicVolume * 100);
    $("set-sfx-vol").value = Math.round(SETTINGS.sfxVolume * 100);
  }

  /* ---------------------------------------------------------- */
  _wireResult() {
    const wire = (id, cb) =>
      $(id).addEventListener("click", () => {
        audioManager.playSfx("click");
        cb();
      });
    wire("result-replay", () => this.callbacks.onResultReplay && this.callbacks.onResultReplay());
    wire("result-again", () => this.callbacks.onResultAgain && this.callbacks.onResultAgain());
    wire("result-menu", () => this.callbacks.onResultMenu && this.callbacks.onResultMenu());
  }

  showResult({ title, subtitle, moves, captures, time, canReplay }) {
    this.hideOverlays();
    $("result-title").textContent = title;
    $("result-subtitle").textContent = subtitle;
    $("result-moves").textContent = moves;
    $("result-captures").textContent = captures;
    $("result-time").textContent = time || "--";
    $("result-replay").classList.toggle("hidden", !canReplay);
    this._show(this.$result);
  }

  /* ---------------------------------------------------------- */
  _wireHelp() {
    $("help-close").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.closeHelp();
    });
  }

  openHelp() {
    this._show(this.$help);
  }

  closeHelp() {
    this._hide(this.$help);
  }

  /* ---------------------------------------------------------- */
  _wireReplay() {
    const wire = (id, action) =>
      $(id).addEventListener("click", () => {
        audioManager.playSfx("click");
        this.callbacks.onReplayAction && this.callbacks.onReplayAction(action);
      });
    wire("rp-restart", "restart");
    wire("rp-prev", "prev");
    wire("rp-play", "toggle");
    wire("rp-next", "next");
    wire("rp-exit", "exit");
  }

  showReplayControls(show) {
    this._toggle(this.$replay, show);
  }

  setReplayLabel(text) {
    $("replay-label").textContent = text;
  }

  setReplayPlayIcon(playing) {
    $("rp-play").textContent = playing ? "⏸" : "▶";
  }

  /* ---------------------------------------------------------- */
  _wireHud() {
    $("btn-pause").addEventListener("click", () => {
      audioManager.playSfx("click");
      if (this.callbacks.onEscape) this.callbacks.onEscape();
    });
    $("btn-top").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.callbacks.onCameraTop && this.callbacks.onCameraTop();
    });
    $("btn-camreset").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.callbacks.onCameraReset && this.callbacks.onCameraReset();
    });
    $("btn-history").addEventListener("click", () => {
      audioManager.playSfx("click");
      this.toggleHistory();
    });
    $("history-close").addEventListener("click", () => {
      this.toggleHistory();
    });
  }

  /* ---------------------------------------------------------- */
  _wireGlobal() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!this.$settings.classList.contains("hidden")) {
          this.closeSettings();
          return;
        }
        if (!this.$help.classList.contains("hidden")) {
          this.closeHelp();
          return;
        }
        if (!this.$pause.classList.contains("hidden")) {
          this.closePause();
          if (this.callbacks.onPauseResume) this.callbacks.onPauseResume();
          return;
        }
        if (this.callbacks.onEscape) this.callbacks.onEscape();
      }
    });

    /* First tap anywhere unlocks audio (autoplay policy). */
    const unlock = () => {
      audioManager.unlock();
      document.removeEventListener("pointerdown", unlock);
    };
    document.addEventListener("pointerdown", unlock);

    if (window.location.search.includes("smoketest")) {
      window.addEventListener("error", (e) => {
        this._smokeLog("error", e.message);
      });
      window.addEventListener("unhandledrejection", (e) => {
        this._smokeLog("rejection", String(e.reason));
      });
    }
  }

  _smokeLog(kind, message) {
    const el = $("smoketest-log");
    if (!el) return;
    const div = document.createElement("div");
    div.textContent = kind + ": " + message;
    el.appendChild(div);
  }

  /* ---------------------------------------------------------- */
  showMenu() {
    try {
      if (this.callbacks.onMenu) this.callbacks.onMenu();
    } catch (err) {
      this.showFatalError(
        "The menu failed to open: " + (err && err.message ? err.message : err)
      );
      return;
    }
    this.hideOverlays();
    this._hide(this.$loading);
    this._show(this.$menu);
    this.menuItems = Array.from(this.$menu.querySelectorAll(".menu-item"));
  }

  showFatalError(message) {
    const text = String(message || "Unknown error");
    console.error("[CHESSFALL] " + text);
    window.__CF_ERRORS__ = window.__CF_ERRORS__ || [];
    window.__CF_ERRORS__.push(text);
    if (this.$fatalMsg) this.$fatalMsg.textContent = text;
    this._show(this.$fatalError);
  }

  showHud(show) {
    this._toggle(this.$hud, show);
  }

  setTurn(text, side) {
    const el = $("turn-indicator");
    el.classList.add("swap");
    setTimeout(() => {
      el.textContent = text;
      el.classList.toggle("cf-turn-white", side === "w");
      el.classList.toggle("cf-turn-black", side === "b");
      el.classList.remove("swap");
    }, 160);
  }

  setClock(side, text) {
    const el = $(side === "w" ? "clock-white" : "clock-black");
    el.textContent = text;
  }

  setActiveClock(side) {
    $("clock-white").classList.toggle("active-clock", side === "w");
    $("clock-black").classList.toggle("active-clock", side === "b");
  }

  setClockLow(side, low) {
    $(side === "w" ? "clock-white" : "clock-black").classList.toggle("low", low);
  }

  renderHistory(history) {
    const list = $("history-list");
    list.innerHTML = "";
    const rows = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push({
        num: i / 2 + 1,
        white: history[i],
        black: history[i + 1] || "",
      });
    }
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const num = document.createElement("span");
      num.className = "h-num";
      num.textContent = r.num + ".";
      const w = document.createElement("span");
      w.textContent = r.white;
      const b = document.createElement("span");
      b.textContent = r.black;
      row.appendChild(num);
      row.appendChild(w);
      row.appendChild(b);
      list.appendChild(row);
    });
  }

  toggleHistory() {
    const show = this.$history.classList.contains("hidden");
    this._toggle(this.$history, show);
  }

  hideHistory() {
    this._hide(this.$history);
  }

  showThinking(show) {
    this._toggle(this.$thinking, show);
  }

  showCheck(show) {
    if (show) {
      if (this.checkTimer) clearTimeout(this.checkTimer);
      this._show(this.$check);
      this.checkTimer = setTimeout(() => {
        this._hide(this.$check);
      }, 2000);
    } else {
      if (this.checkTimer) clearTimeout(this.checkTimer);
      this._hide(this.$check);
    }
  }

  showHint(text) {
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.$hint.textContent = text;
    this._show(this.$hint);
    this.hintTimer = setTimeout(() => {
      this._hide(this.$hint);
    }, 3500);
  }

  showAudioNote(text) {
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.$audioNote.textContent = text;
    this._show(this.$audioNote);
    this.hintTimer = setTimeout(() => {
      this._hide(this.$audioNote);
    }, 4000);
  }

  showSkip(show) {
    this._toggle(this.$skip, show);
  }

  setLoadingStatus(text) {
    this.$loadingStatus.textContent = text;
  }

  setLoadingProgress(frac) {
    this.$loadingBar.style.width = Math.round(frac * 100) + "%";
  }

  showLoadingFact(text) {
    this.$loadingFacts.textContent = text;
    this.$loadingFacts.classList.add("on");
  }

  showEnterButton() {
    this.$loadingEnter.classList.remove("hidden");
  }

  /* ---------------------------------------------------------- */
  openSetup(which) {
    this.hideOverlays();
    if (which === "ai") {
      this._show(this.$setupAI);
    } else {
      this._show(this.$setupLocal);
    }
  }

  hideOverlays() {
    [
      this.$menu, this.$setupAI, this.$setupLocal, this.$challengesMenu,
      this.$challengeInfo, this.$challengeResult, this.$promotion,
      this.$pause, this.$settings, this.$result, this.$help,
    ].forEach((el) => el && this._hide(el));
  }

  hideAll() {
    this.hideOverlays();
    this._hide(this.$loading);
    this._hide(this.$history);
    this.showThinking(false);
    this.showCheck(false);
    this._hide(this.$hint);
    this._hide(this.$audioNote);
    this.showSkip(false);
    this.showReplayControls(false);
  }

  _show(el) {
    if (el) el.classList.remove("hidden");
    return el;
  }

  _hide(el) {
    if (el) el.classList.add("hidden");
  }

  _toggle(el, on) {
    if (el) el.classList.toggle("hidden", !on);
  }
}

export const ui = new UIManager();
