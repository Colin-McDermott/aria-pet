/**
 * cpg-worker.js — Worker thread for parallel CPG creature evaluation.
 *
 * Supports training types: walk (flat), uphill, obstacle, chase.
 */

const { parentPort } = require('worker_threads');
const CANNON = require('cannon-es');
const { CreatureBody } = require('./creature-body');
const { CPGController } = require('./cpg');

/**
 * Build world extras for a given training type.
 */
function setupWorld(world, type, groundMat) {
  if (type === 'uphill') {
    // Tilted ramp — ~12 degree incline starting at x=1
    const rampBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(5, 0.05, 2)),
      material: groundMat,
    });
    rampBody.quaternion.setFromEuler(0, 0, -0.21);
    rampBody.position.set(5, 1.0, 0);
    world.addBody(rampBody);
  } else if (type === 'obstacle') {
    // 4 box obstacles on the ground
    const obstacles = [
      { x: 1.5, w: 0.15, h: 0.08 },
      { x: 3.0, w: 0.2,  h: 0.12 },
      { x: 4.5, w: 0.15, h: 0.1  },
      { x: 6.5, w: 0.25, h: 0.15 },
    ];
    for (const obs of obstacles) {
      const box = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(obs.w, obs.h, 0.5)),
        material: groundMat,
      });
      box.position.set(obs.x, obs.h, 0);
      world.addBody(box);
    }
  }
}

function evaluate(cpgJSON, dna, stage, duration, type) {
  const cpg = CPGController.fromJSON(cpgJSON);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  const body = new CreatureBody(dna);
  body.build(world, stage);

  // Add type-specific world elements
  const groundMat = body._ground ? body._ground.material : null;
  setupWorld(world, type, groundMat);

  // Chase target moves at constant velocity in +X
  const chaseSpeed = 0.8;
  let targetX = 1.0;

  const dt = 1 / 60;
  let t = 0;
  let energy = 0;
  let stepsUpright = 0;
  let proximitySum = 0;

  for (let step = 0; step < duration; step++) {
    if (!body.hasFallen()) stepsUpright++;
    const speeds = cpg.getMotorSpeeds(t);
    body.applyMotors(Array.from(speeds));
    energy += body.getEnergyUsed();
    world.step(dt);
    body.constrainZ();
    t += dt;

    if (type === 'chase') {
      targetX += chaseSpeed * dt;
      const dx = body.torso.position.x - targetX;
      proximitySum += Math.max(0, 3 - Math.abs(dx));
    }

    if (body.hasFallen() && step > 60) break;
  }

  const torso = body.torso;
  const forward = Math.max(0, torso.position.x);
  const drift = Math.abs(torso.position.z);
  const fell = body.hasFallen();
  const uprightGate = fell ? 0 : 1.0;
  const energyPenalty = energy * 0.0001;

  let fitness;
  if (type === 'uphill') {
    const height = Math.max(0, torso.position.y - 0.3);
    fitness = (forward * 8 + height * 15) * uprightGate - drift * 3 - (fell ? 5 : 0) - energyPenalty;
  } else if (type === 'obstacle') {
    fitness = forward * 12 * uprightGate - drift * 3 - (fell ? 5 : 0) - energyPenalty;
  } else if (type === 'chase') {
    fitness = proximitySum * 0.05 * uprightGate + forward * 3 * uprightGate - drift * 3 - (fell ? 5 : 0) - energyPenalty;
  } else {
    fitness = forward * 10 * uprightGate - drift * 3 - (fell ? 5 : 0) - energyPenalty;
  }

  return fitness;
}

parentPort.on('message', (msg) => {
  const fitness = evaluate(msg.cpgJSON, msg.dna, msg.stage, msg.duration, msg.type || 'walk');
  parentPort.postMessage({ fitness, index: msg.index });
});
