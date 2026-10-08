/* ============================================================================
 * js/pond.js – Ao sen tiền cảnh (góc dưới trái → giữa), vẽ ở lớp 10 với parallax "fore" (1.25).
 *  Pond.tasks()                       → tác vụ dựng sprite cánh sen
 *  Pond.update(dt)                    → gợn sóng, cánh hoa trôi, gió trên mặt nước
 *  Pond.draw(ctx)                     → nước (phản chiếu trời lật dọc, phản chiếu mờ của cây, glitter, sóng gió, gợn sóng,
 *                                       cánh hoa nổi) → lá sen (gân toả tia, giọt nước) → hoa sen nở dần
 *  Pond.catchPetal(x,y,size,ang,kind) → true nếu cánh hoa/lá (toạ độ thế giới) rơi trúng nước hoặc lá sen: tạo gợn sóng,
 *                                       cánh hoa trôi hoặc đậu trên lá (petals.js gọi hàm này khi hạ cánh)
 *  Pond.shorePoint(rng, out)          → điểm ngẫu nhiên gần bờ ao (toạ độ lớp fore) cho đom đóm; Pond.PAR = 1.25
 *  Pond.setQuality(q), Pond.reset()
 * Ao nằm ngoài vùng lời chúc và cách xa stickman: hoa sen cao chỉ mọc ở x ≤ 520 (hoặc một bông thấp ở x ≈ 800–860).
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, PC = C.pond, TL = App.timeline, cam = App.camera;
  var W = C.virtual.w, H = C.virtual.h, TAU = U.TAU, PI = Math.PI, PAR = C.camera.parallax.fore;
  var clamp = U.clamp, lerp = U.lerp, ease = U.ease, css = U.css, mix = U.mix, sstep = U.smoothstep;
  var CX = 0.2 * W, CY = 1.02 * H, RY = 0.16 * H, XR = 0.465 * W, RX = XR - CX;   // elip nước: bờ trên ≈ 0.86H

  var Pond = App.pond = { PAR: PAR };
  var pads = [], lotus = [], sparks = [], px = [], py = [], spr = {}, wv = [0, 0], tA = [0, 0], tB = [0, 0];
  var ripples = null, floaters = null, wind = { x: 0, v: 0 }, frac = 1, refl = null, reflOn = true;
  var rng = U.makeRng(PC.seed);

  function shoreY(x) {
    var u = clamp((x - CX) / RX, -1.2, 1), e = Math.sqrt(Math.max(0, 1 - u * u));
    return CY - RY * e + 6 * U.noise1(x * 0.011 + 3.1) + 2.5 * U.noise1(x * 0.042 + 9.7);
  }
  function inWater(x, y, m) { return x > -100 && x < XR - m && y > shoreY(x) + m; }
  function tracePond(g) {
    var i;
    g.moveTo(px[0], 1.3 * H);
    for (i = 0; i < px.length; i++) g.lineTo(px[i], py[i]);
    g.lineTo(XR, 1.3 * H); g.closePath();
  }

  /* ------------------------------------------------------------- Sinh bố cục */
  function generate() {
    var i, tries, x, y, r, ok, k;
    px.length = 0; py.length = 0;
    for (x = -130; x <= XR; x += 12) { px.push(x); py.push(shoreY(x)); }
    pads.length = 0;
    for (i = 0, tries = 0; pads.length < PC.pads && tries < 400; tries++) {
      x = rng.range(-40, XR - 60); r = rng.range(34, 64); y = rng.range(shoreY(x) + r * 0.4 + 8, 1.06 * H);
      if (!inWater(x, y - r * 0.38, 6) || x + r > XR - 10) continue;
      ok = true;
      for (k = 0; k < pads.length; k++) if (Math.hypot(pads[k].x - x, (pads[k].y - y) * 2.2) < (pads[k].r + r) * 0.78) ok = false;
      if (!ok) continue;
      var nd = rng.int(2, 4), drops = [];
      for (k = 0; k < nd; k++) { var a = rng.range(0, TAU), d = rng.range(0.1, 0.7) * r; drops.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.range(2.2, 4.2) }); }
      pads.push({ x: x, y: y, r: r, rot: rng.range(0, TAU), notch: rng.range(0, TAU), ph: rng.range(0, TAU), drops: drops, petals: [], tone: rng.range(0, 1) });
    }
    pads.sort(function (a, b) { return a.y - b.y; });
    lotus.length = 0;
    var open = rng.shuffle([0.12, 0.3, 0.6, 0.8, 1, 1]);
    for (i = 0; i < PC.lotus; i++) {
      var low = i >= 5;                                          // một bông thấp ở rìa phải, còn lại nằm bên trái (xa stickman)
      x = low ? rng.range(800, 850) : rng.range(70, 500);
      y = shoreY(x) + rng.range(26, 80);
      lotus.push({ x: x, y: Math.min(y, 1.07 * H), h: low ? rng.range(40, 55) : rng.range(70, 130), size: rng.range(46, 62), lean: rng.range(-0.12, 0.12),
        ph: rng.range(0, TAU), emerge: 6 + i * 1.3 + rng.range(0, 2), t0: 8 + i * 5.5 + rng.range(0, 3), dur: rng.range(16, 24), maxOpen: open[i % 6],
        a: [rng.range(-0.05, 0.05), rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)] });
    }
    lotus.sort(function (a, b) { return a.y - b.y; });
    sparks.length = 0;
    for (i = 0, tries = 0; sparks.length < PC.glitter && tries < 2000; tries++) {
      x = rng.range(-100, XR - 20); y = rng.range(shoreY(x) + 8, 1.1 * H);
      if (!inWater(x, y, 6)) continue;
      sparks.push({ x: x, y: y, w: rng.range(5, 14), h: rng.range(1, 2.2), ph: rng.range(0, 100), f: rng.range(0.3, 0.9), k: rng.next() });
    }
    ripples = new U.Pool(function () { return { x: 0, y: 0, t0: 0, R: 20, life: 2.4 }; }, PC.ripplesMax);
    floaters = new U.Pool(function () { return { x: 0, y: 0, ang: 0, size: 10, col: 0, kind: 0, age: 0, spin: 0, ph: 0 }; }, 80);
    refl = { sc: 0.3, x0: -130, y0: 0.84 * H, w: XR + 130, h: 0.46 * H };
    refl.cv = U.createCanvas(refl.w * refl.sc, refl.h * refl.sc); refl.ctx = refl.cv.getContext('2d');
  }

  /* ---------------------------------------------------------------- Sprite */
  function petalSprite(wid, tip) {                               // cánh sen nhọn: trắng ở gốc → hồng đậm dần ở đầu cánh
    var w = 112, h = 200, cv = U.createCanvas(w, h), g = cv.getContext('2d'), hw = 52 * wid;
    var gr = g.createLinearGradient(0, h - 4, 0, 6);
    gr.addColorStop(0, '#FFF8F0'); gr.addColorStop(0.35, '#FFE6EE'); gr.addColorStop(0.7, '#F9A9C6'); gr.addColorStop(1, tip);
    g.beginPath(); g.moveTo(w / 2, h - 4);
    g.bezierCurveTo(w / 2 - hw, 150, w / 2 - hw * 0.85, 70, w / 2, 6);
    g.bezierCurveTo(w / 2 + hw * 0.85, 70, w / 2 + hw, 150, w / 2, h - 4);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = 'rgba(200,80,130,0.22)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(w / 2, h - 10); g.lineTo(w / 2, 22); g.stroke();
    g.globalCompositeOperation = 'source-atop';                  // rim ấm phía mặt trời (trái), tím phía khuất
    var a = g.createLinearGradient(0, 0, w, 0);
    a.addColorStop(0, 'rgba(255,170,90,0.28)'); a.addColorStop(0.5, 'rgba(255,170,90,0)'); a.addColorStop(1, 'rgba(106,61,134,0.16)');
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    return cv;
  }
  Pond.tasks = function () {
    return [function () { spr.outer = petalSprite(1, '#EC6C9C'); spr.mid = petalSprite(0.82, '#E8588F'); spr.inner = petalSprite(0.62, '#DC3F7E'); generate(); }];
  };

  /* -------------------------------------------------------------- Cập nhật */
  Pond.update = function (dt) {
    var t = TL.t, i, f, Wd = App.wind;
    if (!ripples) return;
    if (Wd) { Wd.sample(300, 1000, t, wv); U.springStep(wind, clamp(wv[0] / 100, -1.5, 1.5), 22, 5, dt); }
    for (i = 0; i < ripples.size; i++) { var r = ripples.items[i]; if (r.alive && t - r.t0 > r.life) ripples.kill(r); }
    for (i = 0; i < floaters.size; i++) {                        // cánh hoa trôi nhẹ trên mặt nước
      f = floaters.items[i];
      if (!f.alive) continue;
      f.age += dt;
      if (Wd) Wd.sample(f.x, f.y, t, wv); else { wv[0] = 10; wv[1] = 0; }
      f.x += (wv[0] * 0.05 + 3 * Math.sin(0.7 * t + f.ph)) * dt; f.y += (wv[1] * 0.02 + 1.2 * Math.cos(0.5 * t + f.ph)) * dt; f.ang += f.spin * dt;
      if (f.age > 60 || !inWater(f.x, f.y, 4)) floaters.kill(f);
    }
  };

  function addRipple(x, y, R) {
    var r = ripples.spawn();
    if (!r) { r = ripples.items[0]; for (var i = 1; i < ripples.size; i++) if (ripples.items[i].t0 < r.t0) r = ripples.items[i]; }
    r.x = x; r.y = y; r.t0 = TL.t; r.R = R; r.life = 2.4; r.alive = true;
  }
  Pond.catchPetal = function (wx, wy, size, ang, kind) {
    if (!ripples) return false;
    cam.worldToScreen(wx, wy, 1, tA); cam.screenToWorld(tA[0], tA[1], PAR, tB);
    var x = tB[0], y = tB[1], i, p, f;
    if (!inWater(x, y, 4)) return false;
    for (i = 0; i < pads.length; i++) {                          // đậu trên lá sen
      p = pads[i];
      if (p.petals.length < 4 && Math.pow((x - p.x) / p.r, 2) + Math.pow((y - p.y) / (p.r * 0.38), 2) < 0.8) {
        p.petals.push({ dx: (x - p.x), dy: (y - p.y) / 0.38, ang: ang, size: size, kind: kind });
        return true;
      }
    }
    addRipple(x, y, 14 + size * 1.2);
    f = floaters.spawn();
    if (!f) { f = floaters.items[0]; for (i = 1; i < floaters.size; i++) if (floaters.items[i].age > f.age) f = floaters.items[i]; f.alive = true; }
    f.x = x; f.y = y; f.ang = ang; f.size = size; f.kind = kind; f.col = (Math.random() * 3) | 0; f.age = 0; f.spin = (Math.random() - 0.5) * 0.3; f.ph = Math.random() * TAU;
    return true;
  };
  Pond.shorePoint = function (r, out) {
    out = out || [0, 0];
    var x = r.range(0, XR - 40);
    out[0] = x; out[1] = shoreY(x) + r.range(-30, 40);
    return out;
  };

  /* ------------------------------------------------------------------ Vẽ */
  function drawWater(ctx, t, env, sky, sun) {
    var dusk = env.dusk, i, g, y0 = shoreY(CX) - 4, y1 = 1.2 * H;
    ctx.save(); ctx.beginPath(); tracePond(ctx); ctx.clip();
    var base = mix('#3C7E86', '#2C3566', dusk);
    ctx.fillStyle = css(base); ctx.fillRect(-140, y0, XR + 160, y1 - y0);
    if (sky) {                                                   // phản chiếu bầu trời lật dọc: chân trời ấm ở bờ → đỉnh trời tối ở gần
      g = ctx.createLinearGradient(0, y0, 0, 1.1 * H);
      g.addColorStop(0, css(sky.colors.horizon, 0.85)); g.addColorStop(0.35, css(sky.colors.low, 0.8)); g.addColorStop(0.75, css(sky.colors.mid, 0.7)); g.addColorStop(1, css(sky.colors.top, 0.6));
      ctx.fillStyle = g; ctx.fillRect(-140, y0, XR + 160, y1 - y0);
    }
    var T = App.tree;
    if (reflOn && T && T.sil && T.sil.cv && refl) {              // phản chiếu mờ của cây (silhouette lật, nén theo chiều dọc, nhuộm hồng tím)
      var R = refl, g2 = R.ctx, k = 0.17, yM = T.base.y + 70;
      g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalCompositeOperation = 'source-over'; g2.clearRect(0, 0, R.cv.width, R.cv.height);
      g2.setTransform(R.sc, 0, 0, -k * R.sc, -R.x0 * R.sc, ((1 + k) * yM - R.y0) * R.sc);
      g2.drawImage(T.sil.cv, T.sil.x, T.sil.y, T.sil.w, T.sil.h);
      g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalCompositeOperation = 'source-in';
      var tg = g2.createLinearGradient(0, 0, R.cv.width, 0); tg.addColorStop(0, '#F48FB1'); tg.addColorStop(1, '#8A5FA8');
      g2.fillStyle = tg; g2.fillRect(0, 0, R.cv.width, R.cv.height);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.14 * env.fade; ctx.drawImage(R.cv, R.x0 - 3, R.y0, R.w, R.h); ctx.drawImage(R.cv, R.x0 + 3, R.y0 + 2, R.w, R.h);
      ctx.globalAlpha = 1;
    }
    var s = env.windStrength, xr = 0;                            // vị trí phản chiếu mặt trời trên mặt nước (cùng toạ độ x trên màn hình)
    if (sun && sky) { sky.sunScreen(tA); cam.screenToWorld(tA[0], tA[1], PAR, tB); xr = tB[0]; }
    ctx.globalCompositeOperation = 'lighter';
    if (sun) {
      g = ctx.createLinearGradient(xr - 150, 0, xr + 150, 0);
      g.addColorStop(0, css(sun.color, 0)); g.addColorStop(0.5, css(sun.color, 0.1 + 0.16 * dusk)); g.addColorStop(1, css(sun.color, 0));
      ctx.fillStyle = g; ctx.fillRect(xr - 150, y0, 300, y1 - y0);
    }
    ctx.fillStyle = sun ? css(sun.color) : '#FFE9B0';            // glitter: nhấp nháy theo noise, mạnh quanh cột sáng mặt trời
    for (i = 0; i < sparks.length * frac; i++) {
      var sp = sparks[i], n = U.noise2(sp.ph + t * sp.f, sp.k * 20), b = n > 0 ? n * n * n : 0, col = Math.exp(-Math.pow((sp.x - xr) / 170, 2));
      var a = b * (0.12 + 0.88 * col) * (0.3 + 0.7 * Math.min(1, dusk + 0.4)) * env.fade;
      if (a < 0.02) continue;
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.fillRect(sp.x - sp.w / 2 + wind.x * 2, sp.y, sp.w, sp.h);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,248,240,0.12)'; ctx.lineWidth = 1;   // sóng gió nhẹ: các đường nhấp nhô chạy ngang
    for (i = 0; i < 6; i++) {
      var wy = shoreY(CX) + 24 + i * 26, amp = 1 + 2.5 * (s + 0.2);
      ctx.beginPath();
      for (var xx = -120; xx <= XR; xx += 24) { var yy = wy + amp * Math.sin(xx * 0.03 + t * (0.8 + s) + i * 1.7); if (xx === -120) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,248,240,1)';                     // gợn sóng lan toả từ cánh hoa rơi (vòng elip dẹt theo phối cảnh)
    for (i = 0; i < ripples.size; i++) {
      var r = ripples.items[i];
      if (!r.alive) continue;
      var u = clamp((t - r.t0) / r.life, 0, 1), RR = r.R * ease.outCubic(u), al = Math.pow(1 - u, 1.5) * 0.55;
      for (var ring = 0; ring < 2; ring++) {
        ctx.globalAlpha = al * (ring ? 0.55 : 1); ctx.lineWidth = (1.3 * (1 - u) + 0.4) * (ring ? 0.7 : 1);
        ctx.beginPath(); ctx.ellipse(r.x, r.y, RR * (ring ? 0.62 : 1), RR * (ring ? 0.62 : 1) * 0.32, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    var PCOL = ['#FFC1D6', '#F9A9C6', '#FFE6EE'];                // cánh hoa/lá nổi trên mặt nước
    for (i = 0; i < floaters.size; i++) {
      var f = floaters.items[i];
      if (!f.alive) continue;
      ctx.globalAlpha = Math.min(1, f.age / 0.5) * (1 - sstep(48, 60, f.age)) * 0.9;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.scale(1, 0.34);
      ctx.fillStyle = f.kind ? (f.col ? '#B5603F' : '#7FBF7A') : PCOL[f.col];
      ctx.beginPath(); ctx.ellipse(0, 0, f.size * 0.55, f.size * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-f.size * 0.12, -f.size * 0.08, f.size * 0.22, f.size * 0.09, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.beginPath();                                             // viền bờ: dải ẩm tối + ánh sáng mảnh
    for (i = 0; i < px.length; i++) { if (i) ctx.lineTo(px[i], py[i]); else ctx.moveTo(px[i], py[i]); }
    ctx.strokeStyle = 'rgba(40,60,50,0.28)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = sun ? css(sun.rim, 0.28) : 'rgba(255,200,140,0.28)'; ctx.lineWidth = 1.4; ctx.stroke();
  }

  function drawPads(ctx, t, env, sun) {
    var i, j, p, a, n = 36, dusk = env.dusk, sway = wind.x;
    for (i = 0; i < pads.length; i++) {
      p = pads[i];
      var bob = 1.2 * Math.sin(t * 0.9 + p.ph), rot = p.rot + 0.03 * Math.sin(t * 0.7 + p.ph) + sway * 0.02;
      ctx.save(); ctx.translate(p.x + sway * 1.5, p.y + bob); ctx.scale(1, 0.38); ctx.rotate(rot);
      var gr = ctx.createRadialGradient(-p.r * 0.25, -p.r * 0.25, p.r * 0.05, 0, 0, p.r);
      var c0 = mix(mix('#4C9A5C', '#3E8A56', p.tone), '#2A3A5A', dusk * 0.3), c1 = mix('#2B6F50', '#1E5A48', p.tone);
      gr.addColorStop(0, css(c0)); gr.addColorStop(0.7, css(c1)); gr.addColorStop(1, css(mix(c1, '#1D3A3A', 0.5)));
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (j = 0; j <= n; j++) {                                 // hình tròn có khía chữ V
        a = p.notch + 0.2 + (TAU - 0.4) * j / n;
        var rr = p.r * (1 + 0.025 * Math.sin(6 * a + p.ph));
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = 'rgba(190,230,170,0.34)'; ctx.lineWidth = 1; ctx.beginPath();   // gân toả tia
      for (j = 0; j < 16; j++) { a = p.notch + 0.2 + (TAU - 0.4) * (j + 0.5) / 16; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * p.r * 0.94, Math.sin(a) * p.r * 0.94); }
      ctx.stroke();
      if (sun) {                                                 // rim sáng ấm ở nửa lá hướng mặt trời (trái)
        ctx.strokeStyle = css(sun.rim, 0.5 * sun.rimAlpha); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.98, PI * 0.62 - rot, PI * 1.38 - rot); ctx.stroke();
      }
      for (j = 0; j < p.drops.length; j++) {                     // giọt nước có highlight
        var d = p.drops[j];
        ctx.fillStyle = 'rgba(20,50,50,0.4)'; ctx.beginPath(); ctx.arc(d.x + 0.8, d.y + 0.9, d.r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(215,240,235,0.55)'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.32, 0, TAU); ctx.fill();
      }
      for (j = 0; j < p.petals.length; j++) {                    // cánh hoa đậu trên lá
        var q = p.petals[j];
        ctx.save(); ctx.translate(q.dx, q.dy); ctx.rotate(q.ang - rot);
        ctx.fillStyle = q.kind ? '#B5603F' : '#FFC1D6'; ctx.beginPath(); ctx.ellipse(0, 0, q.size * 0.55, q.size * 0.3, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawLotus(ctx, t, env, sun) {
    var i, k, f, dusk = env.dusk, S = env.windStrength;
    for (i = 0; i < lotus.length; i++) {
      f = lotus[i];
      var sg = ease.outCubic(clamp((t - f.emerge) / 6, 0, 1));
      if (sg <= 0.01) continue;
      var open = f.maxOpen * ease.inOutCubic(clamp((t - f.t0) / f.dur, 0, 1));
      var sw = wind.x * 0.07 + 0.035 * Math.sin(t * 0.9 + f.ph) * (0.5 + S), h = f.h * sg;
      var hx = f.x + Math.sin(f.lean + sw) * h, hy = f.y - Math.cos(f.lean + sw) * h;
      ctx.strokeStyle = css(mix('#5FA060', '#3D7A50', dusk * 0.5)); ctx.lineWidth = 3.2; ctx.lineCap = 'round';   // thân cong mảnh
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo(f.x + Math.sin(f.lean * 2 - sw) * h * 0.5 - 10 * f.lean * 8, f.y - h * 0.55, hx, hy); ctx.stroke();
      var s = f.size * (0.55 + 0.45 * sg), Lp = s * (0.7 + 0.3 * open), tilt = sw * 0.8, layers = [[spr.outer, 7, 1, 1.35, 1], [spr.mid, 6, 0.82, 0.95, 0.9], [spr.inner, 5, 0.6, 0.55, 0.78]];
      for (k = 0; k < 3; k++) {                                  // 3 lớp cánh nhọn: xoè dần từ nụ kín tới nở rộ
        var L = layers[k], n = L[1], spread = lerp(0.08 + k * 0.02, L[3], open), j;
        for (j = 0; j < n; j++) {
          var a = (n === 1 ? 0 : (j / (n - 1) - 0.5) * 2) * spread + f.a[k];
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt + a);
          var pl = Lp * L[4], pw = pl * 0.46 * L[2] * (0.8 + 0.2 * open);
          ctx.globalAlpha = 0.9; ctx.drawImage(L[0], -pw / 2, -pl, pw, pl);
          if (k === 0 && sun && dusk > 0.05) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 * dusk; ctx.drawImage(L[0], -pw / 2, -pl, pw, pl); ctx.globalCompositeOperation = 'source-over'; }
          ctx.restore();
        }
        if (k === 1 && open > 0.45) {                            // đài sen vàng + nhuỵ
          var pr = s * 0.16 * clamp((open - 0.45) / 0.4, 0, 1), gg = ctx.createRadialGradient(hx, hy - pr * 0.4, 0, hx, hy - pr * 0.4, pr);
          gg.addColorStop(0, '#F2E36E'); gg.addColorStop(1, '#B8A640');
          ctx.globalAlpha = 1; ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(hx, hy - pr * 0.4, pr, pr * 0.8, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#F6D85A'; ctx.lineWidth = 1; ctx.beginPath();
          for (j = 0; j < 20; j++) { var aa = j / 20 * TAU; ctx.moveTo(hx + Math.cos(aa) * pr * 1.1, hy - pr * 0.4 + Math.sin(aa) * pr * 0.85); ctx.lineTo(hx + Math.cos(aa) * pr * 1.5, hy - pr * 0.4 + Math.sin(aa) * pr * 1.15); }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  Pond.draw = function (ctx) {
    if (!ripples) return;
    var t = TL.t, env = TL.env, sky = App.sky, sun = sky && sky.sun;
    cam.apply(ctx, PAR);
    drawWater(ctx, t, env, sky, sun);
    drawPads(ctx, t, env, sun);
    drawLotus(ctx, t, env, sun);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  /* ---------------------------------------------------------- Điều khiển */
  Pond.setQuality = function (q) { frac = q.grass >= 800 ? 1 : (q.grass >= 500 ? 0.7 : 0.4); reflOn = q.grass >= 500; };
  Pond.reset = function () {
    if (ripples) ripples.clear();
    if (floaters) floaters.clear();
    for (var i = 0; i < pads.length; i++) pads[i].petals.length = 0;
    wind.x = 0; wind.v = 0;
  };
  TL.on('reset', Pond.reset);
  TL.on('seek', Pond.reset);
})();
