/* ============================================================
   CHESSFALL - audio.js
   AudioManager: music switching + SFX with graceful handling
   when audio files are absent. The app must never crash if an
   audio file is missing - it logs a dev warning and continues.

   Placeholder files (added by the user later):
     assets/audio/music/menu.mp3, gameplay.mp3, victory.mp3
     assets/audio/sfx/move.wav, capture.wav, select.wav, check.wav,
       checkmate.wav, victory.wav, defeat.wav, ui-click.wav, promotion.wav
   ============================================================ */

import { SETTINGS, loadSettings, saveSettings } from "./gameState.js";

const MUSIC_TRACKS = {
  menu: "assets/audio/music/menu.mp3",
  gameplay: "assets/audio/music/gameplay.mp3",
  victory: "assets/audio/music/victory.mp3",
};

const SFX_FILES = {
  move: "assets/audio/sfx/move.wav",
  capture: "assets/audio/sfx/capture.wav",
  select: "assets/audio/sfx/select.wav",
  check: "assets/audio/sfx/check.wav",
  checkmate: "assets/audio/sfx/checkmate.wav",
  victory: "assets/audio/sfx/victory.wav",
  defeat: "assets/audio/sfx/defeat.wav",
  click: "assets/audio/sfx/ui-click.wav",
  promotion: "assets/audio/sfx/promotion.wav",
};

class AudioManager {
  constructor() {
    this.sfx = {};
    this.music = {};
    this.currentMusic = null;
    this.unlocked = false;
    this.warned = new Set();
  }

  init() {
    loadSettings();
    this.musicEnabled = SETTINGS.musicEnabled;
    this.sfxEnabled = SETTINGS.sfxEnabled;
    this.musicVolume = SETTINGS.musicVolume;
    this.sfxVolume = SETTINGS.sfxVolume;

    for (const name of Object.keys(MUSIC_TRACKS)) {
      this.music[name] = this._createElement(MUSIC_TRACKS[name], true);
    }
    for (const name of Object.keys(SFX_FILES)) {
      this.sfx[name] = this._createElement(SFX_FILES[name], false);
    }
  }

  _createElement(src, loop) {
    let el = null;
    try {
      el = new Audio(src);
      el.loop = loop;
      el.preload = "auto";
      el.volume = loop ? this.musicVolume : this.sfxVolume;
      el.addEventListener(
        "error",
        () => {
          this._warnMissing(src);
        },
        false
      );
      el.addEventListener(
        "loadeddata",
        () => {
          el._cfLoaded = true;
        },
        false
      );
    } catch (e) {
      this._warnMissing(src);
    }
    return { el, src, loop };
  }

  _warnMissing(src) {
    if (this.warned.has(src)) return;
    this.warned.add(src);
    if (typeof console !== "undefined") {
      console.warn("[CHESSFALL audio] file not available (continuing silently): " + src);
    }
  }

  /* Call once from a user gesture to satisfy autoplay policies. */
  unlock() {
    this.unlocked = true;
    if (this.currentMusic && this.musicEnabled) {
      this._playElement(this.music[this.currentMusic]);
    }
  }

  _playElement(entry) {
    if (!entry || !entry.el || !entry.el._cfLoaded) {
      if (entry) this._warnMissing(entry.src);
      return;
    }
    const p = entry.el.play();
    if (p && p.catch) p.catch(() => {});
  }

  /* ----------------------------------------------------------
     Music
     ---------------------------------------------------------- */
  playMusic(name) {
    if (!this.unlocked) {
      this.currentMusic = name;
      return;
    }
    if (this.currentMusic === name) return;
    const next = this.music[name];
    if (!next) return;
    if (this.currentMusic) {
      this.fadeMusic(0, 0.45, () => {
        if (this.music[this.currentMusic]) this.music[this.currentMusic].el.pause();
        this._switchMusic(name);
      });
    } else {
      this._switchMusic(name);
    }
  }

  _switchMusic(name) {
    this.currentMusic = name;
    if (!this.musicEnabled || !this.unlocked) return;
    const entry = this.music[name];
    if (!entry) return;
    if (entry.el._cfLoaded) {
      entry.el.volume = 0;
      entry.el.currentTime = 0;
      const proxy = { v: 0 };
      gsap.to(proxy, {
        v: this.musicVolume,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => {
          if (entry.el._cfLoaded) entry.el.volume = proxy.v;
        },
      });
      const p = entry.el.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      this._warnMissing(entry.src);
    }
  }

  /* Fade current music to `target` volume (0..1) over `seconds`. */
  fadeMusic(target, seconds, onComplete) {
    const entry = this.currentMusic ? this.music[this.currentMusic] : null;
    if (!entry || !entry.el._cfLoaded) {
      if (onComplete) onComplete();
      return;
    }
    gsap.to(entry.el, {
      volume: target,
      duration: seconds,
      ease: "power2.inOut",
      onComplete,
    });
  }

  stopMusic() {
    for (const name of Object.keys(this.music)) {
      const el = this.music[name].el;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
    }
    this.currentMusic = null;
  }

  pauseMusic() {
    if (this.currentMusic && this.music[this.currentMusic].el) {
      this.music[this.currentMusic].el.pause();
    }
  }

  resumeMusic() {
    if (this.unlocked && this.musicEnabled && this.currentMusic) {
      this._playElement(this.music[this.currentMusic]);
    }
  }

  /* ----------------------------------------------------------
     SFX
     ---------------------------------------------------------- */
  playSfx(name) {
    if (!this.unlocked || !this.sfxEnabled) return;
    const entry = this.sfx[name];
    if (!entry || !entry.el || !entry.el._cfLoaded) {
      if (entry) this._warnMissing(entry.src);
      return;
    }
    try {
      entry.el.currentTime = 0;
      entry.el.volume = this.sfxVolume;
      const p = entry.el.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  /* ----------------------------------------------------------
     Volume / mute
     ---------------------------------------------------------- */
  setMusicVolume(v) {
    this.musicVolume = v;
    SETTINGS.musicVolume = v;
    saveSettings();
    if (this.currentMusic && this.music[this.currentMusic].el._cfLoaded) {
      this.music[this.currentMusic].el.volume = this.musicEnabled ? v : 0;
    }
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    SETTINGS.sfxVolume = v;
    saveSettings();
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    SETTINGS.musicEnabled = on;
    saveSettings();
    if (on) {
      this.resumeMusic();
    } else {
      this.pauseMusic();
    }
  }

  setSfxEnabled(on) {
    this.sfxEnabled = on;
    SETTINGS.sfxEnabled = on;
    saveSettings();
  }

  isMusicEnabled() {
    return this.musicEnabled;
  }

  isSfxEnabled() {
    return this.sfxEnabled;
  }
}

export const audioManager = new AudioManager();
