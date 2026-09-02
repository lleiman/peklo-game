/* ─────────────────────────────────────────────
   ПЕКЛО · зал
   Бывшее очистное сооружение одним фрагментным шейдером: бетонный пол
   в перспективе, светящийся круг на нём, дымка, в которой вязнет свет,
   и провода под потолком чёрными венами.

   Свет здесь идёт снизу — из круга, — а не сверху. Поэтому дымка
   светится у пола и гаснет к потолку, а не наоборот.

   Отклики танцующих сюда не входят: они живут в аддитивном слое
   свечения поверх. Здесь только само помещение.
   ───────────────────────────────────────────── */
const Room = (() => {
  let gl = null, cv = null, ok = false, prog = null, vbo = null;
  const U = {};

  const VS = `#version 300 es
  in vec2 aP; out vec2 vUV;
  void main(){ vUV = aP; gl_Position = vec4(aP, 0.0, 1.0); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 vUV;
  out vec4 outColor;

  uniform vec2  uRes;
  uniform float uT;       // время
  uniform float uHeat;    // жар зала 0…1: круг разгорается
  uniform float uPulse;   // доля удара: пол дышит битом
  uniform float uLook;    // способ видеть
  uniform float uShake;

  float hash(float n){ return fract(sin(n)*43758.5453); }
  float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

  vec3 thermal(float l){
    vec3 c = mix(vec3(0.00,0.00,0.07), vec3(0.10,0.00,0.48), smoothstep(0.00,0.22,l));
    c = mix(c, vec3(0.72,0.04,0.48), smoothstep(0.22,0.42,l));
    c = mix(c, vec3(1.00,0.22,0.05), smoothstep(0.42,0.62,l));
    c = mix(c, vec3(1.00,0.84,0.14), smoothstep(0.62,0.82,l));
    return mix(c, vec3(1.00,1.00,0.94), smoothstep(0.82,1.00,l));
  }
  vec3 acid(vec3 c){
    float l = luma(c);
    vec3 a = mix(vec3(0.02,0.09,0.03), vec3(0.42,1.00,0.10), smoothstep(0.04,0.50,l));
    return mix(a, vec3(1.00,0.16,0.86), smoothstep(0.50,0.95,l));
  }
  vec3 burned(vec3 c){
    float l = pow(clamp(luma(c)*2.6, 0.0, 1.0), 0.55);
    vec3 b = mix(vec3(0.03,0.02,0.02), vec3(0.85,0.30,0.06), smoothstep(0.04,0.42,l));
    b = mix(b, vec3(1.00,0.80,0.45), smoothstep(0.42,0.78,l));
    return b + vec3(1.0)*smoothstep(0.80,1.0,l)*0.55;
  }
  vec3 look(vec3 c, int i){
    if (i == 1) return acid(c);
    if (i == 2) return thermal(clamp(luma(c)*1.35, 0.0, 1.0));
    if (i == 3) return burned(c);
    return c;
  }
  vec3 grade(vec3 c){
    float f = fract(uLook);
    return mix(look(c, int(mod(uLook,4.0))), look(c, int(mod(uLook+1.0,4.0))),
               smoothstep(0.78, 1.0, f));
  }

  // бетон: крупное пятно плюс мелкое зерно
  float concrete(vec2 p){
    float a = hash(floor(p.x*3.0)*57.0 + floor(p.y*3.0)*131.0);
    float b = hash(floor(p.x*11.0)*17.0 + floor(p.y*11.0)*71.0);
    return 0.72 + a*0.20 + b*0.12;
  }

  void main(){
    vec2 uv = vUV;
    uv.x += uShake * (hash(uT*13.0)-0.5) * 0.03;

    float horizon = 0.30;
    vec3 col = vec3(0.0);
    float glowFloor = 0.0;

    if (uv.y < horizon){
      // ── пол ──
      float d = horizon - uv.y;
      float z = 2.0 / max(d, 0.004);
      float wx = uv.x * z;

      float far = exp(-z * 0.075);
      col = vec3(0.085,0.076,0.070) * concrete(vec2(wx*0.5, z*0.35)) * (0.30 + 0.70*far);

      // Круг на полу: в мире он круглый, на экране лежит плоско.
      // Радиус берём в мировых единицах, иначе он раздувается в купол
      // и выбивает кадр — так уже было
      float rr = length(vec2(wx / 5.0, (z - 13.0) / 5.0));
      // кольцо, а не заливка: горит кромка, середина темнее
      float ring = smoothstep(1.02, 0.88, rr) * smoothstep(0.62, 0.80, rr);
      float disc = smoothstep(1.0, 0.86, rr) * 0.22;
      float beat = 0.84 + 0.16*sin(uT*3.4) + uPulse*0.30;
      glowFloor = (ring + disc) * (0.22 + uHeat*0.62) * beat * far;
      col += vec3(1.0, 0.20, 0.05) * glowFloor;
      // подпалины вокруг: пепел въелся в бетон
      col += vec3(1.0,0.35,0.10) * smoothstep(1.9,1.05,rr) * 0.035 * (0.4+uHeat) * far;
    } else {
      // ── потолок и стены ──
      float k = (uv.y - horizon) / (1.0 - horizon);
      col = vec3(0.052,0.046,0.044) * (1.0 - k*0.45);
      // дальняя стена: бетон уходит вверх, к ней сбегается перспектива
      col += vec3(0.030,0.026,0.024) * smoothstep(0.55, 0.0, k) * concrete(vec2(uv.x*3.0, k*6.0));
      // Провода под потолком. Рисуем их светом, а не затемнением: на почти
      // чёрном потолке умножение не даёт ничего, вены пропадают
      float c = abs(sin(uv.x*7.0 + sin(uv.x*2.0)*1.6 + k*1.2));
      float wire = smoothstep(0.05, 0.0, c) * smoothstep(0.9, 0.15, k);
      col = mix(col, vec3(0.012,0.010,0.010), wire*0.85);
      col += vec3(1.0,0.42,0.16) * wire * (0.035 + uHeat*0.10);
    }

    // ── дымка ──
    // Свет идёт снизу, из круга, поэтому она светится у пола и гаснет вверх.
    // Медленно ползёт: воздух в зале не стоит
    float hz = smoothstep(horizon + 0.62, horizon - 0.42, uv.y);
    float drift = sin(uv.x*3.1 + uT*0.22) * 0.5 + sin(uv.x*7.7 - uT*0.13) * 0.5;
    hz *= 0.55 + 0.45 * drift;
    col += vec3(1.0, 0.34, 0.12) * hz * (0.050 + uHeat*0.13 + glowFloor*0.40);

    // ── пост ──
    vec3 g = grade(col);
    // хроматическая аберрация к краям: кадр как будто снят объективом
    float ca = length(uv) * 0.004;
    g.r = grade(col * (1.0 + ca*2.0)).r;
    g.b = grade(col * (1.0 - ca*2.0)).b;
    // виньетка
    g *= 1.0 - smoothstep(0.55, 1.5, length(uv*vec2(0.85,1.0))) * 0.62;
    // зерно поверх всего
    g += (hash(uv.x*311.7 + uv.y*97.3 + uT*11.0) - 0.5) * 0.030;

    outColor = vec4(max(g, 0.0), 1.0);
  }`;

  function sh(t, s) {
    const o = gl.createShader(t);
    gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
      console.warn('зал:', gl.getShaderInfoLog(o)); return null;
    }
    return o;
  }

  return {
    init(canvas) {
      cv = canvas;
      gl = cv.getContext('webgl2', { alpha: false, antialias: false });
      if (!gl) return (ok = false);
      const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
      if (!v || !f) return (ok = false);
      prog = gl.createProgram();
      gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('зал:', gl.getProgramInfoLog(prog)); return (ok = false);
      }
      vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1
      ]), gl.STATIC_DRAW);
      ['uRes','uT','uHeat','uPulse','uLook','uShake']
        .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      return (ok = true);
    },
    ready: () => ok,
    draw(w, h, s) {
      if (!ok) return;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const l = gl.getAttribLocation(prog, 'aP');
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(U.uRes, w, h);
      gl.uniform1f(U.uT, s.t);
      gl.uniform1f(U.uHeat, s.heat);
      gl.uniform1f(U.uPulse, s.pulse || 0);
      gl.uniform1f(U.uLook, s.look || 0);
      gl.uniform1f(U.uShake, s.shake || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  };
})();
