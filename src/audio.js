// Cinderpine Express — Procedural WebAudio Fairground & Coaster Sound Designer
(function () {
  const CPE = window.CPE = window.CPE || {};

  // Safe numeric clamp helper to prevent NaN / non-finite WebAudio AudioParam exceptions
  function safeVal(val, fallback = 0, min = -1e6, max = 1e6) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
    return Math.max(min, Math.min(max, val));
  }

  function safeFreq(val, fallback = 440) {
    return safeVal(val, fallback, 12, 20000);
  }

  function safeGain(val, fallback = 0) {
    return safeVal(val, fallback, 0, 4.0);
  }

  function setTargetSafe(param, value, time, timeConstant = 0.04) {
    if (!param) return;
    const v = safeVal(value, 0, -20000, 20000);
    const t = safeVal(time, 0, 0, 1e9);
    const tc = safeVal(timeConstant, 0.04, 0.002, 10.0);
    try {
      param.setTargetAtTime(v, t, tc);
    } catch (e) {
      try { param.value = v; } catch (_) {}
    }
  }

  // Cheerful Carousel Waltz in C Major (3/4 time, ~150 BPM quarter note = 0.4s per beat)
  // Beats 0, 1, 2 in each measure.
  // Each entry: { bass: midi, chord: [midi, midi], mel: midi (or 0 for rest), dur: beats }
  const WALTZ_BARS = [
    // Phrase A (Bars 1-4)
    { bass: 48, chord: [60, 64, 67], mel: [72, 76, 79] }, // C major: C5 E5 G5
    { bass: 43, chord: [60, 64, 67], mel: [84, 0,  79] }, // C/G:     C6 -  G5
    { bass: 48, chord: [60, 64, 67], mel: [76, 72, 76] }, // C major: E5 C5 E5
    { bass: 43, chord: [59, 62, 67], mel: [74, 0,  0]  }, // G major: D5 -  -
    // Phrase A' (Bars 5-8)
    { bass: 43, chord: [59, 62, 67], mel: [74, 77, 79] }, // G7:      D5 F5 G5
    { bass: 47, chord: [59, 62, 67], mel: [83, 0,  79] }, // G/B:     B5 -  G5
    { bass: 43, chord: [59, 65, 67], mel: [77, 74, 71] }, // G7:      F5 D5 B4
    { bass: 48, chord: [60, 64, 67], mel: [72, 0,  0]  }, // C major: C5 -  -
    // Phrase B (Bars 9-12)
    { bass: 48, chord: [60, 64, 67], mel: [76, 79, 84] }, // C major: E5 G5 C6
    { bass: 45, chord: [60, 64, 69], mel: [81, 0,  76] }, // A minor: A5 -  E5
    { bass: 41, chord: [60, 65, 69], mel: [77, 81, 77] }, // F major: F5 A5 F5
    { bass: 43, chord: [60, 64, 67], mel: [76, 79, 76] }, // C/G:     E5 G5 E5
    // Phrase C / Turnaround (Bars 13-16)
    { bass: 50, chord: [62, 66, 69], mel: [74, 78, 81] }, // D7:      D5 F#5 A5
    { bass: 43, chord: [59, 62, 67], mel: [79, 83, 86] }, // G major: G5 B5 D6
    { bass: 43, chord: [59, 65, 67], mel: [84, 79, 76] }, // G7:      C6 G5 E5
    { bass: 48, chord: [60, 64, 67], mel: [72, 79, 72] }  // C major: C5 G5 C5
  ];

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  CPE.AUDIO = {
    ctx: null,
    masterGain: null,
    compressor: null,
    isMuted: false,
    unlocked: false,
    initialized: false,

    // Shared procedural noise buffers
    whiteBuffer: null,
    pinkBuffer: null,

    // Continuous layer nodes
    layers: {
      calliopeGain: null,
      crowdGain: null,
      crowdFilter: null,
      wheelsGain: null,
      wheelsLowOsc: null,
      wheelsLowGain: null,
      wheelsNoiseFilter: null,
      wheelsNoiseGain: null,
      flangeOsc: null,
      flangeGain: null,
      windGain: null,
      windFilter: null
    },

    // Sequencer & rhythmic timers
    waltzTimer: 0,
    waltzBeatIndex: 0,
    waltzBarIndex: 0,
    clankAccum: 0,
    railClickAccum: 0,
    chatterTimer: 1.5,
    screamCooldown: 0,
    lastScreamTime: 0,
    lastBrakeTime: 0,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      // Unlock / create AudioContext on first user gesture
      const unlockHandler = () => {
        this.unlock();
      };
      window.addEventListener('pointerdown', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });

      // Subscribe to CPE.events if available (or attach when ready)
      this._bindEvents();
    },

    _bindEvents() {
      if (!CPE.events || this._eventsBound) return;
      this._eventsBound = true;

      CPE.events.on('dispatch', (data) => {
        this.playStationBell(data);
      });

      CPE.events.on('brakeHiss', (data) => {
        const intensity = (data && typeof data.intensity === 'number') ? data.intensity : 0.8;
        this.playBrakeHiss(intensity);
      });

      CPE.events.on('scream', (data) => {
        const intensity = (data && typeof data.intensity === 'number') ? data.intensity : 0.85;
        this.playRiderScream(intensity);
      });

      CPE.events.on('enterSection', (data) => {
        if (!data) return;
        const st = data.sectionType;
        if (st === 'trim' || st === 'brake') {
          this.playBrakeHiss(st === 'brake' ? 0.85 : 0.65);
        } else if (st === 'drop' || st === 'loop') {
          this.playRiderScream(0.95);
        }
      });

      CPE.events.on('fireworkLaunch', (data) => {
        this.playFireworkLaunch(data);
      });

      CPE.events.on('fireworkBurst', (data) => {
        this.playFireworkBurst(data);
      });
    },

    unlock() {
      if (this.unlocked && this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      try {
        if (!this.ctx) {
          this.ctx = new AudioCtx();
          this._buildGraph();
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        this.unlocked = true;
      } catch (e) {
        // Ignore if browser blocks until next interaction
      }
    },

    _createNoiseBuffers() {
      const ctx = this.ctx;
      const sr = ctx.sampleRate;
      const len = sr * 4; // 4-second seamless loop

      // White noise
      const white = ctx.createBuffer(1, len, sr);
      const wData = white.getChannelData(0);
      for (let i = 0; i < len; i++) {
        wData[i] = Math.random() * 2 - 1;
      }
      this.whiteBuffer = white;

      // Pink noise (Paul Kellet's Voss-McCartney filter)
      const pink = ctx.createBuffer(1, len, sr);
      const pData = pink.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.045;
        b6 = w * 0.115926;
      }
      this.pinkBuffer = pink;
    },

    _buildGraph() {
      const ctx = this.ctx;
      this._createNoiseBuffers();

      // Master dynamics compressor + Master Gain
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 18;
      comp.ratio.value = 4;
      comp.attack.value = 0.008;
      comp.release.value = 0.18;

      const master = ctx.createGain();
      master.gain.value = this.isMuted ? 0.0 : 0.78;

      comp.connect(master);
      master.connect(ctx.destination);

      this.compressor = comp;
      this.masterGain = master;

      const now = ctx.currentTime;

      // 1. Calliope submix gain
      const calliopeGain = ctx.createGain();
      calliopeGain.gain.value = 0.22;
      calliopeGain.connect(comp);
      this.layers.calliopeGain = calliopeGain;

      // 2. Crowd Ambience continuous murmur
      const crowdSrc = ctx.createBufferSource();
      crowdSrc.buffer = this.pinkBuffer;
      crowdSrc.loop = true;

      const crowdFilter = ctx.createBiquadFilter();
      crowdFilter.type = 'bandpass';
      crowdFilter.frequency.value = 480;
      crowdFilter.Q.value = 0.9;

      const crowdShelf = ctx.createBiquadFilter();
      crowdShelf.type = 'peaking';
      crowdShelf.frequency.value = 850;
      crowdShelf.Q.value = 1.4;
      crowdShelf.gain.value = 4.5;

      const crowdGain = ctx.createGain();
      crowdGain.gain.value = 0.09;

      crowdSrc.connect(crowdFilter);
      crowdFilter.connect(crowdShelf);
      crowdShelf.connect(crowdGain);
      crowdGain.connect(comp);
      crowdSrc.start(now);

      this.layers.crowdFilter = crowdFilter;
      this.layers.crowdGain = crowdGain;

      // 4. Coaster Wheels & Track Roar continuous layer
      const wheelsGain = ctx.createGain();
      wheelsGain.gain.value = 0.0;
      wheelsGain.connect(comp);

      // Rolling noise component
      const wheelsNoise = ctx.createBufferSource();
      wheelsNoise.buffer = this.pinkBuffer;
      wheelsNoise.loop = true;

      const wheelsNoiseFilter = ctx.createBiquadFilter();
      wheelsNoiseFilter.type = 'bandpass';
      wheelsNoiseFilter.frequency.value = 180;
      wheelsNoiseFilter.Q.value = 1.2;

      const wheelsNoiseGain = ctx.createGain();
      wheelsNoiseGain.gain.value = 0.5;

      wheelsNoise.connect(wheelsNoiseFilter);
      wheelsNoiseFilter.connect(wheelsNoiseGain);
      wheelsNoiseGain.connect(wheelsGain);
      wheelsNoise.start(now);

      // Low resonant track/car body hum
      const wheelsLowOsc = ctx.createOscillator();
      wheelsLowOsc.type = 'sawtooth';
      wheelsLowOsc.frequency.value = 55;

      const wheelsLowFilter = ctx.createBiquadFilter();
      wheelsLowFilter.type = 'lowpass';
      wheelsLowFilter.frequency.value = 160;
      wheelsLowFilter.Q.value = 2.5;

      const wheelsLowGain = ctx.createGain();
      wheelsLowGain.gain.value = 0.25;

      wheelsLowOsc.connect(wheelsLowFilter);
      wheelsLowFilter.connect(wheelsLowGain);
      wheelsLowGain.connect(wheelsGain);
      wheelsLowOsc.start(now);

      // Metallic flange squeal oscillator (active on tight turns, especially mine & steel)
      const flangeOsc = ctx.createOscillator();
      flangeOsc.type = 'triangle';
      flangeOsc.frequency.value = 2400;

      const flangeFilter = ctx.createBiquadFilter();
      flangeFilter.type = 'bandpass';
      flangeFilter.frequency.value = 2500;
      flangeFilter.Q.value = 6.0;

      const flangeGain = ctx.createGain();
      flangeGain.gain.value = 0.0;

      flangeOsc.connect(flangeFilter);
      flangeFilter.connect(flangeGain);
      flangeGain.connect(wheelsGain);
      flangeOsc.start(now);

      this.layers.wheelsGain = wheelsGain;
      this.layers.wheelsNoiseFilter = wheelsNoiseFilter;
      this.layers.wheelsNoiseGain = wheelsNoiseGain;
      this.layers.wheelsLowOsc = wheelsLowOsc;
      this.layers.wheelsLowGain = wheelsLowGain;
      this.layers.flangeOsc = flangeOsc;
      this.layers.flangeGain = flangeGain;

      // 5. High-Speed Wind Rush continuous layer
      const windNoise = ctx.createBufferSource();
      windNoise.buffer = this.whiteBuffer;
      windNoise.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 350;
      windFilter.Q.value = 0.85;

      const windGain = ctx.createGain();
      windGain.gain.value = 0.0;

      windNoise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(comp);
      windNoise.start(now);

      this.layers.windFilter = windFilter;
      this.layers.windGain = windGain;
    },

    // =========================================================================
    // MUTE CONTROL
    // =========================================================================
    setMuted(muted) {
      this.isMuted = !!muted;
      if (this.ctx && this.masterGain) {
        setTargetSafe(this.masterGain.gain, this.isMuted ? 0.0 : 0.78, this.ctx.currentTime, 0.05);
      }
      if (!this.isMuted && this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.isMuted;
    },

    toggleMute() {
      if (!this.unlocked) {
        this.unlock();
      }
      return this.setMuted(!this.isMuted);
    },

    // =========================================================================
    // LAYER 1: CALLIOPE / FAIRGROUND ORGAN SYNTHESIZER
    // =========================================================================
    _triggerCalliopePipe(midi, duration, volume, isMelody) {
      if (!this.ctx || !this.layers.calliopeGain || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const freq = safeFreq(midiToHz(midi), 440);
      const dur = safeVal(duration, 0.35, 0.08, 2.5);
      const peakGain = safeGain(volume, 0.12);

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.linearRampToValueAtTime(peakGain, now + (isMelody ? 0.028 : 0.018));
      noteGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain * 0.72), now + dur * 0.75);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      noteGain.connect(this.layers.calliopeGain);

      // Pair of slightly detuned oscillators for authentic calliope steam-whistle chorus
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = isMelody ? 'triangle' : 'square';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * (isMelody ? 1.0045 : 2.002), now);

      // Gentle bandpass/lowpass to warm the brass/steam pipes
      const pipeFilter = ctx.createBiquadFilter();
      pipeFilter.type = 'lowpass';
      pipeFilter.frequency.setValueAtTime(safeFreq(freq * (isMelody ? 4.2 : 2.8), 1800), now);
      pipeFilter.Q.setValueAtTime(isMelody ? 2.2 : 1.0, now);

      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      g1.gain.value = 0.65;
      g2.gain.value = 0.35;

      osc1.connect(g1);
      osc2.connect(g2);
      g1.connect(pipeFilter);
      g2.connect(pipeFilter);
      pipeFilter.connect(noteGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + dur + 0.02);
      osc2.stop(now + dur + 0.02);

      // Subtle steam-chiff transient on melody notes
      if (isMelody && this.whiteBuffer) {
        const chiffSrc = ctx.createBufferSource();
        chiffSrc.buffer = this.whiteBuffer;

        const chiffFilter = ctx.createBiquadFilter();
        chiffFilter.type = 'bandpass';
        chiffFilter.frequency.setValueAtTime(safeFreq(freq * 2.0, 1500), now);
        chiffFilter.Q.setValueAtTime(4.5, now);

        const chiffGain = ctx.createGain();
        chiffGain.gain.setValueAtTime(0.0001, now);
        chiffGain.gain.linearRampToValueAtTime(peakGain * 0.32, now + 0.012);
        chiffGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

        chiffSrc.connect(chiffFilter);
        chiffFilter.connect(chiffGain);
        chiffGain.connect(this.layers.calliopeGain);

        chiffSrc.start(now, Math.random() * 2.0, 0.08);
      }
    },

    _stepWaltz() {
      const bar = WALTZ_BARS[this.waltzBarIndex % WALTZ_BARS.length];
      const beat = this.waltzBeatIndex % 3;

      if (beat === 0) {
        // Beat 1: Oom (warm tuba/bourdon bass pipe)
        this._triggerCalliopePipe(bar.bass, 0.34, 0.14, false);
      } else {
        // Beats 2 & 3: Pah-Pah (staccato chord pipes)
        for (let i = 0; i < bar.chord.length; i++) {
          this._triggerCalliopePipe(bar.chord[i], 0.19, 0.055, false);
        }
      }

      // Melody pipe
      const melNote = bar.mel[beat];
      if (melNote && melNote > 0) {
        // Check if next beat in bar is a rest (0) so we hold the note longer
        const nextNote = (beat < 2) ? bar.mel[beat + 1] : -1;
        const holdBeats = (nextNote === 0) ? 1.85 : 0.92;
        this._triggerCalliopePipe(melNote, 0.36 * holdBeats, 0.15, true);
      }

      this.waltzBeatIndex++;
      if (this.waltzBeatIndex >= 3) {
        this.waltzBeatIndex = 0;
        this.waltzBarIndex = (this.waltzBarIndex + 1) % WALTZ_BARS.length;
      }
    },

    // =========================================================================
    // LAYER 2: CROWD CHATTER / LAUGHTER BURSTS
    // =========================================================================
    _triggerCrowdChatter() {
      if (!this.ctx || !this.layers.crowdGain || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Synthesize 2-4 quick formant syllables ("ha-ha-ha" or cheerful murmur)
      const syllables = 2 + Math.floor(Math.random() * 3);
      const basePitch = 190 + Math.random() * 140;

      for (let i = 0; i < syllables; i++) {
        const t0 = now + i * (0.09 + Math.random() * 0.04);
        const dur = 0.07 + Math.random() * 0.04;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const f = safeFreq(basePitch * (1 + 0.08 * Math.sin(i * 1.7)), 240);
        osc.frequency.setValueAtTime(f, t0);
        osc.frequency.exponentialRampToValueAtTime(safeFreq(f * 0.88, 210), t0 + dur);

        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(safeFreq(650 + Math.random() * 450, 800), t0);
        formant.Q.setValueAtTime(4.0, t0);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.045, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(formant);
        formant.connect(g);
        g.connect(this.layers.crowdGain);

        osc.start(t0);
        osc.stop(t0 + dur + 0.01);
      }
    },

    // =========================================================================
    // LAYER 3: CHAIN LIFT ANTI-ROLLBACK DOG RATCHET CLANK
    // =========================================================================
    _triggerChainClank(coasterType) {
      if (!this.ctx || !this.compressor || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Crisp metallic dog clack: high-passed noise burst + short pitched metallic ring
      const clackGain = ctx.createGain();
      clackGain.gain.setValueAtTime(0.09, now);
      clackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.042);
      clackGain.connect(this.compressor);

      // Metallic resonator
      const osc = ctx.createOscillator();
      osc.type = 'square';
      const baseF = coasterType === 'wood' ? 920 : (coasterType === 'mine' ? 1080 : 1320);
      const jitter = 0.96 + Math.random() * 0.08;
      osc.frequency.setValueAtTime(safeFreq(baseF * jitter, 1100), now);
      osc.frequency.exponentialRampToValueAtTime(safeFreq(baseF * 0.48, 520), now + 0.038);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(safeFreq(baseF * 1.2, 1300), now);
      bp.Q.setValueAtTime(3.5, now);

      osc.connect(bp);
      bp.connect(clackGain);
      osc.start(now);
      osc.stop(now + 0.045);

      // Secondary wooden/steel latch click 14ms later
      if (this.whiteBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.whiteBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1800, now);

        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.05, now);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

        src.connect(hp);
        hp.connect(ng);
        ng.connect(this.compressor);
        src.start(now, Math.random() * 2.0, 0.025);
      }
    },

    // =========================================================================
    // LAYER 4 HELPER: WOOD / MINE RAIL-JOINT CLACK
    // =========================================================================
    _triggerRailJointClick(coasterType, speedNorm) {
      if (!this.ctx || !this.layers.wheelsGain || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const amp = safeGain(0.04 + 0.12 * speedNorm, 0.06);

      if (coasterType === 'wood') {
        // Warm hollow timber clatter
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const f = safeFreq(165 + Math.random() * 45, 180);
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(75, now + 0.045);

        const g = ctx.createGain();
        g.gain.setValueAtTime(amp, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.048);

        osc.connect(g);
        g.connect(this.layers.wheelsGain);
        osc.start(now);
        osc.stop(now + 0.052);
      } else if (coasterType === 'mine') {
        // Ore-car double rail-joint click ("clack-clack")
        for (let b = 0; b < 2; b++) {
          const t0 = now + b * 0.026;
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(safeFreq(620 + b * 90 + Math.random() * 40, 650), t0);
          osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.024);

          const g = ctx.createGain();
          g.gain.setValueAtTime(amp * 0.65, t0);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.026);

          osc.connect(g);
          g.connect(this.layers.wheelsGain);
          osc.start(t0);
          osc.stop(t0 + 0.03);
        }
      }
    },

    // =========================================================================
    // LAYER 6: RIDER SCREAMS & CHEERS (MULTI-VOICE FORMANT CHOIR)
    // =========================================================================
    playRiderScream(intensity = 0.9) {
      if (!this.ctx || !this.compressor || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Throttle overlapping screams to keep mix clean
      if (now - this.lastScreamTime < 1.1) return;
      this.lastScreamTime = now;

      const inten = safeVal(intensity, 0.85, 0.2, 1.2);
      const voiceCount = 4;
      // Vowel formants (F1, F2) for "Wooo!" / "Aaaah!" / "Yeah!"
      const vowels = [
        { f1: 780, f2: 1280 }, // "Aaaah"
        { f1: 420, f2: 920 },  // "Woooo"
        { f1: 680, f2: 1450 }, // "Yeeaa"
        { f1: 820, f2: 1350 }  // "Aaaah"
      ];

      const basePitches = [330, 415, 490, 565]; // Alto/Soprano/Tenor excited voices

      for (let v = 0; v < voiceCount; v++) {
        const delay = v * 0.055 + Math.random() * 0.04;
        const t0 = now + delay;
        const dur = (0.95 + Math.random() * 0.55) * (0.75 + 0.25 * inten);

        const fStart = safeFreq(basePitches[v] * (0.95 + Math.random() * 0.1), 420);
        const fPeak = safeFreq(fStart * (1.16 + Math.random() * 0.12), 500);
        const fEnd = safeFreq(fStart * (0.82 + Math.random() * 0.08), 360);

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(fStart, t0);
        osc.frequency.exponentialRampToValueAtTime(fPeak, t0 + dur * 0.28);
        osc.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);

        // Natural vocal vibrato LFO
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(5.5 + Math.random() * 1.8, t0);
        lfoGain.gain.setValueAtTime(fStart * 0.025, t0);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        // Two parallel formant filters per voice
        const vowel = vowels[v % vowels.length];
        const bp1 = ctx.createBiquadFilter();
        bp1.type = 'bandpass';
        bp1.frequency.setValueAtTime(safeFreq(vowel.f1, 750), t0);
        bp1.frequency.linearRampToValueAtTime(safeFreq(vowel.f1 * 1.12, 840), t0 + dur * 0.4);
        bp1.Q.setValueAtTime(5.5, t0);

        const bp2 = ctx.createBiquadFilter();
        bp2.type = 'bandpass';
        bp2.frequency.setValueAtTime(safeFreq(vowel.f2, 1300), t0);
        bp2.Q.setValueAtTime(6.5, t0);

        const vGain = ctx.createGain();
        const peak = safeGain(0.038 * inten, 0.032);
        vGain.gain.setValueAtTime(0.0001, t0);
        vGain.gain.linearRampToValueAtTime(peak, t0 + 0.09);
        vGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.65), t0 + dur * 0.65);
        vGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(bp1);
        osc.connect(bp2);
        bp1.connect(vGain);
        bp2.connect(vGain);
        vGain.connect(this.compressor);

        osc.start(t0);
        lfo.start(t0);
        osc.stop(t0 + dur + 0.02);
        lfo.stop(t0 + dur + 0.02);
      }
    },

    // =========================================================================
    // LAYER 7: AIR BRAKES & MAGNETIC TRIM HISS
    // =========================================================================
    playBrakeHiss(intensity = 0.8) {
      if (!this.ctx || !this.compressor || !this.whiteBuffer || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      if (now - this.lastBrakeTime < 0.35) return;
      this.lastBrakeTime = now;

      const inten = safeVal(intensity, 0.8, 0.2, 1.2);
      const dur = 0.48 + 0.25 * inten;

      // 1. Crisp pneumatic compressed-air release hiss
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this.whiteBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(3600, now);
      bp.frequency.exponentialRampToValueAtTime(1400, now + dur);
      bp.Q.setValueAtTime(1.4, now);

      const hissGain = ctx.createGain();
      const peak = safeGain(0.14 * inten, 0.11);
      hissGain.gain.setValueAtTime(0.0001, now);
      hissGain.gain.linearRampToValueAtTime(peak, now + 0.015);
      hissGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.35), now + dur * 0.45);
      hissGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      noiseSrc.connect(bp);
      bp.connect(hissGain);
      hissGain.connect(this.compressor);
      noiseSrc.start(now, Math.random() * 1.5, dur + 0.05);

      // 2. Metallic caliper clamp / eddy-current hum transient
      const clampOsc = ctx.createOscillator();
      clampOsc.type = 'triangle';
      clampOsc.frequency.setValueAtTime(340, now);
      clampOsc.frequency.exponentialRampToValueAtTime(95, now + 0.12);

      const clampGain = ctx.createGain();
      clampGain.gain.setValueAtTime(safeGain(0.11 * inten, 0.08), now);
      clampGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

      clampOsc.connect(clampGain);
      clampGain.connect(this.compressor);
      clampOsc.start(now);
      clampOsc.stop(now + 0.14);
    },

    // =========================================================================
    // LAYER 8: STATION DISPATCH BELL ("DING-DING!" + PNEUMATIC GATE)
    // =========================================================================
    playStationBell() {
      if (!this.ctx || !this.compressor || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Double brass station bell strike ("Ding-Ding!")
      const bellBase = 1046.5; // C6 bright brass bell
      const partials = [
        { ratio: 1.0,   amp: 0.16, decay: 0.85 },
        { ratio: 2.0,   amp: 0.09, decay: 0.65 },
        { ratio: 2.756, amp: 0.07, decay: 0.45 },
        { ratio: 4.07,  amp: 0.04, decay: 0.28 }
      ];

      for (let strike = 0; strike < 2; strike++) {
        const t0 = now + strike * 0.22;
        for (let p = 0; p < partials.length; p++) {
          const part = partials[p];
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(safeFreq(bellBase * part.ratio, 1046.5), t0);

          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(safeGain(part.amp, 0.1), t0 + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + part.decay);

          osc.connect(g);
          g.connect(this.compressor);
          osc.start(t0);
          osc.stop(t0 + part.decay + 0.02);
        }
      }

      // Pneumatic air-gate release hiss after second bell strike
      if (this.whiteBuffer) {
        const tGate = now + 0.35;
        const src = ctx.createBufferSource();
        src.buffer = this.whiteBuffer;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2800, tGate);
        bp.frequency.exponentialRampToValueAtTime(1100, tGate + 0.32);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tGate);
        g.gain.linearRampToValueAtTime(0.08, tGate + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, tGate + 0.32);

        src.connect(bp);
        bp.connect(g);
        g.connect(this.compressor);
        src.start(tGate, 0, 0.35);
      }
    },

    // =========================================================================
    // LAYER 9: NIGHT FIREWORKS (LAUNCH WHOOSH/WHISTLE & BURST BOOM/CRACKLE)
    // =========================================================================
    playFireworkLaunch() {
      if (!this.ctx || !this.compressor || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const dur = 0.85;

      // Rising pyrotechnic whistle
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = safeFreq(580 + Math.random() * 140, 620);
      const f1 = safeFreq(f0 * 2.8, 1750);
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f1, now + dur);

      const whistleGain = ctx.createGain();
      whistleGain.gain.setValueAtTime(0.0001, now);
      whistleGain.gain.linearRampToValueAtTime(0.045, now + 0.06);
      whistleGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(whistleGain);
      whistleGain.connect(this.compressor);
      osc.start(now);
      osc.stop(now + dur + 0.02);

      // Rocket tail whoosh
      if (this.pinkBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.pinkBuffer;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(400, now);
        bp.frequency.exponentialRampToValueAtTime(1600, now + dur);
        bp.Q.setValueAtTime(1.5, now);

        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, now);
        ng.gain.linearRampToValueAtTime(0.065, now + 0.04);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        src.connect(bp);
        bp.connect(ng);
        ng.connect(this.compressor);
        src.start(now, Math.random() * 1.5, dur + 0.04);
      }
    },

    playFireworkBurst() {
      if (!this.ctx || !this.compressor || this.isMuted) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // 1. Deep chest-thumping mortar boom
      const boomOsc = ctx.createOscillator();
      boomOsc.type = 'sine';
      boomOsc.frequency.setValueAtTime(135, now);
      boomOsc.frequency.exponentialRampToValueAtTime(28, now + 0.45);

      const boomGain = ctx.createGain();
      boomGain.gain.setValueAtTime(0.0001, now);
      boomGain.gain.linearRampToValueAtTime(0.28, now + 0.008);
      boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);

      boomOsc.connect(boomGain);
      boomGain.connect(this.compressor);
      boomOsc.start(now);
      boomOsc.stop(now + 0.55);

      // 2. Low-passed explosion rumble body
      if (this.pinkBuffer) {
        const rumbleSrc = ctx.createBufferSource();
        rumbleSrc.buffer = this.pinkBuffer;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(420, now);
        lp.frequency.exponentialRampToValueAtTime(75, now + 0.85);

        const rg = ctx.createGain();
        rg.gain.setValueAtTime(0.22, now);
        rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

        rumbleSrc.connect(lp);
        lp.connect(rg);
        rg.connect(this.compressor);
        rumbleSrc.start(now, Math.random() * 2.0, 0.95);
      }

      // 3. Sparkling crackle tail (6-10 micro-pops over 0.15s..0.95s)
      if (this.whiteBuffer) {
        const popCount = 7 + Math.floor(Math.random() * 4);
        for (let i = 0; i < popCount; i++) {
          const tPop = now + 0.14 + Math.random() * 0.78;
          const src = ctx.createBufferSource();
          src.buffer = this.whiteBuffer;

          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(safeFreq(2400 + Math.random() * 3200, 3500), tPop);
          bp.Q.setValueAtTime(3.0, tPop);

          const pg = ctx.createGain();
          pg.gain.setValueAtTime(0.055, tPop);
          pg.gain.exponentialRampToValueAtTime(0.0001, tPop + 0.025);

          src.connect(bp);
          bp.connect(pg);
          pg.connect(this.compressor);
          src.start(tPop, Math.random() * 2.5, 0.03);
        }
      }
    },

    // =========================================================================
    // FRAME UPDATE: CONTINUOUS SOUND MODULATION
    // =========================================================================
    update(dtRaw) {
      // Ensure event listeners are bound if CPE.events initialized after CPE.AUDIO.init()
      if (!this._eventsBound && CPE.events) {
        this._bindEvents();
      }

      if (!this.ctx || !this.unlocked || this.isMuted) return;
      if (this.ctx.state !== 'running') return;

      const dt = safeVal(dtRaw, 0.016, 0.0, 0.1);
      const now = this.ctx.currentTime;

      const ride = CPE.RIDE;
      const coaster = ride && ride.coaster ? ride.coaster : null;
      const coasterType = coaster ? coaster.type : 'wood';
      const speed = ride ? safeVal(ride.speed, 0, 0, 60) : 0;
      const timeScale = ride ? safeVal(ride.timeScale, 1, 0.25, 8) : 1;
      const state = ride ? ride.state : 'BOARD';
      const sample = (ride && ride.currentSample) ? ride.currentSample : null;

      // Determine camera proximity to midway/carousel vs coaster ride
      // Carousel / Midway center is around (-32, 0, -10)
      let camDistToMidway = 38;
      let camDistToTrain = 15;
      let isRideCam = false;

      if (CPE.CAMERA) {
        if (CPE.CAMERA.mode === 'chase' || CPE.CAMERA.mode === 'fpv' || CPE.CAMERA.mode === 1 || CPE.CAMERA.mode === 2) {
          isRideCam = true;
        }
        const camPos = CPE.CAMERA.camera ? CPE.CAMERA.camera.position : CPE.CAMERA.pos;
        if (camPos && Number.isFinite(camPos.x)) {
          const dxM = camPos.x - (-30);
          const dzM = camPos.z - (-6);
          camDistToMidway = Math.sqrt(dxM * dxM + camPos.y * camPos.y + dzM * dzM);

          if (CPE.WORLD && CPE.WORLD.trainPos) {
            const tp = CPE.WORLD.trainPos;
            const dxT = camPos.x - tp.x;
            const dyT = camPos.y - tp.y;
            const dzT = camPos.z - tp.z;
            camDistToTrain = Math.sqrt(dxT * dxT + dyT * dyT + dzT * dzT);
          }
        }
      }

      const speedNorm = Math.min(1.0, speed / 22.0);
      const trainProximity = isRideCam ? 1.0 : Math.max(0.18, Math.min(1.0, 32.0 / Math.max(8.0, camDistToTrain)));
      const midwayProximity = Math.max(0.22, Math.min(1.0, 42.0 / Math.max(12.0, camDistToMidway)));

      // -----------------------------------------------------------------------
      // 1. Calliope Waltz Sequencer & Ducking at high coaster speeds
      // -----------------------------------------------------------------------
      const calliopeDuck = 1.0 - 0.55 * speedNorm * (isRideCam ? 1.0 : 0.45);
      const targetCalliopeGain = safeGain(0.22 * midwayProximity * calliopeDuck, 0.14);
      setTargetSafe(this.layers.calliopeGain.gain, targetCalliopeGain, now, 0.12);

      const beatInterval = 0.38; // ~158 BPM cheerful carousel waltz
      this.waltzTimer += dt;
      if (this.waltzTimer >= beatInterval) {
        this.waltzTimer -= beatInterval;
        this._stepWaltz();
      }

      // -----------------------------------------------------------------------
      // 2. Crowd Ambience & Occasional Cheerful Chatter
      // -----------------------------------------------------------------------
      const targetCrowdGain = safeGain(0.085 * midwayProximity * (1.0 - 0.35 * speedNorm), 0.06);
      setTargetSafe(this.layers.crowdGain.gain, targetCrowdGain, now, 0.15);
      setTargetSafe(
        this.layers.crowdFilter.frequency,
        safeFreq(440 + 120 * Math.sin(now * 0.7), 460),
        now,
        0.2
      );

      this.chatterTimer -= dt;
      if (this.chatterTimer <= 0) {
        this.chatterTimer = 2.4 + Math.random() * 3.8;
        this._triggerCrowdChatter();
      }

      // -----------------------------------------------------------------------
      // 3. Chain Lift Anti-Rollback Clank
      // -----------------------------------------------------------------------
      let onLift = (state === 'LIFT');
      if (!onLift && ride && Array.isArray(ride.cars)) {
        for (let i = 0; i < ride.cars.length; i++) {
          const cs = ride.cars[i].sample;
          if (cs && cs.segmentType === 'lift' && speed > 0.5) {
            onLift = true;
            break;
          }
        }
      }

      if (onLift && speed > 0.3) {
        // Dog teeth spaced every ~0.36m along lift hill
        this.clankAccum += speed * timeScale * dt;
        const toothSpacing = 0.36;
        if (this.clankAccum >= toothSpacing) {
          this.clankAccum %= toothSpacing;
          this._triggerChainClank(coasterType);
        }
      } else {
        this.clankAccum = 0;
      }

      // -----------------------------------------------------------------------
      // 4. Coaster Wheels & Track Roar (distinct timbre per wood / steel / mine)
      // -----------------------------------------------------------------------
      const inTunnel = !!(sample && sample.inTunnel);
      const tunnelBoost = inTunnel ? 1.45 : 1.0;

      if (speed > 0.25) {
        const baseWheelGain = (0.04 + 0.26 * Math.pow(speedNorm, 1.15)) * trainProximity * tunnelBoost;
        setTargetSafe(this.layers.wheelsGain.gain, safeGain(baseWheelGain, 0.1), now, 0.06);

        if (coasterType === 'wood') {
          // Warm hollow timber rumble + rhythmic rail-joint clatter
          setTargetSafe(this.layers.wheelsNoiseFilter.frequency, safeFreq(130 + speed * 14, 220), now, 0.06);
          setTargetSafe(this.layers.wheelsNoiseFilter.Q, inTunnel ? 0.9 : 1.4, now, 0.08);
          setTargetSafe(this.layers.wheelsLowOsc.frequency, safeFreq(42 + speed * 2.4, 65), now, 0.06);
          setTargetSafe(this.layers.wheelsLowGain.gain, 0.32, now, 0.06);

          this.railClickAccum += speed * timeScale * dt;
          if (this.railClickAccum >= 1.85) {
            this.railClickAccum %= 1.85;
            this._triggerRailJointClick('wood', speedNorm);
          }
        } else if (coasterType === 'steel') {
          // Sleek high-tech B&M / Intamin tubular roar
          setTargetSafe(this.layers.wheelsNoiseFilter.frequency, safeFreq(240 + speed * 28, 450), now, 0.06);
          setTargetSafe(this.layers.wheelsNoiseFilter.Q, 2.6, now, 0.08);
          setTargetSafe(this.layers.wheelsLowOsc.frequency, safeFreq(68 + speed * 4.5, 115), now, 0.06);
          setTargetSafe(this.layers.wheelsLowGain.gain, 0.38, now, 0.06);
        } else {
          // 'mine': Metallic ore-car chug + narrow-gauge joint clicks
          setTargetSafe(this.layers.wheelsNoiseFilter.frequency, safeFreq(190 + speed * 20, 320), now, 0.06);
          setTargetSafe(this.layers.wheelsNoiseFilter.Q, 1.8, now, 0.08);
          setTargetSafe(this.layers.wheelsLowOsc.frequency, safeFreq(52 + speed * 3.1, 85), now, 0.06);
          setTargetSafe(this.layers.wheelsLowGain.gain, 0.28, now, 0.06);

          this.railClickAccum += speed * timeScale * dt;
          if (this.railClickAccum >= 1.55) {
            this.railClickAccum %= 1.55;
            this._triggerRailJointClick('mine', speedNorm);
          }
        }

        // Flange squeal on tight curves / helices
        const curv = sample ? Math.abs(safeVal(sample.curvature, 0, -1, 1)) : 0;
        const flangeFactor = (curv > 0.045 && speed > 6.0)
          ? Math.min(1.0, (curv - 0.045) * 18.0) * speedNorm * (coasterType === 'mine' ? 1.35 : 0.75)
          : 0.0;
        setTargetSafe(this.layers.flangeGain.gain, safeGain(flangeFactor * 0.09, 0), now, 0.05);
        setTargetSafe(
          this.layers.flangeOsc.frequency,
          safeFreq(2250 + 380 * Math.sin(now * 11.0) + speed * 18, 2400),
          now,
          0.05
        );
      } else {
        setTargetSafe(this.layers.wheelsGain.gain, 0.0, now, 0.08);
        setTargetSafe(this.layers.flangeGain.gain, 0.0, now, 0.05);
      }

      // -----------------------------------------------------------------------
      // 5. High-Speed Wind Rush: scales with (speed)^1.5, boosted in Chase/FPV
      // -----------------------------------------------------------------------
      const windPower = Math.pow(speedNorm, 1.5);
      const camWindBoost = isRideCam ? 1.55 : 0.65;
      const targetWindGain = safeGain(windPower * 0.22 * camWindBoost, 0.0);
      const targetWindFreq = safeFreq(260 + windPower * 1650, 350);

      setTargetSafe(this.layers.windGain.gain, targetWindGain, now, 0.07);
      setTargetSafe(this.layers.windFilter.frequency, targetWindFreq, now, 0.07);
    }
  };
})();
