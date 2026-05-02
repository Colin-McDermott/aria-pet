/**
 * NEAT (NeuroEvolution of Augmenting Topologies) — custom lightweight implementation.
 *
 * Genome: list of node genes + connection genes.
 * Forward propagation with topological sort.
 * Mutations: add node, add connection, tweak weights, toggle connections.
 * Serialization for persistence.
 */

// Global innovation counter (shared across genomes)
let _innovationCounter = 0;
function nextInnovation() { return ++_innovationCounter; }
function setInnovationCounter(n) { _innovationCounter = n; }

// Node types
const NODE_INPUT = 'input';
const NODE_OUTPUT = 'output';
const NODE_HIDDEN = 'hidden';

// Activation functions
function sigmoid(x) { return 1 / (1 + Math.exp(-4.9 * x)); }
function tanh_act(x) { return Math.tanh(x); }
function relu(x) { return Math.max(0, x); }

const ACTIVATIONS = { sigmoid, tanh: tanh_act, relu };

/**
 * NodeGene — a single neuron in the network.
 */
class NodeGene {
  constructor(id, type, label = '') {
    this.id = id;
    this.type = type;           // input | output | hidden
    this.label = label;
    this.activation = 'sigmoid';
    this.value = 0;             // current activation value
    this.bias = 0;
  }

  toJSON() {
    return { id: this.id, type: this.type, label: this.label, activation: this.activation, bias: this.bias };
  }

  static fromJSON(data) {
    const n = new NodeGene(data.id, data.type, data.label);
    n.activation = data.activation || 'sigmoid';
    n.bias = data.bias || 0;
    return n;
  }
}

/**
 * ConnectionGene — a weighted link between two nodes.
 */
class ConnectionGene {
  constructor(from, to, weight, innovation) {
    this.from = from;           // source node id
    this.to = to;               // target node id
    this.weight = weight;
    this.innovation = innovation;
    this.enabled = true;
    this.recurrent = false;     // true if this is a self/backward connection
  }

  toJSON() {
    return {
      from: this.from, to: this.to, weight: this.weight,
      innovation: this.innovation, enabled: this.enabled, recurrent: this.recurrent,
    };
  }

  static fromJSON(data) {
    const c = new ConnectionGene(data.from, data.to, data.weight, data.innovation);
    c.enabled = data.enabled !== false;
    c.recurrent = data.recurrent || false;
    return c;
  }
}

/**
 * Genome — the full neural network genotype.
 */
class Genome {
  constructor() {
    this.nodes = [];        // NodeGene[]
    this.connections = [];  // ConnectionGene[]
    this._nextNodeId = 0;
    this._sortedIds = null; // cached topological order
    this._dirty = true;
  }

  /** Create a minimal genome: inputs directly connected to outputs with sparse random weights. */
  static createMinimal(inputCount, outputCount, inputLabels, outputLabels, connectionDensity = 0.5) {
    const g = new Genome();

    // Input nodes
    for (let i = 0; i < inputCount; i++) {
      const n = new NodeGene(g._nextNodeId++, NODE_INPUT, inputLabels[i] || `in_${i}`);
      g.nodes.push(n);
    }

    // Output nodes
    for (let i = 0; i < outputCount; i++) {
      const n = new NodeGene(g._nextNodeId++, NODE_OUTPUT, outputLabels[i] || `out_${i}`);
      n.bias = (Math.random() - 0.5) * 0.5;
      g.nodes.push(n);
    }

    // Sparse connections (not fully connected — more interesting starting topology)
    for (let i = 0; i < inputCount; i++) {
      for (let o = inputCount; o < inputCount + outputCount; o++) {
        if (Math.random() < connectionDensity) {
          g.connections.push(new ConnectionGene(i, o, (Math.random() - 0.5) * 2, nextInnovation()));
        }
      }
    }

    g._dirty = true;
    return g;
  }

  // === Forward Propagation ===

  /** Activate the network: set input values, propagate, return output values. */
  activate(inputs) {
    if (this._dirty) this._topologicalSort();

    const inputNodes = this.nodes.filter(n => n.type === NODE_INPUT);
    const outputNodes = this.nodes.filter(n => n.type === NODE_OUTPUT);

    // Set inputs
    for (let i = 0; i < inputNodes.length && i < inputs.length; i++) {
      inputNodes[i].value = inputs[i];
    }

    // Node value map (preserve recurrent values from last step)
    const nodeMap = {};
    for (const n of this.nodes) nodeMap[n.id] = n;

    // Propagate in topological order
    for (const id of this._sortedIds) {
      const node = nodeMap[id];
      if (node.type === NODE_INPUT) continue;

      // Sum weighted inputs
      let sum = node.bias;
      for (const c of this.connections) {
        if (c.to === id && c.enabled) {
          const src = c.recurrent ? nodeMap[c.from].value : nodeMap[c.from].value;
          sum += src * c.weight;
        }
      }

      // Apply activation
      const fn = ACTIVATIONS[node.activation] || sigmoid;
      node.value = fn(sum);
    }

    // Collect outputs
    return outputNodes.map(n => n.value);
  }

