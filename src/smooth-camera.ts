import * as THREE from 'three';

/** Input updates the destination; only the render loop advances the visible pose. */
export class SmoothCamera {
  private readonly current = new THREE.Spherical();
  private readonly destination = new THREE.Spherical();
  private readonly currentTarget = new THREE.Vector3();
  private readonly destinationTarget = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly captured = new THREE.Spherical();

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly target: THREE.Vector3,
    private readonly responseSeconds = 0.065) {
    this.reset();
  }

  /** Fit/Home/resize intentionally reset both poses, cancelling residual motion. */
  reset() {
    this.current.setFromVector3(this.offset.subVectors(this.camera.position, this.target));
    this.destination.copy(this.current);
    this.currentTarget.copy(this.target);
    this.destinationTarget.copy(this.target);
  }

  input(change: () => void) {
    this.target.copy(this.destinationTarget);
    this.camera.position.copy(this.destinationTarget).add(this.offset.setFromSpherical(this.destination));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
    try {
      change();
      this.captured.setFromVector3(this.offset.subVectors(this.camera.position, this.target));
      // atan2 wraps at ±π. Keep the destination continuous across that boundary.
      this.destination.theta += THREE.MathUtils.euclideanModulo(this.captured.theta - this.destination.theta + Math.PI, Math.PI * 2) - Math.PI;
      this.destination.phi = this.captured.phi;
      this.destination.radius = this.captured.radius;
      this.destinationTarget.copy(this.target);
    } finally {
      this.apply();
    }
  }

  update(deltaSeconds: number) {
    const alpha = -Math.expm1(-Math.max(0, deltaSeconds) / this.responseSeconds);
    this.currentTarget.lerp(this.destinationTarget, alpha);
    this.current.theta += (this.destination.theta - this.current.theta) * alpha;
    this.current.phi += (this.destination.phi - this.current.phi) * alpha;
    // Log-space zoom keeps the same relative speed at near and far distances.
    this.current.radius *= Math.exp(Math.log(this.destination.radius / this.current.radius) * alpha);
    this.apply();
  }

  private apply() {
    this.target.copy(this.currentTarget);
    this.camera.position.copy(this.currentTarget).add(this.offset.setFromSpherical(this.current));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }
}

/** Same distance/sensitivity as OrbitControls, including line/page wheel units. */
export function cameraWheelScale(deltaY: number, deltaMode: number, pinch = false, zoomSpeed = 1) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1) * (pinch ? 10 : 1);
  return Math.exp(-Math.log(0.95) * zoomSpeed * pixels * 0.01);
}
