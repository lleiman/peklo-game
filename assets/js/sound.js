/* ─────────────────────────────────────────────
   ПЕКЛО · звук
   Всё синтезируется в браузере: ни одного файла.
   Движок один на обе роли — меняется только тот,
   кто крутит слои: игрок за Шамана или симуляция.
   ───────────────────────────────────────────── */
const Sound = (() => {
  let ctx, master, dry, wet, cut;
  let built = false, timer = null;
  let step = 0, bar = 0, nextT = 0;
  let bpm = 72;
  let onStep = null;              /* колбэк доли: (номер шага, время в ctx) */

  /* уровни слоёв, 0…1 — их двигают снаружи */
  const L = { drone: 0, drum: 0, choir: 0 };
  let heat = 0;                   /* 0…1, жар зала: ведёт «струну» */

  let strVoices = [];             /* перегретая струна: то, что слышит слепой */
  let choirNodes = null;
  let drumBus = null;             /* шина ударных: нужна, чтобы их было чем мерить */

  /* Анализаторы. Один на выходе — из него берётся настоящая осциллограмма
     и спектр. Ещё три поменьше сидят на слоях: по ним подсвечиваются
     трубки, и связь «нажал вот эту — поднялось вот это» становится видна */
  let anaOut = null;
  const anaBus = { drone: null, drum: null, choir: null };
  const busBuf = { drone: null, drum: null, choir: null };

  const sixteenth = () => 60 / bpm / 4;

  /* ── шум и реверберация ── */
  function noiseBuf(sec) {
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let l0 = 0, l1 = 0, l2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      l0 = 0.99765 * l0 + w * 0.0990460;
      l1 = 0.96300 * l1 + w * 0.2965164;
      l2 = 0.57000 * l2 + w * 1.0526913;
      d[i] = (l0 + l1 + l2 + w * 0.1848) * 0.22;
    }
    return b;
  }

  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  /* ── дрон: пять голосов, каждый продублирован с расстройкой ── */
  let droneGain;
  function drone() {
    droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(dry); droneGain.connect(wet);
    droneGain.connect(anaBus.drone);

    [41.20, 61.74, 82.41, 92.50, 123.47].forEach((f, i) => {
      [0, 1].forEach((k) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f * (k ? 1.004 : 0.997);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 150 + i * 40; lp.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.value = (i < 2 ? 0.085 : 0.045) * (k ? 0.7 : 1);
        o.connect(lp); lp.connect(g); g.connect(droneGain);
        const lfo = ctx.createOscillator(), la = ctx.createGain();
        lfo.frequency.value = 0.017 + i * 0.007 + k * 0.004;
        la.gain.value = i < 2 ? 0.04 : 0.022;
        lfo.connect(la); la.connect(g.gain);
        lfo.start(); o.start();
      });
    });

    /* шумовой полог, медленно ползущий по частоте */
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(8); src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(bp); bp.connect(g); g.connect(droneGain);
    const sw = ctx.createOscillator(), sa = ctx.createGain();
    sw.frequency.value = 0.023; sa.gain.value = 190;
    sw.connect(sa); sa.connect(bp.frequency);
    sw.start(); src.start();
  }

  /* ── хор из собора: формантный пад ── */
  function choir() {
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(wet); out.connect(dry); out.connect(anaBus.choir);
    /* три форманты на голос, две расстроенные пары — получается «а-а» */
    [[329.63, 700, 1220], [392.00, 660, 1100], [493.88, 730, 1300]].forEach((v, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = v[0] / 2;
      const g = ctx.createGain(); g.gain.value = 0.055 / (i + 1);
      v.slice(1).forEach((fq) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = 7;
        o.connect(bp); bp.connect(g);
      });
      g.connect(out);
      /* лёгкое дыхание, чтобы пад не стоял мёртво */
      const lfo = ctx.createOscillator(), la = ctx.createGain();
      lfo.frequency.value = 0.09 + i * 0.03; la.gain.value = 0.02;
      lfo.connect(la); la.connect(g.gain);
      lfo.start(); o.start();
    });
    choirNodes = out;
  }

  /* ── голоса ударных ── */
  function doum(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(128, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    o.connect(g); g.connect(drumBus);
    o.start(t); o.stop(t + 0.5);

    const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(v * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(lp); lp.connect(ng); ng.connect(drumBus);
    s.start(t); s.stop(t + 0.1);
  }

  function tek(t, v) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 3.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    s.connect(bp); bp.connect(g); g.connect(drumBus);
    s.start(t); s.stop(t + 0.2);
  }

  function shaker(t, v) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.15);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    s.connect(hp); hp.connect(g); g.connect(drumBus);
    s.start(t); s.stop(t + 0.15);
  }

  function bell(t) {
    [523.25, 1445, 1979].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 / (i + 1), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
      o.connect(g); g.connect(wet);
      o.start(t); o.stop(t + 6);
    });
  }

  const DOUM = { 0: 1, 6: 0.72, 10: 0.9 };
  const TEK  = { 3: 0.34, 8: 0.4, 11: 0.24, 14: 0.38 };

  /* ── перегретая струна ──
     Шаман не видит зал. Он слышит того, кто ближе всех к резонансу:
     чем горячее, тем выше и громче нота. Это и есть его зрение */
  function string() {
    strVoices = [0, 1].map((k) => {
      const o = ctx.createOscillator();
      o.type = k ? 'triangle' : 'sawtooth';
      o.frequency.value = 220;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(bp); bp.connect(g); g.connect(wet); g.connect(dry);
      o.start();
      return { o, g, bp };
    });
  }

  /* ── планировщик ── */
  function tick() {
    const sx = sixteenth();
    while (nextT < ctx.currentTime + 0.25) {
      const t = nextT + (Math.random() - 0.5) * 0.004;
      const d = L.drum;
      if (d > 0.02) {
        if (DOUM[step]) doum(t, DOUM[step] * 0.55 * d);
        if (TEK[step])  tek(t, TEK[step] * 0.5 * d);
        if (step % 2 === 0) shaker(t, (step % 4 === 0 ? 0.07 : 0.045) * d);
      }
      if (step === 0) { bar++; if (bar % 8 === 1 && L.choir > 0.3) bell(t); }
      if (onStep) onStep(step, t, bar);
      step = (step + 1) % 16;
      nextT += sx;
    }
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    cut = ctx.createBiquadFilter();
    cut.type = 'lowpass'; cut.frequency.value = 5200;

    /* Анализатор стоит последним звеном: то, что он показывает, —
       ровно то, что слышно, а не отдельно нарисованная картинка */
    anaOut = ctx.createAnalyser();
    anaOut.fftSize = 2048;
    anaOut.smoothingTimeConstant = 0.72;
    master.connect(cut); cut.connect(anaOut); anaOut.connect(ctx.destination);

    dry = ctx.createGain(); dry.gain.value = 0.85; dry.connect(master);
    const conv = ctx.createConvolver(); conv.buffer = impulse(5.5, 3.2);
    wet = ctx.createGain(); wet.gain.value = 0.5;
    wet.connect(conv); conv.connect(master);

    /* Анализаторы слоёв — тупики: звук в них заходит и дальше не идёт,
       поэтому подключать их к выходу не нужно и ничего не удваивается */
    ['drone', 'drum', 'choir'].forEach((k) => {
      const a = ctx.createAnalyser();
      a.fftSize = 128; a.smoothingTimeConstant = 0.6;
      anaBus[k] = a;
      busBuf[k] = new Uint8Array(a.frequencyBinCount);
    });

    drumBus = ctx.createGain(); drumBus.gain.value = 1;
    drumBus.connect(dry); drumBus.connect(wet); drumBus.connect(anaBus.drum);

    drone(); choir(); string();
    built = true;
  }

  return {
    /* Запуск только из обработчика настоящего клика: иначе браузер
       не даст завести AudioContext */
    start() {
      if (!built) build();
      if (ctx.state === 'suspended') ctx.resume();
      if (!timer) { nextT = ctx.currentTime + 0.12; timer = setInterval(tick, 25); }
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.75, t + 1.2);
    },
    stop(sec = 1.2) {
      if (!built) return;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + sec);
      setTimeout(() => { clearInterval(timer); timer = null; }, sec * 1000 + 60);
    },
    setLayer(name, v) {
      L[name] = Math.max(0, Math.min(1, v));
      if (!built) return;
      const t = ctx.currentTime;
      if (name === 'drone' && droneGain)
        droneGain.gain.setTargetAtTime(L.drone, t, 0.25);
      if (name === 'choir' && choirNodes)
        choirNodes.gain.setTargetAtTime(L.choir * 0.5, t, 0.4);
    },
    layers: L,
    setTempo(v) { bpm = v; },
    tempo: () => bpm,
    /* жар ведёт струну: частота и громкость */
    setHeat(v) {
      heat = Math.max(0, Math.min(1, v));
      if (!built) return;
      const t = ctx.currentTime;
      strVoices.forEach((s, k) => {
        s.o.frequency.setTargetAtTime(180 + heat * heat * 620 + k * 3, t, 0.3);
        s.bp.frequency.setTargetAtTime(700 + heat * 2600, t, 0.3);
        s.g.gain.setTargetAtTime(heat < 0.12 ? 0 : (heat - 0.1) * 0.12, t, 0.3);
      });
      cut.frequency.setTargetAtTime(3600 + heat * 6000, t, 0.4);
    },
    onStep(fn) { onStep = fn; },
    now: () => (ctx ? ctx.currentTime : 0),
    stepLen: sixteenth,

    /* ── что показывать ──
       Всё ниже читается прямо из графа: рисуется настоящий звук,
       а не отдельная анимация, которая просто похожа на него */
    waveSize: () => (anaOut ? anaOut.fftSize : 0),
    freqSize: () => (anaOut ? anaOut.frequencyBinCount : 0),
    readWave(buf) { if (anaOut) anaOut.getByteTimeDomainData(buf); },
    readFreq(buf) { if (anaOut) anaOut.getByteFrequencyData(buf); },
    /* уровень слоя 0…1: среднее по его спектру */
    level(name) {
      const a = anaBus[name], b = busBuf[name];
      if (!a || !b) return 0;
      a.getByteFrequencyData(b);
      let s = 0;
      for (let i = 0; i < b.length; i++) s += b[i];
      return Math.min(1, (s / b.length) / 110);
    },

    /* ── одиночные события ── */
    /* попадание в долю */
    hit(good) {
      if (!built) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(good ? 880 : 440, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(good ? 0.09 : 0.05, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(dry);
      o.start(t); o.stop(t + 0.2);
    },
    /* сбой: короткий срыв, слышно телом */
    slip() {
      if (!built) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(1400, t);
      bp.frequency.exponentialRampToValueAtTime(200, t + 0.28);
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      s.connect(bp); bp.connect(g); g.connect(dry); g.connect(wet);
      s.start(t); s.stop(t + 0.32);
    },
    /* сгорание */
    burn() {
      if (!built) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf(3.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(9000, t);
      lp.frequency.exponentialRampToValueAtTime(120, t + 3.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      s.connect(lp); lp.connect(g); g.connect(dry); g.connect(wet);
      s.start(t); s.stop(t + 3.5);

      /* просадка низа: зал проваливается */
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 2.4);
      og.gain.setValueAtTime(0.35, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(og); og.connect(dry);
      o.start(t); o.stop(t + 2.7);
    }
  };
})();
