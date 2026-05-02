/**
 * CreatureBody — universal physics ragdoll built from DNA.
 *
 * Supports diverse skeleton topologies: serpentine, blob, biped,
 * quadruped, hexapod, arachnid — all driven by the bodyPlan gene.
 *
 * Skeleton = spine chain + bilateral limb pairs.
 *
 * Stage-dependent proportions:
 *   Stage 3 (baby): 60% scale, bigger head
 *   Stage 4 (adult): full proportions
 *
 * Stages 1-2 are incubating (no physics body needed).
 *
 * Key physics changes for CPG walking:
 * - Spine segments use Box shapes (not Sphere — no rolling)
 * - Low damping for natural movement
 * - Z-constraint for 2D walking plane
 * - Per-joint motor force (spine=40, hip=80, knee=60)
 */

const CANNON = require('cannon-es');

/**
 * Decode DNA bodyPlan gene (0-1) into an archetype config.
 */
function decodeBodyPlan(dna) {
  const bp = dna.bodyPlan || 0.4;
  const limb = dna.limbGenes || 0.5;

  let archetype, spineSegments, limbPairs, splay;

  if (bp < 0.15) {
    // Serpentine: long spine, no limbs
    archetype = 'serpentine';
    spineSegments = Math.round(6 + bp / 0.15 * 6); // 6-12
    limbPairs = 0;
    splay = 0;
  } else if (bp < 0.30) {
    // Blob: minimal spine, no limbs
    archetype = 'blob';
    spineSegments = Math.round(1 + (bp - 0.15) / 0.15); // 1-2
    limbPairs = 0;
    splay = 0;
  } else if (bp < 0.50) {
    // Biped: short spine, 1 limb pair
    archetype = 'biped';
    spineSegments = Math.round(2 + (bp - 0.30) / 0.20); // 2-3
    limbPairs = 1;
    splay = 0.3 + limb * 0.2;
  } else if (bp < 0.70) {
    // Quadruped: medium spine, 2 limb pairs
    archetype = 'quadruped';
    spineSegments = Math.round(3 + (bp - 0.50) / 0.20); // 3-4
    limbPairs = 2;
    splay = 0.4 + limb * 0.3;
  } else if (bp < 0.85) {
    // Hexapod: 3 spine segs, 3 limb pairs
    archetype = 'hexapod';
    spineSegments = 3;
    limbPairs = 3;
    splay = 0.5 + limb * 0.3;
  } else {
    // Arachnid: 2 spine segs, 4 limb pairs, high splay
    archetype = 'arachnid';
    spineSegments = 2;
    limbPairs = 4;
    splay = 0.7 + limb * 0.3;
  }

  return { archetype, spineSegments, limbPairs, splay };
}

/**
 * Compute motor and sensor counts for a body plan (without building physics).
 */
function computeIOCounts(dna) {
  const plan = decodeBodyPlan(dna);
  const spineMotors = Math.max(0, plan.spineSegments - 1); // joints between spine segs
  const limbMotors = plan.limbPairs * 4; // 2 joints * 2 sides per pair
  const motorCount = spineMotors + limbMotors;
  const footCount = plan.limbPairs * 2; // one foot per limb (left + right per pair)
  const sensorCount = 4 + motorCount + footCount + 1; // 4 fixed + joints + feet + bias
  return { motorCount, sensorCount, footCount, spineMotors, limbMotors, plan };
}

class CreatureBody {
  constructor(dna) {
    this.dna = dna || {};
    this.bodies = [];       // CANNON.Body[]
    this.joints = [];       // CANNON.HingeConstraint[]
    this.motorJoints = [];  // joints the brain controls
    this.torso = null;      // leg-bearing spine segment (used for fitness/camera)
    this.groundContacts = [];
    this.alive = true;
    this._ground = null;
    this._motorForces = []; // per-motor max force
  }

