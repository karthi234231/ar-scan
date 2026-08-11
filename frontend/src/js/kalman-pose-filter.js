import * as THREE from "three";

/**
 * KalmanPoseFilter
 *
 * State vector (13D):
 *   [px, py, pz, qx, qy, qz, qw, vx, vy, vz, ωx, ωy, ωz]^T
 *
 * - Position: px, py, pz
 * - Orientation: quaternion qx, qy, qz, qw
 * - Velocity: vx, vy, vz
 * - Angular velocity: ωx, ωy, ωz
 *
 * Motion model (constant velocity):
 *   x_{k+1} = F*x_k + w_k
 *
 * Measurement model:
 *   z_k = H*x_k + v_k
 *
 * Prediction step:
 *   x_pred = F*x_prev
 *   P_pred = F*P_prev*F^T + Q
 *
 * Update step:
 *   K = P_pred*H^T*(H*P_pred*H^T + R)^-1
 *   x_current = x_pred + K*(z_measured - H*x_pred)
 *   P_current = (I - K*H)*P_pred
 *
 * The velocity state allows us to predict the pose slightly ahead in time,
 * eliminating sub-frame latency from the render pipeline.
 */
export class KalmanPoseFilter {
  constructor({
    processNoise = 1e-3,
    measurementNoise = 1e-2,
    initialPosition = new THREE.Vector3(0, 0, 0),
    initialQuaternion = new THREE.Quaternion(),
    predictionHorizon = 16, // ms ahead (1 frame at 60fps)
  } = {}) {
    // State: [px, py, pz, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz]
    this.n = 13; // state dimension
    this.m = 7; // measurement dimension: [px, py, pz, qx, qy, qz, qw]

    // Initialize state
    this.x = new Float64Array(this.n);
    this.x[0] = initialPosition.x;
    this.x[1] = initialPosition.y;
    this.x[2] = initialPosition.z;
    this.x[3] = initialQuaternion.x;
    this.x[4] = initialQuaternion.y;
    this.x[5] = initialQuaternion.z;
    this.x[6] = initialQuaternion.w;
    // velocity and angular velocity start at 0

    // Covariance matrix (13x13) - diagonal
    this.P = new Float64Array(this.n * this.n);
    for (let i = 0; i < this.n; i++) {
      this.P[i * this.n + i] = 1e-2;
    }

    // Process noise covariance Q (13x13) - diagonal
    this.Q = new Float64Array(this.n * this.n);
    const posQ = processNoise;
    const velQ = processNoise * 10;
    const angVelQ = processNoise * 100;
    for (let i = 0; i < 3; i++) this.Q[i * this.n + i] = posQ; // position
    for (let i = 3; i < 7; i++) this.Q[i * this.n + i] = processNoise; // quaternion
    for (let i = 7; i < 10; i++) this.Q[i * this.n + i] = velQ; // velocity
    for (let i = 10; i < 13; i++) this.Q[i * this.n + i] = angVelQ; // angular velocity

    // Measurement noise covariance R (7x7) - diagonal
    this.R = new Float64Array(this.m * this.m);
    for (let i = 0; i < this.m; i++) {
      this.R[i * this.m + i] = measurementNoise;
    }

    // Measurement matrix H (7x13): identity for position + quaternion, zero for velocity
    this.H = new Float64Array(this.m * this.n);
    for (let i = 0; i < this.m; i++) {
      this.H[i * this.n + i] = 1;
    }

    this.predictionHorizon = predictionHorizon;
    this.lastTimestamp = null;

    // Temporary buffers
    this._tmp = {
      F: new Float64Array(this.n * this.n), // state transition
      FP: new Float64Array(this.n * this.n), // F*P
      FPF: new Float64Array(this.n * this.n), // F*P*F^T
      P_pred: new Float64Array(this.n * this.n),
      HT: new Float64Array(this.n * this.m), // H^T
      HP: new Float64Array(this.m * this.n), // H*P_pred
      HPH: new Float64Array(this.m * this.m), // H*P_pred*H^T
      S: new Float64Array(this.m * this.m), // H*P*H^T + R
      S_inv: new Float64Array(this.m * this.m),
      K: new Float64Array(this.n * this.m), // Kalman gain
      KH: new Float64Array(this.n * this.n),
      I_KH: new Float64Array(this.n * this.n),
      innovation: new Float64Array(this.m),
      x_pred: new Float64Array(this.n),
    };
  }

