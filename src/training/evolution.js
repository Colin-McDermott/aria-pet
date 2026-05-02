/**
 * EvolutionSystem — player-driven evolution with meaningful choices.
 *
 * When the player presses EVO:
 * 1. Show 3 evolution paths based on current stats + training history
 * 2. Player picks one
 * 3. DNA mutates in that direction
 * 4. Brain gets mutations biased toward that path
 * 5. Creature visually changes
 *
 * Evolution paths compound — picking Swift twice makes a very fast creature.
 * Each stage offers new choices based on accumulated evolution.
 */

const EVOLUTION_PATHS = {
  swift: {
    name: 'Swift',
    icon: '⚡',
    description: 'Longer legs, lighter body. Faster but fragile.',
    dnaChanges: {
      limbGenes: 0.08,        // longer legs
      metabolismGenes: -0.05, // lighter
      bodyPlan: -0.03,        // slimmer
    },
    brainBias: 'speed',       // bias brain mutations toward movement outputs
    statBonus: { speed: 5, strength: -2 },
  },
  tough: {
    name: 'Tough',
    icon: '🛡️',
    description: 'Thicker body, armored skin. Slower but durable.',
    dnaChanges: {
      bodyPlan: 0.06,         // wider
      metabolismGenes: 0.05,  // heavier
      limbGenes: -0.02,       // shorter legs
    },
    brainBias: 'stability',
    statBonus: { strength: 5, speed: -2 },
  },
  smart: {
    name: 'Smart',
    icon: '🧠',
    description: 'Bigger brain, more connections. Learns faster.',
    dnaChanges: {
      eyeGenes: 0.06,        // bigger head/eyes
    },
    brainBias: 'complexity',  // add hidden nodes
    statBonus: { intelligence: 5 },
  },
  agile: {
    name: 'Agile',
    icon: '🌀',
    description: 'Flexible joints, better balance. Nimble and adaptive.',
    dnaChanges: {
      limbGenes: 0.04,
      bodyPlan: -0.02,
    },
    brainBias: 'coordination',
    statBonus: { agility: 5, strength: -1 },
  },
  sensory: {
    name: 'Sensory',
    icon: '👁️',
    description: 'Enhanced senses, bigger eyes. Sees and hears more.',
    dnaChanges: {
      eyeGenes: 0.08,
      saturation: 0.03,
    },
    brainBias: 'sensory',
    statBonus: { perception: 5 },
  },
};

class EvolutionSystem {
  constructor() {
    this.stage = 0;            // evolution stage (how many times evolved)
    this.history = [];         // [{path, stage, timestamp}]
    this.accumulatedTraits = {}; // path → count (how many times picked)
  }

  /**
   * Get 3 evolution choices based on current state.
   * Choices are influenced by training history and accumulated traits.
   */
  getChoices(cell, trainingHistory) {
    const allPaths = Object.keys(EVOLUTION_PATHS);

    // Weight paths based on what the creature has been training
    const weights = {};
    for (const p of allPaths) weights[p] = 1;

    if (trainingHistory) {
      // If creature has been walk-training, offer more physical paths
      const walkCount = trainingHistory.filter(h => h.type === 'walk').length;
      const chaseCount = trainingHistory.filter(h => h.type === 'chase').length;
      if (walkCount > 3) { weights.swift += 2; weights.agile += 1; }
      if (chaseCount > 2) { weights.swift += 1; weights.sensory += 1; }
    }

    // Don't offer the same path 3 times in a row
    const lastTwo = this.history.slice(-2).map(h => h.path);
    if (lastTwo[0] === lastTwo[1] && lastTwo[0]) {
      weights[lastTwo[0]] = 0;
    }

    // Pick 3 weighted random (no duplicates)
    const chosen = [];
    const available = allPaths.filter(p => weights[p] > 0);

    while (chosen.length < 3 && available.length > 0) {
      const totalW = available.reduce((s, p) => s + weights[p], 0);
      let r = Math.random() * totalW;
      for (let i = 0; i < available.length; i++) {
        r -= weights[available[i]];
        if (r <= 0) {
          chosen.push(available[i]);
          available.splice(i, 1);
          break;
        }
      }
    }

    return chosen.map(key => ({
      key,
      ...EVOLUTION_PATHS[key],
      timesPicked: this.accumulatedTraits[key] || 0,
    }));
  }

