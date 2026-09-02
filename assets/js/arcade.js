/* ─────────────────────────────────────────────
   ПЕКЛО · пять персонажей
   Общий экран, разные глаголы. У каждого своё решение,
   которое приходится принимать заново каждую секунду, —
   иначе получается «зажми и жди», а это уже было.

   Казе      — нырять:      глубже ценнее, но там Мадам
   Фрешер    — гнать:       когда отпустить перед поворотом
   Мадам     — просачиваться: идти в противофазе чужой музыке
   Модель    — поднимать:   выиграть нельзя, можно только выше
   Фотограф  — ловить:      молчание кормит кадр и убивает натуру
   ───────────────────────────────────────────── */
const Arcade = (() => {
  let cv, cx, raf = null, tick = null, cur = null, running = false;
  let held = false, px = 0, py = 0;
  const D = () => Math.min(devicePixelRatio || 1, 2);

  const hud = (a, b) => {
    document.querySelector('#ar-a').style.setProperty('--v', Math.max(0, Math.min(1, a)).toFixed(3));
    document.querySelector('#ar-b').style.setProperty('--v', Math.max(0, Math.min(1, b)).toFixed(3));
  };
  const labels = (a, b) => {
    document.querySelector('#ar-la').textContent = a;
    document.querySelector('#ar-lb').textContent = b;
  };

  /* ═══ КАЗЕ · погружение ═══
     Три погружения в сознание Шамана: мир без изображений, плотный
     от звука. Глубже — больше видишь, но там тёмное присутствие.
     Решение каждую секунду: ещё глубже или наверх */
  const Kaze = {
    title: 'Казе', a: 'глубина', b: 'тревога',
    tip: 'Держи — уходишь глубже. Отпустишь — всплываешь. Глубже образы идут быстрее, но и она ближе. Собери восемь и выйди живой.',
    start() { this.d = 0; this.fear = 0; this.img = 0; this.blips = []; this.t = 0; },
    step() {
      this.t += 0.1;
      this.d += held ? 0.011 : -0.020;
      this.d = Math.max(0, Math.min(1, this.d));
      /* образы приходят тем чаще, чем глубже */
      if (Math.random() < 0.02 + this.d * 0.075) {
        this.img++;
        this.blips.push({ x: Math.random(), y: Math.random(), t0: performance.now() });
        Sound.hit(true);
      }
      /* тревога копится на глубине и отпускает наверху */
      this.fear += this.d > 0.42 ? (this.d - 0.42) * 0.030 : -0.011;
      this.fear = Math.max(0, this.fear);
      Sound.setHeat(this.d * 0.8);
      Sound.setLayer('drone', 0.35 + this.d * 0.6);
      Sound.setLayer('choir', this.d * 0.8);
      hud(this.d, this.fear);
      if (this.fear >= 1) return Arcade.end('kaze-caught', this.img);
      if (this.img >= 8 && this.d < 0.06) return Arcade.end('kaze-out', this.img);
    },
    draw(w, h) {
      const dpr = D();
      /* воронка сознания: кольца тем плотнее, чем глубже */
      for (let i = 0; i < 9; i++) {
        const k = (i / 9 + this.t * 0.06 * (0.4 + this.d)) % 1;
        cx.strokeStyle = `rgba(255,106,31,${(1 - k) * 0.20 * (0.3 + this.d)})`;
        cx.lineWidth = dpr;
        cx.beginPath();
        cx.arc(w / 2, h / 2, k * Math.min(w, h) * 0.55, 0, 6.2832);
        cx.stroke();
      }
      this.blips = this.blips.filter((b) => performance.now() - b.t0 < 1400);
      this.blips.forEach((b) => {
        const a = 1 - (performance.now() - b.t0) / 1400;
        cx.fillStyle = `rgba(242,239,233,${a * 0.8})`;
        cx.beginPath();
        cx.arc(b.x * w, b.y * h, 3 * dpr, 0, 6.2832);
        cx.fill();
      });
      /* она подходит: пятно из глубины */
      if (this.fear > 0.25) {
        const g = cx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.5);
        g.addColorStop(0, `rgba(150,20,30,${(this.fear - 0.25) * 0.7})`);
        g.addColorStop(1, 'rgba(150,20,30,0)');
        cx.fillStyle = g; cx.fillRect(0, 0, w, h);
      }
      Arcade.count(`образов ${this.img} из 8`);
    }
  };

  /* ═══ ФРЕШЕР · гонка ═══
     Молчаливый поединок на светофоре и гонка по мокрым улицам.
     Решение: когда отпустить перед поворотом */
  const Fresher = {
    title: 'Фрешер', a: 'отрыв', b: 'скорость',
    tip: 'Держи — разгон. Дорога гнётся: входить в поворот на полном нельзя, сорвёт. Отпускай заранее и не отставай от красной машины.',
    start() {
      this.v = 0.3; this.gap = 0.5; this.t = 0; this.spins = 0;
      this.z = 0; this.curve = 0; this.tgt = 0; this.next = 3.2;
      this.pal = 0; this.shake = 0;
    },
    step() {
      this.t += 0.1;
      this.v += held ? 0.020 : -0.026;
      this.v = Math.max(0.12, Math.min(1, this.v));
      this.z += this.v * 2.6;                 /* путь: он и крутит картинку */
      this.pal += 0.0016 + this.v * 0.0016;   /* кварталы перетекают светом */

      /* профиль дороги: цель кривизны меняется, руль идёт к ней плавно */
      this.next -= 0.1;
      if (this.next <= 0) {
        this.tgt = (Math.random() * 2 - 1) * 2.6;
        this.next = 2.0 + Math.random() * 2.4;
      }
      this.curve += (this.tgt - this.curve) * 0.045;
      this.shake = Math.max(0, this.shake - 0.06);

      /* Вход в поворот на полном — срыв. Решение одно и то же каждые
         несколько секунд: успеть сбросить до того, как дорога согнётся */
      const bend = Math.abs(this.curve);
      if (bend > 1.25 && this.v > 0.62) {
        this.gap -= 0.22; this.v = 0.22; this.spins++;
        this.shake = 1; Sound.slip();
      } else if (bend > 1.25) {
        this.gap += 0.012;                    /* прошёл чисто */
      }

      this.gap += (this.v - 0.55) * 0.010;
      this.gap = Math.min(1, this.gap);
      Sound.setTempo(72 + this.v * 46);
      Sound.setLayer('drum', 0.3 + this.v * 0.65);
      Sound.setLayer('drone', 0.4 + this.v * 0.3);
      Sound.setHeat(this.v * 0.5);
      hud(this.gap, this.v);
      if (this.gap <= 0) return Arcade.end('fresher-lost', Math.round(this.t));
      if (this.t >= 75) return Arcade.end('fresher-held', Math.round(this.t));
    },
    draw(w, h) {
      const dpr = D();
      /* дорога идёт шейдером на своём холсте, здесь только силуэт и метки */
      if (Road.ready()) {
        Road.draw(w, h, {
          z: this.z, curve: this.curve, speed: this.v,
          pal: this.pal, car: Math.max(0, Math.min(1, this.gap)), shake: this.shake
        });
      }
      /* мотоцикл: тень у нижнего края, ведёт вбок на кривой */
      const bx = w / 2 - this.curve * w * 0.035;
      cx.fillStyle = 'rgba(8,8,8,.92)';
      cx.beginPath();
      cx.ellipse(bx, h * 0.93, 26 * dpr, 9 * dpr, 0, 0, 6.2832);
      cx.fill();
      cx.fillStyle = 'rgba(242,239,233,.9)';
      cx.fillRect(bx - 4 * dpr, h * 0.86, 8 * dpr, 22 * dpr);
      /* предупреждение о повороте */
      if (Math.abs(this.curve) > 0.9) {
        cx.font = `${11 * dpr}px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillStyle = this.v > 0.62 ? 'rgba(255,106,31,.95)' : 'rgba(140,134,126,.7)';
        cx.fillText(this.curve > 0 ? 'ПОВОРОТ ВПРАВО' : 'ПОВОРОТ ВЛЕВО', w / 2, h * 0.12);
      }
      Arcade.count(this.spins ? `срывов ${this.spins}` : 'ни одного срыва');
    }
  };

  /* ═══ МАДАМ · напев ═══
     Она поёт сверху и просачивается в чужую музыку. Идти надо
     не по волне, а против неё: во впадины */
  const Madam = {
    title: 'Мадам', a: 'власть', b: 'сопротивление',
    tip: 'Веди голос по впадинам чужой волны. На гребне тебя выталкивает. Он сопротивляется и меняет частоту.',
    start() { this.p = 0; this.push = 0; this.y = 0.5; this.t = 0; this.f = 1.0; this.ph = 0; },
    step() {
      this.t += 0.1;
      this.ph += 0.1 * this.f;
      /* Шаман меняет частоту — тем чаще, чем сильнее она давит */
      if (Math.random() < 0.008 + this.p * 0.02) this.f = 0.7 + Math.random() * 1.1;
      const target = this.wave(0.5);
      const d = Math.abs(this.y - target);
      /* впадина — там, где волна ниже; попал в противофазу — просочилась */
      if (d < 0.12) { this.p += 0.0075; this.push = Math.max(0, this.push - 0.01); }
      else { this.push += 0.0055; this.p -= 0.0016; }
      this.p = Math.max(0, Math.min(1, this.p));
      Sound.setLayer('choir', 0.25 + this.p * 0.7);
      Sound.setLayer('drone', 0.5);
      Sound.setHeat(this.p);
      hud(this.p, this.push);
      if (this.push >= 1) return Arcade.end('madam-out', Math.round(this.p * 100));
      if (this.p >= 1) return Arcade.end('madam-win', Math.round(this.t));
    },
    /* впадина волны в точке x */
    wave(x) { return 0.5 + Math.sin(this.ph + x * 5) * 0.3; },
    draw(w, h) {
      const dpr = D();
      cx.strokeStyle = 'rgba(196,113,60,.5)'; cx.lineWidth = 2 * dpr;
      cx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const x = i / 60, y = this.wave(x) * h;
        i === 0 ? cx.moveTo(x * w, y) : cx.lineTo(x * w, y);
      }
      cx.stroke();
      /* её голос */
      const ty = this.y * h;
      const ok = Math.abs(this.y - this.wave(0.5)) < 0.12;
      cx.strokeStyle = ok ? 'rgba(255,106,31,.95)' : 'rgba(140,134,126,.6)';
      cx.lineWidth = 2 * dpr;
      cx.beginPath(); cx.moveTo(0, ty); cx.lineTo(w, ty); cx.stroke();
      cx.fillStyle = ok ? 'rgba(255,106,31,1)' : 'rgba(140,134,126,.8)';
      cx.beginPath(); cx.arc(w / 2, ty, 6 * dpr, 0, 6.2832); cx.fill();
      Arcade.count(ok ? 'просачивается' : 'выталкивает');
    },
    move(x, y) { this.y = y; }
  };

  /* ═══ МОДЕЛЬ · ставка ═══
     Выиграть нельзя. Признание — структурное отсутствие, полоса
     не сдвинется ни разу, и это видно с первой секунды.
     Играется только то, как высоко успеешь поднять */
  const Model = {
    title: 'Модель', a: 'восхищение', b: 'температура',
    tip: 'Держи — поднимаешь ставку: точнее, рискованнее, горячее. Признание не сдвинется. Оно и не может.',
    start() { this.adm = 0; this.temp = 0; this.stake = 0; this.t = 0; this.best = 0; },
    step() {
      this.t += 0.1;
      if (held) { this.stake += 0.016; this.temp += 0.0075; }
      else { this.stake -= 0.010; this.temp -= 0.0026; }
      this.stake = Math.max(0, Math.min(1, this.stake));
      this.temp = Math.max(0, this.temp);
      this.adm = Math.min(1, this.adm + this.stake * 0.009);
      if (this.stake > this.best) this.best = this.stake;
      Sound.setHeat(this.temp);
      Sound.setLayer('drum', 0.3 + this.stake * 0.6);
      Sound.setLayer('drone', 0.45);
      hud(this.adm, this.temp);
      if (this.temp >= 1) return Arcade.end('model-burn', Math.round(this.best * 100));
      if (this.t >= 90) return Arcade.end('model-stop', Math.round(this.best * 100));
    },
    draw(w, h) {
      const dpr = D();
      /* третья полоса — признание. Стоит на нуле весь раунд */
      const y = h * 0.5;
      cx.strokeStyle = 'rgba(30,28,25,1)'; cx.lineWidth = 2 * dpr;
      cx.beginPath(); cx.moveTo(w * 0.1, y); cx.lineTo(w * 0.9, y); cx.stroke();
      cx.fillStyle = 'rgba(74,71,65,1)';
      cx.font = `${9 * dpr}px monospace`;
      cx.textAlign = 'left'; cx.textBaseline = 'bottom';
      cx.fillText('ПРИЗНАНИЕ', w * 0.1, y - 8 * dpr);
      cx.textAlign = 'right';
      cx.fillText('0', w * 0.9, y - 8 * dpr);
      /* ставка — растущий столб под ней */
      cx.fillStyle = `rgba(255,106,31,${0.25 + this.stake * 0.6})`;
      cx.fillRect(w * 0.1, y + 10 * dpr, (w * 0.8) * this.stake, 10 * dpr);
      /* зал смотрит: точки по краю, тем ярче, чем выше восхищение */
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * 6.2832;
        cx.fillStyle = `rgba(200,196,189,${0.05 + this.adm * 0.5})`;
        cx.beginPath();
        cx.arc(w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * h * 0.42, 2.4 * dpr, 0, 6.2832);
        cx.fill();
      }
      Arcade.count(`ставка ${Math.round(this.stake * 100)} · выше всего ${Math.round(this.best * 100)}`);
    }
  };

  /* ═══ ФОТОГРАФ · кадр ═══
     Работает фрагментами: целое отвлекает. Молчание — ресурс:
     не сказала — она старается сильнее, кадр дороже, натура горячее */
  const Photo = {
    title: 'Фотограф', a: 'плёнка', b: 'её температура',
    tip: 'Жми затвор, когда фрагмент в рамке. Молчишь — она старается сильнее и кадр дороже. Скажешь слово — остынет, но кадр подешевеет.',
    start() {
      this.film = 0; this.temp = 0.12; this.sil = 0; this.frags = []; this.t = 0; this.shots = 0; this.miss = 0;
    },
    step() {
      this.t += 0.1;
      this.sil += 0.1;
      this.temp += 0.0016 + this.sil * 0.00030;
      if (Math.random() < 0.055 + this.temp * 0.05)
        this.frags.push({ x: -0.1, y: 0.2 + Math.random() * 0.6, v: 0.006 + this.temp * 0.010 });
      this.frags.forEach((f) => { f.x += f.v; });
      this.frags = this.frags.filter((f) => f.x < 1.1);
      Sound.setHeat(this.temp);
      Sound.setLayer('drum', 0.35 + this.temp * 0.4);
      Sound.setLayer('drone', 0.5);
      hud(this.film, this.temp);
      if (this.temp >= 1) return Arcade.end('photo-burn', Math.round(this.film * 100));
      if (this.t >= 85) return Arcade.end('photo-end', Math.round(this.film * 100));
    },
    /* окно затвора — вертикальная полоса по центру */
    shoot() {
      const hit = this.frags.find((f) => Math.abs(f.x - 0.5) < 0.055);
      if (hit) {
        this.frags = this.frags.filter((f) => f !== hit);
        this.film = Math.min(1, this.film + 0.02 + this.sil * 0.0016);
        this.shots++; Sound.hit(true);
      } else { this.miss++; Sound.slip(); }
    },
    /* сказать слово: она остывает, но кадр обесценивается */
    speak() { this.temp = Math.max(0.1, this.temp - 0.22); this.sil = 0; Sound.hit(false); },
    draw(w, h) {
      const dpr = D();
      cx.strokeStyle = 'rgba(255,106,31,.55)'; cx.lineWidth = 1.5 * dpr;
      cx.strokeRect(w * 0.445, h * 0.12, w * 0.11, h * 0.76);
      this.frags.forEach((f) => {
        const inFrame = Math.abs(f.x - 0.5) < 0.055;
        cx.fillStyle = inFrame ? 'rgba(255,220,190,.95)' : `rgba(200,196,189,${0.3 + this.temp * 0.4})`;
        cx.beginPath();
        cx.ellipse(f.x * w, f.y * h, 13 * dpr, 5 * dpr, 0.4, 0, 6.2832);
        cx.fill();
      });
      Arcade.count(`кадров ${this.shots} · молчание ${this.sil.toFixed(0)} с`);
    }
  };

  const GAMES = { kaze: Kaze, fresher: Fresher, madam: Madam, model: Model, photo: Photo };

  const CARD = {
    'kaze-caught': ['глубина', 'Попалась', (n) => `Ты ушла глубже, чем нужно, и она открыла глаза. Река крови, кроваво-красные ворота, дыхание за ними.<br><br>Успела вынести ${n} образов из восьми. Шаман выдернул тебя наружу одним словом.`],
    'kaze-out':    ['выход',   'Ты вынесла всё',  (n) => `Восемь образов, и ты успела всплыть.<br><br>Ты знаешь теперь то, чего не знает город. Легче от этого не стало.`],
    'fresher-lost':['улица',   'Он ушёл',   (n) => `Красная машина растворилась в дожде, оставив рокот мотора и ощущение недосказанности.<br><br>Ты держалась ${n} секунд.`],
    'fresher-held':['площадь', 'Вы встали разом', (n) => `Он вышел, снял очки. Ни одного слова — они не были нужны.<br><br>Ты не отстала ни разу за ${n} секунд.`],
    'madam-out':   ['комната', 'Он выстоял', (n) => `Он сменил частоту в последний раз, и тебя вытолкнуло обратно наверх.<br><br>Власти набралось ${n} из ста. До следующей ночи.`],
    'madam-win':   ['сверху',  'Он не смог отвергнуть', (n) => `Ты просочилась до конца. Он ведёт музыку, но ведёт её теперь не один.<br><br>Заняло ${n} секунд.`],
    'model-burn':  ['пекло',   'Ставка закрыта', (n) => `Выше всего ты поднимала до ${n}. Признание так и осталось на нуле — не потому, что не успела, а потому, что его нельзя заработать.<br><br>Ты и не собиралась останавливаться.`],
    'model-stop':  ['студия',  'Ночь кончилась', (n) => `Выше всего — ${n}. Восхищение полное, признание на нуле.<br><br>Ничего не изменилось. Значит, завтра ещё точнее.`],
    'photo-burn':  ['тёмная',  'Кадр, который не посмотреть', (n) => `Она сгорела в кадре. Плёнка отснята на ${n} из ста, и ты успела нажать в последний раз.<br><br>Проявлять ты её не будешь.`],
    'photo-end':   ['студия',  'Смена кончилась', (n) => `Плёнка отснята на ${n} из ста. Ты не сказала ни слова о ней самой — только о свете.<br><br>Завтра снова.`]
  };

  return {
    count(text) { document.querySelector('#ar-count').textContent = text; },
    end(kind, n) {
      running = false;
      clearInterval(tick); cancelAnimationFrame(raf);
      const c = CARD[kind];
      const burn = kind.endsWith('burn') || kind === 'kaze-caught';
      if (burn) { Sound.burn(); setTimeout(() => Sound.stop(2.2), 800); }
      else Sound.stop(2.2);
      document.querySelector('#end-kick').textContent = c[0];
      document.querySelector('#end-title').textContent = c[1];
      document.querySelector('#end-body').innerHTML = c[2](n);
      setTimeout(() => {
        document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
        document.querySelector('#end').classList.add('on');
      }, burn ? 1400 : 400);
    },
    start(key) {
      cur = GAMES[key];
      cv = document.querySelector('#arena'); cx = cv.getContext('2d');
      cv.width = cv.clientWidth * D(); cv.height = cv.clientHeight * D();
      /* дорога живёт на своём холсте под этим: у неё свой контекст */
      const rgl = document.querySelector('#arena-gl');
      document.querySelector('#arcade').classList.toggle('has-road', key === 'fresher');
      if (key === 'fresher') { rgl.width = cv.width; rgl.height = cv.height; Road.init(rgl); }
      document.querySelector('#ar-who').textContent = cur.title;
      document.querySelector('#ar-tip').textContent = cur.tip;
      document.querySelector('#arcade').classList.toggle('has-speak', key === 'photo');
      labels(cur.a, cur.b);
      cur.start();
      held = false; running = true;
      Sound.setLayer('drone', 0.4); Sound.setLayer('drum', 0.2); Sound.setLayer('choir', 0.1);
      Sound.setTempo(72); Sound.onStep(null); Sound.start();
      tick = setInterval(() => { if (running && cur.step) cur.step(); }, 100);
      const loop = () => {
        if (!running) return;
        cx.clearRect(0, 0, cv.width, cv.height);
        cur.draw(cv.width, cv.height);
        raf = requestAnimationFrame(loop);
      };
      loop();
    },
    stop() { running = false; clearInterval(tick); cancelAnimationFrame(raf); },
    init() {
      const arena = document.querySelector('#arena');
      const pos = (e) => {
        const r = arena.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width;
        py = (e.clientY - r.top) / r.height;
      };
      arena.addEventListener('pointerdown', (e) => {
        e.preventDefault(); pos(e); held = true;
        if (cur && cur.move) cur.move(px, py);
        if (cur && cur.shoot) cur.shoot();
      });
      arena.addEventListener('pointermove', (e) => {
        pos(e);
        if (cur && cur.move && (held || cur === Madam)) cur.move(px, py);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
        arena.addEventListener(ev, () => { held = false; }));
      addEventListener('keydown', (e) => {
        if (!running) return;
        if (e.code === 'Space') { e.preventDefault(); held = true; if (cur.shoot) cur.shoot(); }
        if (e.code === 'ArrowUp' && cur.move) cur.move(0.5, Math.max(0, py -= 0.04));
        if (e.code === 'ArrowDown' && cur.move) cur.move(0.5, Math.min(1, py += 0.04));
      });
      addEventListener('keyup', (e) => { if (e.code === 'Space') held = false; });
      document.querySelector('#ar-speak').addEventListener('click', () => {
        if (running && cur && cur.speak) cur.speak();
      });
    }
  };
})();