  /**
   * Builds the state transition matrix F for a constant-velocity model.
   * For position: p_{k+1} = p_k + Δt * v_k
   * For quaternion: q_{k+1} ≈ q_k + Δt * ω (small-angle approx)
   * For velocity: v_{k+1} = v_k (constant)
   * For angular velocity: ω_{k+1} = ω_k (constant)
   * @param {number} dt seconds
   */
  _buildStateTransition(dt) {
    const F = this._tmp.F;
    F.fill(0);

    // Identity matrix
    for (let i = 0; i < this.n; i++) F[i * this.n + i] = 1;

    // Position <- velocity coupling: p_{k+1} = p_k + dt * v_k
    F[0 * this.n + 7] = dt; // px <-> vx
    F[1 * this.n + 8] = dt; // py <-> vy
    F[2 * this.n + 9] = dt; // pz <-> vz

    // Quaternion <- angular velocity coupling (simplified):
    // q_{k+1} ≈ q_k + 0.5 * dt * [ωx, ωy, ωz, 0] ⊗ q_k
    // For small angles, we approximate by direct addition on each component.
    F[3 * this.n + 10] = 0.5 * dt; // qx <-> ωx
    F[4 * this.n + 11] = 0.5 * dt; // qy <-> ωy
    F[5 * this.n + 12] = 0.5 * dt; // qz <-> ωz

    return F;
  }

