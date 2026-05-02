/**
 * LocalSTT — local speech-to-text using OpenAI Whisper.
 * No internet required. Runs entirely on the user's machine.
 *
 * Captures audio from either mic or desktop monitor via parec,
 * saves 5-second chunks to temp WAV files, runs Whisper on them.
 *
 * Runs in MAIN process (needs child_process for parec + whisper).
 */

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalSTT {
  constructor() {
    this.active = false;
    this.source = null;       // PulseAudio source name
    this.sourceType = 'mic';  // 'mic' or 'desktop'
    this.recorder = null;     // parec process
    this.whisperAvailable = false;
    this.onTranscript = null; // callback(text, sourceType)

    this._chunkDuration = 5;  // seconds per chunk
    this._tmpDir = path.join(os.tmpdir(), 'aria-stt');
    this._recording = false;
    this._chunkTimer = null;
  }

  /** Check if whisper CLI is available. */
  async checkWhisper() {
    return new Promise((resolve) => {
      execFile('whisper', ['--help'], { timeout: 5000 }, (err) => {
        this.whisperAvailable = !err;
        if (this.whisperAvailable) console.log('[LocalSTT] Whisper found');
        else console.log('[LocalSTT] Whisper not found — install with: pip install openai-whisper');
        resolve(this.whisperAvailable);
      });
    });
  }

  /**
   * Start recording and transcribing from a PulseAudio source.
   * sourceType: 'mic' or 'desktop'
   */
  async start(paSourceName, sourceType = 'mic') {
    if (!this.whisperAvailable) {
      const ok = await this.checkWhisper();
      if (!ok) return false;
    }

    this.source = paSourceName;
    this.sourceType = sourceType;

    // Create temp directory
    if (!fs.existsSync(this._tmpDir)) fs.mkdirSync(this._tmpDir, { recursive: true });

    this.active = true;
    this._recordNextChunk();
    return true;
  }

  /** Stop recording. */
  stop() {
    this.active = false;
    if (this.recorder) {
      this.recorder.kill();
      this.recorder = null;
    }
    if (this._chunkTimer) {
      clearTimeout(this._chunkTimer);
      this._chunkTimer = null;
    }
  }

  /** Record a 5-second chunk, then transcribe it. */
  _recordNextChunk() {
    if (!this.active) return;

    const chunkFile = path.join(this._tmpDir, `chunk-${Date.now()}.wav`);

    // Record raw PCM via parec, pipe to wav via ffmpeg or just save raw
    // For simplicity, use parec with --file-format=wav
    const args = [
      '--device', this.source,
      '--file-format=wav',
      '--channels=1',
      '--rate=16000',
      chunkFile,
    ];

    this.recorder = spawn('parec', args);
    this._recording = true;

    // Kill after chunk duration
    this._chunkTimer = setTimeout(() => {
      if (this.recorder) {
        this.recorder.kill('SIGINT');
        this.recorder = null;
      }
      this._recording = false;

      // Check if file has content and isn't just silence
      try {
        const stat = fs.statSync(chunkFile);
        if (stat.size > 32000) { // at least ~1s of audio
          // Quick energy check — read a sample of the raw audio
          const buf = Buffer.alloc(4000);
          const fd = fs.openSync(chunkFile, 'r');
          fs.readSync(fd, buf, 0, 4000, Math.min(44, stat.size - 4000)); // skip WAV header
          fs.closeSync(fd);
          let energy = 0;
          for (let i = 0; i < buf.length - 1; i += 2) {
            const sample = buf.readInt16LE(i) / 32768;
            energy += sample * sample;
          }
          energy = Math.sqrt(energy / (buf.length / 2));

          if (energy > 0.005) { // above silence threshold
            this._transcribe(chunkFile);
          } else {
            // Silence — skip transcription
            try { fs.unlinkSync(chunkFile); } catch {}
          }
        } else {
          try { fs.unlinkSync(chunkFile); } catch {}
        }
      } catch {
        // File doesn't exist
      }

      // Start next chunk
      if (this.active) this._recordNextChunk();
    }, this._chunkDuration * 1000);
  }

  /** Run Whisper on a WAV file. */
  _transcribe(wavFile) {
    // Use tiny model for speed, English
    execFile('whisper', [
      wavFile,
      '--model', 'tiny',
      '--language', 'en',
      '--output_format', 'txt',
      '--output_dir', this._tmpDir,
      '--fp16', 'False',
    ], { timeout: 30000 }, (err, stdout, stderr) => {
      // Clean up WAV
      try { fs.unlinkSync(wavFile); } catch {}

      if (err) {
        // Whisper failed — might not be installed or model not downloaded
        if (err.message.includes('ENOENT')) {
          console.log('[LocalSTT] Whisper binary not found');
          this.whisperAvailable = false;
          this.active = false;
        }
        return;
      }

      // Read the transcript .txt file
      const txtFile = wavFile.replace('.wav', '.txt');
      try {
        const text = fs.readFileSync(txtFile, 'utf8').trim();
        fs.unlinkSync(txtFile);

        if (text && text.length > 2 && !text.match(/^\[.*\]$/)) {
          // Filter out Whisper artifacts and hallucinations
          const clean = text.replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')        // remove (music), (silence) etc
            .replace(/^(you|the|I|a|\.+|,+|\s)+$/i, '') // filter single-word hallucinations
            .trim();
          // Filter common Whisper hallucinations (repeats, stock phrases, phantom names)
          const isHallucination =
            /^(.+?)\1{2,}$/i.test(clean) ||                    // same word/phrase repeated 3+ times
            /thank(s| you) for (watching|listening)/i.test(clean) || // youtube outros
            /subscribe|like and share/i.test(clean) ||          // youtube spam
            /^\w+\s*$/i.test(clean) ||                          // single word
            clean.length > 200;                                  // absurdly long = hallucination
          if (isHallucination) { try { fs.unlinkSync(txtFile); } catch {} }
          // Must have at least 2 real words to count
          const wordCount = clean.split(/\s+/).filter(w => w.length > 1).length;
          if (!isHallucination && clean.length > 5 && wordCount >= 3) {
            console.log(`[LocalSTT] ${this.sourceType}: "${clean}"`);
            if (this.onTranscript) this.onTranscript(clean, this.sourceType);
          }
        }
      } catch {
        // No transcript file
      }
    });
  }
}

module.exports = { LocalSTT };