  /** Softmax over output values. */
  activateSoftmax(inputs) {
    const raw = this.activate(inputs);
    const max = Math.max(...raw);
    const exps = raw.map(v => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }

  // === Topological Sort ===

  _topologicalSort() {
    const adj = {};
    const inDeg = {};
    for (const n of this.nodes) {
      adj[n.id] = [];
      inDeg[n.id] = 0;
    }
    for (const c of this.connections) {
      if (c.enabled && !c.recurrent) {
        adj[c.from].push(c.to);
        inDeg[c.to]++;
      }
    }

    // Kahn's algorithm
    const queue = [];
    for (const n of this.nodes) {
      if (inDeg[n.id] === 0) queue.push(n.id);
    }

    const sorted = [];
    while (queue.length > 0) {
      const id = queue.shift();
      sorted.push(id);
      for (const to of adj[id]) {
        inDeg[to]--;
        if (inDeg[to] === 0) queue.push(to);
      }
    }

    // Add any remaining nodes (cycles from recurrent — just append)
    for (const n of this.nodes) {
      if (!sorted.includes(n.id)) sorted.push(n.id);
    }

    this._sortedIds = sorted;
    this._dirty = false;
  }

  // === Mutations ===

  /** Mutate a single weight by a small amount. */
  mutateWeight(rate = 0.8, perturbChance = 0.9) {
    for (const c of this.connections) {
      if (Math.random() < rate) {
        if (Math.random() < perturbChance) {
          c.weight += (Math.random() - 0.5) * 0.4;
        } else {
          c.weight = (Math.random() - 0.5) * 4;
        }
        c.weight = Math.max(-5, Math.min(5, c.weight));
      }
    }
  }

  /** Mutate biases. */
  mutateBias(rate = 0.3) {
    for (const n of this.nodes) {
      if (n.type !== NODE_INPUT && Math.random() < rate) {
        n.bias += (Math.random() - 0.5) * 0.3;
        n.bias = Math.max(-3, Math.min(3, n.bias));
      }
    }
  }

  /** Add a new node by splitting an existing connection. */
  mutateAddNode() {
    const enabled = this.connections.filter(c => c.enabled && !c.recurrent);
    if (enabled.length === 0) return null;

    const conn = enabled[Math.floor(Math.random() * enabled.length)];
    conn.enabled = false;

    const newNode = new NodeGene(this._nextNodeId++, NODE_HIDDEN, `h_${this._nextNodeId - 1}`);
    newNode.activation = Math.random() < 0.7 ? 'sigmoid' : 'tanh';
    this.nodes.push(newNode);

    // Two new connections: from → new (weight 1) and new → to (old weight)
    this.connections.push(new ConnectionGene(conn.from, newNode.id, 1.0, nextInnovation()));
    this.connections.push(new ConnectionGene(newNode.id, conn.to, conn.weight, nextInnovation()));

    this._dirty = true;
    return newNode;
  }

  /** Add a new connection between two unconnected nodes. */
  mutateAddConnection(maxAttempts = 20) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const from = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      const to = this.nodes[Math.floor(Math.random() * this.nodes.length)];

      if (from.id === to.id && Math.random() > 0.1) continue; // rare self-connections
      if (to.type === NODE_INPUT) continue;
      if (from.type === NODE_OUTPUT && to.type === NODE_OUTPUT) continue;

      // Check if connection already exists
      const exists = this.connections.some(c => c.from === from.id && c.to === to.id);
      if (exists) continue;

      // Determine if recurrent
      const isRecurrent = from.id === to.id || (from.type === NODE_OUTPUT) || (from.type === NODE_HIDDEN && to.type === NODE_HIDDEN);

      const c = new ConnectionGene(from.id, to.id, (Math.random() - 0.5) * 2, nextInnovation());
      c.recurrent = isRecurrent;
      this.connections.push(c);
      this._dirty = true;
      return c;
    }
    return null;
  }

  /** Add a self-connection (recurrent) to a random hidden or output node. */
  mutateAddSelfConnection() {
    const candidates = this.nodes.filter(n => n.type !== NODE_INPUT);
    if (candidates.length === 0) return null;

    const node = candidates[Math.floor(Math.random() * candidates.length)];
    const exists = this.connections.some(c => c.from === node.id && c.to === node.id);
    if (exists) return null;

    const c = new ConnectionGene(node.id, node.id, (Math.random() - 0.5) * 1.5, nextInnovation());
    c.recurrent = true;
    this.connections.push(c);
    this._dirty = true;
    return c;
  }

  /** Prune the weakest connections. */
  pruneWeak(threshold = 0.1) {
    const before = this.connections.length;
    this.connections = this.connections.filter(c => !c.enabled || Math.abs(c.weight) > threshold);
    if (this.connections.length !== before) this._dirty = true;
    return before - this.connections.length;
  }

  /** Add connection specifically from an input node to a random non-input node. */
  mutateAddInputConnection(inputNodeId) {
    const targets = this.nodes.filter(n => n.type !== NODE_INPUT);
    if (targets.length === 0) return null;

    const to = targets[Math.floor(Math.random() * targets.length)];
    const exists = this.connections.some(c => c.from === inputNodeId && c.to === to.id);
    if (exists) return null;

    const c = new ConnectionGene(inputNodeId, to.id, (Math.random() - 0.5) * 2, nextInnovation());
    this.connections.push(c);
    this._dirty = true;
    return c;
  }

  /** Add connection specifically to an output node from a random non-output node. */
  mutateAddOutputConnection(outputNodeId) {
    const sources = this.nodes.filter(n => n.type !== NODE_OUTPUT);
    if (sources.length === 0) return null;

    const from = sources[Math.floor(Math.random() * sources.length)];
    const exists = this.connections.some(c => c.from === from.id && c.to === outputNodeId);
    if (exists) return null;

    const c = new ConnectionGene(from.id, outputNodeId, (Math.random() - 0.5) * 2, nextInnovation());
    this.connections.push(c);
    this._dirty = true;
    return c;
  }

  // === Stats ===

  getHiddenCount() { return this.nodes.filter(n => n.type === NODE_HIDDEN).length; }
  getEnabledConnectionCount() { return this.connections.filter(c => c.enabled).length; }
  getComplexity() { return this.getHiddenCount() + this.getEnabledConnectionCount(); }

  // === Serialization ===

  toJSON() {
    return {
      nodes: this.nodes.map(n => n.toJSON()),
      connections: this.connections.map(c => c.toJSON()),
      nextNodeId: this._nextNodeId,
      innovationCounter: _innovationCounter,
    };
  }

  static fromJSON(data) {
    const g = new Genome();
    g.nodes = data.nodes.map(n => NodeGene.fromJSON(n));
    g.connections = data.connections.map(c => ConnectionGene.fromJSON(c));
    g._nextNodeId = data.nextNodeId || 0;
    if (data.innovationCounter) setInnovationCounter(data.innovationCounter);
    g._dirty = true;
    return g;
  }

  /** Deep clone. */
  clone() {
    return Genome.fromJSON(this.toJSON());
  }

  /** Crossover two genomes (align by innovation number). */
  static crossover(parent1, parent2) {
    const child = new Genome();
    child.nodes = parent1.nodes.map(n => NodeGene.fromJSON(n.toJSON()));
    child._nextNodeId = Math.max(parent1._nextNodeId, parent2._nextNodeId);

    // Add hidden nodes from parent2 that don't exist in parent1
    for (const n of parent2.nodes) {
      if (n.type === NODE_HIDDEN && !child.nodes.some(cn => cn.id === n.id)) {
        child.nodes.push(NodeGene.fromJSON(n.toJSON()));
      }
    }

    // Align connections by innovation number
    const p2Map = {};
    for (const c of parent2.connections) p2Map[c.innovation] = c;

    for (const c1 of parent1.connections) {
      const c2 = p2Map[c1.innovation];
      if (c2) {
        // Matching gene: randomly pick from either parent
        const pick = Math.random() < 0.5 ? c1 : c2;
        child.connections.push(ConnectionGene.fromJSON(pick.toJSON()));
        delete p2Map[c1.innovation];
      } else {
        // Disjoint/excess from parent1 (fitter parent)
        child.connections.push(ConnectionGene.fromJSON(c1.toJSON()));
      }
    }

    child._dirty = true;
    return child;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Genome, NodeGene, ConnectionGene, nextInnovation, setInnovationCounter, NODE_INPUT, NODE_OUTPUT, NODE_HIDDEN };
}
