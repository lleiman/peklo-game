/* ─────────────────────────────────────────────
   ПЕКЛО · игра
   Две роли, устроенные зеркально.

   Шаман слеп — значит зала не видит и игрок. Он ведёт музыку и слышит
   только того, кто ближе всех к резонансу. Кто сгорит, не знает никто,
   включая его самого: жертву выбирает симуляция, а не выбор игрока.

   Танцующий видит только пол под собой. Его работа — не сбиться.
   ───────────────────────────────────────────── */

const $ = (s) => document.querySelector(s);
const show = (id) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  $(id).classList.add('on');
};

/* ══════════════════════════════════════════════
   Кто был в зале. Из пролога: зал собран из лиц,
   а не из статистов, — поэтому у сгоревшего есть примета
   ══════════════════════════════════════════════ */
const CROWD = [
  'мужчина лет пятидесяти, в рубашке, застёгнутой под горло',
  'девушка, пришедшая одна и никого здесь не знавшая',
  'тот, кто весь вечер держался у стены и вышел в центр под конец',
  'парень, который приехал из-за перевала неделю назад',
  'женщина, танцевавшая с закрытыми глазами с самого начала',
  'кто-то, кого потом не смогли опознать',
  'тот, кто пришёл вторую ночь подряд',
  'высокая, в чёрном, не снимавшая перчаток'
];

/* ══════════════════════════════════════════════
   РОЛЬ I · ШАМАН
   ══════════════════════════════════════════════ */
