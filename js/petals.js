/* ============================================================================
 * js/petals.js – Cánh hoa và lá rơi, sinh ra từ chính các bông hoa trong tán (Tree.pickSource / pickLeaf).
 *  Petals.tasks()                  → tác vụ dựng sprite (cánh hoa nhiều hình/màu × 3 mức mờ theo độ sâu × bản "ngược sáng")
 *  Petals.update(dt)               → sinh hạt theo env.petalRate, mô phỏng, hạ cánh
 *  Petals.drawGround(ctx)          → lớp cánh hoa đã lắng trên mặt đất (cache) – gọi ngay sau đồng cỏ sau (lớp 5)
 *  Petals.drawBack / drawMid / drawFront(ctx) → lớp 6 / 9 / 12 (sau cây / giữa / trước cây, mỗi lớp parallax riêng)
 *  Petals.setQuality(q), Petals.setReduced(bool), Petals.reset(), Petals.prewarm(giây), Petals.count
 * Vật lý: mỗi hạt có vận tốc, khối lượng, hệ số cản, xoay, lắc ngang (flutter) và lật 3D giả (scaleX = |cos|).
 * Cản lớn khi nằm phẳng (lướt chậm), nhỏ khi nằm cạnh (rơi nhanh) → vận tốc hướng tới
 *   v* = gió(curl + giật + xung) + (flutter, vt·(1.55 − 0.9·phẳng)), tốc độ bám = (0.8 + 1.8·phẳng)/khối lượng.
 * Móc nối với module sau (nếu có): App.pond.catchPetal(x,y,size,ang,kind) → true nếu ao nhận cánh hoa (gợn sóng, trôi);
 *   App.stickman.catchPetal(x,y,size) → true nếu cánh hoa đậu lên vai/tóc.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, PC = C.petals, TC = C.timeline, TL = App.timeline, cam = App.camera, Wd = App.wind;
  var W = C.virtual.w, H = C.virtual.h, L = C.layout, TAU = U.TAU, PI = Math.PI;
  var clamp = U.clamp, lerp = U.lerp, ease = U.ease;
  var ZN = L.wishZone, zx0 = ZN.x0 * W - 40, zx1 = ZN.x1 * W + 40, zy0 = ZN.y0 * H - 40, zy1 = ZN.y1 * H + 40;

  var PAR = [0.92, 1, 1.2];                       // parallax: sau cây / giữa / trước cây
  var SIZE = [[7, 11], [10, 16], [22, 38]];       // kích thước (đơn vị ảo): xa nhỏ, gần to
  var SPD = [0.65, 1, 1.4];                       // hệ số tốc độ biểu kiến: xa chậm, gần nhanh
  var ALPHA = [0.62, 0.96, 0.72];                 // xa mờ nhạt, gần mờ bokeh
  var BLUR = [1.2, 0, 4.5];                       // độ nhoè sprite (px trên sprite 64)
  var NPET = 12, NVAR = 16, SS = 64, FILL = 0.69; // 12 cánh hoa (4 hình × 3 màu) + 4 lá; sprite 64px, hình chiếm 69%
  var HQ = C.quality.levels.high.flying;

  var pool = new U.Pool(function () {
    return { layer: 1, kind: 0, v: 0, x: 0, y: 0, vx: 0, vy: 0, mass: 1, vt: 70, size: 12, ang: 0, spin: 0, flip: 0, flipV: 0,
      phi: 0, fA: 20, fw: 3, age: 0, land: -1, landY: 900, tick: 0, lf: 1 };
  }, HQ);
  var Petals = App.petals = { count: 0, density: 1, settled: 0 };
  var maxLive = HQ, acc = 0, latch = false;
  var spr = [[[], []], [[], []], [[], []]];       // spr[lớp][ngược sáng][biến thể]
  var wv = [0, 0], tA = [0, 0], tB = [0, 0], src = { x: 0, y: 0, layer: 1, size: 12, v: 0 };
  var rng = U.makeRng(9090), rngS = U.makeRng(3030);
  var GS = 1.25, GX = -100, GY = 0.70 * H, GW = W + 200, GH = 0.38 * H, gcv = null, gctx = null;   // cache cánh hoa trên đất

  /* ------------------------------------------------------------------ Sprite */
  var PCOL = [['#FFFFFF', '#FFEAF1', '#FFC9DC'], ['#FFF0F4', '#FFC1D6', '#F48FB1'], ['#F9C6DA', '#F48FB1', '#D96A98']];
  var LCOL = [['#9AD07A', '#7FBF7A', '#B58A4A'], ['#D9895A', '#B5603F', '#7A3E2E']];
  function warmCol(c) { return U.css(U.mix(c, '#FFD9A0', 0.38)); }
  function shapePath(g, s, Lp, leaf) {
    g.beginPath(); g.moveTo(0, 0);
    if (leaf) {
      var w = s ? 0.42 : 0.62;
      g.bezierCurveTo(w * Lp, -Lp * 0.25, w * 0.8 * Lp, -Lp * 0.8, 0, -Lp);
      g.bezierCurveTo(-w * 0.8 * Lp, -Lp * 0.8, -w * Lp, -Lp * 0.25, 0, 0);
    } else if (s === 0) {                                           // cánh có khía
      g.bezierCurveTo(-0.7 * Lp * 0.95, -Lp * 0.18, -0.7 * Lp * 1.05, -Lp * 0.78, -0.7 * Lp * 0.3, -Lp * 0.96);
      g.quadraticCurveTo(-0.7 * Lp * 0.1, -Lp * 0.9, 0, -Lp * 0.82);
      g.quadraticCurveTo(0.7 * Lp * 0.1, -Lp * 0.9, 0.7 * Lp * 0.3, -Lp * 0.96);
      g.bezierCurveTo(0.7 * Lp * 1.05, -Lp * 0.78, 0.7 * Lp * 0.95, -Lp * 0.18, 0, 0);
    } else if (s === 1) {                                           // cánh tròn
      g.bezierCurveTo(-0.75 * Lp, -Lp * 0.15, -0.7 * Lp, -Lp * 0.85, 0, -Lp);
      g.bezierCurveTo(0.7 * Lp, -Lp * 0.85, 0.75 * Lp, -Lp * 0.15, 0, 0);
    } else if (s === 2) {                                           // cánh thon
      g.bezierCurveTo(-0.38 * Lp, -Lp * 0.25, -0.34 * Lp, -Lp * 0.8, 0, -Lp);
      g.bezierCurveTo(0.34 * Lp, -Lp * 0.8, 0.38 * Lp, -Lp * 0.25, 0, 0);
    } else {                                                        // cánh cong, lệch
      g.bezierCurveTo(-0.9 * Lp, -Lp * 0.1, -0.5 * Lp, -Lp * 0.9, 0.15 * Lp, -Lp);
      g.bezierCurveTo(0.8 * Lp, -Lp * 0.8, 0.55 * Lp, -Lp * 0.2, 0, 0);
    }
    g.closePath();
  }
  function makeSprite(v, warm) {
    var cv = U.createCanvas(SS, SS), g = cv.getContext('2d'), leaf = v >= NPET, Lp = SS * FILL;
    var shape = leaf ? (v - NPET) % 2 : v % 4, cols = leaf ? LCOL[(v - NPET) >> 1] : PCOL[v >> 2];
    if (warm) cols = [warmCol(cols[0]), warmCol(cols[1]), warmCol(cols[2])];
    g.translate(SS / 2, SS / 2 + Lp / 2);
    var gr = g.createLinearGradient(0, 0, 0, -Lp);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.5, cols[1]); gr.addColorStop(1, cols[2]);
    shapePath(g, shape, Lp, leaf); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = leaf ? 'rgba(255,248,240,0.4)' : 'rgba(190,80,125,0.22)';
    g.beginPath(); g.moveTo(0, -Lp * 0.1); g.lineTo(0, -Lp * 0.8); g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';                     // rim light cam phía mặt trời + bóng tím phía khuất
    var a = g.createLinearGradient(0, 0, SS, 0);
    a.addColorStop(0, 'rgba(255,170,90,0.3)'); a.addColorStop(0.5, 'rgba(255,170,90,0)'); a.addColorStop(1, 'rgba(106,61,134,0.18)');
    g.fillStyle = a; g.fillRect(0, 0, SS, SS);
    return cv;
  }
  function blurred(srcCv, r) {                                      // nhoè hộp bằng cộng 17 bản lệch nhau (không phụ thuộc ctx.filter)
    if (r <= 0) return srcCv;
    var d = U.createCanvas(SS, SS), g = d.getContext('2d'), pts = [[0, 0]], k;
    for (k = 0; k < 8; k++) pts.push([Math.cos(k * TAU / 8) * r, Math.sin(k * TAU / 8) * r]);
    for (k = 0; k < 8; k++) pts.push([Math.cos(k * TAU / 8 + 0.4) * r * 0.5, Math.sin(k * TAU / 8 + 0.4) * r * 0.5]);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 / pts.length;
    for (k = 0; k < pts.length; k++) g.drawImage(srcCv, pts[k][0], pts[k][1]);
    return d;
  }
  function buildLayer(layer) {
    for (var w = 0; w < 2; w++) {
      spr[layer][w].length = 0;
      for (var v = 0; v < NVAR; v++) spr[layer][w].push(blurred(makeSprite(v, w), BLUR[layer]));
    }
  }
  function buildGround() {
    gcv = U.createCanvas(GW * GS, GH * GS); gctx = gcv.getContext('2d');
  }
  Petals.tasks = function () {
    return [function () { buildLayer(0); }, function () { buildLayer(1); }, function () { buildLayer(2); }, buildGround];
  };

  /* --------------------------------------------------------------- Sinh hạt */
  function spawn(layer, leaf, wx, wy, boost) {
    if (pool.count >= maxLive) return null;
    var p = pool.spawn(), par = PAR[layer];
    if (!p) return null;
    if (par !== 1) { cam.worldToScreen(wx, wy, 1, tA); cam.screenToWorld(tA[0], tA[1], par, tB); wx = tB[0]; wy = tB[1]; }
    p.layer = layer; p.kind = leaf ? 1 : 0;
    p.v = leaf ? NPET + rng.int(0, 3) : rng.int(0, NPET - 1);
    p.x = wx; p.y = wy;
    Wd.sample(wx, wy, TL.t, wv);
    p.vx = wv[0] * 0.5 + (boost || 0) * rng.range(0.6, 1.2); p.vy = rng.range(0, 10);
    p.mass = rng.range(PC.mass[0], PC.mass[1]);
    p.size = rng.range(SIZE[layer][0], SIZE[layer][1]) * (leaf ? 1.5 : 1);
    p.vt = rng.range(PC.fall[0], PC.fall[1]) * (leaf ? 1.1 : 1);
    p.ang = rng.range(0, TAU); p.spin = rng.range(-2.2, 2.2) * (leaf ? 0.5 : 1);
    p.flip = rng.range(0, TAU); p.flipV = rng.range(1.5, 4) * (leaf ? 0.6 : 1) * (rng.chance(0.5) ? 1 : -1);
    p.phi = rng.range(0, TAU); p.fA = rng.range(PC.flutterAmp[0], PC.flutterAmp[1]) * (leaf ? 0.8 : 1); p.fw = rng.range(2.2, 4.4);
    p.age = 0; p.land = -1; p.tick = 0; p.lf = SPD[layer];
    p.landY = layer === 0 ? H * rng.range(0.77, 0.81) : (layer === 1 ? H * rng.range(0.81, 0.93) : H * rng.range(0.95, 1.03));
    return p;
  }
  function pickLayer() {
    var r = rng.next();
    return r < PC.layers.back ? 0 : (r < PC.layers.back + PC.layers.mid ? 1 : 2);
  }
  function emit(boost) {
    var T = App.tree, t = TL.t, leaf = t >= PC.leafFrom && rng.chance(PC.leafShare), s = null;
    if (!T) return;
    if (leaf) s = T.pickLeaf(rng, src);
    if (!s) { leaf = false; s = T.pickSource(rng, src); }
    if (!s) return;                                                 // chưa có bông nào nở → chưa rơi
    spawn(pickLayer(), leaf, s.x + rng.range(-8, 8), s.y + rng.range(-6, 10), boost);
  }

  /* ---------------------------------------------------------- Hạ cánh, lắng */
  function toWorld(p, out) {
    var par = PAR[p.layer];
    if (par === 1) { out[0] = p.x; out[1] = p.y; return out; }
    cam.worldToScreen(p.x, p.y, par, tA); cam.screenToWorld(tA[0], tA[1], 1, out);
    return out;
  }
  function settle(p) {
    toWorld(p, tB);
    var Pd = App.pond;
    if (Pd && Pd.catchPetal && Pd.catchPetal(tB[0], tB[1], p.size, p.ang, p.kind)) return;       // rơi xuống ao
    if (!gctx || Petals.settled >= PC.groundMax) return;
    if (!rngS.chance(1 - 0.5 * Petals.settled / PC.groundMax)) return;
    if (tB[0] < GX || tB[0] > GX + GW || tB[1] < GY || tB[1] > GY + GH) return;
    var s = p.size / FILL * GS;
    gctx.save(); gctx.globalAlpha = 0.92;
    gctx.translate((tB[0] - GX) * GS, (tB[1] - GY) * GS); gctx.rotate(p.ang); gctx.scale(1, 0.3);
    gctx.drawImage(spr[1][0][p.v] || spr[1][0][0], -s / 2, -s / 2, s, s);
    gctx.restore();
    Petals.settled++;
  }

  /* ---------------------------------------------------------------- Mô phỏng */
  function step(p, dt, t) {
    var SM, Pd, flat, c, tx, ty, k;
    p.age += dt; p.tick++;
    if (p.land >= 0) {                                              // lắng xuống: tắt dần chuyển động, nằm phẳng
      p.land += dt; p.vx *= Math.exp(-6 * dt);
      p.y += (p.landY - p.y) * Math.min(1, 6 * dt); p.x += p.vx * dt * p.lf;
      p.ang += p.spin * dt * Math.max(0, 1 - p.land * 3);
      if (p.land > 0.4) { settle(p); pool.kill(p); }
      return;
    }
    Wd.sample(p.x, p.y, t, wv);
    flat = Math.abs(Math.cos(p.flip));
    c = (0.8 + 1.8 * flat) / p.mass * (p.kind ? 0.8 : 1);
    tx = wv[0] + p.fA * Math.sin(p.fw * t + p.phi) * (0.35 + 0.65 * flat);
    ty = wv[1] + p.vt * (1.55 - 0.9 * flat);
    k = Math.min(1, c * dt);
    p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
    p.x += p.vx * dt * p.lf; p.y += p.vy * dt * p.lf;
    p.flip += p.flipV * dt; p.ang += p.spin * dt + p.vx * 0.003 * dt;
    if (p.y >= p.landY) {
      toWorld(p, tB); Pd = App.pond;
      if (Pd && Pd.catchPetal && p.layer > 0 && Pd.catchPetal(tB[0], tB[1], p.size, p.ang, p.kind)) { pool.kill(p); return; }
      p.land = 0;
    } else if (p.x < -400 || p.x > W + 400 || p.y > H + 200 || p.age > 45) pool.kill(p);
    else if (p.layer === 1 && (p.tick & 7) === 0 && t > TC.walkStart + 4) {
      SM = App.stickman;
      if (SM && SM.catchPetal && SM.catchPetal(p.x, p.y, p.size)) pool.kill(p);       // đáp lên vai / tóc stickman
    }
  }

  Petals.update = function (dt) {
    var t = TL.t, i, p, n = 0;
    acc += TL.env.petalRate * (maxLive / 7) * Petals.density * dt;
    while (acc >= 1) { acc -= 1; emit(0); }
    if (!latch && Wd.gust > 0.3 && t >= PC.leafFrom) {              // gió giật → dải cánh hoa/lá bay ngang, xoáy mềm
      latch = true;
      for (i = 0, n = 14 + rng.int(0, 14); i < n; i++) emit(80 + 90 * Wd.gust);
    } else if (latch && Wd.gust < 0.1) latch = false;
    for (i = 0; i < pool.size; i++) { p = pool.items[i]; if (p.alive) step(p, dt, t); }
    Petals.count = pool.count;
  };
  Petals.prewarm = function (sec) {                                 // chạy trước vài giây để cảnh không "trống" sau khi tua
    for (var i = 0, n = Math.ceil(sec / 0.1); i < n; i++) Petals.update(0.1);
  };

  /* ------------------------------------------------------------------- Vẽ */
  function drawLayer(ctx, layer) {
    var t = TL.t, par = PAR[layer], items = pool.items, i, p, a, s, sx, warm, sun = App.sky, zf = ease.inOutCubic((t - 56) / 3);
    cam.apply(ctx, par);
    if (layer < 2 && sun) sun.sunScreen(tA);
    for (i = 0; i < items.length; i++) {
      p = items[i];
      if (!p.alive || p.layer !== layer) continue;
      sx = Math.abs(Math.cos(p.flip));
      if (p.land >= 0) sx = lerp(sx, 1, ease.outCubic(p.land / 0.4));
      if (sx < 0.07) sx = 0.07;
      a = ALPHA[layer] * Math.min(1, p.age / 0.5);
      if (zf > 0 && p.x > zx0 && p.x < zx1 && p.y > zy0 && p.y < zy1) a *= 1 - zf * (layer === 2 ? 0.88 : (layer === 1 ? 0.45 : 0.2));   // không che lời chúc
      warm = 0;
      if (layer < 2 && sun) {                                       // ngược sáng (gần mặt trời trên màn hình): ấm hơn, trong hơn
        cam.worldToScreen(p.x, p.y, par, tB);
        warm = Math.hypot(tB[0] - tA[0], tB[1] - tA[1]) < 0.8 * cam.cssH ? 1 : 0;
      }
      s = p.size / FILL;
      ctx.globalAlpha = a * (warm ? 0.9 : 1);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(sx, 1);
      ctx.drawImage(spr[layer][warm][p.v], -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  Petals.drawBack = function (ctx) { drawLayer(ctx, 0); };
  Petals.drawMid = function (ctx) { drawLayer(ctx, 1); };
  Petals.drawFront = function (ctx) { drawLayer(ctx, 2); };
  Petals.drawGround = function (ctx) {
    if (!gcv || Petals.settled === 0) return;
    cam.apply(ctx, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(gcv, GX, GY, GW, GH);
  };

  /* ---------------------------------------------------------- Điều khiển */
  Petals.setQuality = function (q) { maxLive = Math.min(HQ, q.flying); };
  Petals.setReduced = function (on) { Petals.density = on ? C.reduced.particles : 1; };
  Petals.reset = function () {                                      // giải phóng sạch: hạt, cache đất, bộ đếm
    pool.clear(); acc = 0; latch = false; Petals.settled = 0; Petals.count = 0;
    if (gctx) { gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, gcv.width, gcv.height); }
  };
  TL.on('reset', Petals.reset);
  TL.on('seek', Petals.reset);       // sau khi tua, main.js gọi Petals.prewarm(7)
})();
