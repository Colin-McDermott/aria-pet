/**
 * CreatureBrain — wraps a NEAT genome into a creature decision system.
 *
 * Builds sensor inputs, runs the network, returns action probabilities.
 * Integrates with LSTM memory for input #11.
 *
 * 20 inputs: 12 original + 5 screen sense + 3 audio sense
 * 8 outputs: unchanged action probabilities
 */

const { Genome, NodeGene, NODE_INPUT } = require('./neat');
const { MemoryRNN } = require('./memory-rnn');

const INPUT_LABELS = [
  // Original 12
  'Hunger', 'Energy', 'Happiness', 'Fear', 'Sleepiness',
  'CPU', 'TimeOfDay', 'MouseProx', 'MouseDir',
  'FoodProx', 'FoodDir', 'MemoryCtx',
  // Screen sense (5)
  'ScreenBrt', 'ScreenWarm', 'ScreenMove', 'ScreenColor', 'ScreenBusy',
  // Audio sense (3)
  'AudioVol', 'AudioSpch', 'AudioRhym',
  // Communication + civ sense (4) — v3
  'VocabLevel', 'HeardRecent', 'PopSat', 'UnmetNeed',
];

const OUTPUT_LABELS = [
  'Idle', 'WanderL', 'WanderR', 'SeekFood',
  'Flee', 'Sleep', 'Play', 'Approach',
  // Communication + civ outputs (4) — v3
  'Vocalize', 'VocalTone', 'Think', 'Build',
];

const INPUT_COUNT = 24;
const OUTPUT_COUNT = 12;
const BRAIN_VERSION = 3; // v1 = 12in/8out, v2 = 20in/8out, v3 = 24in/12out

class CreatureBrain {
  constructor(genome) {
    this.genome = genome || Genome.createMinimal(INPUT_COUNT, OUTPUT_COUNT, INPUT_LABELS, OUTPUT_LABELS, 0.4);
    this.memory = new MemoryRNN(4); // 4-unit LSTM
    this.lastInputs = new Array(INPUT_COUNT).fill(0);
    this.lastOutputs = new Array(OUTPUT_COUNT).fill(1 / OUTPUT_COUNT);
    this.lastAction = 0;
    this.learningRate = 0.05;
    this.decisionInterval = 0;
    this.tickCount = 0;
    this.version = BRAIN_VERSION;
  }

  /**
   * Build sensor array from creature state + world + screen + audio.
   * All values normalized 0-1.
   */
  buildSensors(cell, worldInfo, envProfile, screenData, audioData) {
    const s = new Array(INPUT_COUNT).fill(0);

    // 0: Hunger (1 = starving, 0 = full)
    s[0] = 1 - Math.min(1, cell.energy / cell.maxEnergy);
    // 1: Energy level
    s[1] = Math.min(1, cell.energy / cell.maxEnergy);
    // 2: Happiness
    s[2] = cell.happy;
    // 3: Fear
    s[3] = cell.scared;
    // 4: Sleepiness
    s[4] = cell.sleepy;

    // 5: CPU activity
    if (envProfile) s[5] = Math.min(1, envProfile.cpu / 100);

    // 6: Time of day
    if (envProfile) s[6] = envProfile.hour / 24;

    // 7: Mouse proximity
    if (worldInfo.mouseNear && cell) {
      const dx = worldInfo.mouseX - cell.x;
      const dy = worldInfo.mouseY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      s[7] = Math.max(0, 1 - dist * 5);
    }

    // 8: Mouse direction
    if (worldInfo.mouseNear && cell) {
      s[8] = Math.max(0, Math.min(1, (worldInfo.mouseX - cell.x) + 0.5));
    } else {
      s[8] = 0.5;
    }

    // 9: Food proximity
    if (worldInfo.nearestFood && cell) {
      const dx = worldInfo.nearestFood.x - cell.x;
      const dy = worldInfo.nearestFood.y - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      s[9] = Math.max(0, 1 - dist * 5);
    }

    // 10: Food direction
    if (worldInfo.nearestFood && cell) {
      s[10] = Math.max(0, Math.min(1, (worldInfo.nearestFood.x - cell.x) + 0.5));
    } else {
      s[10] = 0.5;
    }

    // 11: Memory context (LSTM emotional valence)
    const emotionalInput = [s[2], s[3], s[0], s[1]];
    const memOut = this.memory.forward(emotionalInput);
    s[11] = (memOut[0] + 1) / 2;

    // 12-16: Screen sense
    if (screenData) {
      s[12] = screenData.brightness || 0;
      s[13] = screenData.warmth || 0.5;
      s[14] = screenData.motion || 0;
      s[15] = screenData.dominantColor || 0.5;
      s[16] = screenData.visualBusy || 0;
    }

    // 17-19: Audio sense
    if (audioData) {
      s[17] = audioData.volume || 0;
      s[18] = audioData.speechLikeness || 0;
      s[19] = audioData.rhythm || 0;
    }

    // 20-23: Communication + civilization sense (v3)
    if (cell._commState) {
      s[20] = Math.log1p(cell._commState.vocabSize || 0) / 4;        // log scale, stronger signal
      s[21] = cell._commState.heardRecent ? 1 : 0;                   // just heard words
      s[22] = Math.min(1, (cell._commState.popSatisfaction || 50) / 100); // pop satisfaction
      s[23] = Math.min(1, cell._commState.unmetNeed || 0);           // strongest unmet need
    }

    this.lastInputs = s;
    return s;
  }

