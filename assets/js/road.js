/* ─────────────────────────────────────────────
   ПЕКЛО · дорога
   Бесконечная трасса Фрешера одним фрагментным шейдером: ни моделей,
   ни текстур, ни геометрии. Для каждого пикселя ниже горизонта считаем
   точку на плоскости — отсюда и перспектива, и скорость, и повороты.

   Меняется только свет: кварталы города перетекают друг в друга
   палитрой, и это единственное, что отличает один участок от другого.
   Так и задумано — город здесь один и тот же, меняется освещение.
   ───────────────────────────────────────────── */
const Road = (() => {
  let gl = null, cv = null, ok = false, prog = null, vbo = null;
  const U = {};

  const VS = `#version 300 es
  in vec2 aP;
  out vec2 vUV;
  void main(){ vUV = aP; gl_Position = vec4(aP, 0.0, 1.0); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 vUV;
  out vec4 outColor;

  uniform vec2  uRes;
  uniform float uZ;        // пройденный путь
  uniform float uCurve;    // текущая кривизна
  uniform float uSpeed;    // 0…1
  uniform float uPal;      // квартал: перетекание палитры
  uniform float uCar;      // где впереди чужая машина, 0…1 по дальности
  uniform float uShake;    // тряска на срыве
  uniform float uLook;     // как показан город: обычный, кислота, тепловизор, выжженный

  // палитры кварталов: нефть, неон, тоннель, рассвет
  vec3 pal(float t, int i){
    if (i == 0) return mix(vec3(0.03,0.02,0.02), vec3(0.55,0.20,0.06), t); // уголь
    if (i == 1) return mix(vec3(0.02,0.02,0.04), vec3(0.65,0.10,0.22), t); // неон
    if (i == 2) return mix(vec3(0.02,0.03,0.03), vec3(0.10,0.35,0.30), t); // тоннель
    return mix(vec3(0.04,0.03,0.02), vec3(0.70,0.40,0.12), t);             // рассвет
  }
  vec3 palette(float t){
    float f = fract(uPal); int a = int(mod(uPal,4.0)); int b = int(mod(uPal+1.0,4.0));
    return mix(pal(t,a), pal(t,b), smoothstep(0.75,1.0,f));
  }

  float hash(float n){ return fract(sin(n)*43758.5453); }
  float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

  // ── как город показан ──
  // Свет меняется не оттенком, а способом видеть: кислота, тепловизор,
  // выжженный. Считается в самом конце по светимости кадра
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
    // Сцена сама по себе тёмная, поэтому светимость сначала поднимаем:
    // без этого рампа съедает почти весь кадр и «взгляд» превращается
    // просто в темноту
    float l = pow(clamp(luma(c) * 2.6, 0.0, 1.0), 0.55);
    vec3 b = mix(vec3(0.03,0.02,0.02), vec3(0.85,0.30,0.06), smoothstep(0.04,0.42,l));
    b = mix(b, vec3(1.00,0.80,0.45), smoothstep(0.42,0.78,l));
    return b + vec3(1.0) * smoothstep(0.80, 1.0, l) * 0.55;
  }
  vec3 look(vec3 c, int i){
    if (i == 1) return acid(c);
    if (i == 2) return thermal(clamp(luma(c) * 1.35, 0.0, 1.0));
    if (i == 3) return burned(c);
    return c;
  }
  vec3 grade(vec3 c){
    float f = fract(uLook);
    int i = int(mod(uLook, 4.0));
    int j = int(mod(uLook + 1.0, 4.0));
    // держим один взгляд долго и перетекаем в следующий на последней четверти
    return mix(look(c, i), look(c, j), smoothstep(0.78, 1.0, f));
  }

  void main(){
    vec2 uv = vUV;
    uv.x += uShake * (hash(uZ*7.0)-0.5) * 0.04;

    float horizon = 0.12;
    vec3 col;

    if (uv.y > horizon){
      // небо: только свет, ни одной детали
      float k = (uv.y - horizon) / (1.0 - horizon);
      col = palette(0.35) * (0.45 - k*0.35);
      // зарево над горизонтом — город впереди
      col += palette(1.0) * exp(-k*7.0) * 0.30;
    } else {
      // Плоскость под ногами. Для точки экрана ниже горизонта дальность
      // обратна расстоянию до линии горизонта, а мировая координата
      // поперёк дороги равна экранной, умноженной на эту дальность.
      // Отсюда честная трапеция, а не колонна: у зрителя полотно широкое,
      // к горизонту сходится само
      float d = horizon - uv.y;
      float z = 2.2 / max(d, 0.004);       // дальность до точки
      float zz = z + uZ;                   // с учётом пройденного пути
      float wx = uv.x * z;                 // мировая координата поперёк

      // поворот копится квадратично: дальняя часть уходит вбок сильнее
      float bend = uCurve * z * z * 0.0045;
      float t = wx - bend;

      float hw = 3.0;                                        // полуширина полотна
      float road = smoothstep(hw + 0.35, hw, abs(t));
      float kerbM = smoothstep(hw + 1.5, hw + 0.35, abs(t)) - road;
      float mid = smoothstep(0.30, 0.14, abs(t)) * step(0.5, fract(zz * 0.10));

      float far = exp(-z * 0.045);                           // затухание вдаль
      vec3 asphalt = palette(0.08) * (0.30 + 0.70 * far);
      vec3 kerb = palette(0.90) * (0.35 + 0.65 * step(0.5, fract(zz * 0.06)));

      col = asphalt * road + kerb * kerbM * 0.85;
      col += vec3(1.0, 0.62, 0.28) * mid * 0.65 * far;

      // мокрый асфальт: свет тянется вдоль полос
      col += palette(1.0) * road * far * 0.20
           * (0.45 + 0.55 * sin(t * 2.2 + uZ * 0.8));

      // фары чужой машины: сидят на полотне, уходят с дальностью
      float carZ = 9.0 + (1.0 - uCar) * 34.0;
      float carY = horizon - 2.2 / carZ;
      float carX = uCurve * carZ * carZ * 0.0045 / carZ;
      vec2 cd = (uv - vec2(carX, carY)) * vec2(1.0, 2.2);
      col += vec3(1.0, 0.16, 0.09) * exp(-length(cd) * 26.0) * (0.55 + 0.7 * uCar);

      col *= 1.0 - smoothstep(0.0, 1.1, d) * 0.22;
    }

    // скорость тянет свет к краям
    float v = length(uv) * uSpeed;
    col += palette(1.0) * v * v * 0.10;

    vec3 g = grade(col);
    // зерно кладём после грейда: иначе тепловизор перекрасил бы и его
    g += (hash(uv.x*311.7 + uv.y*97.3 + uZ) - 0.5) * 0.035;

    outColor = vec4(max(g, 0.0), 1.0);
  }`;

  function sh(t, s) {
    const o = gl.createShader(t);
    gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
      console.warn('дорога:', gl.getShaderInfoLog(o)); return null;
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
        console.warn('дорога:', gl.getProgramInfoLog(prog)); return (ok = false);
      }
      vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1
      ]), gl.STATIC_DRAW);
      ['uRes', 'uZ', 'uCurve', 'uSpeed', 'uPal', 'uCar', 'uShake', 'uLook']
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
      gl.uniform1f(U.uZ, s.z);
      gl.uniform1f(U.uCurve, s.curve);
      gl.uniform1f(U.uSpeed, s.speed);
      gl.uniform1f(U.uPal, s.pal);
      gl.uniform1f(U.uCar, s.car);
      gl.uniform1f(U.uShake, s.shake);
      gl.uniform1f(U.uLook, s.look || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  };
})();
