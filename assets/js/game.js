/* ─────────────────────────────────────────────
   ПЕКЛО · игра
   Две роли, устроенные зеркально.

   Шаман слеп, но не глух: библия описывает, как он чувствует одну среди
   сотен — каждую пору, каждый удар сердца, свет под кожей. Поэтому зал
   он воспринимает и зал виден игроку. Запрещено ему не восприятие,
   а выбор: кто попадёт в резонанс, решает симуляция. Кликать по залу
   нельзя и не будет можно — иначе весь механизм романа рассыпается.

   Танцующий видит только пол под собой. Его работа — не сбиться.
   ───────────────────────────────────────────── */

const $ = (s) => document.querySelector(s);
const show = (id) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  $(id).classList.add('on');
};
const DPR = () => Math.min(devicePixelRatio || 1, 2);

/* Кто был в зале. Из пролога: зал собран из лиц, а не из статистов, —
   поэтому у сгоревшего есть примета */
const CROWD = [
  'мужчина лет пятидесяти, в рубашке, застёгнутой под горло',
  'девушка, пришедшая одна и никого здесь не знавшая',
  'тот, кто весь вечер держался у стены и вышел в центр под конец',
  'парень, приехавший из-за перевала неделю назад',
  'женщина, танцевавшая с закрытыми глазами с самого начала',
  'кто-то, кого потом не смогли опознать',
  'тот, кто пришёл вторую ночь подряд',
  'высокая, в чёрном, не снимавшая перчаток'
];

/* ══════════════════════════════════════════════
   РОЛЬ I · ШАМАН
   ══════════════════════════════════════════════ */
