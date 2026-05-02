# Video Understanding Research — Aria Watch Pipeline

Research for a unified system where Aria watches screen content (movies, games, streams)
and learns from it. Same input pipeline handles all content types.

---

## 1. Video Understanding from Frames

### 1.1 Frame Capture in Electron

You already have `desktopCapturer` in `screen-sense.js` capturing 128x128 thumbnails.
For video understanding, you need two capture tiers:

- **Low-res continuous (existing):** 8x8 for motion/brightness at ~5Hz — keep this for ambient awareness
- **Medium-res on-demand:** 256x256 or 512x512 for object detection / OCR, triggered by scene changes

The `desktopCapturer.getSources()` API returns `NativeImage` objects that can be resized
and converted to various formats cheaply. For the watch pipeline, capture at 512x512
and downscale as needed per analysis stage.

### 1.2 Scene Change Detection

**Why:** Most video frames are redundant. A 2-hour movie at 1fps = 7,200 frames. With
scene detection, you process maybe 200-500 distinct scenes.

**How — pixel histogram differencing:**
```javascript
// Compare consecutive frames using color histogram distance
function detectSceneChange(currentFrame, previousFrame, threshold = 0.15) {
  // Build 16-bin histograms for R, G, B channels
  const histCurr = buildHistogram(currentFrame);
  const histPrev = buildHistogram(previousFrame);

  // Chi-squared distance between histograms
  let distance = 0;
  for (let i = 0; i < histCurr.length; i++) {
    const diff = histCurr[i] - histPrev[i];
    const sum = histCurr[i] + histPrev[i];
    if (sum > 0) distance += (diff * diff) / sum;
  }

  return distance > threshold; // true = new scene
}
```

**FFmpeg-based approach** (for file-based video):
```bash
# Extract only scene-change frames
ffmpeg -i video.mp4 -vf "select=gt(scene\,0.3)" -vsync vfr frame_%04d.jpg
```

**Node.js library: `@doedja/scenecut`**
- Uses streaming ring buffer with zero-copy alternating buffers
- Samples every 64th pixel for fast comparison
- WebAssembly-compiled motion estimation
- Claims 80-150+ fps on 1080p
- npm: `@doedja/scenecut`

**Recommended approach for Aria:**
You're already computing `motion` in screen-sense.js from 8x8 pixel diffs. Upgrade this:
1. Keep the 8x8 motion detector as a fast "something changed" trigger
2. When motion exceeds threshold, capture a 256x256 frame
3. Compare against last captured frame using histogram distance
4. If scene change detected, push frame into the analysis pipeline

### 1.3 Object Detection (what's on screen)

**COCO-SSD via TensorFlow.js:**
- Default backbone: `lite_mobilenet_v2` — under 1MB model size
- Detects 90 common objects (person, car, cat, chair, TV, etc.)
- Runs in browser or Node.js via `@tensorflow/tfjs-node`
- Input: any image element, canvas, or tensor
- Output: array of `{bbox, class, score}`
- Performance: ~30fps on GPU, ~5-10fps on CPU at 300x300 input

```javascript
const cocoSsd = require('@tensorflow-models/coco-ssd');
const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
const predictions = await model.detect(imageTensor);
// [{bbox: [x, y, w, h], class: 'person', score: 0.87}, ...]
```

**YOLO Nano via ONNX Runtime:**
- YOLOv8n / YOLOv11n — smallest YOLO variants
- Run via `onnxruntime-node` (native Node.js bindings, faster than WASM)
- Export from Ultralytics: `model.export(format='onnx')`
- 80 COCO classes, better accuracy than MobileNet SSD
- ~400ms model load, inference depends on input size
- For CPU real-time: use 320x320 input, expect ~100-200ms/frame

```javascript
const ort = require('onnxruntime-node');
const session = await ort.InferenceSession.create('yolov8n.onnx');
const tensor = new ort.Tensor('float32', imageData, [1, 3, 320, 320]);
const results = await session.run({ images: tensor });
```

**CLIP via Transformers.js (zero-shot classification):**
- Most flexible: classify images into ANY categories without retraining
- `Xenova/clip-vit-base-patch32` — runs in Node.js via ONNX
- Input: image + array of text labels
- Output: probability distribution over labels
- Use case: "Is this a game? A movie? A desktop? A browser?"

