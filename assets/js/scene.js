/* ─────────────────────────────────────────────
   ПЕКЛО · сцены персонажей
   Один шейдер на пять ролей: режим переключается юниформом, общими
   остаются перспектива, дымка и пост. Так пять сцен стоят одного файла,
   а не пяти контекстов.

   0 — воронка Казе: погружение в чужое сознание, мир без изображений
   1 — поле Мадам: чужая музыка волнами снизу, её голос сверху
   2 — зал Модели: свет, направленный на одну точку
   3 — тёмная комната Фотографа: свет через щель, пыль в луче
   ───────────────────────────────────────────── */
const Scene = (() => {
  let gl = null, cv = null, ok = false, prog = null, vbo = null;
  const U = {};

  const VS = `#version 300 es
  in vec2 aP; out vec2 vUV;
  void main(){ vUV = aP; gl_Position = vec4(aP, 0.0, 1.0); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 vUV;
  out vec4 outColor;

  uniform float uT;
  uniform int   uMode;
  uniform float uA;      // главный параметр роли: глубина, власть, ставка
  uniform float uB;      // второй: тревога, сопротивление, температура
  uniform float uLook;
  uniform float uPulse;

  float hash(float n){ return fract(sin(n)*43758.5453); }
  float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

  // мягкий шум: из него делается дымка и муар в глубине
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x),
               mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ s += noise(p)*a; p *= 2.03; a *= 0.5; }
    return s;
  }

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
  vec3 grade(vec3 c){
    int i = int(mod(uLook,4.0)), j = int(mod(uLook+1.0,4.0));
    vec3 a = i==1?acid(c): i==2?thermal(clamp(luma(c)*1.35,0.0,1.0)): i==3?burned(c): c;
    vec3 b = j==1?acid(c): j==2?thermal(clamp(luma(c)*1.35,0.0,1.0)): j==3?burned(c): c;
    return mix(a, b, smoothstep(0.78, 1.0, fract(uLook)));
  }

  // ── воронка: погружение ──
  // Градиент сам по себе даёт кляксу. Тоннель читается только по рёбрам:
  // кольца по глубине и сегменты по углу — глазу нужны края, а не пятна
  vec3 tunnel(vec2 uv){
    float r = max(length(uv), 0.02);
    float ang = atan(uv.y, uv.x);
    float z = 0.85/r + uT*(0.45 + uA*2.2);      // глубина обратна радиусу
    float far = smoothstep(0.0, 0.45, r);        // центр — точка схода

    float ring = fract(z);
    float seg  = fract(ang*7.0/6.2832 + 0.5);
    float rEdge = smoothstep(0.10, 0.0, min(ring, 1.0-ring));
    float sEdge = smoothstep(0.055, 0.0, min(seg, 1.0-seg));

    // панель стены: своя яркость у каждой ячейки
    float cell = hash2(vec2(floor(z), floor(ang*7.0/6.2832)));
    vec3 col = vec3(0.030,0.026,0.028) * (0.5 + cell*0.9) * far;
    col += vec3(0.030,0.024,0.030) * fbm(vec2(ang*3.0, z*0.7)) * far;

    // рёбра горят: они и делают глубину
    col += vec3(1.00,0.42,0.13) * rEdge * far * (0.16 + uA*0.60);
    col += vec3(0.85,0.30,0.10) * sEdge * far * (0.05 + uA*0.22);

    // свет из-за спины гаснет вглубь
    col *= 0.35 + 0.65*far;

    // она подходит из глубины: тьма в самой точке схода
    float deep = pow(1.0-far, 2.2);
    col = mix(col, vec3(0.42,0.02,0.05), deep*uB*0.9);
    col += vec3(0.55,0.03,0.06) * deep * uB * (0.6 + 0.4*sin(uT*2.4));
    return col;
  }

  // ── поле: чужая музыка волнами ──
  vec3 waves(vec2 uv){
    vec3 col = vec3(0.020,0.018,0.022);
    // слоями, каждый со своей фазой — получается объём, а не линия
    for (int i = 0; i < 5; i++){
      float fi = float(i);
      float y = sin(uv.x*(2.2+fi*1.3) + uT*(0.5+fi*0.22) + fi*1.7) * (0.32 - fi*0.045);
      float d = abs(uv.y - y - (fi-2.0)*0.13);
      float line = exp(-d*d*(90.0 - fi*12.0));
      vec3 c = mix(vec3(0.55,0.16,0.30), vec3(0.20,0.10,0.45), fi/4.0);
      col += c * line * (0.35 + uA*0.9) / (1.0 + fi*0.5);
    }
    // её голос давит сверху
    col += vec3(0.55,0.20,0.50) * smoothstep(1.0, -0.2, uv.y) * uB * 0.55;
    col += vec3(0.9,0.35,0.15) * fbm(uv*2.4 + uT*0.15) * 0.045;
    return col;
  }

  // ── зал: свет в одну точку ──
  // Нужен пол в перспективе и конус с краями, иначе выходит просто пятно
  vec3 spot(vec2 uv){
    float horizon = 0.26;
    vec3 col;
    if (uv.y < horizon){
      float d = horizon - uv.y;
      float z = 1.9/max(d,0.004);
      float wx = uv.x*z;
      float far = exp(-z*0.09);
      // доски пола: полосы поперёк, они и держат перспективу
      float board = smoothstep(0.06,0.0,abs(fract(z*0.55)-0.5)-0.44);
      col = vec3(0.055,0.048,0.045)*(0.35+0.65*far)*(0.75+board*0.5);
      // пятно света, лежащее на полу эллипсом
      float rr = length(vec2(wx/3.4,(z-9.0)/3.4));
      col += vec3(1.0,0.60,0.26)*smoothstep(1.05,0.15,rr)*(0.14+uA*0.80)*far;
      col += vec3(1.0,0.22,0.05)*smoothstep(1.30,1.02,rr)*uB*0.55*far;
    } else {
      float k = (uv.y-horizon)/(1.0-horizon);
      col = vec3(0.026,0.023,0.023)*(1.0-k*0.5);
    }
    // конус от прибора: у света видны края
    float cone = smoothstep(0.34+ (1.0-uv.y)*0.16, 0.0, abs(uv.x));
    col += vec3(1.0,0.74,0.45)*cone*smoothstep(1.05,-0.35,uv.y)*(0.035+uA*0.10);
    return col;
  }

  // ── тёмная комната ──
  // Луч должен иметь края и упираться в стену, а плёнки — висеть
  vec3 darkroom(vec2 uv){
    vec3 col = vec3(0.024,0.020,0.021) * (0.8 + fbm(uv*2.6)*0.5);
    // щель под дверью: узкая полоса с резким краем
    float slit = smoothstep(0.16,0.10,abs(uv.x*0.62 - uv.y*0.48 - 0.22));
    float dust = fbm(vec2(uv.x*7.0 + uT*0.30, uv.y*7.0 - uT*0.16));
    col += vec3(1.0,0.34,0.12) * slit * (0.08 + uA*0.30) * (0.55 + dust*0.9);
    // висящие плёнки: вертикальные полосы на прищепках
    float strip = smoothstep(0.028,0.0,abs(fract(uv.x*3.2+0.15)-0.5)-0.46)
                * smoothstep(0.95,0.35,uv.y);
    col = mix(col, vec3(0.045,0.030,0.028), strip*0.85);
    col += vec3(0.9,0.25,0.10) * strip * slit * 0.35;
    // фонарь проявочной: сам источник виден
    vec2 lp = uv - vec2(-0.62,0.60);
    col += vec3(0.90,0.07,0.05) * exp(-length(lp*vec2(1.0,1.3))*4.0) * (0.30 + uB*0.95);
    col += vec3(1.0,0.35,0.25) * exp(-length(lp)*22.0) * 0.7;
    return col;
  }

  void main(){
    vec2 uv = vUV;
    vec3 col;
    if (uMode == 0)      col = tunnel(uv);
    else if (uMode == 1) col = waves(uv);
    else if (uMode == 2) col = spot(uv);
    else                 col = darkroom(uv);

    // общая дымка: без неё любая сцена выглядит плоской заливкой
    col += vec3(1.0,0.42,0.18) * fbm(uv*1.7 + vec2(uT*0.06, -uT*0.04)) * 0.035
         * (0.5 + uPulse);

    vec3 g = grade(col);
    float ca = length(uv)*0.005;
    g.r = grade(col*(1.0+ca*2.0)).r;
    g.b = grade(col*(1.0-ca*2.0)).b;
    g *= 1.0 - smoothstep(0.5, 1.5, length(uv*vec2(0.85,1.0)))*0.60;
    g += (hash(uv.x*311.7 + uv.y*97.3 + uT*11.0) - 0.5)*0.028;
    outColor = vec4(max(g,0.0), 1.0);
  }`;

  function sh(t, s) {
    const o = gl.createShader(t);
    gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
      console.warn('сцена:', gl.getShaderInfoLog(o)); return null;
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
        console.warn('сцена:', gl.getProgramInfoLog(prog)); return (ok = false);
      }
      vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1
      ]), gl.STATIC_DRAW);
      ['uT','uMode','uA','uB','uLook','uPulse']
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
      gl.uniform1f(U.uT, s.t);
      gl.uniform1i(U.uMode, s.mode | 0);
      gl.uniform1f(U.uA, s.a || 0);
      gl.uniform1f(U.uB, s.b || 0);
      gl.uniform1f(U.uLook, s.look || 0);
      gl.uniform1f(U.uPulse, s.pulse || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  };
})();