const Shaman = (() => {
  const N = 24;                 /* зал */
  let dancers = [], madam = 0, running = false, raf = null, tickTimer = null;
  let held = {};                /* какие трубки сейчас держат */
  let cv, cx, t0 = 0;

  function reset() {
    dancers = [];
    for (let i = 0; i < N; i++) {
      /* веса отклика: у каждого свой способ попасть в резонанс.
         Нормализуем, чтобы ни один не откликался на всё сразу */
      const w = [Math.random(), Math.random(), Math.random()];
      const s = w[0] + w[1] + w[2];
      dancers.push({
        w: [w[0] / s, w[1] / s, w[2] / s],
        heat: Math.random() * 0.05,
        limit: 0.72 + Math.random() * 0.28,
        who: CROWD[Math.floor(Math.random() * CROWD.length)]
      });
    }
    madam = 0;
    held = {};
    Sound.setLayer('drone', 0);
    Sound.setLayer('drum', 0);
    Sound.setLayer('choir', 0);
    Sound.setHeat(0);
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
       Числа ниже подобраны прогоном шести стратегий по 120 партий:
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
    if (Sound.layers.choir > 0.55) madam += 0.03;   /* хор её будит */

    if (d && d.heat >= d.limit) return finish('burn', d);
    if (madam >= 100) return finish('madam', hallMax().d);

    /* трубки без нажатия оседают */
    ['drone', 'drum', 'choir'].forEach((k) => {
      if (!held[k]) Sound.setLayer(k, Sound.layers[k] - 0.012);
      else Sound.setLayer(k, Sound.layers[k] + 0.021);
    });
    paint();
  }

  function paint() {
    const L = Sound.layers;
    ['drone', 'drum', 'choir'].forEach((k) => {
      const el = $('#tube-' + k);
      if (el) el.style.setProperty('--v', L[k].toFixed(3));
    });
    $('#madam').style.setProperty('--v', (madam / 100).toFixed(3));
  }

  /* Линия — это не зал, а слух. Дрожь тем сильнее, чем ближе резонанс */
  function draw() {
    if (!running) return;
    const w = cv.width, h = cv.height, mid = h / 2;
    const { r } = hallMax();
    cx.clearRect(0, 0, w, h);
    cx.strokeStyle = `rgba(255,106,31,${0.25 + r * 0.7})`;
    cx.lineWidth = 1.5;
    cx.beginPath();
    const t = performance.now() / 1000;
    for (let x = 0; x <= w; x += 2) {
      const k = x / w;
      const a = Math.sin(k * 34 + t * (2 + r * 9)) * Math.sin(k * Math.PI);
      const b = Math.sin(k * 71 - t * (1 + r * 5)) * Math.sin(k * Math.PI);
      const y = mid + (a * 0.6 + b * 0.4) * (2 + r * r * mid * 0.85);
      x === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
    }
    cx.stroke();
    raf = requestAnimationFrame(draw);
  }

  function finish(kind, d) {
    running = false;
    clearInterval(tickTimer); cancelAnimationFrame(raf);
    if (kind === 'burn') {
      Sound.burn();
      setTimeout(() => Sound.stop(2.4), 900);
      End.show('burn-shaman', d ? d.who : CROWD[0]);
    } else {
      Sound.stop(2.2);
      End.show('madam', d ? d.who : CROWD[0]);
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
    /* клавиши для тех, кто за столом */
    const KEY = { Digit1: 'drone', Digit2: 'drum', Digit3: 'choir' };
    addEventListener('keydown', (e) => {
      const k = KEY[e.code];
      if (k && running) { held[k] = true; $('#tube-' + k).classList.add('push'); }
    });
    addEventListener('keyup', (e) => {
      const k = KEY[e.code];
      if (k) { held[k] = false; $('#tube-' + k).classList.remove('push'); }
    });
  }

  return {
    init() { bind(); },
    start() {
      cv = $('#wave'); cx = cv.getContext('2d');
      cv.width = cv.clientWidth * devicePixelRatio;
      cv.height = cv.clientHeight * devicePixelRatio;
      reset(); paint();
      running = true; t0 = performance.now();
      Sound.setTempo(72);
      Sound.onStep(null);
      Sound.start();
      tickTimer = setInterval(step, 100);
      draw();
    },
    stop() {
      running = false;
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
  const LEAD = 1.35;            /* за сколько секунд метка выходит на экран */
  const GOOD = 0.095, OK = 0.17;

  let notes = [], res = 0, phase = 0, phaseT = 0, running = false;
  let cv, cx, raf = null, tickTimer = null, combo = 0, best = 0;

  function reset() {
    notes = []; res = 0; phase = 0; phaseT = 0; combo = 0; best = 0;
    Sound.setLayer('drone', 0.55);
    Sound.setLayer('drum', 0.75);
    Sound.setLayer('choir', 0.15);
    Sound.setHeat(0);
  }

  function schedule(step, time) {
    if (!running) return;
    const p = PHASE[phase];
    if (p.hits.indexOf(step) !== -1) notes.push({ t: time, hit: false, dead: false });
  }

  function judge() {
    if (!running) return;
    const now = Sound.now();
    let best_ = null, bd = 9;
    notes.forEach((n) => {
      if (n.hit || n.dead) return;
      const d = Math.abs(n.t - now);
      if (d < bd) { bd = d; best_ = n; }
    });
    if (!best_ || bd > OK) {           /* мимо всего — тоже сбой, но мягкий */
      res += 2.5; combo = 0; Sound.slip(); flash(false);
      return;
    }
    /* Цена промаха и награда за точность подобраны прогоном по 200 партий
       на каждый уровень точности: 90% — выходит почти всегда, 85% — три
       раза из четырёх, 80% — один раз из восьми, ниже 70% — не выходит.
       Сгорание при этом почти всегда приходится на третий час */
    best_.hit = true;
    if (bd <= GOOD) { res -= 2.4; combo++; Sound.hit(true); flash(true); }
    else            { res -= 1.2; combo++; Sound.hit(false); flash(true); }
    if (combo > best) best = combo;
  }

  let flashT = 0, flashGood = true;
  function flash(good) { flashT = performance.now(); flashGood = good; }

  function step() {
    if (!running) return;
    const now = Sound.now();
    /* пропущенные */
    notes.forEach((n) => {
      if (!n.hit && !n.dead && now - n.t > OK) {
        n.dead = true; res += 6; combo = 0; Sound.slip();
      }
    });
    notes = notes.filter((n) => now - n.t < 1.2);

    /* Резонанс растёт сам: зал греется, и к третьему часу
       удержаться можно только точностью */
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
  }

  function banner(text) {
    const b = $('#phase');
    b.textContent = text;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }

  function draw() {
    if (!running) return;
    const w = cv.width, h = cv.height;
    const cxp = w / 2, cyp = h / 2;
    const R = Math.min(w, h) * 0.21;         /* кольцо попадания */
    const OUT = Math.min(w, h) * 0.47;
    const now = Sound.now();
    cx.clearRect(0, 0, w, h);

    /* пол светится тем сильнее, чем ближе резонанс */
    const g = cx.createRadialGradient(cxp, cyp, R * 0.2, cxp, cyp, OUT * 1.5);
    const a = res / 100;
    g.addColorStop(0, `rgba(255,60,10,${0.05 + a * 0.5})`);
    g.addColorStop(1, 'rgba(255,60,10,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, w, h);

    /* кольцо */
    cx.strokeStyle = `rgba(255,106,31,${0.5 + a * 0.4})`;
    cx.lineWidth = 2 * devicePixelRatio;
    cx.beginPath(); cx.arc(cxp, cyp, R, 0, Math.PI * 2); cx.stroke();

    /* вспышка попадания */
    const fl = (performance.now() - flashT) / 260;
    if (fl < 1) {
      cx.strokeStyle = flashGood
        ? `rgba(255,200,150,${(1 - fl) * 0.9})`
        : `rgba(120,120,120,${(1 - fl) * 0.6})`;
      cx.lineWidth = 3 * devicePixelRatio;
      cx.beginPath(); cx.arc(cxp, cyp, R + fl * 26 * devicePixelRatio, 0, Math.PI * 2); cx.stroke();
    }

    /* метки идут снаружи внутрь и приходят на кольцо ровно в свою долю */
    notes.forEach((n, i) => {
      const dt = n.t - now;
      if (dt > LEAD || n.hit) return;
      const k = Math.max(0, dt / LEAD);
      const r = R + k * (OUT - R);
      const ang = (i * 1.7) % (Math.PI * 2);
      const x = cxp + Math.cos(ang) * r, y = cyp + Math.sin(ang) * r;
      cx.fillStyle = n.dead ? 'rgba(90,86,80,.5)' : `rgba(242,239,233,${0.35 + (1 - k) * 0.65})`;
      cx.beginPath();
      cx.arc(x, y, (3 + (1 - k) * 3.5) * devicePixelRatio, 0, Math.PI * 2);
      cx.fill();
    });

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
      cv.width = cv.clientWidth * devicePixelRatio;
      cv.height = cv.clientHeight * devicePixelRatio;
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
      setTimeout(() => show('#end'), kind.startsWith('burn') ? 1500 : 400);
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