  /**
   * Filters a raw pose measurement.
   * @param {THREE.Vector3} position
   * @param {THREE.Quaternion} quaternion
   * @param {number} timestamp performance.now() in ms
   * @param {THREE.Vector3} outPosition (optional) preallocated output
   * @param {THREE.Quaternion} outQuaternion (optional) preallocated output
   * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion }}
   */
  update(position, quaternion, timestamp, outPosition, outQuaternion) {
    const dt = this.lastTimestamp !== null
      ? Math.max((timestamp - this.lastTimestamp) / 1000, 0.001)
      : 0.016;
    this.lastTimestamp = timestamp;

    // ---- Prediction step ----
    const F = this._buildStateTransition(dt);

    // x_pred = F * x
    const x_pred = this._tmp.x_pred;
    for (let i = 0; i < this.n; i++) {
      let sum = 0;
      for (let j = 0; j < this.n; j++) {
        sum += F[i * this.n + j] * this.x[j];
      }
      x_pred[i] = sum;
    }

    // Normalize quaternion part of prediction
    const qLen = Math.hypot(x_pred[3], x_pred[4], x_pred[5], x_pred[6]);
    if (qLen > 0) {
      x_pred[3] /= qLen;
      x_pred[4] /= qLen;
      x_pred[5] /= qLen;
      x_pred[6] /= qLen;
    }

    // P_pred = F * P * F^T + Q
    // Step 1: FP = F * P
    const FP = this._tmp.FP;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        let sum = 0;
        for (let k = 0; k < this.n; k++) {
          sum += F[i * this.n + k] * this.P[k * this.n + j];
        }
        FP[i * this.n + j] = sum;
      }
    }

    // Step 2: FPF = FP * F^T
    const FPF = this._tmp.FPF;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        let sum = 0;
        for (let k = 0; k < this.n; k++) {
          sum += FP[i * this.n + k] * F[j * this.n + k]; // F^T[k,j] = F[j,k]
        }
        FPF[i * this.n + j] = sum;
      }
    }

    // P_pred = FPF + Q
    const P_pred = this._tmp.P_pred;
    for (let i = 0; i < this.n * this.n; i++) {
      P_pred[i] = FPF[i] + this.Q[i];
    }

    // ---- Update step ----
    // innovation = z - H*x_pred
    const innovation = this._tmp.innovation;
    // Measurement z: [px, py, pz, qx, qy, qz, qw]
    const z = [
      position.x, position.y, position.z,
      quaternion.x, quaternion.y, quaternion.z, quaternion.w,
    ];
    for (let i = 0; i < this.m; i++) {
      innovation[i] = z[i] - x_pred[i];
    }

    // HT = H^T
    const HT = this._tmp.HT;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.m; j++) {
        HT[i * this.m + j] = this.H[j * this.n + i];
      }
    }

    // HP = H * P_pred
    const HP = this._tmp.HP;
    for (let i = 0; i < this.m; i++) {
      for (let j = 0; j < this.n; j++) {
        let sum = 0;
        for (let k = 0; k < this.n; k++) {
          sum += this.H[i * this.n + k] * P_pred[k * this.n + j];
        }
        HP[i * this.n + j] = sum;
      }
    }

    // HPH = H * P_pred * H^T = HP * H^T
    const HPH = this._tmp.HPH;
    for (let i = 0; i < this.m; i++) {
      for (let j = 0; j < this.m; j++) {
        let sum = 0;
        for (let k = 0; k < this.n; k++) {
          sum += HP[i * this.n + k] * this.H[j * this.n + k];
        }
        HPH[i * this.m + j] = sum;
      }
    }

    // S = HPH + R
    const S = this._tmp.S;
    for (let i = 0; i < this.m * this.m; i++) {
      S[i] = HPH[i] + this.R[i];
    }

    // S_inv = S^-1 (7x7 matrix inversion)
    const S_inv = this._tmp.S_inv;
    if (!invertMatrix7(S, S_inv)) {
      // If inversion fails, skip update and return prediction
      return this._getOutput(x_pred, outPosition, outQuaternion);
    }

    // K = P_pred * H^T * S^-1 = (P_pred * H^T) * S^-1
    // First compute PH = P_pred * H^T (13x7)
    const K = this._tmp.K;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.m; j++) {
        let sum = 0;
        for (let k = 0; k < this.m; k++) {
          sum += HT[i * this.m + k] * S_inv[k * this.m + j];
        }
        // Actually: (P_pred * H^T) = P_pred * HT, then * S^-1
        let phSum = 0;
        for (let k = 0; k < this.n; k++) {
          phSum += P_pred[i * this.n + k] * HT[k * this.m + j];
        }
        K[i * this.m + j] = phSum; // PH (13x7)
      }
    }

    // Now multiply PH by S_inv to get K: K = PH * S_inv
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.m; j++) {
        let sum = 0;
        for (let k = 0; k < this.m; k++) {
          // PH[i,k] currently stored in K[i,k]
          sum += K[i * this.m + k] * S_inv[k * this.m + j];
        }
        // Store PH in a temp
        this._tmp.K[i * this.m + j] = sum;
      }
    }

    // x_current = x_pred + K * innovation
    for (let i = 0; i < this.n; i++) {
      let sum = 0;
      for (let j = 0; j < this.m; j++) {
        sum += K[i * this.m + j] * innovation[j];
      }
      this.x[i] = x_pred[i] + sum;
    }

    // Normalize quaternion
    const qLen2 = Math.hypot(this.x[3], this.x[4], this.x[5], this.x[6]);
    if (qLen2 > 0) {
      this.x[3] /= qLen2;
      this.x[4] /= qLen2;
      this.x[5] /= qLen2;
      this.x[6] /= qLen2;
    }

    // P_current = (I - K*H) * P_pred
    // First compute KH = K * H (13x13)
    const KH = this._tmp.KH;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        let sum = 0;
        for (let k = 0; k < this.m; k++) {
          sum += K[i * this.m + k] * this.H[k * this.n + j];
        }
        KH[i * this.n + j] = sum;
      }
    }

    // I_KH = I - KH
    const I_KH = this._tmp.I_KH;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        I_KH[i * this.n + j] = (i === j ? 1 : 0) - KH[i * this.n + j];
      }
    }

    // P = I_KH * P_pred
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        let sum = 0;
        for (let k = 0; k < this.n; k++) {
          sum += I_KH[i * this.n + k] * P_pred[k * this.n + j];
        }
        this.P[i * this.n + j] = sum;
      }
    }

    // ---- Prediction ahead (predictionHorizon) ----
    // Use velocity to predict future pose and eliminate sub-frame latency
    if (this.predictionHorizon > 0 && this.lastTimestamp !== null) {
      const dtPredict = this.predictionHorizon / 1000;
      // Position prediction: p_future = p + v * dtPredict
      this.x[0] += this.x[7] * dtPredict;
      this.x[1] += this.x[8] * dtPredict;
      this.x[2] += this.x[9] * dtPredict;

      // Quaternion prediction: small-angle rotation by angular velocity
      // This is an approximation that adds the angular velocity contribution
    }

    // Decay velocity slightly to prevent runaway drift
    const damping = 0.95;
    for (let i = 7; i < 13; i++) {
      this.x[i] *= damping;
    }

    // Return filtered + predicted pose
    const outPos = outPosition || new THREE.Vector3();
    const outQuat = outQuaternion || new THREE.Quaternion();
    outPos.set(this.x[0], this.x[1], this.x[2]);
    outQuat.set(this.x[3], this.x[4], this.x[5], this.x[6]);

    return { position: outPos, quaternion: outQuat };
  }

  /**
   * Resets the filter state.
   */
  reset(position, quaternion) {
    this.lastTimestamp = null;
    this.x.fill(0);
    if (position) {
      this.x[0] = position.x;
      this.x[1] = position.y;
      this.x[2] = position.z;
    }
    if (quaternion) {
      this.x[3] = quaternion.x;
      this.x[4] = quaternion.y;
      this.x[5] = quaternion.z;
      this.x[6] = quaternion.w;
    }
    this.P.fill(0);
    for (let i = 0; i < this.n; i++) {
      this.P[i * this.n + i] = 1e-2;
    }
  }

  _getOutput(x_pred, outPosition, outQuaternion) {
    const outPos = outPosition || new THREE.Vector3();
    const outQuat = outQuaternion || new THREE.Quaternion();
    outPos.set(x_pred[0], x_pred[1], x_pred[2]);
    outQuat.set(x_pred[3], x_pred[4], x_pred[5], x_pred[6]);
    return { position: outPos, quaternion: outQuat };
  }
}