  /**
   * Make a decision. Only runs every 3-5 frames for performance.
   *
   * Returns:
   *   action: 0-7 motor action index
   *   probs: motor action probabilities
   *   vocalize: 0-1 how much the brain wants to speak
   *   vocalTone: 0-1 emotional tone for word selection (0=negative, 1=positive)
   *   think: 0-1 how much the brain wants to generate a thought
   *   build: 0-1 how much the brain wants to build
   *   fresh: whether this is a new decision
   */
  decide(cell, worldInfo, envProfile, behaviorBias, screenData, audioData) {
    this.tickCount++;

    if (this.decisionInterval > 0) {
      this.decisionInterval--;
      return {
        action: this.lastAction, probs: this.lastOutputs,
        vocalize: this._lastVocalize, vocalTone: this._lastVocalTone,
        think: this._lastThink, build: this._lastBuild,
        fresh: false,
      };
    }
    this.decisionInterval = 3 + Math.floor(Math.random() * 3);

    const inputs = this.buildSensors(cell, worldInfo, envProfile, screenData, audioData);

    // Get raw outputs (not softmax — we need individual values for the new outputs)
    const raw = this.genome.activate(inputs);

    // Motor actions (0-7): softmax over first 8 outputs
    const motorRaw = raw.slice(0, 8);
    const max = Math.max(...motorRaw);
    const exps = motorRaw.map(v => Math.exp(v - max));
    const expSum = exps.reduce((a, b) => a + b, 0);
    let probs = exps.map(e => e / expSum);

    // Apply LLM behavior bias if present (only to motor outputs)
    if (behaviorBias && behaviorBias.length >= 8) {
      for (let i = 0; i < 8; i++) {
        probs[i] = Math.max(0, probs[i] + (behaviorBias[i] || 0) * 0.15);
      }
      const sum = probs.reduce((a, b) => a + b, 0);
      if (sum > 0) probs = probs.map(p => p / sum);
    }

    // Weighted random selection for motor action
    let r = Math.random();
    let action = 0;
    for (let i = 0; i < probs.length; i++) {
      r -= probs[i];
      if (r <= 0) { action = i; break; }
    }

    // Communication/civ outputs (8-11): sigmoid already applied by activate()
    this._lastVocalize = raw[8] || 0;   // 0-1: speak urge
    this._lastVocalTone = raw[9] || 0;  // 0-1: emotional tone
    this._lastThink = raw[10] || 0;     // 0-1: thought urge
    this._lastBuild = raw[11] || 0;     // 0-1: build urge

    this.lastOutputs = probs;
    this.lastAction = action;
    return {
      action, probs,
      vocalize: this._lastVocalize,
      vocalTone: this._lastVocalTone,
      think: this._lastThink,
      build: this._lastBuild,
      fresh: true,
    };
  }