const Shaman = (() => {
  const N = 24;
  let dancers = [], madam = 0, running = false, raf = null, tickTimer = null;
  let held = {}, mode = 'near', burning = null, t0 = 0;
  let hall, hx, scope, sx_;
  let wbuf = null, fbuf = null;

  function reset() {
    dancers = [];
    for (let i = 0; i < N; i++) {
      /* веса отклика: у каждого свой способ попасть в резонанс */
      const w = [Math.random(), Math.random(), Math.random()];
      const s = w[0] + w[1] + w[2];
      dancers.push({
        w: [w[0] / s, w[1] / s, w[2] / s],
        heat: Math.random() * 0.05,
        limit: 0.72 + Math.random() * 0.28,
        who: CROWD[Math.floor(Math.random() * CROWD.length)],
        /* собственное сердце: у каждого свой ритм и своя фаза */
        phase: Math.random() * Math.PI * 2,
        rate: 0.75 + Math.random() * 0.35,
        px: 0, py: 0, seed: Math.random()
      });
    }
    layout();
    madam = 0; held = {}; burning = null;
    Sound.setLayer('drone', 0); Sound.setLayer('drum', 0); Sound.setLayer('choir', 0);
    Sound.setHeat(0);
  }

  /* Россыпь по залу: кольцо с разбросом, чтобы не читалось решёткой */
  function layout() {
    const w = hall.width, h = hall.height;
    dancers.forEach((d, i) => {
      const a = (i / N) * Math.PI * 2 + d.seed * 0.5;
      const rr = (0.28 + d.seed * 0.52);
      d.px = w / 2 + Math.cos(a) * rr * w * 0.42;
      d.py = h / 2 + Math.sin(a) * rr * h * 0.40;
    });
  }

  function hallMax() {
    let m = 0, who = null;
    dancers.forEach((d) => { const r = d.heat / d.limit; if (r > m) { m = r; who = d; } });
    return { r: m, d: who };
  }

  function step() {
    const L = Sound.layers;
    const total = L.drone + L.drum + L.choir;
    /* Перебор громкости зал не разогревает, а разгоняет: когда давит всё
       сразу, танцевать невозможно и люди расходятся к стенам.
       Числа подобраны прогоном шести стратегий по 120 партий:
       держать пару слоёв — победа за 42 с, менять пары — 98% за 64 с,
       давить всё, тыкать наугад или не жать ничего — Мадам за 62–65 с */
    const scatter = total > 2.3 ? 2.6 : 1;

    dancers.forEach((d) => {
      const drive = L.drone * d.w[0] + L.drum * d.w[1] + L.choir * d.w[2];
      d.heat += drive * 0.0028 - 0.0007 * scatter;
      if (d.heat < 0) d.heat = 0;
    });

    const { r, d } = hallMax();
    Sound.setHeat(r);

    /* Мадам сверху: её терпения хватает примерно на 80 секунд,
       и холодный зал она терпит хуже всего */
    madam += (r < 0.35 ? 0.155 : 0.115);
    if (L.choir > 0.55) madam += 0.03;

    if (d && d.heat >= d.limit) return finish('burn', d);
    if (madam >= 100) return finish('madam', d);

    ['drone', 'drum', 'choir'].forEach((k) => {
      Sound.setLayer(k, Sound.layers[k] + (held[k] ? 0.021 : -0.012));
    });
    $('#madam').style.setProperty('--v', (madam / 100).toFixed(3));
  }

  /* ── зал ──
     Не фигурки людей: отклики. Каждый пульсирует своим сердцем, тем чаще
     и ярче, чем ближе к порогу. Клика по ним нет намеренно */
  function drawHall(now) {
    const w = hall.width, h = hall.height, dpr = DPR();
    hx.clearRect(0, 0, w, h);
    const top = hallMax();

    dancers.forEach((d) => {
      const k = d.heat / d.limit;                 /* 0…1 близость к порогу */
      const isTop = d === top.d;

      /* режимы видимости зала */
      let vis = 1;
      if (mode === 'near') vis = isTop ? 1 : (k > 0.45 ? (k - 0.45) * 1.4 : 0);
      else if (mode === 'dim') vis = isTop ? 1 : 0.18;
      if (vis <= 0.01) return;

      const beat = 0.5 + 0.5 * Math.sin(now * (d.rate + k * 2.4) * 6.28 + d.phase);
      const base = (2.6 + k * 7) * dpr;
      const r = base * (1 + beat * (0.25 + k * 0.5));

      /* свет под кожей: к порогу отклик наливается изнутри */
      const g = hx.createRadialGradient(d.px, d.py, 0, d.px, d.py, r * 3.4);
      g.addColorStop(0, `rgba(255,${170 - k * 90},${120 - k * 100},${(0.16 + k * 0.84) * vis})`);
      g.addColorStop(0.4, `rgba(255,106,31,${(0.08 + k * 0.5) * vis})`);
      g.addColorStop(1, 'rgba(255,106,31,0)');
      hx.fillStyle = g;
      hx.beginPath(); hx.arc(d.px, d.py, r * 3.4, 0, 6.2832); hx.fill();

      hx.fillStyle = `rgba(${200 + k * 55},${170 - k * 60},${150 - k * 110},${(0.35 + k * 0.65) * vis})`;
      hx.beginPath(); hx.arc(d.px, d.py, r, 0, 6.2832); hx.fill();

      /* тот, кого ведёшь, обведён тонким кольцом — «среди сотен именно её» */
      if (isTop && k > 0.12) {
        hx.strokeStyle = `rgba(255,106,31,${0.2 + k * 0.5})`;
        hx.lineWidth = dpr;
        hx.beginPath(); hx.arc(d.px, d.py, r + 9 * dpr + beat * 3 * dpr, 0, 6.2832); hx.stroke();
      }
    });

    /* сгорание: вспышка, потом пепел, потом его снимают */
    if (burning) {
      const t = (performance.now() - burning.t0) / 1000;
      const d = burning.d;
      if (t < 0.4) {
        const a = 1 - t / 0.4;
        hx.fillStyle = `rgba(255,246,235,${a})`;
        hx.beginPath(); hx.arc(d.px, d.py, (10 + t * 190) * dpr, 0, 6.2832); hx.fill();
      } else if (t < 1.8) {
        const a = 1 - (t - 0.4) / 1.4;
        hx.strokeStyle = `rgba(255,106,31,${a * 0.8})`;
        hx.lineWidth = 2 * dpr;
        hx.beginPath(); hx.arc(d.px, d.py, (30 + (t - 0.4) * 70) * dpr, 0, 6.2832); hx.stroke();
      }
      if (t > 0.4) {
        const fade = t < 2.6 ? 1 : Math.max(0, 1 - (t - 2.6) / 0.8);   /* Бродяги */
        hx.fillStyle = `rgba(140,134,126,${0.5 * fade})`;
        hx.beginPath(); hx.arc(d.px, d.py, 7 * dpr, 0, 6.2832); hx.fill();
      }
    }
  }

  /* ── осциллограмма и спектр ──
     Читается прямо с выхода: это ровно то, что слышно */
  function drawScope() {
    const w = scope.width, h = scope.height, dpr = DPR();
    sx_.clearRect(0, 0, w, h);
    if (!wbuf) return;

    /* спектр силуэтом снизу: видно, чем занят каждый слой */
    Sound.readFreq(fbuf);
    sx_.beginPath();
    sx_.moveTo(0, h);
    const n = Math.min(fbuf.length, 220);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const v = fbuf[i] / 255;
      sx_.lineTo(x, h - v * h * 0.92);
    }
    sx_.lineTo(w, h);
    sx_.closePath();
    sx_.fillStyle = 'rgba(255,106,31,.13)';
    sx_.fill();

    /* осциллограмма поверх */
    Sound.readWave(wbuf);
    sx_.beginPath();
    const m = wbuf.length;
    for (let i = 0; i < m; i += 2) {
      const x = (i / m) * w;
      const y = h / 2 + ((wbuf[i] - 128) / 128) * h * 0.44;
      i === 0 ? sx_.moveTo(x, y) : sx_.lineTo(x, y);
    }
    sx_.strokeStyle = 'rgba(242,239,233,.55)';
    sx_.lineWidth = 1.1 * dpr;
    sx_.stroke();
  }

  function draw() {
    if (!running && !burning) return;
    const now = performance.now() / 1000;
    drawHall(now);
    drawScope();
    /* трубки светятся своим звуком, а не своим значением */
    ['drone', 'drum', 'choir'].forEach((k) => {
      const el = $('#tube-' + k);
      el.style.setProperty('--v', Sound.layers[k].toFixed(3));
      el.style.setProperty('--lv', Sound.level(k).toFixed(3));
    });
    raf = requestAnimationFrame(draw);
  }

  function finish(kind, d) {
    running = false;
    clearInterval(tickTimer);
    const victim = d || dancers[0];
    if (kind === 'burn') {
      burning = { d: victim, t0: performance.now() };
      Sound.burn();
      setTimeout(() => Sound.stop(2.4), 900);
      setTimeout(() => { cancelAnimationFrame(raf); burning = null;
        End.show('burn-shaman', victim.who); }, 3400);
    } else {
      cancelAnimationFrame(raf);
      Sound.stop(2.2);
      End.show('madam', victim.who);
    }
  }

  function bind() {
    ['drone', 'drum', 'choir'].forEach((k) => {
      const el = $('#tube-' + k);
      const down = (e) => { e.preventDefault(); held[k] = true; el.classList.add('push'); };
      const up = () => { held[k] = false; el.classList.remove('push'); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    });
    const KEY = { Digit1: 'drone', Digit2: 'drum', Digit3: 'choir' };
    addEventListener('keydown', (e) => {
      const k = KEY[e.code];
      if (k && running) { held[k] = true; $('#tube-' + k).classList.add('push'); }
    });
    addEventListener('keyup', (e) => {
      const k = KEY[e.code];
      if (k) { held[k] = false; $('#tube-' + k).classList.remove('push'); }
    });
    document.querySelectorAll('.modes .m').forEach((b) => {
      b.addEventListener('click', () => {
        mode = b.dataset.mode;
        document.querySelectorAll('.modes .m').forEach((x) => x.classList.toggle('on', x === b));
      });
    });
  }

  function fit(c) {
    c.width = c.clientWidth * DPR();
    c.height = c.clientHeight * DPR();
  }

  return {
    init() { bind(); },
    start() {
      hall = $('#hall'); hx = hall.getContext('2d');
      scope = $('#scope'); sx_ = scope.getContext('2d');
      fit(hall); fit(scope);
      reset();
      running = true; t0 = performance.now();
      Sound.setTempo(72);
      Sound.onStep(null);
      Sound.start();
      wbuf = new Uint8Array(Sound.waveSize());
      fbuf = new Uint8Array(Sound.freqSize());
      tickTimer = setInterval(step, 100);
      /* короткая подсказка на первые секунды */
      $('#shaman').classList.add('teach');
      setTimeout(() => $('#shaman').classList.remove('teach'), 9000);
      draw();
    },
    stop() {
      running = false; burning = null;
      clearInterval(tickTimer); cancelAnimationFrame(raf);
    }
  };
})();