  /**
   * Apply an evolution choice.
   * Mutates DNA and brain in the chosen direction.
   * Returns the changes made.
   */
  apply(choiceKey, cell) {
    const path = EVOLUTION_PATHS[choiceKey];
    if (!path) return null;

    // Mutate DNA
    const dna = cell.dna;
    for (const [gene, delta] of Object.entries(path.dnaChanges)) {
      if (dna[gene] !== undefined) {
        dna[gene] = Math.max(0, Math.min(1, dna[gene] + delta));
      }
    }

    // Mutate brain based on path bias
    if (cell.brain?.genome) {
      const g = cell.brain.genome;

      switch (path.brainBias) {
        case 'speed':
          // Strengthen connections to movement outputs
          g.mutateWeight(0.5, 0.9);
          if (Math.random() < 0.3) g.mutateAddConnection();
          break;
        case 'stability':
          // Add recurrent connections (memory helps balance)
          g.mutateWeight(0.3, 0.95);
          if (Math.random() < 0.2) g.mutateAddSelfConnection();
          break;
        case 'complexity':
          // Add hidden nodes (bigger brain)
          if (Math.random() < 0.5) g.mutateAddNode();
          if (Math.random() < 0.4) g.mutateAddConnection();
          g.mutateWeight(0.2, 0.95);
          break;
        case 'coordination':
          // More connections, better weight tuning
          g.mutateWeight(0.6, 0.9);
          if (Math.random() < 0.3) g.mutateAddConnection();
          g.mutateBias(0.2);
          break;
        case 'sensory':
          // Strengthen sensory input connections
          const inputs = g.nodes.filter(n => n.type === 'input');
          if (inputs.length > 0) {
            const inp = inputs[Math.floor(Math.random() * inputs.length)];
            g.mutateAddInputConnection(inp.id);
          }
          break;
      }
    }

    // Record
    this.stage++;
    this.history.push({ path: choiceKey, stage: this.stage, timestamp: Date.now() });
    this.accumulatedTraits[choiceKey] = (this.accumulatedTraits[choiceKey] || 0) + 1;

    return {
      path: path.name,
      stage: this.stage,
      dnaChanges: path.dnaChanges,
      statBonus: path.statBonus,
    };
  }

  /**
   * Create a new creature (offspring or fresh).
   * mode: 'offspring' — inherits some traits from parent
   *       'fresh' — completely new DNA
   *       'respec' — reset evolution choices, keep brain
   */
  createNew(mode, parentCell) {
    switch (mode) {
      case 'offspring':
        // New DNA that inherits ~70% from parent with some mutation
        const childDna = { ...parentCell.dna };
        for (const key of Object.keys(childDna)) {
          if (typeof childDna[key] === 'number') {
            if (Math.random() < 0.3) {
              childDna[key] = Math.max(0, Math.min(1, childDna[key] + (Math.random() - 0.5) * 0.2));
            }
          }
        }
        return { dna: childDna, keepBrain: false, keepVocab: true };

      case 'respec':
        // Same DNA, same brain, reset evolution history
        this.stage = 0;
        this.history = [];
        this.accumulatedTraits = {};
        return { dna: parentCell.dna, keepBrain: true, keepVocab: true };

      case 'fresh':
      default:
        return { dna: null, keepBrain: false, keepVocab: false };
    }
  }

  // === Persistence ===

  toJSON() {
    return {
      stage: this.stage,
      history: this.history,
      accumulatedTraits: this.accumulatedTraits,
    };
  }

  static fromJSON(d) {
    const e = new EvolutionSystem();
    if (d.stage) e.stage = d.stage;
    if (d.history) e.history = d.history;
    if (d.accumulatedTraits) e.accumulatedTraits = d.accumulatedTraits;
    return e;
  }
}

module.exports = { EvolutionSystem, EVOLUTION_PATHS };