  /** Get the top N most likely actions with labels. */
  getTopActions(n = 3) {
    const indexed = this.lastOutputs.map((p, i) => ({ label: OUTPUT_LABELS[i], prob: p, index: i }));
    indexed.sort((a, b) => b.prob - a.prob);
    return indexed.slice(0, n);
  }

  /** Neural state summary for LLM context. */
  getNeuralSummary() {
    const top = this.getTopActions(3);
    return {
      topActions: top.map(a => `${a.label}(${(a.prob * 100).toFixed(0)}%)`).join(', '),
      hiddenNodes: this.genome.getHiddenCount(),
      connections: this.genome.getEnabledConnectionCount(),
      complexity: this.genome.getComplexity(),
      vocalize: this._lastVocalize || 0,
      vocalTone: this._lastVocalTone || 0,
      think: this._lastThink || 0,
      build: this._lastBuild || 0,
    };
  }

  /** Get output node IDs dynamically (for colony mutations). */
  getOutputNodeIds() {
    return this.genome.nodes.filter(n => n.type === 'output').map(n => n.id);
  }

  /** Get output node ID by index (0-7). */
  getOutputNodeId(outputIndex) {
    const outputs = this.genome.nodes.filter(n => n.type === 'output');
    return outputs[outputIndex]?.id;
  }

  // === Persistence ===

  toJSON() {
    return {
      genome: this.genome.toJSON(),
      memory: this.memory.toJSON(),
      learningRate: this.learningRate,
      version: BRAIN_VERSION,
    };
  }

  static fromJSON(data) {
    const genome = Genome.fromJSON(data.genome);
    const savedVersion = data.version || 1;

    // Migrate inputs: add missing input nodes before outputs
    const inputNodes = genome.nodes.filter(n => n.type === NODE_INPUT);
    if (inputNodes.length < INPUT_COUNT) {
      const newLabels = INPUT_LABELS.slice(inputNodes.length);
      const firstOutputIdx = genome.nodes.findIndex(n => n.type === 'output');
      const newNodes = newLabels.map(label => new NodeGene(genome._nextNodeId++, NODE_INPUT, label));
      if (firstOutputIdx >= 0) {
        genome.nodes.splice(firstOutputIdx, 0, ...newNodes);
      } else {
        genome.nodes.push(...newNodes);
      }
      genome._dirty = true;
      console.log(`[Brain] Migrated inputs: ${inputNodes.length} → ${INPUT_COUNT}`);
    }

    // Migrate outputs: add missing output nodes at end
    const outputNodes = genome.nodes.filter(n => n.type === 'output');
    if (outputNodes.length < OUTPUT_COUNT) {
      const newLabels = OUTPUT_LABELS.slice(outputNodes.length);
      const newOutputs = newLabels.map(label => {
        const n = new NodeGene(genome._nextNodeId++, 'output', label);
        n.bias = (Math.random() - 0.5) * 0.5;
        return n;
      });
      genome.nodes.push(...newOutputs);
      genome._dirty = true;
      console.log(`[Brain] Migrated outputs: ${outputNodes.length} → ${OUTPUT_COUNT}`);
    }

    const brain = new CreatureBrain(genome);
    if (data.memory) brain.memory = MemoryRNN.fromJSON(data.memory);
    if (data.learningRate) brain.learningRate = data.learningRate;
    brain.version = BRAIN_VERSION;
    return brain;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { CreatureBrain, INPUT_LABELS, OUTPUT_LABELS, INPUT_COUNT, OUTPUT_COUNT, BRAIN_VERSION };
}
