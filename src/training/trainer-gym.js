/**
 * TrainerGym — parallel CPG-based training for creature locomotion.
 *
 * Uses worker threads for parallel evaluation (~10x speedup).
 * CPG (sinusoidal patterns) instead of NEAT for motor control.
 *
 * Adaptive mutation: scales inversely with motor count.
 * Early stopping: detects fitness plateau over last 20 gens.
 */

const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const CANNON = require('cannon-es');
const { CreatureBody, computeIOCounts, decodeBodyPlan } = require('./creature-body');
const { CPGController } = require('./cpg');

const WORKER_COUNT = Math.max(2, os.cpus().length - 2);
const DURATION = 1000; // physics steps per evaluation (~16.7 seconds at 60fps)
const MAX_GENERATIONS = 200;
const PLATEAU_WINDOW = 20;    // generations to check for plateau
const PLATEAU_THRESHOLD = 0.5; // minimum improvement over window to continue

class TrainerGym {
  constructor() {
    this.populationSize = 50;
    this.elitism = 8;
    this.running = false;
    this.generation = 0;
    this.bestFitness = 0;
    this.bestCPG = null;
    this.history = [];
    this.earlyStopped = false;
    this._workers = [];
    this._type = 'walk';
  }

  _ensureWorkers() {
    if (this._workers.length > 0) return;
    const workerPath = path.join(__dirname, 'cpg-worker.js');
    for (let i = 0; i < WORKER_COUNT; i++) {
      this._workers.push(new Worker(workerPath));
    }
  }

  /**
   * Adaptive mutation parameters based on motor count.
   * Complex creatures (14+ motors) need gentler mutation.
   */
  _getMutationParams(motorCount) {
    if (motorCount <= 4) return { rate: 0.30, amount: 0.50 };
    if (motorCount <= 8) return { rate: 0.25, amount: 0.40 };
    if (motorCount <= 14) return { rate: 0.20, amount: 0.30 };
    return { rate: 0.15, amount: 0.25 }; // 14+ motors (hexapod, arachnid)
  }

  /**
   * Detect fitness plateau: if best fitness hasn't improved meaningfully
   * over the last PLATEAU_WINDOW generations, signal early stop.
   */
  _isPlateaued() {
    if (this.history.length < PLATEAU_WINDOW) return false;
    const recent = this.history.slice(-PLATEAU_WINDOW);
    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    return (newest - oldest) < PLATEAU_THRESHOLD;
  }

  /**
   * Evaluate a batch of CPGs in parallel.
   */
  _evaluateParallel(cpgs, dna, stage, type) {
    this._ensureWorkers();

    return new Promise((resolve) => {
      const results = new Array(cpgs.length).fill(0);
      let nextIdx = 0;
      let completed = 0;

      const dispatch = (worker) => {
        if (nextIdx >= cpgs.length) return;
        const idx = nextIdx++;

        const handler = (msg) => {
          worker.removeListener('message', handler);
          results[msg.index] = msg.fitness;
          completed++;

          if (completed === cpgs.length) {
            resolve(results);
          } else {
            dispatch(worker);
          }
        };

        worker.on('message', handler);
        worker.postMessage({
          cpgJSON: cpgs[idx].toJSON(),
          dna,
          stage,
          duration: DURATION,
          type: type || 'walk',
          index: idx,
        });
      };

      for (const w of this._workers) dispatch(w);
    });
  }

  /**
   * Run one generation of training.
   */
  async runGeneration(type, dna, stage) {
    this._stage = stage || 4;
    this._type = type || 'walk';
    this.running = true;

    const { motorCount, spineMotors, plan } = computeIOCounts(dna);
    const { rate, amount } = this._getMutationParams(motorCount);

    // Create population
    const population = [];
    for (let i = 0; i < this.populationSize; i++) {
      let cpg;
      if (i === 0 && this.bestCPG) {
        cpg = this.bestCPG.clone();
      } else if (i < this.elitism && this.bestCPG) {
        cpg = this.bestCPG.clone();
        cpg.mutate(rate * 0.5, amount * 0.4);
      } else if (this.bestCPG) {
        cpg = this.bestCPG.clone();
        cpg.mutate(rate, amount);
      } else {
        cpg = CPGController.createForArchetype(plan.archetype, motorCount, spineMotors, plan.limbPairs);
      }
      population.push({ cpg, fitness: 0 });
    }

    // Evaluate in parallel
    const cpgs = population.map(p => p.cpg);
    const fitnesses = await this._evaluateParallel(cpgs, dna, this._stage, this._type);
    for (let i = 0; i < population.length; i++) {
      population[i].fitness = fitnesses[i];
    }

    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);

    const best = population[0];
    this.bestFitness = best.fitness;
    this.bestCPG = best.cpg.clone();
    this.generation++;
    this.history.push(best.fitness);

    // Check early stopping
    this.earlyStopped = this._isPlateaued();

    // Get replay of best
    const bestReplay = this._getReplay(best.cpg, dna, this._stage);

    this.running = false;

    return {
      generation: this.generation,
      maxGenerations: MAX_GENERATIONS,
      bestFitness: best.fitness.toFixed(2),
      avgFitness: (population.reduce((s, p) => s + p.fitness, 0) / population.length).toFixed(2),
      bestReplay,
      bestCPG: best.cpg.toJSON(),
      populationSize: this.populationSize,
      earlyStopped: this.earlyStopped,
    };
  }

  _getReplay(cpg, dna, stage) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    const body = new CreatureBody(dna);
    body.build(world, stage);

    const frames = [];
    const dt = 1 / 60;
    let t = 0;

    // Replay uses shorter window (400 steps) for snappy preview
    for (let step = 0; step < 400; step++) {
      const speeds = cpg.getMotorSpeeds(t);
      body.applyMotors(Array.from(speeds));
      world.step(dt);
      body.constrainZ();
      t += dt;
      if (step % 3 === 0) frames.push(body.getVisualState());
      if (body.hasFallen() && step > 30) break;
    }

    return frames;
  }

  getSummary() {
    return {
      generation: this.generation,
      maxGenerations: MAX_GENERATIONS,
      bestFitness: this.bestFitness.toFixed(2),
      running: this.running,
      history: this.history.slice(-20),
      earlyStopped: this.earlyStopped,
    };
  }

  destroy() {
    for (const w of this._workers) w.terminate();
    this._workers = [];
  }
}

module.exports = { TrainerGym };