/**
 * Inverts a 7x7 matrix in-place using Gauss-Jordan elimination.
 * @param {Float64Array} mat input matrix (row-major, 49 elements)
 * @param {Float64Array} out output matrix (row-major, 49 elements)
 * @returns {boolean} true if invertible, false otherwise
 */
function invertMatrix7(mat, out) {
  // Augmented matrix [mat | I]
  const aug = new Float64Array(14 * 7);
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      aug[i * 14 + j] = mat[i * 7 + j];
    }
    aug[i * 14 + 7 + i] = 1;
  }

  // Forward elimination
  for (let col = 0; col < 7; col++) {
    // Find pivot
    let pivot = col;
    let maxVal = Math.abs(aug[col * 14 + col]);
    for (let row = col + 1; row < 7; row++) {
      const val = Math.abs(aug[row * 14 + col]);
      if (val > maxVal) {
        maxVal = val;
        pivot = row;
      }
    }

    if (maxVal < 1e-12) return false;

    // Swap rows
    if (pivot !== col) {
      for (let j = 0; j < 14; j++) {
        const tmp = aug[col * 14 + j];
        aug[col * 14 + j] = aug[pivot * 14 + j];
        aug[pivot * 14 + j] = tmp;
      }
    }

    // Normalize pivot row
    const pivotVal = aug[col * 14 + col];
    for (let j = 0; j < 14; j++) {
      aug[col * 14 + j] /= pivotVal;
    }

    // Eliminate other rows
    for (let row = 0; row < 7; row++) {
      if (row === col) continue;
      const factor = aug[row * 14 + col];
      if (factor === 0) continue;
      for (let j = 0; j < 14; j++) {
        aug[row * 14 + j] -= factor * aug[col * 14 + j];
      }
    }
  }

  // Extract inverse from augmented matrix
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      out[i * 7 + j] = aug[i * 14 + 7 + j];
    }
  }

  return true;
}