  /**
   * Build the ragdoll in a physics world.
   * @param {CANNON.World} world
   * @param {number} stage - creature stage (3 or 4)
   */
  build(world, stage) {
    stage = stage || 4;
    const d = this.dna;
    const plan = decodeBodyPlan(d);

    // Scale factor: baby = 60%, adult = 100%
    const scale = stage <= 3 ? 0.6 : 1.0;
    // Baby gets slightly bigger head ratio (but not too heavy)
    const headScale = stage <= 3 ? 1.15 : 1.0;

    const mass = (0.8 + (d.metabolismGenes || 0.5) * 1.2) * scale;
    const limbLen = (0.12 + (d.limbGenes || 0.5) * 0.22) * scale;
    const limbW = (0.025 + (d.limbGenes || 0.5) * 0.02) * scale;
    const headR = (0.04 + (d.eyeGenes || 0.5) * 0.04) * scale * headScale;

    // Spine segment sizing
    const spineR = (0.06 + (d.bodyPlan || 0.5) * 0.06) * scale;
    const spineSpacing = spineR * 1.8;

    // Materials
    const groundMat = new CANNON.Material('ground');
    const bodyMat = new CANNON.Material('body');
    world.addContactMaterial(new CANNON.ContactMaterial(groundMat, bodyMat, {
      friction: 2.5, restitution: 0.1,
    }));

    // Ground plane
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    this._ground = ground;

    // Determine spawn height: enough to clear the ground
    const spawnY = plan.limbPairs > 0
      ? limbLen * 2 + spineR + 0.05
      : spineR + 0.05; // limbless creatures sit near ground

    // Mass distribution
    const spineSegs = plan.spineSegments;
    const torsoMassPerSeg = mass * 0.8 / Math.max(1, spineSegs);
    const headMass = mass * 0.1;
    const upperLimbMass = mass * 0.08;
    const lowerLimbMass = mass * 0.05;

    // ============ BUILD SPINE CHAIN ============
    // First segment = HEAD, remaining = body segments
    // All use Box shapes (no rolling!)
    const spineBodies = [];

    for (let i = 0; i < spineSegs; i++) {
      const isHead = (i === 0);
      const radius = isHead ? headR : spineR;
      const segMass = isHead ? headMass : torsoMassPerSeg;

      // Spine runs along +X axis (forward direction)
      const xPos = -i * spineSpacing;
      // Box shape: width=radius, height=radius*0.8 (slightly flat), depth=radius
      const shape = new CANNON.Box(new CANNON.Vec3(radius, radius * 0.8, radius));
      const body = new CANNON.Body({
        mass: segMass,
        position: new CANNON.Vec3(xPos, spawnY, 0),
        shape,
        material: bodyMat,
        linearDamping: 0.01,
        angularDamping: 0.05,
      });
      world.addBody(body);
      this.bodies.push(body);
      spineBodies.push(body);

      // Connect to previous spine segment with hinge
      if (i > 0) {
        const prev = spineBodies[i - 1];
        const prevR = (i === 1) ? headR : spineR;
        const joint = new CANNON.HingeConstraint(prev, body, {
          pivotA: new CANNON.Vec3(-prevR * 0.8, 0, 0),
          pivotB: new CANNON.Vec3(radius * 0.8, 0, 0),
          axisA: new CANNON.Vec3(0, 0, 1), // lateral bending (Z axis for spine along X)
          axisB: new CANNON.Vec3(0, 0, 1),
        });
        joint.lowerLimitEnabled = true;
        joint.upperLimitEnabled = true;
        joint.lowerLimit = -0.5;
        joint.upperLimit = 0.5;
        world.addConstraint(joint);
        this.joints.push(joint);
        this.motorJoints.push(joint);
        this._motorForces.push(40); // spine motor force
        joint.enableMotor();
      }
    }

    // Torso = leg-bearing segment (not the head which swings wildly).
    // For limbless creatures, use first body segment (or head if only 1).
    if (plan.limbPairs > 0 && spineBodies.length > 1) {
      this.torso = spineBodies[1]; // first body segment after head
    } else {
      this.torso = spineBodies[0];
    }

    // ============ ATTACH LIMB PAIRS ============
    // ALL limbs built in XY plane (Z=0). Splay is expressed as hip angle,
    // NOT as Z-offset. This prevents constrainZ() from fighting limb placement.
    if (plan.limbPairs > 0 && spineSegs > 0) {
      // Distribute limb pairs evenly along spine (skip head)
      const attachableSegs = spineBodies.slice(1); // body segments only
      if (attachableSegs.length === 0 && spineBodies.length > 0) {
        // Only head exists — attach to head
        attachableSegs.push(spineBodies[0]);
      }

      for (let pair = 0; pair < plan.limbPairs; pair++) {
        // Pick which spine segment to attach to
        const segIdx = attachableSegs.length === 1
          ? 0
          : Math.round(pair / Math.max(1, plan.limbPairs - 1) * (attachableSegs.length - 1));
        const attachBody = attachableSegs[Math.min(segIdx, attachableSegs.length - 1)];
        const attachR = (attachBody === spineBodies[0]) ? headR : spineR;

        for (let side = -1; side <= 1; side += 2) {
          const halfLimb = limbLen * 0.5;

          // Upper limb — placed directly below attachment point, Z=0
          const upperX = attachBody.position.x;
          const upperY = spawnY - halfLimb;

          const upper = new CANNON.Body({
            mass: upperLimbMass,
            position: new CANNON.Vec3(upperX, upperY, 0),
            shape: new CANNON.Box(new CANNON.Vec3(limbW, halfLimb * 0.5, limbW)),
            material: bodyMat,
            linearDamping: 0.01,
            angularDamping: 0.05,
          });
          world.addBody(upper);
          this.bodies.push(upper);

          // Hip joint — splay expressed as angular offset on the hip pivot
          // Side determines which direction the hip pivots from center
          const splayOffset = side * attachR * 0.5;
          const hipJoint = new CANNON.HingeConstraint(attachBody, upper, {
            pivotA: new CANNON.Vec3(splayOffset, -attachR * 0.6, 0),
            pivotB: new CANNON.Vec3(0, halfLimb * 0.5, 0),
            axisA: new CANNON.Vec3(0, 0, 1),
            axisB: new CANNON.Vec3(0, 0, 1),
          });
          hipJoint.lowerLimitEnabled = true;
          hipJoint.upperLimitEnabled = true;
          hipJoint.lowerLimit = -1.0;
          hipJoint.upperLimit = 1.2;
          world.addConstraint(hipJoint);
          this.joints.push(hipJoint);
          this.motorJoints.push(hipJoint);
          this._motorForces.push(80); // hip motor force
          hipJoint.enableMotor();

          // Lower limb (shin) — wider at bottom for feet
          const lowerY = upperY - halfLimb;
          const lower = new CANNON.Body({
            mass: lowerLimbMass,
            position: new CANNON.Vec3(upperX, lowerY, 0),
            shape: new CANNON.Box(new CANNON.Vec3(limbW * 2, halfLimb * 0.5, limbW * 2)),
            material: bodyMat,
            linearDamping: 0.01,
            angularDamping: 0.05,
          });
          world.addBody(lower);
          this.bodies.push(lower);

          // Knee joint — hinge in Z axis (same plane as hip)
          const kneeJoint = new CANNON.HingeConstraint(upper, lower, {
            pivotA: new CANNON.Vec3(0, -halfLimb * 0.5, 0),
            pivotB: new CANNON.Vec3(0, halfLimb * 0.5, 0),
            axisA: new CANNON.Vec3(0, 0, 1),
            axisB: new CANNON.Vec3(0, 0, 1),
          });
          kneeJoint.lowerLimitEnabled = true;
          kneeJoint.upperLimitEnabled = true;
          kneeJoint.lowerLimit = -1.6;
          kneeJoint.upperLimit = -0.1;
          world.addConstraint(kneeJoint);
          this.joints.push(kneeJoint);
          this.motorJoints.push(kneeJoint);
          this._motorForces.push(60); // knee motor force
          kneeJoint.enableMotor();

          // Ground contact tracking (on feet / lower segments)
          const footIdx = this.groundContacts.length;
          this.groundContacts.push(false);
          lower.addEventListener('collide', (e) => {
            if (e.body === ground) this.groundContacts[footIdx] = true;
          });
        }
      }
    }
  }