/* ══════════════════════════════════════════════
   РОЛЬ II · ТАНЦУЮЩИЙ
   ══════════════════════════════════════════════ */
const Dancer = (() => {
  /* Три часа танца из пролога — три фазы. Рисунок ударов по шестнадцатым */
  const PHASE = [
    { sec: 30, bpm: 72, hits: [0, 4, 8, 12],                 gain: 0.10, name: 'первый час' },
    { sec: 34, bpm: 80, hits: [0, 4, 6, 8, 12, 14],          gain: 0.20, name: 'второй час' },
    { sec: 38, bpm: 92, hits: [0, 3, 4, 8, 10, 11, 12, 14],  gain: 0.36, name: 'третий час' }
  ];
  const LEAD = 1.35;
  const GOOD = 0.095, OK = 0.17;

  let notes = [], res = 0, phase = 0, phaseT = 0, running = false;
  let cv, cx, raf = null, tickTimer = null, combo = 0, best = 0;
  let flashT = -9, flashGood = true, judgeText = '', judgeT = -9;

  function reset() {
    notes = []; res = 0; phase = 0; phaseT = 0; combo = 0; best = 0;
    flashT = -9; judgeT = -9;
    Sound.setLayer('drone', 0.55);
    Sound.setLayer('drum', 0.75);
    Sound.setLayer('choir', 0.15);
    Sound.setHeat(0);
  }

  function schedule(step, time) {
    if (!running) return;
    if (PHASE[phase].hits.indexOf(step) !== -1) notes.push({ t: time, hit: false, dead: false });
  }

  function say(text, good) {
    judgeText = text; judgeT = performance.now();
    flashT = performance.now(); flashGood = good;
  }

  function judge() {
    if (!running) return;
    const now = Sound.now();
    let pick = null, bd = 9;
    notes.forEach((n) => {
      if (n.hit || n.dead) return;
      const d = Math.abs(n.t - now);
      if (d < bd) { bd = d; pick = n; }
    });
    if (!pick || bd > OK) { res += 2.5; combo = 0; Sound.slip(); say('мимо', false); return; }
    /* Цена промаха и награда за точность подобраны прогоном по 200 партий
       на уровень точности: 90% — выходит почти всегда, 85% — три раза
       из четырёх, 80% — раз из восьми, ниже 70% — не выходит.
       Сгорание при этом почти всегда приходится на третий час */
    pick.hit = true;
    if (bd <= GOOD) { res -= 2.4; combo++; Sound.hit(true); say('в такт', true); }
    else            { res -= 1.2; combo++; Sound.hit(false); say('почти', true); }
    if (combo > best) best = combo;
  }

  function step() {
    if (!running) return;
    const now = Sound.now();
    notes.forEach((n) => {
      if (!n.hit && !n.dead && now - n.t > OK) {
        n.dead = true; res += 6; combo = 0; Sound.slip(); say('сбился', false);
      }
    });
    notes = notes.filter((n) => now - n.t < 1.2);

    res += PHASE[phase].gain;
    if (res < 0) res = 0;
    Sound.setHeat(Math.min(1, res / 100));

    phaseT += 0.1;
    if (phaseT >= PHASE[phase].sec) {
      if (phase === PHASE.length - 1) return finish('out');
      phase++; phaseT = 0;
      Sound.setTempo(PHASE[phase].bpm);
      Sound.setLayer('choir', 0.15 + phase * 0.22);
      banner(PHASE[phase].name);
    }
    if (res >= 100) return finish('burn');
    $('#res').style.setProperty('--v', (res / 100).toFixed(3));
    $('#combo').textContent = combo > 2 ? combo + ' подряд' : '';
  }

  function banner(text) {
    const b = $('#phase');
    b.textContent = text;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }

  function draw() {
    if (!running) return;
    const w = cv.width, h = cv.height, dpr = DPR();
    const cxp = w / 2, cyp = h / 2;
    const R = Math.min(w, h) * 0.21;
    const OUT = Math.min(w, h) * 0.47;
    const now = Sound.now();
    const a = res / 100;
    cx.clearRect(0, 0, w, h);

    /* пол дышит настоящим битом: уровень берётся с шины ударных */
    const kick = Sound.level('drum');

    const g = cx.createRadialGradient(cxp, cyp, R * 0.2, cxp, cyp, OUT * 1.6);
    g.addColorStop(0, `rgba(255,60,10,${0.05 + a * 0.5 + kick * 0.1})`);
    g.addColorStop(1, 'rgba(255,60,10,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, w, h);

    cx.strokeStyle = `rgba(255,106,31,${0.5 + a * 0.4})`;
    cx.lineWidth = (2 + kick * 3) * dpr;
    cx.beginPath(); cx.arc(cxp, cyp, R * (1 + kick * 0.04), 0, 6.2832); cx.stroke();

    const fl = (performance.now() - flashT) / 260;
    if (fl < 1) {
      cx.strokeStyle = flashGood
        ? `rgba(255,200,150,${(1 - fl) * 0.9})`
        : `rgba(150,60,40,${(1 - fl) * 0.8})`;
      cx.lineWidth = 3 * dpr;
      cx.beginPath(); cx.arc(cxp, cyp, R + fl * 26 * dpr, 0, 6.2832); cx.stroke();
    }

    notes.forEach((n, i) => {
      const dt = n.t - now;
      if (dt > LEAD || n.hit) return;
      const k = Math.max(0, dt / LEAD);
      const r = R + k * (OUT - R);
      const ang = (i * 1.7) % 6.2832;
      const x = cxp + Math.cos(ang) * r, y = cyp + Math.sin(ang) * r;
      cx.fillStyle = n.dead ? 'rgba(90,86,80,.5)' : `rgba(242,239,233,${0.35 + (1 - k) * 0.65})`;
      cx.beginPath();
      cx.arc(x, y, (3 + (1 - k) * 3.5) * dpr, 0, 6.2832);
      cx.fill();
    });

    /* оценка последнего нажатия — крупно, в центре кольца */
    const jt = (performance.now() - judgeT) / 700;
    if (jt < 1 && judgeText) {
      cx.font = `${11 * dpr}px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = flashGood
        ? `rgba(242,239,233,${(1 - jt) * 0.75})`
        : `rgba(196,113,60,${(1 - jt) * 0.9})`;
      cx.fillText(judgeText.toUpperCase(), cxp, cyp);
    }

    raf = requestAnimationFrame(draw);
  }

  function finish(kind) {
    running = false;
    clearInterval(tickTimer); cancelAnimationFrame(raf);
    Sound.onStep(null);
    if (kind === 'burn') {
      Sound.burn();
      setTimeout(() => Sound.stop(2.4), 900);
      End.show('burn-dancer', null, best);
    } else {
      Sound.stop(2.6);
      End.show('out', null, best);
    }
  }

  return {
    init() {
      addEventListener('keydown', (e) => {
        if (running && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); judge(); }
      });
      /* Слушатель вешается один раз, а не при каждом заходе: иначе после
         второй партии каждый тап считался бы дважды */
      $('#floorwrap').addEventListener('pointerdown', (e) => {
        if (running) { e.preventDefault(); judge(); }
      });
    },
    start() {
      cv = $('#floor'); cx = cv.getContext('2d');
      cv.width = cv.clientWidth * DPR();
      cv.height = cv.clientHeight * DPR();
      reset();
      running = true;
      Sound.setTempo(PHASE[0].bpm);
      Sound.onStep(schedule);
      Sound.start();
      banner(PHASE[0].name);
      tickTimer = setInterval(step, 100);
      draw();
    },
    stop() {
      running = false;
      clearInterval(tickTimer); cancelAnimationFrame(raf);
      Sound.onStep(null);
    }
  };
})();

/* ══════════════════════════════════════════════
   Финалы. Голос тот же, что в романе: без утешения
   ══════════════════════════════════════════════ */
const End = (() => {
  const CARD = {
    'burn-shaman': {
      kick: 'зал',
      title: 'Кто-то сбился',
      body: (who) => `Это был ${who}.<br><br>Ты вёл музыку и не выбирал. Он попал в резонанс первым — свет прошёл под кожей раньше, чем кто-нибудь понял, что происходит. Бродяги собрали пепел за минуту.<br><br>Наверху замолчали. До следующей ночи.`
    },
    'madam': {
      kick: 'сверху',
      title: 'Она выбрала за тебя',
      body: () => 'Ты держал зал слишком холодным, и терпение наверху кончилось. Голос прошёл сквозь Организм, минуя твои руки.<br><br>Кто сгорел, ты узнал вместе со всеми. Это и есть проигрыш: не смерть в зале, а то, что она случилась не через тебя.'
    },
    'burn-dancer': {
      kick: 'пол',
      title: 'Ты сбился',
      body: (_, best) => `Один раз мимо ритма — и дальше уже не догнать. Кожа пошла светом раньше, чем пришла боль.<br><br>Дольше всего ты держался ${best} ударов подряд.<br><br>Пепел забрали раньше, чем зал успел отойти к стенам.`
    },
    'out': {
      kick: 'утро',
      title: 'Ты вышел',
      body: (_, best) => `Три часа, и ни разу не выпал надолго. К утру все расходятся истощёнными, но живыми.<br><br>Лучшая серия — ${best} ударов подряд.<br><br>Сегодня не сгорел никто. Все чувствуют, что это ненадолго.`
    }
  };

  return {
    show(kind, who, best) {
      const c = CARD[kind];
      $('#end-kick').textContent = c.kick;
      $('#end-title').textContent = c.title;
      $('#end-body').innerHTML = c.body(who, best);
      setTimeout(() => show('#end'), kind === 'burn-dancer' ? 1500 : 300);
    }
  };
})();

/* ══════════════════════════════════════════════
   Ворота, выбор роли, переходы
   ══════════════════════════════════════════════ */
(() => {
  const root = document.documentElement;
  root.classList.add('gated');

  $('#gate').addEventListener('click', () => {
    $('#gate').classList.add('gone');
    root.classList.remove('gated');
    setTimeout(() => { $('#gate').remove(); show('#pick'); }, 700);
  });

  Shaman.init();
  Dancer.init();

  $('#pick-shaman').addEventListener('click', () => { show('#shaman'); Shaman.start(); });
  $('#pick-dancer').addEventListener('click', () => { show('#dancer'); Dancer.start(); });

  document.querySelectorAll('.again').forEach((b) =>
    b.addEventListener('click', () => { Sound.stop(0.4); show('#pick'); }));

  document.querySelectorAll('.quit').forEach((b) =>
    b.addEventListener('click', () => {
      Shaman.stop(); Dancer.stop(); Sound.stop(0.5); show('#pick');
    }));
})();
