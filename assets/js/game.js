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

  /* Вариант партии: 'hold' — держать трубки (первый, самый простой),
     'field' — вести Организм по полю настройки. Во втором жар идёт
     не от громкости, а от совпадения: резонанс — это попадание
     в чужую частоту, а не давление на неё */
  let variant = 'hold';
  let f = { x: 0.5, y: 0.5 }, pf = { x: 0.5, y: 0.5 }, madPt = null, madT = 0;
  let pad, px_, padOn = false;
  /* вариант «ритм»: уровни слоёв поднимаются попаданиями и оседают сами */
  let bl = [0, 0, 0], beatBar = 0;
  let look = 0;   /* способ видеть: меняется по ходу партии */

  /* Константы поля подобраны прогоном пяти стратегий по 80 партий:
     стоять на месте — проигрыш, дёргаться — проигрыш, медленный обход —
     проигрыш, точное слежение — победа за 58 с, неточное — за 73 с */
  const F = { range: 0.26, gain: 0.0042, cool: 0.0028, drift: 0.0022,
              jerkAt: 0.035, jerkK: 3, mSlow: 0.085, mFast: 0.30 };

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
        px: 0, py: 0, seed: Math.random(),
        /* своя точка в поле настройки и медленный дрейф: тело устаёт,
           совпадение уходит, и его приходится вести */
        tx: Math.random(), ty: Math.random(),
        vx: (Math.random() - 0.5) * F.drift, vy: (Math.random() - 0.5) * F.drift
      });
    }
    layout();
    madam = 0; held = {}; burning = null;
    f = { x: 0.5, y: 0.5 }; pf = { x: 0.5, y: 0.5 }; madPt = null; madT = 0;
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

  /* ── вариант «настройка» ──
     Жар идёт от совпадения точки Организма с точкой тела, а не от
     громкости. Поэтому держать всё на максимуме бессмысленно само по
     себе: это угол поля, где почти никого нет */
  function stepField() {
    madT += 0.1;
    /* Мадам поёт раз в пятнадцать секунд и висит восемь */
    if (madT >= 15) { madT = 0; madPt = { x: Math.random(), y: Math.random(), left: 8 }; }
    if (madPt) { madPt.left -= 0.1; if (madPt.left <= 0) madPt = null; }

    /* рваная музыка роняет весь зал: под неё не танцуют */
    const jerk = Math.hypot(f.x - pf.x, f.y - pf.y) > F.jerkAt ? F.jerkK : 1;
    pf = { x: f.x, y: f.y };

    /* рядом с её нотой жар сильнее, но и она набирает быстрее */
    let mm = 1, mrate = F.mSlow;
    if (madPt && Math.hypot(f.x - madPt.x, f.y - madPt.y) < 0.2) { mm = 1.6; mrate = F.mFast; }

    dancers.forEach((d) => {
      d.tx += d.vx; d.ty += d.vy;
      if (d.tx <= 0 || d.tx >= 1) d.vx *= -1;
      if (d.ty <= 0 || d.ty >= 1) d.vy *= -1;
      d.tx = Math.max(0, Math.min(1, d.tx)); d.ty = Math.max(0, Math.min(1, d.ty));
      const g = Math.max(0, 1 - Math.hypot(f.x - d.tx, f.y - d.ty) / F.range);
      d.heat = Math.max(0, d.heat + g * F.gain * mm - F.cool * jerk);
    });

    const { r, d } = hallMax();
    Sound.setHeat(r);
    /* положение в поле ведёт сам звук: низ ↔ верх, плотно ↔ разреженно */
    Sound.setLayer('drone', 0.25 + (1 - f.y) * 0.7);
    Sound.setLayer('drum', 0.2 + f.x * 0.75);
    Sound.setLayer('choir', 0.1 + f.y * 0.6);

    madam += (r < 0.35 ? F.mSlow * 1.5 : mrate);
    if (d && d.heat >= d.limit) return finish('burn', d);
    if (madam >= 100) return finish('madam', d);
    $('#madam').style.setProperty('--v', (madam / 100).toFixed(3));
  }

  /* ── вариант «ритм» ──
     Шаман не держит слой, а играет его: нота пришла — ударил, длинная
     нота — тянешь. Пока слой звучит, зал по нему греется.
     Числа подобраны прогоном по 150 партий на уровень точности:
     100% — победа за 56 с, 90% — 97% за 61 с, 80% — 81% за 65 с,
     65% — 21%, ниже половины — никогда. Первый подбор давал победу
     даже при 40% точности за двадцать секунд, то есть игры не было */
  function stepBeat() {
    bl = bl.map((v) => Math.max(0, v - 0.045));
    Sound.setLayer('drone', bl[0]);
    Sound.setLayer('drum',  bl[1]);
    Sound.setLayer('choir', bl[2]);

    const total = bl[0] + bl[1] + bl[2];
    const scatter = total > 2.3 ? 2.6 : 1;
    dancers.forEach((d) => {
      const drive = bl[0] * d.w[0] + bl[1] * d.w[1] + bl[2] * d.w[2];
      d.heat += drive * 0.0030 - 0.0007 * scatter;
      if (d.heat < 0) d.heat = 0;
    });

    const { r, d } = hallMax();
    Sound.setHeat(r);
    madam += (r < 0.35 ? 0.155 : 0.115);
    if (d && d.heat >= d.limit) return finish('burn', d);
    if (madam >= 100) return finish('madam', d);
    $('#madam').style.setProperty('--v', (madam / 100).toFixed(3));
  }

  function step() {
    if (variant === 'field') return stepField();
    if (variant === 'beat') return stepBeat();
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

      /* Свет под кожей уходит в слой WebGL: там он складывается и
         размывается сам в себя. Без него остаётся 2D-запаска */
      if (Glow.ready()) {
        Glow.blob(d.px, d.py, r * 3.6, k * vis);
      } else {
        const g = hx.createRadialGradient(d.px, d.py, 0, d.px, d.py, r * 3.4);
        g.addColorStop(0, `rgba(255,${170 - k * 90},${120 - k * 100},${(0.16 + k * 0.84) * vis})`);
        g.addColorStop(1, 'rgba(255,106,31,0)');
        hx.fillStyle = g;
        hx.beginPath(); hx.arc(d.px, d.py, r * 3.4, 0, 6.2832); hx.fill();
        hx.fillStyle = `rgba(${200 + k * 55},${170 - k * 60},${150 - k * 110},${(0.35 + k * 0.65) * vis})`;
        hx.beginPath(); hx.arc(d.px, d.py, r, 0, 6.2832); hx.fill();
      }

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
      if (t < 0.4 && !Glow.ready()) {
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

  /* ── поле настройки ──
     Стоит отдельно от зала и никогда на него не накладывается: водить
     точку по головам читалось бы как прицеливание, а выбирать жертву
     нельзя. Ты настраиваешь Организм, зал — следствие */
  function drawPad() {
    const w = pad.width, h = pad.height, dpr = DPR();
    px_.clearRect(0, 0, w, h);
    px_.strokeStyle = 'rgba(30,28,25,1)'; px_.lineWidth = dpr;
    px_.strokeRect(0.5, 0.5, w - 1, h - 1);
    for (let i = 1; i < 4; i++) {
      px_.beginPath();
      px_.moveTo((w / 4) * i, 0); px_.lineTo((w / 4) * i, h);
      px_.moveTo(0, (h / 4) * i); px_.lineTo(w, (h / 4) * i);
      px_.stroke();
    }
    /* её нота */
    if (madPt) {
      const g = px_.createRadialGradient(madPt.x * w, madPt.y * h, 0, madPt.x * w, madPt.y * h, 0.2 * w);
      g.addColorStop(0, 'rgba(160,106,154,.5)');
      g.addColorStop(1, 'rgba(160,106,154,0)');
      px_.fillStyle = g;
      px_.beginPath(); px_.arc(madPt.x * w, madPt.y * h, 0.2 * w, 0, 6.2832); px_.fill();
    }
    /* точка Организма и её радиус совпадения */
    px_.strokeStyle = 'rgba(255,106,31,.35)'; px_.lineWidth = dpr;
    px_.beginPath(); px_.arc(f.x * w, f.y * h, F.range * w * 0.5, 0, 6.2832); px_.stroke();
    px_.fillStyle = 'rgba(255,106,31,1)';
    px_.beginPath(); px_.arc(f.x * w, f.y * h, 5 * dpr, 0, 6.2832); px_.fill();
  }

  let lastT = 0;
  function draw() {
    if (!running && !burning) return;
    const now = performance.now() / 1000;
    const dt = lastT ? Math.min(0.05, now - lastT) : 0.016;
    lastT = now;
    /* помещение рисуется первым и заполняет кадр целиком */
    look += dt * 0.055;
    if (Room.ready()) {
      Room.draw(hall.width, hall.height, {
        t: now, heat: hallMax().r, pulse: Sound.level('drum'),
        look: look, shake: burning ? 0.5 : 0
      });
    }
    if (Glow.ready()) { Glow.resize(hall.width, hall.height); Glow.begin(); }
    drawHall(now);
    /* пепел в воздухе зала: его тут и собирают */
    Ash.step(dt, 0);
    Ash.draw(hx, hall.width, hall.height);
    if (Glow.ready()) { Glow.step(dt); Glow.end(1.5); }
    drawScope();
    if (variant === 'field' && pad) drawPad();
    if (variant === 'beat' && pad) { Lanes.step(dt); Lanes.draw(); }
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
      if (Glow.ready()) Glow.burst(victim.px, victim.py, 70);
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

  /* Чарт Шамана: дарбука идёт из настоящего рисунка ударных, дрон и хор —
     длинные ноты, которые надо тянуть. Это и есть бывшее «удержание»,
     но теперь у него есть момент начала и конца */
  function beatChart(stp, time, bar) {
    const p = Sound.patterns();
    if (p.doum[stp] !== undefined || p.tek[stp] !== undefined) Lanes.push(1, time, 0);
    if (stp === 0 && bar !== beatBar) {
      beatBar = bar;
      if (bar % 2 === 1) Lanes.push(0, time, 2.4);
      if (bar % 4 === 2) Lanes.push(2, time, 1.8);
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
    const LANE = { Digit1: 0, Digit2: 1, Digit3: 2 };
    addEventListener('keydown', (e) => {
      if (!running) return;
      if (variant === 'beat') {
        const l = LANE[e.code];
        if (l !== undefined && !e.repeat) { e.preventDefault(); Lanes.press(l); }
        return;
      }
      const k = KEY[e.code];
      if (k) { held[k] = true; $('#tube-' + k).classList.add('push'); }
    });
    addEventListener('keyup', (e) => {
      if (variant === 'beat') {
        const l = LANE[e.code];
        if (l !== undefined) Lanes.release(l);
        return;
      }
      const k = KEY[e.code];
      if (k) { held[k] = false; $('#tube-' + k).classList.remove('push'); }
    });
    document.querySelectorAll('.modes .m').forEach((b) => {
      b.addEventListener('click', () => {
        mode = b.dataset.mode;
        document.querySelectorAll('.modes .m').forEach((x) => x.classList.toggle('on', x === b));
      });
    });

    /* поле настройки: точка идёт за пальцем, но резкие рывки наказываются
       в самой механике, а не запретом — вести приходится плавно */
    const p = $('#pad');
    const at = (e) => {
      const r = p.getBoundingClientRect();
      f.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      f.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    };
    const laneOf = (e) => {
      const r = p.getBoundingClientRect();
      return Lanes.laneAt((e.clientX - r.left) / r.width);
    };
    p.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (variant === 'beat') { if (running) Lanes.press(laneOf(e)); return; }
      padOn = true; at(e);
    });
    p.addEventListener('pointermove', (e) => { if (padOn && variant === 'field') at(e); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      p.addEventListener(ev, (e) => {
        padOn = false;
        if (variant === 'beat' && running) Lanes.release(laneOf(e));
      }));
    addEventListener('keydown', (e) => {
      if (!running || variant !== 'field') return;
      const s = 0.03;
      if (e.code === 'ArrowLeft')  f.x = Math.max(0, f.x - s);
      if (e.code === 'ArrowRight') f.x = Math.min(1, f.x + s);
      if (e.code === 'ArrowUp')    f.y = Math.max(0, f.y - s);
      if (e.code === 'ArrowDown')  f.y = Math.min(1, f.y + s);
    });
  }

  function fit(c) {
    c.width = c.clientWidth * DPR();
    c.height = c.clientHeight * DPR();
  }

  return {
    init() { bind(); },
    start(v) {
      variant = v || 'hold';
      $('#shaman').classList.toggle('v-field', variant === 'field');
      $('#shaman').classList.toggle('v-beat', variant === 'beat');
      $('#sh-tip').textContent =
        variant === 'field' ? 'Веди точку Организма по полю. Жар идёт от совпадения, а не от громкости: попал в чужую частоту — он греется. Цель уходит, её надо вести. Дёргаться нельзя — под рваную музыку не танцуют.'
      : variant === 'beat' ? 'Играй Организм: нота пришла — бей, длинная нота — тяни. Клавиши 1 2 3 или пальцем по своей трети поля. Пока слой звучит, зал по нему греется.'
      : 'Держи трубку — слой растёт и слышен в спектре. Отпустишь — оседает. Дави всем сразу, и зал разойдётся к стенам.';
      hall = $('#hall'); hx = hall.getContext('2d');
      scope = $('#scope'); sx_ = scope.getContext('2d');
      pad = $('#pad'); px_ = pad.getContext('2d');
      fit(hall); fit(scope); fit(pad);
      /* три слоя: помещение, свечение откликов, 2D поверх.
         Если WebGL2 нет, остаётся только 2D — игра работает */
      Room.init($('#hall-room'));
      Glow.init($('#hall-gl'));
      Ash.init(90);
      look = 0;
      lastT = 0;
      bl = [0, 0, 0]; beatBar = -1;
      if (variant === 'beat') {
        Lanes.init(pad, {
          labels: ['дрон', 'дарбука', 'хор'],
          keys: ['1', '2', '3'],
          onHit: (exact, lane) => { bl[lane] = Math.min(1, bl[lane] + (exact ? 0.46 : 0.30)); },
          onHold: (dt2, lane) => { bl[lane] = Math.min(1, bl[lane] + dt2 * 1.7); },
          onMiss: () => { Sound.slip(); dancers.forEach((d) => { d.heat = Math.max(0, d.heat - 0.012); }); }
        });
        Lanes.reset();
        Sound.onStep(beatChart);
      }
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
  /* Три часа танца из пролога — три фазы. Ноты берутся из настоящего
     рисунка ударных: doum и tek приходят прямо из sound.js, третья
     дорожка — акцент шейкера, он там идёт слишком часто для цели.
     Значит, на дорожках та же музыка, что звучит, а не отдельный чарт */
  const SH = [[4, 12], [2, 4, 12], [2, 4, 7, 12, 15]];
  const PHASE = [
    { sec: 30, bpm: 72, gain: 0.10, name: 'первый час' },
    { sec: 34, bpm: 80, gain: 0.20, name: 'второй час' },
    { sec: 38, bpm: 92, gain: 0.34, name: 'третий час' }
  ];
  /* Прогон 400 партий на каждый уровень точности: 90% и выше — выходит
     всегда, 85% — почти всегда, 80% — в сорока случаях из ста, 70% —
     никогда. Сгорание при 80% приходится на третий час, как в прологе */
  const GOOD = -1.7, OKH = -0.9, MISS = 4.0;

  let res = 0, phase = 0, phaseT = 0, running = false;
  let cv, raf = null, tickTimer = null, lastT = 0;

  function reset() {
    res = 0; phase = 0; phaseT = 0; lastT = 0;
    Lanes.reset();
    Sound.setLayer('drone', 0.55);
    Sound.setLayer('drum', 0.75);
    Sound.setLayer('choir', 0.15);
    Sound.setHeat(0);
  }

  /* планировщик отдаёт долю — раскладываем её по дорожкам */
  function schedule(step, time) {
    if (!running) return;
    const p = Sound.patterns();
    if (p.doum[step] !== undefined) Lanes.push(0, time, 0);
    if (p.tek[step] !== undefined) Lanes.push(1, time, 0);
    if (SH[phase].indexOf(step) !== -1) Lanes.push(2, time, 0);
  }

  function banner(text) {
    const b = $('#phase');
    b.textContent = text;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }

  function step() {
    if (!running) return;
    const now = performance.now() / 1000;
    const dt = lastT ? Math.min(0.2, now - lastT) : 0.1;
    lastT = now;
    Lanes.step(dt);

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
    $('#combo').textContent = Lanes.combo() > 2 ? Lanes.combo() + ' подряд' : '';
  }

  function draw() {
    if (!running) return;
    if (Glow.ready()) { Glow.resize(cv.width, cv.height); Glow.begin(); }
    Lanes.draw();
    if (Glow.ready()) { Glow.step(1 / 60); Glow.end(1.35); }
    raf = requestAnimationFrame(draw);
  }

  function finish(kind) {
    running = false;
    clearInterval(tickTimer); cancelAnimationFrame(raf);
    Sound.onStep(null);
    if (kind === 'burn') {
      if (Glow.ready()) Glow.burst(cv.width / 2, cv.height * 0.8, 80);
      Sound.burn();
      setTimeout(() => Sound.stop(2.4), 900);
      End.show('burn-dancer', null, Lanes.best());
    } else {
      Sound.stop(2.6);
      End.show('out', null, Lanes.best());
    }
  }

  const KEY = { KeyA: 0, KeyS: 1, KeyD: 2, Digit1: 0, Digit2: 1, Digit3: 2 };

  return {
    init() {
      addEventListener('keydown', (e) => {
        if (!running || e.repeat) return;
        const l = KEY[e.code];
        if (l !== undefined) { e.preventDefault(); Lanes.press(l); }
      });
      addEventListener('keyup', (e) => {
        const l = KEY[e.code];
        if (l !== undefined) Lanes.release(l);
      });
      /* Слушатели вешаются один раз, а не при каждом заходе: иначе после
         второй партии каждый тап считался бы дважды */
      const wrap = $('#floorwrap');
      const lane = (e) => {
        const r = wrap.getBoundingClientRect();
        return Lanes.laneAt((e.clientX - r.left) / r.width);
      };
      wrap.addEventListener('pointerdown', (e) => {
        if (!running) return;
        e.preventDefault(); Lanes.press(lane(e));
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
        wrap.addEventListener(ev, (e) => { if (running) Lanes.release(lane(e)); }));
    },
    start() {
      cv = $('#floor');
      cv.width = cv.clientWidth * DPR();
      cv.height = cv.clientHeight * DPR();
      Glow.init($('#floor-gl'));
      Lanes.init(cv, {
        labels: ['доум', 'тек', 'шейкер'],
        keys: ['A', 'S', 'D'],
        onHit: (exact) => { res += exact ? GOOD : OKH; },
        onMiss: () => { res += MISS; Sound.slip(); }
      });
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
  Arcade.init();

  /* каждая роль объявляет, чем она запускается */
  document.querySelectorAll('.role').forEach((b) => {
    b.addEventListener('click', () => {
      const who = b.dataset.who;
      if (who === 'shaman-hold')  { show('#shaman'); Shaman.start('hold'); }
      else if (who === 'shaman-field') { show('#shaman'); Shaman.start('field'); }
      else if (who === 'shaman-beat')  { show('#shaman'); Shaman.start('beat'); }
      else if (who === 'dancer')  { show('#dancer'); Dancer.start(); }
      else { show('#arcade'); Arcade.start(who); }
    });
  });

  const backToPick = () => {
    Shaman.stop(); Dancer.stop(); Arcade.stop(); Sound.stop(0.5); show('#pick');
  };
  document.querySelectorAll('.again').forEach((b) => b.addEventListener('click', backToPick));
  document.querySelectorAll('.quit').forEach((b) => b.addEventListener('click', backToPick));
})();