```javascript
const { pipeline } = require('@xenova/transformers');
const classifier = await pipeline('zero-shot-image-classification',
  'Xenova/clip-vit-base-patch32');
const result = await classifier(imageUrl, [
  'a video game', 'a movie or TV show', 'a web browser',
  'a code editor', 'a desktop with windows'
]);
// [{label: 'a video game', score: 0.72}, ...]
```

**Recommendation for Aria:**
Use a tiered approach:
1. **Always on:** CLIP for context classification (what type of content), runs every scene change
2. **When watching video:** COCO-SSD for object detection (who/what is visible)
3. **When watching games:** Template matching + OCR for HUD elements

### 1.4 Action Recognition

No good lightweight JS models exist for temporal action recognition (recognizing actions
across frame sequences). The research models (VideoMAE, TimeSformer) are too heavy for CPU.

**Practical alternative — describe actions from object trajectories:**
1. Run COCO-SSD on consecutive frames
2. Track objects across frames (simple IoU matching)
3. Derive actions from movement patterns:
   - Person bbox moving right → "walking/running right"
   - Car bbox growing → "car approaching"
   - Person bbox disappearing → "person left scene"

**NVIDIA NitroGen approach (reference, not for direct use):**
NitroGen is a 493M-parameter vision-action model trained on 40,000 hours of gameplay.
It uses SigLip2 (Vision Transformer) + Diffusion Matching Transformer. Takes 256x256
frames, predicts gamepad actions. Trained purely via behavior cloning on internet videos.
Key insight: they extracted controller actions from gameplay videos by detecting on-screen
controller overlays. This is the state of the art for "watch and play" — but far too
heavy for Aria's CPU budget.

**What Aria can do instead:**
- For games: detect UI elements and track state changes (see section 3)
- For movies: rely on dialogue (Whisper) + object detection + scene descriptions
- Build a simple action vocabulary from repeated patterns over time

### 1.5 Subtitle/Caption Extraction via OCR

**Tesseract.js:**
- Pure JavaScript OCR, supports 100+ languages
- npm: `tesseract.js` (already familiar territory — you have `@xenova/transformers`)
- Works in Node.js and browser

**Optimized subtitle extraction:**
```javascript
const Tesseract = require('tesseract.js');

async function extractSubtitles(frameBuffer, frameWidth, frameHeight) {
  // Crop to bottom 15% where subtitles live
  const subtitleRegion = cropBottom15Percent(frameBuffer, frameWidth, frameHeight);

  // Preprocess: increase contrast, threshold to black/white
  const processed = preprocessForOCR(subtitleRegion);

  const { data: { text, confidence } } = await Tesseract.recognize(processed, 'eng', {
    tessedit_pageseg_mode: '7', // Single line mode — much faster
  });

  return confidence > 60 ? text.trim() : null;
}
```

**Key optimizations:**
- **PSM 7** (single text line) instead of default PSM 3 (full page) — 3-5x faster
- **Crop first:** Only process bottom 15% of frame for subtitles
- **Threshold:** Convert to high-contrast black/white before OCR
- **Dedup:** Subtitles persist across frames — hash the text region and skip if unchanged
- **Performance:** ~100-300ms per recognition on CPU with single-line mode

**Alternative: Use Whisper instead of OCR for dialogue.**
If audio is available (which it should be from desktop audio capture), Whisper transcription
is more reliable than OCR for getting dialogue. OCR is a backup for:
- Foreign language content with hardcoded subtitles
- Muted video
- Text overlays that aren't spoken (title cards, credits, signs)

---

## 2. Learning Language from Video

### 2.1 Audio Capture and Transcription

**Current setup:** `local-stt.js` uses `parec` (PulseAudio) to capture audio and
Whisper CLI for transcription. This works but has gaps.

**Better approach: `electron-audio-loopback`**
- npm: `electron-audio-loopback`
- Captures system audio loopback on Linux/macOS/Windows
- No PulseAudio dependency, works directly with Electron
- Requires Electron >= 31.0.1
- Gives you the actual speaker output (what the user hears)

**whisper-node / nodejs-whisper for local transcription:**
- `whisper-node` — Node.js bindings for whisper.cpp (C++ CPU version)
- `nodejs-whisper` — alternative bindings, auto-converts audio to 16kHz WAV
- Both run the `tiny` model well on CPU
- Whisper tiny: ~39M parameters, ~1GB RAM, processes 5s audio in ~1-2s on CPU

**Streaming approach for real-time:**
```
Desktop audio → 5-second chunks → silence detection → Whisper tiny → transcript
                                  ↓ (if silent, skip)
```

### 2.2 Temporal Alignment: Pairing Words with Visuals

