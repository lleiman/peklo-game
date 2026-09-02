/* ─────────────────────────────────────────────
   ПЕКЛО · свечение
   Сырой WebGL2, без единой библиотеки: слой поверх обычного холста.
   Он рисует только то, что светится, — отклики зала, искры сгорания —
   и размывает яркое само в себя. Линии, текст и рамки остаются
   на 2D-холсте: там они чётче.

   Если WebGL2 нет, init() возвращает false и игра идёт как раньше.
   Свечение — надбавка к картинке, а не условие её работы.
   ───────────────────────────────────────────── */
const Glow = (() => {
  let gl = null, cv = null, ok = false;
  let progPoint, progBlur, progMix;
  let quadVBO, instVBO, instData, instCount = 0, instMax = 2048;
  let fboScene, fboPing, fboPong, texScene, texPing, texPong;
  let W = 0, H = 0, HW = 0, HH = 0;
  const parts = [];

  const VS_POINT = `#version 300 es
  in vec2 aCorner;          // угол единичного квадрата, -1…1
  in vec4 aInst;            // x, y (пиксели), радиус, жар
  out vec2 vUV;
  out float vHeat;
  uniform vec2 uRes;
  void main(){
    vUV = aCorner;
    vHeat = aInst.w;
    vec2 p = aInst.xy + aCorner * aInst.z;
    // пиксели → клип-пространство, ось Y вниз как на холсте
    vec2 c = (p / uRes) * 2.0 - 1.0;
    gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  }`;

  /* Свет под кожей: ядро тем белее, чем ближе тело к порогу.
     Спад экспоненциальный — так пятно не имеет видимой границы */
  const FS_POINT = `#version 300 es
  precision highp float;
  in vec2 vUV;
  in float vHeat;
  out vec4 outColor;
  void main(){
    float d = length(vUV);
    if (d > 1.0) discard;
    float f = exp(-d * d * 4.2);
    vec3 ember = vec3(1.0, 0.33, 0.07);
    vec3 core  = vec3(1.0, 0.93, 0.84);
    vec3 col = mix(ember, core, pow(clamp(vHeat, 0.0, 1.0), 2.2));
    // множитель держим низким: свет складывается, и десяток пятен
    // в одной точке иначе выбивает кадр в белое
    outColor = vec4(col * f * (0.16 + vHeat * 0.95), f);
  }`;

  const VS_FULL = `#version 300 es
  in vec2 aCorner;
  out vec2 vT;
  void main(){
    vT = aCorner * 0.5 + 0.5;
    gl_Position = vec4(aCorner, 0.0, 1.0);
  }`;

  /* Размытие в девять отсчётов, по одной оси за проход */
  const FS_BLUR = `#version 300 es
  precision highp float;
  in vec2 vT;
  out vec4 outColor;
  uniform sampler2D uTex;
  uniform vec2 uDir;
  void main(){
    float w[5];
    w[0]=0.2270; w[1]=0.1946; w[2]=0.1216; w[3]=0.0540; w[4]=0.0162;
    vec4 s = texture(uTex, vT) * w[0];
    for (int i = 1; i < 5; i++){
      vec2 o = uDir * float(i);
      s += texture(uTex, vT + o) * w[i];
      s += texture(uTex, vT - o) * w[i];
    }
    outColor = s;
  }`;

  const FS_MIX = `#version 300 es
  precision highp float;
  in vec2 vT;
  out vec4 outColor;
  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform float uStrength;
  void main(){
    vec4 a = texture(uScene, vT);
    vec4 b = texture(uBloom, vT);
    outColor = a + b * uStrength;
  }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('шейдер:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(vs, fs) {
    const v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('программа:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function target(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  function buildTargets() {
    HW = Math.max(2, Math.floor(W / 2));
    HH = Math.max(2, Math.floor(H / 2));
    [fboScene, fboPing, fboPong].forEach((t) => {
      if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); }
    });
    fboScene = target(HW, HH); texScene = fboScene.tex;
    fboPing  = target(HW, HH); texPing  = fboPing.tex;
    fboPong  = target(HW, HH); texPong  = fboPong.tex;
  }

  function drawFull(prog) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    const loc = gl.getAttribLocation(prog, 'aCorner');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    init(canvas) {
      /* Слой один на всю игру, а холстов несколько: при переходе между
         ролями контекст берётся заново, поэтому сбрасываем размеры —
         иначе цели останутся от прошлого экрана — и гасим старые искры */
      W = 0; H = 0;
      fboScene = fboPing = fboPong = null;
      parts.length = 0;
      cv = canvas;
      gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
      if (!gl) return (ok = false);
      progPoint = program(VS_POINT, FS_POINT);
      progBlur  = program(VS_FULL, FS_BLUR);
      progMix   = program(VS_FULL, FS_MIX);
      if (!progPoint || !progBlur || !progMix) return (ok = false);

      quadVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1
      ]), gl.STATIC_DRAW);

      instVBO = gl.createBuffer();
      instData = new Float32Array(instMax * 4);
      ok = true;
      return true;
    },
    ready: () => ok,

    resize(w, h) {
      if (!ok) return;
      if (w === W && h === H) return;
      W = w; H = h;
      cv.width = w; cv.height = h;
      buildTargets();
    },

    begin() { instCount = 0; },

    /* один светящийся отклик: центр в пикселях холста */
    blob(x, y, r, heat) {
      if (!ok || instCount >= instMax) return;
      const i = instCount * 4;
      instData[i] = x; instData[i + 1] = y; instData[i + 2] = r; instData[i + 3] = heat;
      instCount++;
    },

    /* сгорание: искры разлетаются и оседают пеплом */
    burst(x, y, n) {
      for (let i = 0; i < (n || 55); i++) {
        const a = Math.random() * 6.2832;
        const s = 60 + Math.random() * 300;
        /* искры расходятся из пятна, а не из точки: иначе первый кадр
           складывает полсотни пятен в одном пикселе и всё белеет */
        const r0 = Math.random() * 14;
        parts.push({
          x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
          life: 0, max: 0.8 + Math.random() * 1.4,
          size: 1.6 + Math.random() * 4.4
        });
      }
    },

    step(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy -= 30 * dt;              /* искра идёт вверх, остывая */
        p.vx *= 0.97; p.vy *= 0.97;
      }
      parts.forEach((p) => {
        const k = 1 - p.life / p.max;
        this.blob(p.x, p.y, p.size * (0.6 + k * 1.6), k * k * 0.75);
      });
    },

    end(strength) {
      if (!ok || !W) return;
      /* сцена в половинном разрешении: свечению деталей не нужно */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene.fbo);
      gl.viewport(0, 0, HW, HH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (instCount) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);        /* складываем свет, а не кроем им */
        gl.useProgram(progPoint);
        gl.uniform2f(gl.getUniformLocation(progPoint, 'uRes'), W, H);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        const lc = gl.getAttribLocation(progPoint, 'aCorner');
        gl.enableVertexAttribArray(lc);
        gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(lc, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, instVBO);
        gl.bufferData(gl.ARRAY_BUFFER, instData.subarray(0, instCount * 4), gl.DYNAMIC_DRAW);
        const li = gl.getAttribLocation(progPoint, 'aInst');
        gl.enableVertexAttribArray(li);
        gl.vertexAttribPointer(li, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(li, 1);

        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instCount);
        gl.vertexAttribDivisor(li, 0);
      }

      /* два прохода размытия: сначала по горизонтали, потом по вертикали */
      gl.disable(gl.BLEND);
      gl.useProgram(progBlur);
      gl.uniform1i(gl.getUniformLocation(progBlur, 'uTex'), 0);
      gl.activeTexture(gl.TEXTURE0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fboPing.fbo);
      gl.viewport(0, 0, HW, HH);
      gl.bindTexture(gl.TEXTURE_2D, texScene);
      gl.uniform2f(gl.getUniformLocation(progBlur, 'uDir'), 1.6 / HW, 0);
      drawFull(progBlur);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fboPong.fbo);
      gl.bindTexture(gl.TEXTURE_2D, texPing);
      gl.uniform2f(gl.getUniformLocation(progBlur, 'uDir'), 0, 1.6 / HH);
      drawFull(progBlur);

      /* складываем резкое свечение с размытым */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(progMix);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texScene);
      gl.uniform1i(gl.getUniformLocation(progMix, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texPong);
      gl.uniform1i(gl.getUniformLocation(progMix, 'uBloom'), 1);
      gl.uniform1f(gl.getUniformLocation(progMix, 'uStrength'), strength === undefined ? 1.5 : strength);
      drawFull(progMix);
    }
  };
})();
