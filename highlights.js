/* ============================================================
   CHESSFALL - highlights.js
   Board feedback via direct square tinting:
   - legal destinations turn green
   - last-move from/to squares get a soft yellow tint
   - captures get a slightly warmer tint
   - pulsing red ring around a king in check
   ============================================================ */

import * as THREE from "three";

export const CHESS_COLORS = {
  WHITE_SQUARE: 0xf2f2f2,
  BLACK_SQUARE: 0x161616,
  LEGAL_MOVE: 0x2ecc71,
  LEGAL_CAPTURE: 0x2ecc71,
  LAST_MOVE: 0xf5d063,
  CHECK: 0xe0524a,
};

const RING_INNER = 0.032;
const RING_OUTER = 0.054;
const MARKER_Y_OFFSET = 0.025;

const _c3 = new THREE.Color();

export class HighlightManager {
  constructor(scene, squares) {
    this.scene = scene;
    this.squares = squares;
    this._tinted = new Set();
    this.checkRing = null;
    this.checkTween = null;
  }

  /* ---------- legal-move / last-move tinting ---------- */

  showMoves(moves, enabled) {
    this.clear();
    if (!enabled || !moves) return;
    for (const move of moves) {
      this._tintSquare(move.to, CHESS_COLORS.LEGAL_MOVE);
    }
  }

  showMovePair(from, to) {
    this.clear();
    this._tintSquare(from, CHESS_COLORS.LAST_MOVE);
    this._tintSquare(to, CHESS_COLORS.LAST_MOVE);
  }

  clear() {
    for (const key of this._tinted) {
      const sq = this.squares[key];
      if (sq && sq.material && sq.userData.originalColor) {
        const oc = sq.userData.originalColor;
        gsap.to(sq.material.color, {
          r: oc.r,
          g: oc.g,
          b: oc.b,
          duration: 0.25,
          overwrite: true,
        });
      }
    }
    this._tinted.clear();
    this.clearCheck();
  }

  _tintSquare(key, color) {
    const sq = this.squares[key];
    if (!sq || !sq.material) return;
    _c3.set(color);
    this._tinted.add(key);
    gsap.to(sq.material.color, {
      r: _c3.r,
      g: _c3.g,
      b: _c3.b,
      duration: 0.25,
      overwrite: true,
    });
  }

  /* ---------- check ring (overlay, created on demand) ---------- */

  showCheck(squareKey) {
    this.clearCheck();
    if (!squareKey || !this.squares[squareKey]) return;
    const square = this.squares[squareKey];
    const worldPos = new THREE.Vector3();
    square.getWorldPosition(worldPos);
    const y = worldPos.y + MARKER_Y_OFFSET;

    const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 40);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: CHESS_COLORS.CHECK,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(worldPos.x, y, worldPos.z);
    ring.renderOrder = 6;
    ring.scale.set(1.05, 1.05, 1);
    this.scene.add(ring);
    this.checkRing = ring;
    this.checkTween = gsap.to(ring.scale, {
      x: 1.35,
      z: 1.35,
      duration: 0.8,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  }

  clearCheck() {
    if (this.checkTween) {
      this.checkTween.kill();
      this.checkTween = null;
    }
    if (this.checkRing) {
      this.scene.remove(this.checkRing);
      this.checkRing.geometry.dispose();
      this.checkRing.material.dispose();
      this.checkRing = null;
    }
  }

  dispose() {
    this.clear();
  }
}
