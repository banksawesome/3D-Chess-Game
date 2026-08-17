/* ============================================================
   CHESSFALL - camera.js
   CameraManager: cinematic sequences that briefly take control,
   then restore the player's previous view. Every transition keeps
   OrbitControls' target in sync so the player is never stuck.
   ============================================================ */

import * as THREE from "three";

class CameraManager {
  constructor() {
    this.camera = null;
    this.controls = null;
    this.defaultPosition = new THREE.Vector3(0, 1.9, -2.4);
    this.defaultTarget = new THREE.Vector3(0, -0.7, 0);
    this.saved = null;
    this.shakeStrength = 0;
    this.idle = false;
    this.cinematic = false;
  }

  init(camera, controls) {
    this.camera = camera;
    this.controls = controls;
  }

  /* Move the board frame-of-reference for a full 180 turn. */
  flipTable() {
    this.defaultPosition.set(0, 1.9, 2.4);
    this.defaultTarget.set(0, -0.7, 0);
  }

  /* Return the frame-of-reference to the standard white-side view. */
  resetFlip() {
    this.defaultPosition.set(0, 1.9, -2.4);
    this.defaultTarget.set(0, -0.7, 0);
  }

  save() {
    this.saved = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
    };
  }

  restore(duration = 1) {
    if (!this.saved) return;
    const from = this.saved;
    this.saved = null;
    this.moveTo(from.position, from.target, duration, { ease: "power2.inOut" });
  }

  /* Cinematic move: tween camera.position AND controls.target together. */
  moveTo(position, target, duration, opts = {}) {
    const cam = this.camera;
    const ctrl = this.controls;
    const ease = opts.ease || "power2.inOut";
    const onComplete = opts.onComplete || null;
    this.cinematic = true;
    gsap.killTweensOf(cam.position);
    gsap.killTweensOf(ctrl.target);
    gsap.to(cam.position, {
      x: position.x, y: position.y, z: position.z,
      duration,
      ease,
    });
    gsap.to(ctrl.target, {
      x: target.x, y: target.y, z: target.z,
      duration,
      ease,
      onComplete: () => {
        cam.position.set(position.x, position.y, position.z);
        ctrl.target.set(target.x, target.y, target.z);
        ctrl._sphericalDelta.set(0, 0, 0);
        ctrl._panOffset.set(0, 0, 0);
        const wasAutoRotate = ctrl.autoRotate;
        ctrl.autoRotate = false;
        ctrl.update();
        ctrl.autoRotate = wasAutoRotate;
        this.cinematic = false;
        if (onComplete) onComplete();
      },
    });
  }

  /* Instantly jump (used after board reset / mode flip). */
  snap(position, target) {
    this.cinematic = true;
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    this.camera.position.set(position.x, position.y, position.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls._sphericalDelta.set(0, 0, 0);
    this.controls._panOffset.set(0, 0, 0);
    const wasAutoRotate = this.controls.autoRotate;
    this.controls.autoRotate = false;
    this.controls.update();
    this.controls.autoRotate = wasAutoRotate;
    this.cinematic = false;
  }

  resetToDefault(duration = 1.1) {
    this.moveTo(this.defaultPosition, this.defaultTarget, duration, { ease: "power2.inOut" });
  }

  goTopView(duration = 1.5) {
    const cam = this.camera;
    const ctrl = this.controls;
    if (!cam || !ctrl) return;
    const zSign = this.defaultPosition.z > 0 ? 0.001 : -0.001;
    const target = new THREE.Vector3(0, -0.7, 0);
    ctrl.enabled = false;
    this.cinematic = true;
    gsap.killTweensOf(cam.position);
    gsap.killTweensOf(ctrl.target);
    ctrl.target.copy(target);
    const reenable = () => {
      ctrl.enabled = true;
      this.cinematic = false;
      window.removeEventListener("pointerdown", reenable);
      window.removeEventListener("touchstart", reenable);
    };
    gsap.to(cam.position, {
      x: 0,
      y: 1.3,
      z: zSign,
      duration,
      ease: "power2.inOut",
      onComplete: () => {
        cam.position.set(0, 1.3, zSign);
        ctrl.target.copy(target);
        ctrl._sphericalDelta.set(0, 0, 0);
        ctrl._panOffset.set(0, 0, 0);
        const wasAutoRotate = ctrl.autoRotate;
        ctrl.autoRotate = false;
        ctrl.update();
        ctrl.autoRotate = wasAutoRotate;
        window.addEventListener("pointerdown", reenable, { once: true });
        window.addEventListener("touchstart", reenable, { once: true });
        setTimeout(reenable, 3000);
      },
    });
  }

  /* Subtle menu idle: slow auto-orbit, disabled on interaction. */
  startIdle() {
    if (this.idle) return;
    this.idle = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
  }

  stopIdle() {
    this.idle = false;
    this.controls.autoRotate = false;
  }

  /* Small, decaying shake. Call applyShake() each render frame. */
  shake(amplitude = 0.02, duration = 0.3) {
    this.shakeStrength = amplitude;
  }

  applyShake() {
    if (this.shakeStrength < 0.0005) {
      this.shakeStrength = 0;
      return;
    }
    this.camera.position.x += (Math.random() - 0.5) * this.shakeStrength;
    this.camera.position.y += (Math.random() - 0.5) * this.shakeStrength;
    this.camera.position.z += (Math.random() - 0.5) * this.shakeStrength;
    this.shakeStrength *= 0.86;
  }

  /* Kill any in-flight camera tweens (e.g. when skipping a cinematic). */
  stopTransitions() {
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    this.cinematic = false;
  }
}

export const cameraManager = new CameraManager();