This is the core innovation for Aria's language learning. The idea:
**When a word is spoken, what was on screen at that moment?**

```javascript
class TemporalAligner {
  constructor() {
    this.events = []; // timestamped multimodal events
  }

  // Called when Whisper produces a transcript
  addTranscript(text, timestamp) {
    this.events.push({ type: 'speech', text, time: timestamp });
  }

  // Called when scene analysis produces objects/description
  addVisual(objects, description, timestamp) {
    this.events.push({ type: 'visual', objects, description, time: timestamp });
  }

  // Find visual context for a word/phrase
  getVisualContext(word, windowMs = 3000) {
    const speechEvents = this.events.filter(e =>
      e.type === 'speech' && e.text.toLowerCase().includes(word.toLowerCase())
    );

    return speechEvents.map(speech => {
      const nearbyVisuals = this.events.filter(e =>
        e.type === 'visual' &&
        Math.abs(e.time - speech.time) < windowMs
      );
      return { speech, visuals: nearbyVisuals };
    });
  }
}
```

**How this builds meaning over time:**
1. Whisper transcribes: "Look at that cat!" at t=1000
2. COCO-SSD detected `{class: 'cat', score: 0.9}` at t=800
3. Aria learns: the word "cat" co-occurs with the visual feature "cat detected"
4. After seeing this pattern 5-10 times, Aria "knows" what a cat is
5. This mirrors how infants learn — tracking co-occurrence of words and visual referents

### 2.3 Research on Language Acquisition from Video

**Key findings from child development research:**

- Children learn words from TV **only when co-viewing with a caregiver** who reinforces
  the words. Passive watching alone is insufficient for children under 2.
- However, children aged 2+ can learn vocabulary from educational TV (Sesame Street, Dora)
  even without a caregiver present.
- The critical factor is **temporal contingency** — the word appears at the same time as
  the visual referent. This is exactly what Aria's temporal alignment does.
- **Statistical learning:** Infants track co-occurrence probabilities of word forms and
  their visual referents across multiple learning situations. This is essentially what
  a co-occurrence matrix does.

**What this means for Aria:**
Aria should build a co-occurrence matrix:
```
           | cat_visual | dog_visual | car_visual | person_visual | explosion_visual |
"cat"      |    12      |     1      |     0      |      3        |       0          |
"dog"      |     0      |     9      |     0      |      4        |       0          |
"drive"    |     0      |     0      |     7      |      2        |       0          |
"run"      |     1      |     3      |     1      |      8        |       1          |
```
Over time, strong co-occurrences become "grounded" meanings. The word "cat" becomes
associated with the visual feature pattern of a cat.

### 2.4 Multimodal Grounding Architecture