  /**
   * Get sensor values for the brain.
   * Fixed: torso pitch, angular velocity, height, horizontal velocity (4)
   * Variable: joint angle per motor joint, ground contact per foot
   * Fixed: bias (1)
   */
  getSensors() {
    const t = this.torso;
    if (!t) {
      const count = 4 + this.motorJoints.length + this.groundContacts.length + 1;
      return new Array(count).fill(0);
    }

    const euler = new CANNON.Vec3();
    t.quaternion.toEuler(euler);
    const pitch = euler.x / Math.PI;
    const angVel = t.angularVelocity.y / 10;
    const height = Math.min(1, t.position.y / 2);
    const hVel = t.velocity.x / 5;

    const jointAngles = [];
    for (const joint of this.motorJoints) {
      jointAngles.push(this._getJointAngle(joint) / Math.PI);
    }

    const contacts = this.groundContacts.map(c => c ? 1 : 0);
    this.groundContacts.fill(false);

    return [pitch, angVel, height, hVel, ...jointAngles, ...contacts, 1.0];
  }

  applyMotors(outputs) {
    const maxSpeed = 4;
    this._energyUsed = 0;
    for (let i = 0; i < this.motorJoints.length && i < outputs.length; i++) {
      const speed = outputs[i] * maxSpeed;
      this._energyUsed += speed * speed;
      this.motorJoints[i].setMotorSpeed(speed);
      this.motorJoints[i].setMotorMaxForce(this._motorForces[i] || 40);
    }
  }

  getEnergyUsed() {
    return this._energyUsed || 0;
  }

  hasFallen() {
    if (!this.torso) return true;
    return this.torso.position.y < 0.04;
  }

  getFitness() {
    if (!this.torso) return 0;
    const distance = Math.max(0, this.torso.position.x);
    const height = Math.max(0, this.torso.position.y);
    const fallPenalty = this.hasFallen() ? 2 : 0;
    return distance + height * 0.5 - fallPenalty;
  }

  /**
   * Constrain all bodies to the Z=0 plane (2D walking).
   */
  constrainZ() {
    for (const b of this.bodies) {
      b.position.z = 0;
      b.velocity.z = 0;
    }
  }

  _getJointAngle(joint) {
    const q1 = joint.bodyA.quaternion;
    const q2 = joint.bodyB.quaternion;
    return Math.acos(Math.min(1, Math.abs(
      q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w
    ))) * 2;
  }

  getVisualState() {
    return this.bodies.map(b => ({
      pos: { x: b.position.x, y: b.position.y, z: b.position.z },
      quat: { x: b.quaternion.x, y: b.quaternion.y, z: b.quaternion.z, w: b.quaternion.w },
      shape: b.shapes[0] instanceof CANNON.Sphere ? 'sphere' : 'box',
      size: b.shapes[0] instanceof CANNON.Sphere
        ? { r: b.shapes[0].radius }
        : { x: b.shapes[0].halfExtents.x, y: b.shapes[0].halfExtents.y, z: b.shapes[0].halfExtents.z },
    }));
  }
}

module.exports = { CreatureBody, decodeBodyPlan, computeIOCounts };
