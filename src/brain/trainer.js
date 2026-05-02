/**
 * Trainer — handles reward/punishment signals, Hebbian weight updates,
 * sleep consolidation, and genome export/import.
 */

class Trainer {
  constructor(brain) {
    this.brain = brain;
    this.rewardAccumulator = 0;
    this.rewardHistory = []; // last 50 reward events
    this.maxHistory = 50;
  }

  /**
   * Apply reward signal: strengthen connections that were recently active.
   * Hebbian learning: weight += reward * sourceActivation * targetActivation * lr
   */
  reward(amount) {
    this.rewardAccumulator += amount;
    this.rewardHistory.push({ time: Date.now(), amount });
    if (this.rewardHistory.length > this.maxHistory) this.rewardHistory.shift();

    const genome = this.brain.genome;
    const lr = this.brain.learningRate;

    // Build activation map from current node values
    const nodeMap = {};
    for (const n of genome.nodes) nodeMap[n.id] = n.value;

    // Hebbian update on active connections
    for (const c of genome.connections) {
      if (!c.enabled) continue;
      const src = nodeMap[c.from] || 0;
      const tgt = nodeMap[c.to] || 0;
      const update = amount * src * tgt * lr;
      c.weight += update;
      c.weight = Math.max(-5, Math.min(5, c.weight));
    }

    // Also train the LSTM memory
    this.brain.memory.learn(amount, lr * 0.5);
  }

  /** Convenience: strong positive reward (user button). */
  userReward() { this.reward(2.0); }

  /** Convenience: strong negative reward (user button). */
  userPunish() { this.reward(-2.0); }

  /** Auto-reward from game events. */
  rewardEating() { this.reward(1.0); }
  rewardHappiness() { this.reward(0.2); }
  punishLowEnergy() { this.reward(-0.3); }

  /**
   * Sleep consolidation: prune weak connections, add small noise,
   * optionally trigger structural mutations.
   */
  sleepConsolidate() {
    const genome = this.brain.genome;

    // Prune weak connections
    const pruned = genome.pruneWeak(0.08);

    // Add small noise to surviving weights (prevent local optima)
    for (const c of genome.connections) {
      if (c.enabled) {
        c.weight += (Math.random() - 0.5) * 0.05;
      }
    }

    // Small bias noise
    for (const n of genome.nodes) {
      if (n.type !== 'input') {
        n.bias += (Math.random() - 0.5) * 0.03;
      }
    }

    // Reset LSTM state (fresh start after sleep)
    this.brain.memory.reset();

    // Reset reward accumulator
    const totalReward = this.rewardAccumulator;
    this.rewardAccumulator = 0;

    return { pruned, totalReward };
  }

  /** Get recent reward trend (-1 to 1). */
  getRewardTrend() {
    if (this.rewardHistory.length === 0) return 0;
    const recent = this.rewardHistory.slice(-10);
    const avg = recent.reduce((s, r) => s + r.amount, 0) / recent.length;
    return Math.max(-1, Math.min(1, avg));
  }

  /** Export genome as JSON string. */
  exportGenome() {
    return JSON.stringify(this.brain.toJSON(), null, 2);
  }

  /** Import genome from JSON string. Returns new CreatureBrain. */
  static importGenome(jsonStr) {
    const data = JSON.parse(jsonStr);
    const { CreatureBrain } = require('./brain');
    return CreatureBrain.fromJSON(data);
  }

  /** Crossover two brains' genomes, return new brain. */
  static crossover(brain1, brain2) {
    const { Genome } = require('./neat');
    const { CreatureBrain } = require('./brain');
    const childGenome = Genome.crossover(brain1.genome, brain2.genome);
    return new CreatureBrain(childGenome);
  }
}

if (typeof module !== 'undefined') module.exports = { Trainer };