**Research approaches (simplified for Aria's scale):**

1. **Cross-modal contrastive learning:** Learn embeddings where matching audio-visual
   pairs are close and mismatched pairs are far apart. Too expensive for CPU.

2. **Co-occurrence counting (practical for Aria):**
   - Maintain a sparse matrix of (word, visual_feature) counts
   - Increment when they co-occur within a time window
   - Normalize by total occurrences of each
   - After enough data, this gives P(visual | word) — the probability of seeing
     a visual feature given a word was spoken

3. **CLIP embeddings (middle ground):**
   - Use CLIP to embed both frames and text into the same vector space
   - Store embeddings, compute similarity
   - More semantic than raw co-occurrence, but more expensive
   - Could run periodically rather than continuously

---

## 3. Unified Watch Pipeline

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     WATCH PIPELINE                               │
│                                                                  │
│  Screen Capture (desktopCapturer, 512x512)                      │
│       │                                                          │
│       ├── Motion Detector (8x8, 5Hz) ── "something changed?"    │
│       │         │                                                │
│       │    Scene Change? ──no──→ skip                            │
│       │         │yes                                             │
│       │         ▼                                                │
│       ├── Context Classifier (CLIP, ~500ms)                     │
│       │    "game" / "movie" / "browser" / "desktop"             │
│       │         │                                                │
│       │         ├── MOVIE MODE ──→ OCR subtitles + object detect │
│       │         ├── GAME MODE ──→ HUD OCR + state tracking      │
│       │         └── OTHER ──→ lightweight observation            │
│       │                                                          │
│  Desktop Audio (electron-audio-loopback)                        │
│       │                                                          │
│       └── Whisper tiny (5s chunks) ──→ transcript               │
│                                                                  │
│  Temporal Aligner                                               │
│       │                                                          │
│       └── Pairs transcripts with visual context                 │
│           Feeds co-occurrence matrix                            │
│           Builds grounded vocabulary                            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Mode Detection

Use CLIP zero-shot classification to determine content type:

```javascript
const CONTENT_LABELS = [
  'a video game being played',
  'a movie or TV show',
  'a livestream with a webcam',
  'a web browser showing a website',
  'a code editor or terminal',
  'a desktop with application windows',
  'a music player or audio application',
];

async function classifyContent(frameBuffer) {
  const result = await clipClassifier(frameBuffer, CONTENT_LABELS);
  return result[0]; // highest scoring label
}
```

Run this on every scene change. Cache the result — content type usually persists for
minutes or hours.

### 3.3 Movie/Show Mode

When watching video content:

**Every scene change (~0.5-2 Hz effective rate):**
1. Run COCO-SSD → what objects/people are visible
2. Run OCR on bottom 15% → extract subtitles (backup for Whisper)
3. Feed objects + transcript to temporal aligner

**Continuously:**
4. Whisper transcribes audio in 5-second chunks
5. Emotional tone from audio analysis (you already have volume, speechLikeness, rhythm)

**Periodically (every 3-5 minutes):**
6. Use LLaVA (already in screen-sense.js) for a rich scene description
7. Store scene description with timestamp for long-term memory

**What Aria learns from movies:**
- Vocabulary grounded in visual context
- Emotional patterns (loud + fast speech = excitement/anger)
- Narrative structure (setup → conflict → resolution patterns)
- Character recognition (same face appearing = same entity)

### 3.4 Game Mode

When watching someone play a game:

**Every scene change:**
1. OCR on known HUD regions (score, health, lives, timer)
2. Track game state changes over time
3. Detect player avatar position (template matching or object detection)

**Game state extraction:**
```javascript
class GameStateExtractor {
  constructor() {
    this.hudRegions = null; // auto-detected or configured
    this.lastState = {};
    this.stateHistory = [];
  }

  async extract(frame) {
    // Phase 1: Find HUD regions (run once, cache)
    if (!this.hudRegions) {
      this.hudRegions = await this.detectHUDRegions(frame);
    }

    // Phase 2: OCR on each HUD region
    const state = {};
    for (const [name, region] of Object.entries(this.hudRegions)) {
      const cropped = cropRegion(frame, region);
      const text = await ocrRegion(cropped);
      state[name] = parseGameValue(text); // "Score: 1500" → 1500
    }

    // Phase 3: Detect changes
    const changes = this.diffState(state, this.lastState);
    this.lastState = state;
    this.stateHistory.push({ state, time: Date.now(), changes });

    return { state, changes };
  }

  // Auto-detect HUD by finding persistent text regions
  async detectHUDRegions(frame) {
    // Run full-frame OCR
    // Regions with text that persists across multiple frames = HUD
    // Regions where text changes = dynamic values (score, timer)
    // Regions with no text = gameplay area
  }
}
```

**Game HUD detection approach:**
- Health bars: Look for colored rectangles (red/green) in consistent positions.
  Filter by HSV color space, detect contours, measure bar width ratio.
- Score/text: OCR on corners and edges of screen where HUD text lives
- The approach from the research: mask the interface, threshold by brightness,
  use Tesseract for text, HSV filtering for health/energy bars

**Learning to play (observation phase):**
1. Record: frame sequence + detected game states + user inputs
2. Build associations: "when enemy approaches + player jumps → score increases"
3. Over time, learn which visual patterns precede which actions
4. This is pure observation — Aria watches and builds a model of "what works"

**Learning to play (action phase):**
This requires `robotjs` or `nut.js` to emit keyboard/mouse events:
```
npm install @nut-tree/nut-js
```
- Map learned associations to keyboard actions
- Start with simple games (platformers, clickers)
- Aria would need: screen observation → game state → decide action → emit input

### 3.5 Stream Mode

Livestreams combine elements of both:
- Chat overlay → OCR for chat messages
- Webcam face → emotion detection (BlazeFace + simple expression classifier)
- Game content → game mode analysis
- Spoken commentary → Whisper transcription

---

## 4. Practical Video Parsing Approaches

### 4.1 Frame Rate Requirements

| Task                     | Needed FPS | Resolution | CPU cost    |
|--------------------------|-----------|------------|-------------|
| Ambient awareness        | 0.2 Hz    | 8x8        | Negligible  |
| Scene change detection   | 2-5 Hz    | 64x64      | ~1ms/frame  |
| Content classification   | On change | 224x224    | ~500ms      |
| Object detection         | 0.5-1 Hz  | 320x320    | ~200ms      |
| Subtitle OCR             | 0.5 Hz    | 512x128    | ~200ms      |
| Game HUD OCR             | 1-2 Hz    | regions    | ~100ms      |
| Full scene description   | 0.003 Hz  | 512x512    | ~3s (LLaVA) |

**Total CPU budget estimate:**
Running all of these simultaneously at their target rates:
- Scene detection: 5 Hz × 1ms = 5ms/s
- Object detection: 1 Hz × 200ms = 200ms/s
- OCR: 0.5 Hz × 200ms = 100ms/s
- CLIP classification: 0.02 Hz × 500ms = 10ms/s
- **Total: ~315ms per second of wall time = ~31% of one CPU core**

This is feasible on a modern CPU alongside other applications.

### 4.2 Resolution Requirements

- **Scene change:** 64x64 is sufficient (just comparing color distributions)
- **Object detection:** 320x320 for YOLO nano, 300x300 for COCO-SSD
- **OCR:** Higher is better. 512px wide minimum for subtitle text. For HUD, crop
  the specific region and upscale to at least 2x before OCR.
- **CLIP:** 224x224 (model's native input size)
- **LLaVA:** 512x512 (what you already use in screen-sense.js)

### 4.3 Smart Frame Sampling Strategy

```javascript
class SmartFrameSampler {
  constructor() {
    this.lastAnalyzedFrame = null;
    this.lastHistogram = null;
    this.sceneChangeThreshold = 0.15;
    this.minInterval = 200;  // ms — never analyze faster than 5Hz
    this.lastAnalysisTime = 0;
  }

  shouldAnalyze(currentFrame) {
    const now = Date.now();
    if (now - this.lastAnalysisTime < this.minInterval) return false;

    // Fast motion check (reuse existing screen-sense motion detection)
    const histogram = buildQuickHistogram(currentFrame); // 16-bin, from 64x64
    if (!this.lastHistogram) {
      this.lastHistogram = histogram;
      this.lastAnalysisTime = now;
      return true;
    }

    const distance = chiSquaredDistance(histogram, this.lastHistogram);
    this.lastHistogram = histogram;

    if (distance > this.sceneChangeThreshold) {
      this.lastAnalysisTime = now;
      return true;
    }

    return false;
  }
}
```

### 4.4 Subtitle Region Optimization

```javascript
// Only process bottom 15% for subtitles — dramatically reduces OCR work
function cropSubtitleRegion(nativeImage, fullWidth, fullHeight) {
  const y = Math.floor(fullHeight * 0.85);
  const h = fullHeight - y;
  return nativeImage.crop({ x: 0, y, width: fullWidth, height: h });
}

// Preprocess for OCR: high contrast, threshold
function preprocessSubtitleRegion(imageBuffer) {
  // 1. Convert to grayscale
  // 2. Apply adaptive threshold (Otsu's method)
  // 3. Invert if white text on dark background (most subtitles)
  // 4. Upscale 2x with bicubic interpolation
  // This can be done with sharp (already a dependency via @xenova/transformers)
}
```

---

## 5. Libraries and Dependencies

### 5.1 Already Available in Project

| Library | Current Use | Video Pipeline Use |
|---------|------------|-------------------|
| `@xenova/transformers` | In node_modules | CLIP classification, feature extraction |
| `electron` desktopCapturer | screen-sense.js | Frame capture |
| Whisper CLI | local-stt.js | Audio transcription |
| LLaVA (Ollama) | screen-sense.js describe() | Rich scene descriptions |

### 5.2 New Dependencies Needed

| Library | Purpose | Size | Install |
|---------|---------|------|---------|
| `tesseract.js` | OCR for subtitles/HUD | ~2MB + language data | `npm i tesseract.js` |
| `onnxruntime-node` | Run YOLO/other ONNX models | ~50MB | `npm i onnxruntime-node` |
| `@tensorflow-models/coco-ssd` | Object detection | ~5MB with model | `npm i @tensorflow/tfjs-node @tensorflow-models/coco-ssd` |
| `electron-audio-loopback` | Desktop audio capture | Small | `npm i electron-audio-loopback` |
| `whisper-node` or `nodejs-whisper` | Better Whisper integration | Small (needs whisper.cpp) | `npm i whisper-node` |
| `sharp` | Image preprocessing | Already bundled with transformers | Already available |
| `@nut-tree/nut-js` | Keyboard/mouse for game playing | ~10MB | `npm i @nut-tree/nut-js` |

### 5.3 Model Files Needed

| Model | Size | Use | Source |
|-------|------|-----|--------|
| CLIP ViT-B/32 (ONNX) | ~350MB | Content classification | `Xenova/clip-vit-base-patch32` |
| COCO-SSD lite_mobilenet_v2 | ~1MB | Object detection | tfjs-models |
| YOLOv8n (ONNX) | ~6MB | Better object detection | Ultralytics export |
| Whisper tiny | ~75MB | Audio transcription | whisper.cpp models |
| Tesseract eng data | ~4MB | OCR | tesseract.js auto-download |

**Total model footprint:** ~436MB on disk, ~500MB-1GB RAM during inference
(models loaded on demand, not all simultaneously)

### 5.4 Choose Your Fighter: TF.js COCO-SSD vs ONNX YOLO

**COCO-SSD (TensorFlow.js):**
- Pro: Easy setup, well-documented, loads from CDN
- Pro: lite_mobilenet_v2 is tiny (~1MB)
- Con: TF.js Node overhead, slower than native ONNX
- Con: Less accurate than YOLO nano

**YOLOv8n (ONNX Runtime):**
- Pro: Better accuracy, faster native inference via onnxruntime-node
- Pro: More model variants available (seg, pose, etc.)
- Con: Need to export model yourself (or find pre-exported)
- Con: More setup work, need to handle pre/post-processing

**Recommendation:** Start with COCO-SSD for simplicity. Switch to YOLO if you need
better accuracy or find TF.js too slow.

---

## 6. Implementation Roadmap

### Phase 1: Enhanced Capture (extend screen-sense.js)
- Add histogram-based scene change detection
- Add medium-res capture tier (256x256) triggered by scene changes
- Add subtitle region cropping

### Phase 2: Audio Pipeline Upgrade
- Replace parec with electron-audio-loopback
- Switch to whisper-node for tighter integration
- Add word-level timestamps from Whisper

### Phase 3: Visual Analysis
- Integrate Tesseract.js for OCR (subtitles + HUD text)
- Integrate COCO-SSD or YOLO for object detection
- Add CLIP via transformers.js for content classification

### Phase 4: Temporal Alignment + Learning
- Build the TemporalAligner (pair audio transcripts with visual events)
- Build co-occurrence matrix (word ↔ visual feature)
- Connect to Aria's memory/brain systems

### Phase 5: Mode-Specific Processing
- Movie mode: dialogue + scene description + emotional tone
- Game mode: HUD extraction + state tracking + action recording
- Auto-detection via CLIP

### Phase 6: Game Playing (future)
- Record observations of gameplay
- Build action-state association model
- Emit inputs via nut.js
- Start with trivially simple games (cookie clicker, flappy bird clones)

---

## 7. Key Insights and Recommendations

### What actually matters for CPU-bound real-time:
1. **Scene change detection is the biggest win.** Skip 90% of frames. This alone makes
   everything else feasible on CPU.
2. **Whisper is more reliable than OCR for dialogue.** Use OCR only for on-screen text
   that isn't spoken (subtitles in another language, game HUD, signs).
3. **CLIP is the most versatile single model.** It handles content classification,
   can describe scenes in terms of text similarity, and provides visual embeddings
   for the co-occurrence learning system.
4. **Don't try to understand every frame.** 1 analysis per scene change is enough.
   Movies change scenes every 3-8 seconds. Games change more frequently but HUD
   regions are consistent.

### The NitroGen lesson (applicable to Aria):
NVIDIA's NitroGen showed that you can train a game-playing agent purely from watching
gameplay videos — no reinforcement learning needed. The key was behavior cloning on a
massive dataset. Aria's version would be much smaller scale, but the principle holds:
watch enough gameplay, track what actions lead to positive state changes, and you can
learn to play. The trick they used — detecting controller overlays in videos to get
ground-truth actions — is clever but not available to Aria. Instead, Aria would need
to observe user inputs directly (keyboard/mouse events) paired with screen state.

### The child development lesson:
Children don't learn language from passive TV watching. They need interaction — "serve
and return" exchanges. For Aria, this suggests the creature shouldn't just silently
absorb; it should **react to what it sees** ("I see a cat!") and get feedback from
the user. The co-viewing research shows that reinforcement of words during viewing
dramatically improves learning. Aria's equivalent: when the user talks to Aria about
what's on screen, that should heavily weight those word-visual associations.
