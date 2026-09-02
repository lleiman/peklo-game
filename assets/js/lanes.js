/* ─────────────────────────────────────────────
   ПЕКЛО · дорожки
   Три полосы, ноты идут сверху к линии удара. Общий движок на две роли:
   Танцующий ловит голоса дарбуки, Шаман бьёт по трубкам Организма.

   Три, а не пять: на телефоне пять целей не живут.

   Тон держим отдельно. Никаких очков за серию, множителей и вспышек
   «отлично»: роман холодный, награда тут одна — что ты не сгорел.
   Серия считается мелким моноширинным и ничего не даёт.
   ───────────────────────────────────────────── */
const Lanes = (() => {
  const LEAD = 1.55;                 /* сек от появления до линии удара */
  const GOOD = 0.095, OK = 0.17;     /* окна, выверены на танцующем */
  const N = 3;

  let notes = [], cv, cx, cfg = {};
  let held = [false, false, false];
  let flash = [-9, -9, -9], flashOk = [true, true, true];
  let combo = 0, best = 0, judged = '', judgedT = -9;
  /* Разбор управления держим на экране, пока игрок не нажал ни разу.
     Мелкая подпись внизу не работает: её не читают */
  let introT = 0, introDone = false;

  const D = () => Math.min(devicePixelRatio || 1, 2);
  const geo = () => {
    const w = cv.width, h = cv.height;
    return { w, h, lw: w / N, line: h * 0.80 };
  };

  return {
    init(canvas, options) {
      cv = canvas; cx = cv.getContext('2d');
      cfg = options || {};
    },
    reset() {
      notes = []; combo = 0; best = 0;
      held = [false, false, false];
      flash = [-9, -9, -9]; judged = ''; judgedT = -9;
      introT = performance.now(); introDone = false;
    },
    /* поставить ноту: дорожка, время удара, длина удержания в секундах */
    push(lane, t, len) { notes.push({ lane, t, len: len || 0, hit: false, dead: false, done: 0 }); },
    combo: () => combo,
    best: () => best,

    press(lane) {
      const now = Sound.now();
      let pick = null, bd = 9;
      notes.forEach((n) => {
        if (n.lane !== lane || n.hit || n.dead) return;
        const d = Math.abs(n.t - now);
        if (d < bd) { bd = d; pick = n; }
      });
      held[lane] = true;
      introDone = true;
      if (!pick || bd > OK) {
        combo = 0; flash[lane] = performance.now(); flashOk[lane] = false;
        judged = 'мимо'; judgedT = performance.now();
        if (cfg.onMiss) cfg.onMiss(true);
        return;
      }
      pick.hit = true;
      const exact = bd <= GOOD;
      combo++; if (combo > best) best = combo;
      flash[lane] = performance.now(); flashOk[lane] = true;
      judged = exact ? 'в такт' : 'почти'; judgedT = performance.now();
      if (cfg.onHit) cfg.onHit(exact, lane);
    },
    release(lane) { held[lane] = false; },

    step(dt) {
      const now = Sound.now();
      notes.forEach((n) => {
        /* пропущенная */
        if (!n.hit && !n.dead && now - n.t > OK) {
          n.dead = true; combo = 0;
          judged = 'сбился'; judgedT = performance.now();
          flash[n.lane] = performance.now(); flashOk[n.lane] = false;
          if (cfg.onMiss) cfg.onMiss(false);
        }
        /* длинная нота начисляется, пока её держат */
        if (n.hit && n.len > 0 && n.done < n.len && now >= n.t) {
          if (held[n.lane]) {
            const add = Math.min(dt, n.len - n.done);
            n.done += add;
            if (cfg.onHold) cfg.onHold(add, n.lane);
          } else if (now - n.t > 0.14) {
            n.done = n.len;              /* отпустил раньше — хвост потерян */
            combo = 0;
          }
        }
      });
      notes = notes.filter((n) => now - n.t < n.len + 1.0);
    },

    draw() {
      const { w, h, lw, line } = geo();
      const dpr = D(), now = Sound.now();
      cx.clearRect(0, 0, w, h);

      /* полосы */
      for (let i = 0; i <= N; i++) {
        cx.strokeStyle = 'rgba(30,28,25,1)';
        cx.lineWidth = dpr;
        cx.beginPath(); cx.moveTo(i * lw, 0); cx.lineTo(i * lw, h); cx.stroke();
      }
      /* линия удара */
      cx.strokeStyle = 'rgba(196,113,60,.75)';
      cx.lineWidth = 2 * dpr;
      cx.beginPath(); cx.moveTo(0, line); cx.lineTo(w, line); cx.stroke();

      /* Цели. Клавиша написана прямо в круге: в подписи мелким шрифтом
         внизу экрана её никто не найдёт, а знать надо сразу */
      const mono = getComputedStyle(document.body).getPropertyValue('--mono');
      for (let i = 0; i < N; i++) {
        const cxp = (i + 0.5) * lw;
        const fl = (performance.now() - flash[i]) / 240;
        const R = 22 * dpr;
        cx.strokeStyle = held[i] ? 'rgba(255,106,31,.95)' : 'rgba(120,114,104,.9)';
        cx.lineWidth = (held[i] ? 2.5 : 1.4) * dpr;
        cx.beginPath(); cx.arc(cxp, line, R, 0, 6.2832); cx.stroke();
        if (fl < 1) {
          cx.strokeStyle = flashOk[i]
            ? `rgba(255,210,170,${(1 - fl) * 0.9})`
            : `rgba(150,60,40,${(1 - fl) * 0.85})`;
          cx.lineWidth = 2.5 * dpr;
          cx.beginPath(); cx.arc(cxp, line, R + fl * 20 * dpr, 0, 6.2832); cx.stroke();
        }
        if (cfg.keys) {
          cx.font = `700 ${15 * dpr}px ${mono}`;
          cx.textAlign = 'center'; cx.textBaseline = 'middle';
          cx.fillStyle = held[i] ? 'rgba(255,106,31,1)' : 'rgba(200,196,189,.95)';
          cx.fillText(cfg.keys[i], cxp, line + dpr);
        }
        if (cfg.labels) {
          cx.font = `${9.5 * dpr}px ${mono}`;
          cx.textAlign = 'center'; cx.textBaseline = 'top';
          cx.fillStyle = 'rgba(120,114,104,1)';
          cx.fillText(cfg.labels[i].toUpperCase(), cxp, line + 32 * dpr);
        }
      }

      /* ноты: сверху вниз, приходят на линию ровно в свою долю */
      notes.forEach((n) => {
        const dt = n.t - now;
        if (dt > LEAD) return;
        const k = dt / LEAD;
        const y = line - k * line;
        const cxp = (n.lane + 0.5) * lw;
        if (n.len > 0) {
          /* хвост длинной ноты */
          const y2 = line - ((n.t + n.len - now) / LEAD) * line;
          cx.strokeStyle = n.hit && held[n.lane]
            ? 'rgba(255,106,31,.85)' : 'rgba(140,134,126,.45)';
          cx.lineWidth = 7 * dpr;
          cx.beginPath(); cx.moveTo(cxp, Math.min(y, line)); cx.lineTo(cxp, Math.min(y2, line)); cx.stroke();
        }
        if (n.hit || n.dead) return;
        if (y < -20 * dpr) return;
        if (Glow.ready()) Glow.blob(cxp, y, 16 * dpr, 0.45);
        cx.fillStyle = 'rgba(242,239,233,.92)';
        cx.beginPath(); cx.arc(cxp, y, 7 * dpr, 0, 6.2832); cx.fill();
      });

      /* Разбор управления: висит, пока не нажали ни разу, но не дольше
         десяти секунд. Уходит с первого же нажатия */
      const introAge = (performance.now() - introT) / 1000;
      if (!introDone && introAge < 10) {
        const a = introAge > 9 ? 10 - introAge : 1;
        cx.fillStyle = `rgba(5,5,5,${0.72 * a})`;
        cx.fillRect(0, 0, w, h);
        cx.textAlign = 'center';
        cx.fillStyle = `rgba(242,239,233,${0.9 * a})`;
        cx.font = `${13 * dpr}px ${mono}`;
        cx.textBaseline = 'middle';
        cx.fillText('ЖМИ ДОРОЖКУ, ПО КОТОРОЙ ПРИШЛА НОТА', w / 2, h * 0.30);
        for (let i = 0; i < N; i++) {
          const cxp = (i + 0.5) * lw;
          cx.strokeStyle = `rgba(255,106,31,${0.65 * a})`;
          cx.lineWidth = 1.4 * dpr;
          cx.beginPath(); cx.arc(cxp, h * 0.5, 30 * dpr, 0, 6.2832); cx.stroke();
          cx.fillStyle = `rgba(255,106,31,${a})`;
          cx.font = `700 ${22 * dpr}px ${mono}`;
          cx.fillText(cfg.keys ? cfg.keys[i] : '', cxp, h * 0.5 + dpr);
          if (cfg.labels) {
            cx.fillStyle = `rgba(160,154,146,${a})`;
            cx.font = `${10 * dpr}px ${mono}`;
            cx.fillText(cfg.labels[i].toUpperCase(), cxp, h * 0.5 + 48 * dpr);
          }
        }
        cx.fillStyle = `rgba(120,114,104,${a})`;
        cx.font = `${11 * dpr}px ${mono}`;
        cx.fillText('ИЛИ ПАЛЬЦЕМ ПО СВОЕЙ ТРЕТИ ЭКРАНА', w / 2, h * 0.68);
      }

      /* оценка последнего нажатия — сдержанно, без похвал */
      const jt = (performance.now() - judgedT) / 650;
      if (jt < 1 && judged) {
        cx.font = `${11 * dpr}px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillStyle = flashOk.some((x) => x) && judged !== 'сбился' && judged !== 'мимо'
          ? `rgba(242,239,233,${(1 - jt) * 0.6})`
          : `rgba(196,113,60,${(1 - jt) * 0.85})`;
        cx.fillText(judged.toUpperCase(), w / 2, h * 0.13);
      }
    },

    /* какая дорожка под точкой: нижняя треть экрана — зона нажатий */
    laneAt(nx) { return Math.max(0, Math.min(N - 1, Math.floor(nx * N))); }
  };
})();
