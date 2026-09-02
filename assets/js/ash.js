/* ─────────────────────────────────────────────
   ПЕКЛО · пепел
   Он летит всегда и везде: Бродяги собирают его в Пекле, едят и помнят,
   а в воздухе он не кончается. Отдельный слой поверх любой сцены.

   Пепел не светится — он серый и глушит свет, поэтому рисуется
   на обычном 2D-холсте, а не в аддитивном слое свечения. Иначе
   получились бы искры, а это другое вещество.
   ───────────────────────────────────────────── */
const Ash = (() => {
  let P = [], w = 0, h = 0;

  function spawn(i, full) {
    const p = P[i] || (P[i] = {});
    p.x = Math.random();
    /* при первом заполнении раскидываем по всей высоте, потом только сверху */
    p.y = full ? Math.random() : -0.03 - Math.random() * 0.1;
    p.z = 0.25 + Math.random() * 0.75;       /* дальность: ближние крупнее и быстрее */
    p.vy = 0.014 + p.z * 0.05;
    p.vx = (Math.random() - 0.5) * 0.02;
    p.ph = Math.random() * 6.28;
    p.sp = 0.4 + Math.random() * 1.4;        /* своя частота качания */
    p.a = 0.10 + p.z * 0.32;
    return p;
  }

  return {
    init(n) {
      P = new Array(n || 150);
      for (let i = 0; i < P.length; i++) spawn(i, true);
    },
    /* wind — снос вбок, обычно от скорости сцены */
    step(dt, wind) {
      const t = performance.now() / 1000;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        p.y += p.vy * dt;
        /* качание: пепел не падает по прямой, его несёт */
        p.x += (p.vx + Math.sin(t * p.sp + p.ph) * 0.012 + (wind || 0) * p.z) * dt;
        if (p.y > 1.06 || p.x < -0.1 || p.x > 1.1) spawn(i, false);
      }
    },
    draw(cx, W, H) {
      w = W; h = H;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        const r = (0.5 + p.z * 1.7) * dpr;
        /* тёплый серый: пепел ещё помнит, чем был */
        cx.fillStyle = `rgba(${168 + p.z * 26},${158 + p.z * 20},${146 + p.z * 14},${p.a})`;
        cx.beginPath();
        cx.arc(p.x * w, p.y * h, r, 0, 6.2832);
        cx.fill();
      }
    }
  };
})();
