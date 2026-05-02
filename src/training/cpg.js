/**
 * CPGController — Central Pattern Generator for locomotion.
 *
 * Each joint: speed = amplitude * sin(2π * frequency * time + phase)
 *
 * Phases are PRE-WIRED based on archetype (biped trot, quadruped trot, etc.)
 * Only amplitude and frequency evolve — phase stays locked to the gait pattern.
 * This is how real animals work: spinal cord has hardwired gait CPGs,
 * the brain just modulates speed/intensity.
 */

const PI = Math.PI;

/**
 * Known gait phase patterns.
 * For limbs: each pair has [hip_L, knee_L, hip_R, knee_R] phases.
 * Hips on opposite sides are anti-phase (π apart).
 * Knees lead hips by π/2 (leg swings forward then plants).
 */
const GAIT_PHASES = {
  // Biped: 1 limb pair — left/right anti-phase
  // Motors: [spine..., hipL, kneeL, hipR, kneeR]
  biped: {
    spine: (i, n) => i * PI * 0.1,  // gentle wave
    limbs: [
      [0, PI * 0.5, PI, PI * 1.5],  // pair 0: L hip, L knee, R hip, R knee
    ],
  },

  // Quadruped trot: diagonal pairs in sync
  // Front-left + Back-right together, Front-right + Back-left together
  // Motors: [spine..., FL_hip, FL_knee, FR_hip, FR_knee, BL_hip, BL_knee, BR_hip, BR_knee]
  quadruped: {
    spine: (i, n) => i * PI * 0.15,
    limbs: [
      [0, PI * 0.5, PI, PI * 1.5],          // front pair
      [PI, PI * 1.5, 0, PI * 0.5],          // back pair (anti-phase to front)
    ],
  },

  // Hexapod tripod: alternating groups of 3 legs
  // L1, R2, L3 together; R1, L2, R3 together
  hexapod: {
    spine: (i, n) => i * PI * 0.1,
    limbs: [
      [0, PI * 0.5, PI, PI * 1.5],          // pair 0 (L=group A, R=group B)
      [PI, PI * 1.5, 0, PI * 0.5],          // pair 1 (L=group B, R=group A)
      [0, PI * 0.5, PI, PI * 1.5],          // pair 2 (L=group A, R=group B)
    ],
  },

  // Arachnid wave: sequential wave from front to back
  arachnid: {
    spine: (i, n) => 0,
    limbs: [
      [0, PI * 0.5, PI, PI * 1.5],
      [PI * 0.5, PI, PI * 1.5, 0],
      [PI, PI * 1.5, 0, PI * 0.5],
      [PI * 1.5, 0, PI * 0.5, PI],
    ],
  },

  // Serpentine: body wave, no limbs
  serpentine: {
    spine: (i, n) => i * PI * 0.4,  // traveling wave along body
    limbs: [],
  },

  // Blob: no locomotion pattern
  blob: {
    spine: (i, n) => 0,
    limbs: [],
  },
};

class CPGController {
  constructor(motorCount) {
    this.motorCount = motorCount;
    // Genome: 3 params per motor (amplitude, frequency, phase)
    this.params = new Float32Array(motorCount * 3);
    this._lockedPhases = null; // if set, phases won't mutate
  }

  getMotorSpeeds(t) {
    const speeds = new Float32Array(this.motorCount);
    for (let i = 0; i < this.motorCount; i++) {
      const amp = this.params[i * 3];
      const freq = this.params[i * 3 + 1];
      const phase = this.params[i * 3 + 2];
      speeds[i] = amp * Math.sin(2 * PI * freq * t + phase);
    }
    return speeds;
  }

  /**
   * Create a CPG with pre-wired gait phases for an archetype.
   * Only amplitude and frequency are randomized — phases come from the gait pattern.
   */
  static createForArchetype(archetype, motorCount, spineMotors, limbPairs) {
    const c = new CPGController(motorCount);
    const gait = GAIT_PHASES[archetype] || GAIT_PHASES.biped;

    // Default amplitude and frequency
    const defaultAmp = 1.0 + Math.random() * 0.5;
    const defaultFreq = 1.0 + Math.random() * 0.5;

    let motorIdx = 0;

    // Spine motors
    for (let i = 0; i < spineMotors; i++) {
      c.params[motorIdx * 3] = defaultAmp * (archetype === 'serpentine' ? 1.5 : 0.3); // amplitude
      c.params[motorIdx * 3 + 1] = defaultFreq;  // frequency
      c.params[motorIdx * 3 + 2] = gait.spine(i, spineMotors);  // phase from pattern
      motorIdx++;
    }

    // Limb motors (4 per pair: hipL, kneeL, hipR, kneeR)
    for (let pair = 0; pair < limbPairs; pair++) {
      const pairPhases = gait.limbs[pair] || gait.limbs[gait.limbs.length - 1] || [0, PI/2, PI, PI*1.5];
      for (let j = 0; j < 4; j++) {
        if (motorIdx >= motorCount) break;
        const isKnee = (j === 1 || j === 3);
        c.params[motorIdx * 3] = defaultAmp * (isKnee ? 0.8 : 1.2);  // knees slightly less amplitude
        c.params[motorIdx * 3 + 1] = defaultFreq;
        c.params[motorIdx * 3 + 2] = pairPhases[j];
        motorIdx++;
      }
    }

    // Lock the phases so mutation doesn't mess them up
    c._lockedPhases = new Float32Array(motorCount);
    for (let i = 0; i < motorCount; i++) {
      c._lockedPhases[i] = c.params[i * 3 + 2];
    }

    return c;
  }

  /**
   * Mutate amplitude and frequency only. Phases stay locked to gait pattern.
   */
  mutate(rate, amount) {
    for (let i = 0; i < this.motorCount; i++) {
      // Amplitude
      if (Math.random() < rate) {
        this.params[i * 3] += (Math.random() - 0.5) * 2 * amount;
        this.params[i * 3] = Math.max(-3, Math.min(3, this.params[i * 3]));
      }
      // Frequency
      if (Math.random() < rate) {
        this.params[i * 3 + 1] += (Math.random() - 0.5) * 2 * amount * 0.5;
        this.params[i * 3 + 1] = Math.max(0.3, Math.min(4, this.params[i * 3 + 1]));
      }
      // Phase: restore to locked value (don't mutate)
      if (this._lockedPhases) {
        this.params[i * 3 + 2] = this._lockedPhases[i];
      }
    }
  }

  clone() {
    const c = new CPGController(this.motorCount);
    c.params.set(this.params);
    if (this._lockedPhases) {
      c._lockedPhases = new Float32Array(this._lockedPhases);
    }
    return c;
  }

  toJSON() {
    return {
      motorCount: this.motorCount,
      params: Array.from(this.params),
      lockedPhases: this._lockedPhases ? Array.from(this._lockedPhases) : null,
    };
  }

  static fromJSON(d) {
    const c = new CPGController(d.motorCount);
    c.params.set(d.params);
    if (d.lockedPhases) {
      c._lockedPhases = new Float32Array(d.lockedPhases);
    }
    return c;
  }
}

module.exports = { CPGController, GAIT_PHASES };
