/* ============================================================================
 * js/sky.js – Bầu trời, mặt trời, mây, núi/đồi xa, sương và ánh sáng.
 *  Sky.tasks()            → mảng tác vụ dựng cache (main.js chạy lần lượt để báo tiến độ thật)
 *  Sky.update()           → tính màu trời/mặt trời/ánh sáng theo timeline (gọi mỗi khung)
 *  Sky.drawBack(ctx)      → lớp 1–4: trời + sao, mặt trời + bloom, mây, đồi + sương
 *  Sky.drawFront(ctx)     → lớp 13: god rays, quầng sáng khí quyển, lens flare (blend cộng/screen)
 *  Sky.sun                → {x,y,alt,toX,toY,shadowK,color,rim,ambient,rimAlpha} cho module khác
 *                           (toX,toY: hướng từ cảnh về phía mặt trời; bóng đổ sang PHẢI, dài = shadowK × cao)
 *  Sky.colors             → {top,mid,low,horizon} màu trời hiện tại (mảng RGB, dùng cho phản chiếu ao…)
 *  Sky.setQuality(level)  → số chùm tia và độ phân giải god rays; Sky.reset() → dùng cho "Xem lại"
 * Đồi vẽ vector trực tiếp (Path2D) nên không bao giờ vỡ hình khi zoom; mây được cache và tô lại ~2 lần/giây.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, S = C.sky, TL = App.timeline, cam = App.camera;
  var W = C.virtual.w, H = C.virtual.h, HZ = C.layout.horizonY * H, DEG = U.DEG, P = C.camera.parallax;
  var css = U.css, mix = U.mix, clamp = U.clamp, lerp = U.lerp, sstep = U.smoothstep;

  function rgb(c) { return 'rgb(' + ((c[0] + 0.5) | 0) + ',' + ((c[1] + 0.5) | 0) + ',' + ((c[2] + 0.5) | 0) + ')'; }

  /* Bảng màu mây theo thời gian (có thể ghi đè bằng config.sky.cloudTop / cloudMid / cloudBot) */
  var CK = {
    top: S.cloudTop || [[0, '#FFFFFF'], [26, '#F6EEF6'], [40, '#CBA9DA'], [60, '#8A6FB8']],
    mid: S.cloudMid || [[0, '#F4F9FF'], [26, '#FFE7CF'], [40, '#F7A9B8'], [60, '#C9709A']],
    bot: S.cloudBot || [[0, '#DCE8F4'], [26, '#FFD0A0'], [40, '#FF9A6B'], [60, '#F27A54']]
  };
  var col = {
    top: [0, 0, 0], mid: [0, 0, 0], low: [0, 0, 0], horizon: [0, 0, 0],
    sun: [0, 0, 0], rim: [0, 0, 0], ambient: [0, 0, 0], ray: [0, 0, 0], mist: [0, 0, 0],
    ctop: [0, 0, 0], cmid: [0, 0, 0], cbot: [0, 0, 0], tmpA: [0, 0, 0], tmpB: [0, 0, 0], tmpC: [0, 0, 0]
  };
  var sun = {
    x: 0, y: 0, alt: 50, toX: -0.64, toY: -0.77, shadowK: 0.35, dusk: 0, rimAlpha: 0.4,
    color: col.sun, rim: col.rim, ambient: col.ambient
  };
  var Sky = App.sky = {
    sun: sun, horizonY: HZ, setY: HZ - 130,   // setY: độ cao sống núi xa quanh mặt trời (mặt trời lặn sau núi)
    colors: { top: col.top, mid: col.mid, low: col.low, horizon: col.horizon },
    rayScale: 0.5, rayCount: 10, cs: 0.9
  };

  var view = { x0: 0, y0: 0, x1: 0, y1: 0 }, tmp = [0, 0];
  var clouds = [], hills = [], stars = [], blobSprite = null, rayCv = null, rayCtx = null, rr = 0;
  var CLOUD_RANGE = W + 1400;
  var SKY_B = HZ - 190;   // đáy gradient trời = tầm sống núi xa (chân trời nhìn thấy được)

  /* ------------------------------------------------------------------ Cập nhật */
  Sky.update = function () {
    var t = TL.t, e = TL.env;
    U.keyColor(S.top, t, col.top); U.keyColor(S.mid, t, col.mid);
    U.keyColor(S.low, t, col.low); U.keyColor(S.horizon, t, col.horizon);
    U.keyColor(S.sunColor, t, col.sun);
    U.keyColor(CK.top, t, col.ctop); U.keyColor(CK.mid, t, col.cmid); U.keyColor(CK.bot, t, col.cbot);
    var alt = e.sunAlt, a = alt * DEG;
    sun.alt = alt;
    sun.x = C.layout.sunX * W + U.remap(alt, 2.5, 50, -40, 70);
    var yLow = Sky.setY + S.sunRadius * 0.5;                      // ~2.5°: tâm đĩa sát sống núi, lặn dần sau núi
    sun.y = yLow - (yLow - 97) * Math.sin(a) / Math.sin(50 * DEG); // 50° → gần đỉnh trời
    sun.toX = -Math.cos(a); sun.toY = -Math.sin(a);               // hướng từ cảnh về phía mặt trời (trái, lên)
    sun.shadowK = e.shadowLen; sun.dusk = e.dusk;
    sun.rimAlpha = 0.35 + 0.5 * e.dusk;
    mix(col.sun, '#FF9A4D', 0.35 + 0.4 * e.dusk, col.rim);        // rim light cam ấm
    mix(col.mid, '#6A3D86', 0.55, col.ambient);                   // ánh trời tím lạnh cho phần khuất
    mix(col.sun, '#FFD9A0', 0.5, col.ray);
    mix(col.horizon, '#FFF8F0', 0.25, col.mist);
  };
  /** Vị trí mặt trời trên màn hình (pixel CSS). */
  Sky.sunScreen = function (out) { return cam.worldToScreen(sun.x, sun.y, P.sky, out || [0, 0]); };

  Sky.setQuality = function (q) {
    Sky.rayScale = q.rayScale; Sky.rayCount = q.godRays;
  };
  Sky.reset = function () { for (var i = 0; i < clouds.length; i++) clouds[i].built = -99; };

  /* ------------------------------------------------------------------- Dựng cache */
  function makeBlob() {
    var c = U.createCanvas(128, 128), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.5, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return c;
  }

  function buildHills() {
    var n = S.hillLayers, N = U.makeNoise(555), step = 8, i, x;
    hills.length = 0;
    for (i = 0; i < n; i++) {
      var f = n > 1 ? i / (n - 1) : 0, base = HZ - lerp(170, 26, f), amp = lerp(120, 34, f), fq = lerp(0.0019, 0.0042, f);
      var xs = [], ys = [];
      for (x = -400; x <= W + 400; x += step) {
        var v = N.fbm2(x * fq + i * 13.7, i * 5.3, 4, 2, 0.5);
        var h = i < 2 ? Math.pow(1 - Math.abs(v), 1.3) : 0.5 + 0.5 * v;   // 2 lớp xa: sống núi nhọn hơn; lớp gần: đồi thoải
        xs.push(x); ys.push(base - amp * h);
      }
      var layer = { f: f, par: lerp(P.far, P.mid, f), base: base, xs: xs, ys: ys, path: null };
      if (typeof Path2D === 'function') { layer.path = new Path2D(); traceHill(layer.path, layer); }
      hills.push(layer);
    }
    var sum = 0, cnt = 0;                                          // sống núi xa quanh vị trí mặt trời
    for (i = 0; i < hills[0].xs.length; i++) if (hills[0].xs[i] >= 150 && hills[0].xs[i] <= 450) { sum += hills[0].ys[i]; cnt++; }
    if (cnt) Sky.setY = sum / cnt;
  }
  function traceHill(p, L) {
    var xs = L.xs, ys = L.ys, n = xs.length, i;
    p.moveTo(xs[0], HZ + 320); p.lineTo(xs[0], ys[0]);
    for (i = 1; i < n - 1; i++) p.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
    p.lineTo(xs[n - 1], ys[n - 1]); p.lineTo(xs[n - 1], HZ + 320); p.closePath();
  }

  function buildStars() {
    var rng = U.makeRng(4242), i;
    stars.length = 0;
    for (i = 0; i < 170; i++) {
      stars.push({ x: rng.range(-200, W + 200), y: rng.range(-250, HZ * 0.8), r: rng.range(0.6, 1.7), f: rng.range(0.8, 2.4), p: rng.range(0, 6.28) });
    }
  }

  var LAYERS = [
    { n: 5, w: [380, 620], h: [90, 130], y: [0.10, 0.26], a: 0.7, k: 0.6, par: P.sky + 0.01 },
    { n: 4, w: [480, 760], h: [120, 170], y: [0.20, 0.38], a: 0.88, k: 1.0, par: P.sky + 0.03 },
    { n: 3, w: [640, 980], h: [150, 220], y: [0.30, 0.48], a: 1.0, k: 1.5, par: P.sky + 0.07 }
  ];

  function makeCloudDefs() {
    var li, k, idx = 0;
    clouds.length = 0;
    var L = LAYERS.slice(0, S.cloudLayers);
    for (li = 0; li < L.length; li++) {
      for (k = 0; k < L[li].n; k++) {
        var rng = U.makeRng(2025 + idx * 101);
        clouds.push({
          layer: li, par: L[li].par, alpha: L[li].a, speed: L[li].k,
          w: rng.range(L[li].w[0], L[li].w[1]), h: rng.range(L[li].h[0], L[li].h[1]),
          x0: -700 + CLOUD_RANGE * (k + rng.range(0.1, 0.9)) / L[li].n, y: H * rng.range(L[li].y[0], L[li].y[1]),
          rng: rng, mask: null, rim: null, sprite: null, sctx: null, built: -99
        });
        idx++;
      }
    }
  }

  function buildCloud(cl) {
    var s = Sky.cs, pad = 14, rng = cl.rng;
    var w = Math.ceil(cl.w * s) + pad * 2, h = Math.ceil(cl.h * s) + pad * 2;
    var mask = U.createCanvas(w, h), g = mask.getContext('2d');
    var n = 18 + Math.floor(cl.w / 22), baseY = pad + cl.h * s * 0.8, i;
    for (i = 0; i < n; i++) {
      var u = clamp(rng.gauss() * 0.3, -0.5, 0.5), uu = u * 2, prof = Math.pow(Math.max(0, 1 - uu * uu), 0.8);
      var r = cl.h * s * (0.16 + 0.32 * prof * rng.range(0.6, 1));
      var x = pad + cl.w * s * (0.5 + u), y = baseY - rng.range(0, 1) * cl.h * s * 0.72 * prof - r * 0.25;
      g.drawImage(blobSprite, x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'destination-out';           // đáy mây phẳng và mềm
    var fg = g.createLinearGradient(0, baseY - cl.h * s * 0.04, 0, baseY + cl.h * s * 0.16);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fg; g.fillRect(0, baseY - cl.h * s * 0.04, w, h);
    var rim = U.createCanvas(w, h), rg = rim.getContext('2d'), off = Math.max(2, cl.h * s * 0.045);
    rg.drawImage(mask, 0, 0);                                  // viền sáng (silver lining) phía mặt trời (bên trái, trên)
    rg.globalCompositeOperation = 'destination-out'; rg.drawImage(mask, off, off * 0.6);
    cl.mask = mask; cl.rim = rim; cl.sprite = U.createCanvas(w, h); cl.sctx = cl.sprite.getContext('2d'); cl.built = -99;
  }

  /** Tô lại một đám mây theo màu hiện tại: trên tím nhạt, giữa hồng, dưới cam-hồng, phía mặt trời ấm + viền sáng. */
  function paintCloud(cl, t) {
    var g = cl.sctx, w = cl.sprite.width, h = cl.sprite.height, e = TL.env;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, w, h); g.drawImage(cl.mask, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    var lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, rgb(col.ctop)); lg.addColorStop(0.55, rgb(col.cmid)); lg.addColorStop(1, rgb(col.cbot));
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    var sg = g.createLinearGradient(0, 0, w * 0.65, 0);
    sg.addColorStop(0, css(col.sun, 0.34 + 0.2 * e.dusk)); sg.addColorStop(1, css(col.sun, 0));
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.35 + 0.5 * e.dusk;
    g.drawImage(cl.rim, 0, 0);
    g.globalAlpha = 1; cl.built = t;
  }

  /** Danh sách tác vụ dựng cache; mỗi tác vụ nhỏ để màn hình chờ báo tiến độ thật. */
  Sky.tasks = function () {
    var list = [], i;
    makeCloudDefs();
    list.push(function () { blobSprite = makeBlob(); buildHills(); buildStars(); });
    for (i = 0; i < clouds.length; i++) list.push((function (cl) { return function () { buildCloud(cl); }; })(clouds[i]));
    list.push(function () { Sky.update(); for (var k = 0; k < clouds.length; k++) paintCloud(clouds[k], TL.t); });
    return list;
  };

  /* ------------------------------------------------------------------ Vẽ lớp sau */
  function glow(ctx, x, y, r, c, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(c, a)); g.addColorStop(0.35, css(c, a * 0.45)); g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  Sky.drawBack = function (ctx) {
    var t = TL.t, e = TL.env, i, v;
    // 1) Gradient trời 4 tầng + vùng dưới chân trời (đồng cỏ sẽ che phần này)
    cam.apply(ctx, P.sky);
    v = cam.viewRect(P.sky, view);
    var y0 = Math.min(v.y0, -400) - 50, y1 = Math.max(v.y1, HZ + 400), x0 = v.x0 - 60, xw = v.x1 - v.x0 + 120;
    var g = ctx.createLinearGradient(0, -100, 0, SKY_B);
    g.addColorStop(0, rgb(col.top)); g.addColorStop(0.4, rgb(col.mid)); g.addColorStop(0.78, rgb(col.low)); g.addColorStop(1, rgb(col.horizon));
    ctx.fillStyle = g; ctx.fillRect(x0, y0, xw, SKY_B - y0 + 1);
    ctx.fillStyle = rgb(col.horizon); ctx.fillRect(x0, SKY_B, xw, y1 - SKY_B);

    // sao mờ (xuất hiện cuối cảnh)
    if (e.stars > 0.01) {
      ctx.fillStyle = '#FFF8F0';
      for (i = 0; i < stars.length; i++) {
        var st = stars[i], a = e.stars * (0.65 + 0.35 * Math.sin(t * st.f + st.p)) * (1 - sstep(0.22 * H, 0.62 * H, st.y + 250));
        if (a < 0.02) continue;
        ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, U.TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 2) Mặt trời: quầng khí quyển, bloom nhiều lớp, đĩa sáng, dải sáng ngang chân trời
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, sun.x, sun.y, 1100, col.sun, 0.14 + 0.18 * e.dusk);
    glow(ctx, sun.x, sun.y, 520, col.sun, 0.28);
    glow(ctx, sun.x, sun.y, 210, col.sun, 0.5);
    ctx.save(); ctx.translate(sun.x, SKY_B); ctx.scale(1, 0.32);
    glow(ctx, 0, 0, 1000, col.sun, 0.08 + 0.3 * e.dusk);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    var R = S.sunRadius, dg = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, R * 1.1);
    mix(col.sun, '#FFFFFF', 0.7, col.tmpA);
    dg.addColorStop(0, rgb(col.tmpA)); dg.addColorStop(0.78, rgb(col.sun)); dg.addColorStop(1, css(col.sun, 0));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(sun.x, sun.y, R * 1.1, 0, U.TAU); ctx.fill();

    // 3) Mây (2–3 lớp, trôi chậm theo gió, parallax khác nhau); mỗi khung tô lại tối đa 1 đám nếu đã cũ
    for (i = 0; i < clouds.length; i++) {
      var k = (rr + i) % clouds.length, c = clouds[k];
      if (t - c.built > 0.5 || t < c.built) { paintCloud(c, t); break; }
    }
    rr = (rr + 1) % Math.max(1, clouds.length);
    var lastPar = -1, shift = S.cloudDrift * (t + 0.012 * t * t);   // gió mạnh dần → mây trôi nhanh dần (xác định theo t)
    for (i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      if (cl.par !== lastPar) { cam.apply(ctx, cl.par); lastPar = cl.par; }
      var cx = U.mod(cl.x0 + shift * cl.speed + 700, CLOUD_RANGE) - 700;
      var dw = cl.sprite.width / Sky.cs, dh = cl.sprite.height / Sky.cs;
      ctx.globalAlpha = cl.alpha;
      ctx.drawImage(cl.sprite, cx - dw / 2, cl.y - dh / 2, dw, dh);
    }
    ctx.globalAlpha = 1;

    // 4) Đồi/núi xa: càng xa càng nhạt, xanh và nhoè; dải sương ở chân mỗi lớp lấy màu chân trời
    var n = hills.length, dusk = e.dusk;
    mix('#9DB7D6', '#6E5CA0', dusk, col.tmpA);       // tông lớp xa
    mix('#4E7A6A', '#3A2F5E', dusk, col.tmpB);       // tông lớp gần
    for (i = 0; i < n; i++) {
      var L = hills[i], f = L.f;
      cam.apply(ctx, L.par);
      v = cam.viewRect(L.par, view);
      mix(col.tmpA, col.tmpB, f, col.tmpC);
      mix(col.tmpC, col.low, lerp(0.78, 0.22, f), col.tmpC);      // tán xạ khí quyển
      ctx.fillStyle = rgb(col.tmpC);
      if (L.path) ctx.fill(L.path);
      else { ctx.beginPath(); traceHill(ctx, L); ctx.fill(); }
      var ma = lerp(0.5, 0.28, f) * (0.7 + 0.3 * dusk), mg = ctx.createLinearGradient(0, L.base - 90, 0, L.base + 60);
      mg.addColorStop(0, css(col.mist, 0)); mg.addColorStop(0.55, css(col.mist, ma)); mg.addColorStop(1, css(col.mist, ma * 0.7));
      ctx.fillStyle = mg; ctx.fillRect(v.x0 - 40, L.base - 90, v.x1 - v.x0 + 80, 150);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  /* ----------------------------------------------------------- Vẽ lớp trước: ánh sáng */
  function ensureRay() {
    var w = Math.max(2, Math.ceil(cam.sw * Sky.rayScale)), h = Math.max(2, Math.ceil(cam.sh * Sky.rayScale));
    if (!rayCv) { rayCv = U.createCanvas(w, h); rayCtx = rayCv.getContext('2d'); }
    else if (rayCv.width !== w || rayCv.height !== h) { rayCv.width = w; rayCv.height = h; }
  }
  function beam(rc, x, y, th, hw, L, a) {
    var x1 = x + Math.cos(th - hw) * L, y1 = y + Math.sin(th - hw) * L, x2 = x + Math.cos(th + hw) * L, y2 = y + Math.sin(th + hw) * L;
    var g = rc.createLinearGradient(x, y, x + Math.cos(th) * L, y + Math.sin(th) * L);
    g.addColorStop(0, css(col.ray, a)); g.addColorStop(0.55, css(col.ray, a * 0.45)); g.addColorStop(1, css(col.ray, 0));
    rc.fillStyle = g; rc.beginPath(); rc.moveTo(x, y); rc.lineTo(x1, y1); rc.lineTo(x2, y2); rc.closePath(); rc.fill();
  }
  function ghost(ctx, x, y, r, c, a, ring) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (ring) { g.addColorStop(0, css(c, 0)); g.addColorStop(0.72, css(c, 0)); g.addColorStop(0.9, css(c, a)); g.addColorStop(1, css(c, 0)); }
    else { g.addColorStop(0, css(c, a)); g.addColorStop(1, css(c, 0)); }
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  var GH = [[0.28, 0.05, 0, 0.14, '#FFE9B0'], [0.55, 0.09, 1, 0.10, '#FFB6C8'], [0.9, 0.035, 0, 0.18, '#C8A0F0'], [1.25, 0.12, 1, 0.08, '#FFC27A'], [1.7, 0.06, 0, 0.12, '#FFE9B0']];

  Sky.drawFront = function (ctx) {
    var t = TL.t, e = TL.env, k = e.godRays, d = cam.dpr, i;
    Sky.sunScreen(tmp);
    var sx = tmp[0] * d, sy = tmp[1] * d, cx = cam.sw / 2, cy = cam.sh / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // God rays: 6–10 chùm toả từ mặt trời, sáng dao động chậm theo noise, mạnh dần khi hoàng hôn
    if (k > 0.01 && Sky.rayCount > 0) {
      ensureRay();
      var rs = rayCv.width / cam.sw, rc = rayCtx, n = Sky.rayCount, L = Math.max(cam.sw, cam.sh) * 1.7, a0 = sun.alt * DEG;
      rc.setTransform(1, 0, 0, 1, 0, 0); rc.clearRect(0, 0, rayCv.width, rayCv.height);
      rc.setTransform(rs, 0, 0, rs, 0, 0);
      rc.globalCompositeOperation = 'lighter';
      for (i = 0; i < n; i++) {
        var f = (i + 0.5) / n, nz = U.noise2(i * 7.13, t * 0.12);
        var th = lerp(-0.1 + a0 * 0.5, 0.78 + a0 * 0.4, f) + nz * 0.05;
        var hw = 0.011 + 0.022 * (0.5 + 0.5 * U.noise2(i * 3.7, 9.1));
        var al = Math.pow(clamp(0.55 + 0.45 * nz, 0, 1), 1.4) * k * 0.2;
        beam(rc, sx, sy, th, hw * 2.4, L, al * 0.4);
        beam(rc, sx, sy, th, hw, L, al);
      }
      ctx.globalCompositeOperation = 'screen';
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(rayCv, 0, 0, cam.sw, cam.sh);
    }

    // Quầng sáng tán xạ + lens flare dọc trục mặt trời → tâm màn hình (mờ dần khi mặt trời rời khung)
    var dist = Math.hypot((sx - cx) / cam.sw, (sy - cy) / cam.sh), vis = 1 - sstep(0.55, 1.1, dist);
    ctx.globalCompositeOperation = 'lighter';
    if (vis > 0.01) {
      glow(ctx, sx, sy, cam.sw * 0.9, col.sun, (0.07 + 0.1 * e.dusk) * vis);
      var fk = vis * (0.35 + 0.65 * e.dusk) * e.fade;
      for (i = 0; i < GH.length; i++) {
        var gh = GH[i];
        ghost(ctx, sx + (cx - sx) * gh[0], sy + (cy - sy) * gh[0], gh[1] * cam.sh, gh[4], gh[3] * fk, gh[2]);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  };
})();
