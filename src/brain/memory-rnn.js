/**
 * MemoryRNN — tiny LSTM for short-term experiential memory.
 *
 * 4-unit LSTM that processes emotional state each tick.
 * Output feeds into brain input #11 as "emotional context".
 * Trained via simple BPTT on reward signals.
 */

class MemoryRNN {
  constructor(hiddenSize = 4) {
    this.hiddenSize = hiddenSize;
    this.inputSize = 4; // happy, scared, hunger, energy

    // LSTM weights (small random init)
    const s = hiddenSize;
    const n = this.inputSize + s; // input concat hidden

    // Gate weights: [inputSize + hiddenSize, hiddenSize]
    this.Wf = this._randMatrix(n, s, 0.3); // forget gate
    this.Wi = this._randMatrix(n, s, 0.3); // input gate
    this.Wc = this._randMatrix(n, s, 0.3); // cell candidate
    this.Wo = this._randMatrix(n, s, 0.3); // output gate

    // Biases
    this.bf = new Float32Array(s).fill(1.0); // forget bias starts high (remember by default)
    this.bi = new Float32Array(s).fill(0);
    this.bc = new Float32Array(s).fill(0);
    this.bo = new Float32Array(s).fill(0);

    // State
    this.h = new Float32Array(s); // hidden state
    this.c = new Float32Array(s); // cell state

    // History for BPTT (keep last 8 steps)
    this.history = [];
    this.maxHistory = 8;
  }

  /** Forward pass: input → update cell/hidden → return hidden state. */
  forward(input) {
    const s = this.hiddenSize;

    // Concat input and previous hidden
    const x = new Float32Array(this.inputSize + s);
    for (let i = 0; i < this.inputSize && i < input.length; i++) x[i] = input[i];
    for (let i = 0; i < s; i++) x[this.inputSize + i] = this.h[i];

    // Gates
    const fg = this._sigmoid(this._matvec(this.Wf, x, this.bf));
    const ig = this._sigmoid(this._matvec(this.Wi, x, this.bi));
    const cg = this._tanh(this._matvec(this.Wc, x, this.bc));
    const og = this._sigmoid(this._matvec(this.Wo, x, this.bo));

    // Cell state update: c = fg * c + ig * cg
    const newC = new Float32Array(s);
    for (let i = 0; i < s; i++) {
      newC[i] = fg[i] * this.c[i] + ig[i] * cg[i];
    }

    // Hidden state: h = og * tanh(c)
    const newH = new Float32Array(s);
    for (let i = 0; i < s; i++) {
      newH[i] = og[i] * Math.tanh(newC[i]);
    }

    // Save for BPTT
    this.history.push({ x: x.slice(), fg, ig, cg, og, cPrev: this.c.slice(), hPrev: this.h.slice() });
    if (this.history.length > this.maxHistory) this.history.shift();

    this.c = newC;
    this.h = newH;

    return Array.from(newH);
  }

  /** Simple reward-based weight update (approximate BPTT). */
  learn(reward, lr = 0.01) {
    if (this.history.length === 0) return;

    // Nudge weights in direction of recent activations scaled by reward
    const last = this.history[this.history.length - 1];
    const s = this.hiddenSize;
    const n = this.inputSize + s;

    for (let i = 0; i < s; i++) {
      for (let j = 0; j < n; j++) {
        const grad = reward * last.x[j] * lr;
        this.Wi[i * n + j] += grad * last.ig[i] * 0.5;
        this.Wo[i * n + j] += grad * last.og[i] * 0.5;
      }
      this.bi[i] += reward * lr * last.ig[i] * 0.3;
      this.bo[i] += reward * lr * last.og[i] * 0.3;
    }
  }

  /** Reset hidden/cell state (e.g., after sleep consolidation). */
  reset() {
    this.h.fill(0);
    this.c.fill(0);
    this.history = [];
  }

  // === Math helpers ===

  _randMatrix(rows, cols, scale) {
    const m = new Float32Array(rows * cols);
    for (let i = 0; i < m.length; i++) m[i] = (Math.random() - 0.5) * scale;
    return m;
  }

  _matvec(W, x, bias) {
    const cols = x.length;
    const rows = bias.length;
    const out = new Float32Array(rows);
    for (let i = 0; i < rows; i++) {
      let sum = bias[i];
      for (let j = 0; j < cols; j++) {
        sum += W[i * cols + j] * x[j];
      }
      out[i] = sum;
    }
    return out;
  }

  _sigmoid(arr) {
    return arr.map(x => 1 / (1 + Math.exp(-x)));
  }

  _tanh(arr) {
    return arr.map(x => Math.tanh(x));
  }

  // === Persistence ===

  toJSON() {
    return {
      hiddenSize: this.hiddenSize,
      inputSize: this.inputSize,
      Wf: Array.from(this.Wf), Wi: Array.from(this.Wi),
      Wc: Array.from(this.Wc), Wo: Array.from(this.Wo),
      bf: Array.from(this.bf), bi: Array.from(this.bi),
      bc: Array.from(this.bc), bo: Array.from(this.bo),
      h: Array.from(this.h), c: Array.from(this.c),
    };
  }

  static fromJSON(data) {
    const m = new MemoryRNN(data.hiddenSize);
    m.inputSize = data.inputSize || 4;
    if (data.Wf) m.Wf = new Float32Array(data.Wf);
    if (data.Wi) m.Wi = new Float32Array(data.Wi);
    if (data.Wc) m.Wc = new Float32Array(data.Wc);
    if (data.Wo) m.Wo = new Float32Array(data.Wo);
    if (data.bf) m.bf = new Float32Array(data.bf);
    if (data.bi) m.bi = new Float32Array(data.bi);
    if (data.bc) m.bc = new Float32Array(data.bc);
    if (data.bo) m.bo = new Float32Array(data.bo);
    if (data.h) m.h = new Float32Array(data.h);
    if (data.c) m.c = new Float32Array(data.c);
    return m;
  }
}

if (typeof module !== 'undefined') module.exports = { MemoryRNN };
