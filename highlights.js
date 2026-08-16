/* ============================================================
   CHESSFALL - highlights.js
   Elegant, reversible board feedback:
   - soft dots on empty legal destinations
   - thin warm rings on capturable targets
   - pulsing red ring around a king in check
   No square base color is ever mutated, so clearing is instant
   and leaves the black & white board untouched.
   ============================================================ */

import * as THREE from "three";

export const CHESS_COLORS = {
  WHITE_SQUARE: 0xf2f2f2,
  BLACK_SQUARE: 0x161616,
  LEGAL_MOVE: 0x2ecc71,
  LEGAL_CAPTURE: 0x2ecc71,
  CHECK: 0xe0524a,
};

const DOT_RADIUS = 0.045;
const RING_INNER = 0.032;
const RING_OUTER = 0.054;
const MARKER_Y_OFFSET = 0.025;

export class HighlightManager {
  constructor(scene, squares) {
    this.scene = scene;
    this.squares = squares;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.dots = {};
    this.rings = {};
    this.checkRing = null;
    this.checkTween = null;
    this._build();
  }

  _build() {
    const dotGeo = new THREE.CircleGeometry(DOT_RADIUS, 24);
    const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 40);
    const worldPos = new THREE.Vector3();

    for (const key of Object.keys(this.squares)) {
      const square = this.squares[key];
      square.getWorldPosition(worldPos);
      const y = worldPos.y + MARKER_Y_OFFSET;

      const dot = new THREE.Mesh(
        dotGeo,
        new THREE.MeshBasicMaterial({
          color: CHESS_COLORS.LEGAL_MOVE,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
        })
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(worldPos.x, y, worldPos.z);
      dot.renderOrder = 6;

      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: CHESS_COLORS.LEGAL_CAPTURE,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(worldPos.x, y, worldPos.z);
      ring.renderOrder = 6;

      this.group.add(dot);
      this.group.add(ring);
      this.dots[key] = dot;
      this.rings[key] = ring;
    }
  }

  showMoves(moves, enabled) {
    this.clear();
    if (!enabled) return;
    for (const move of moves) {
      if (move.captured) {
        this._fade(this.rings[move.to], 0.95);
      } else {
        this._fade(this.dots[move.to], 0.9);
      }
    }
  }

  showMovePair(from, to) {
    this.clear();
    this._fade(this.dots[from], 0.45);
    this._fade(this.dots[to], 0.95);
  }

  clear() {
    for (const key of Object.keys(this.dots)) {
      this._fade(this.dots[key], 0);
      this._fade(this.rings[key], 0);
    }
  }

  _fade(mesh, opacity) {
    if (mesh) {
      gsap.to(mesh.material, { opacity, duration: 0.25, overwrite: true });
    }
  }

  showCheck(squareKey) {
    this.clearCheck();
    if (!squareKey || !this.rings[squareKey]) return;
    const ring = this.rings[squareKey];
    this.checkRing = ring;
    ring.material.color.set(CHESS_COLORS.CHECK);
    ring.material.opacity = 0.9;
    ring.scale.set(1.05, 1.05, 1);
    this.checkTween = gsap.to(ring.scale, {
      x: 1.35, z: 1.35,
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
      this.checkRing.material.opacity = 0;
      this.checkRing.scale.set(1, 1, 1);
      this.checkRing.material.color.set(CHESS_COLORS.LEGAL_CAPTURE);
      this.checkRing = null;
    }
  }

  dispose() {
    this.clearCheck();
    this.clear();
    gsap.killTweensOf(this.group.children);
    this.scene.remove(this.group);
    for (const mesh of this.group.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
