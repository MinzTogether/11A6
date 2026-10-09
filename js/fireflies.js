/* ============================================================================
 * js/fireflies.js – Đom đóm (40–90 con theo chất lượng), vẽ ở lớp 11 bằng blend cộng.
 *  Fireflies.tasks()        → tác vụ dựng sprite (lõi sáng, quầng lớn mờ, bokeh) + khởi tạo
 *  Fireflies.update(dt)     → quỹ đạo mềm (Lissajous + curl noise), lơ lửng rồi bay vút, nhấp nháy theo nhịp riêng
 *  Fireflies.draw(ctx)      → 3 độ sâu: xa (nhỏ, sắc nét), giữa, gần (to, mờ kiểu bokeh, parallax 1.25)
 *  Fireflies.setQuality(q), Fireflies.setReduced(bool), Fireflies.reset(), Fireflies.prewarm(giây)
 * Số lượng hiển thị = ngân sách × env.fireflies × độ tối của trời (tăng dần từ ~38s).
 * Tập trung quanh stickman, bờ ao, mép cỏ và gần thân cây; bị đẩy ra khỏi vùng lời chúc và mờ đi khi lời chúc hiện.
 * Mỗi con còn hắt một quầng sáng dẹt yếu lên cỏ ngay dưới nó (ánh sáng đổ xuống mặt đất/thân cây gần đó).
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, FC = C.fireflies, TL = App.timeline, cam = App.camera;
  var W = C.virtual.w, H = C.virtual.h, L = C.layout, TAU = U.TAU;
  var clamp = U.clamp, lerp = U.lerp, ease = U.ease, css = U.css;
  var ZN = L.wishZone, zx0 = ZN.x0 * W - 30, zx1 = ZN.x1 * W + 30, zy0 = ZN.y0 * H - 30, zy1 = ZN.y1 * H + 30;
  var HQ = C.quality.levels.high.fireflies;
  var PARS = [1, 1, 1.25], SIZE = [[5, 9], [12, 20], [26, 44]], ALPHA = [0.95, 0.85, 0.55];   // xa / giữa / gần
  var COLS = [C.palette.fireflyA, C.palette.fireflyB];

  var Fireflies = App.fireflies = { count: 0 };
  var spr = { core: [], halo: [], bokeh: [] }, ff = [], byD = [[], [], []], maxN = HQ, density = 1, ready = false;
  var rng = U.makeRng(FC.seed), cv = [0, 0], wv = [0, 0], tmp = [0, 0];

  /* ---------------------------------------------------------------- Sprite */
  function glow(S, stops) {
    var c = U.createCanvas(S, S), g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  }
  function buildSprites() {
    for (var v = 0; v < 2; v++) {
      var c = COLS[v];
      spr.core[v] = glow(64, [[0, 'rgba(255,255,240,1)'], [0.1, css(c, 0.95)], [0.35, css(c, 0.4)], [1, css(c, 0)]]);          // lõi sáng
      spr.halo[v] = glow(128, [[0, css(c, 0.5)], [0.4, css(c, 0.14)], [1, css(c, 0)]]);                                       // quầng lớn mờ
      spr.bokeh[v] = glow(96, [[0, css(c, 0.28)], [0.72, css(c, 0.36)], [0.9, css(c, 0.62)], [1, css(c, 0)]]);                // đĩa bokeh sáng ở rìa
    }
  }

  /* ------------------------------------------------------------- Khởi tạo */
  function inZone(x, y) { return x > zx0 && x < zx1 && y > zy0 && y < zy1; }
  function anchorFor(depth, out) {
    var u = rng.next(), x, y, Pd = App.pond, tries = 0;
    do {
      if (depth === 2) {                                           // gần camera: bờ ao (toạ độ lớp fore) hoặc mép dưới cỏ
        if (Pd && Pd.shorePoint && u < 0.55) { Pd.shorePoint(rng, tmp); x = tmp[0]; y = tmp[1]; }
        else { x = rng.range(0, W); y = rng.range(0.9 * H, 1.02 * H); }
      } else if (u < 0.4) { x = C.stickman.sitX * W + rng.gauss() * 90; y = C.layout.stickmanY * H - 40 + rng.gauss() * 70; }     // quanh stickman
      else if (u < 0.65) { x = rng.range(0, W); y = rng.range(0.78 * H, 0.93 * H); }                                                  // mép cỏ
      else if (u < 0.85) { x = rng.range(300, 1000); y = rng.range(0.45 * H, 0.78 * H); }                                              // dưới tán, phía trái
      else { x = L.treeX * W + rng.range(-130, 130); y = rng.range(0.55 * H, 0.85 * H); }                                              // gần thân cây
      u = rng.next(); tries++;
    } while (inZone(x, y) && tries < 8);
    out[0] = x; out[1] = y;
    return out;
  }
  function init() {
    var i, f, d, r, a = [0, 0];
    ff.length = 0; byD[0].length = byD[1].length = byD[2].length = 0;
    for (i = 0; i < maxN; i++) {
      r = rng.next(); d = r < FC.nearShare ? 2 : (r < FC.nearShare + 0.35 ? 0 : 1);
      anchorFor(d, a);
      f = {
        d: d, hx: a[0], hy: a[1], ax: a[0], ay: a[1], x: a[0], y: a[1], vx: 0, vy: 0,
        Ax: rng.range(25, 90), Ay: rng.range(15, 60), fx: rng.range(0.18, 0.5), fy: rng.range(0.2, 0.55), px: rng.range(0, TAU), py: rng.range(0, TAU),
        size: rng.range(SIZE[d][0], SIZE[d][1]), cv: rng.int(0, 1), onset: i / maxN, v: 0, b: 0,
        c0: rng.range(0, 8), period: rng.range(FC.blink[0], FC.blink[1]), rest: rng.range(FC.rest[0], FC.rest[1]),
        next: rng.range(2, 9), dash: 0, hover: 0
      };
      ff.push(f); byD[d].push(f);
    }
    ready = true;
  }
  Fireflies.tasks = function () { return [buildSprites, init]; };

  /* -------------------------------------------------------------- Cập nhật */
  Fireflies.update = function (dt) {
    if (!ready) return;
    var t = TL.t, env = TL.env, level = env.fireflies * (0.5 + 0.5 * clamp(env.night / 0.62, 0, 1)) * density, i, f, Wd = App.wind;
    var n = 0;
    for (i = 0; i < ff.length; i++) {
      f = ff[i];
      f.v += (clamp((level - f.onset) * 10, 0, 1) - f.v) * Math.min(1, 3 * dt);
      if (f.v < 0.01) { f.b = 0; continue; }
      n++;
      if (t >= f.next) {                                           // bay vút tới chỗ mới rồi lơ lửng một lúc
        f.ax = clamp(f.ax + rng.range(-110, 110) + (f.hx - f.ax) * 0.3, 20, W - 20); f.ay = clamp(f.ay + rng.range(-70, 70) + (f.hy - f.ay) * 0.3, 0.3 * H, 1.02 * H);
        f.dash = 0.7; f.hover = rng.range(2, 4.5); f.next = t + rng.range(5, 13);
      }
      var hv = f.hover > 0 ? 0.35 : 1, kp = f.dash > 0 ? 6 : 1.2;
      f.dash -= dt; f.hover -= dt;
      var tx = f.ax + f.Ax * hv * Math.sin(f.fx * t + f.px), ty = f.ay + f.Ay * hv * Math.sin(f.fy * t + f.py);     // Lissajous quanh điểm neo
      U.curl2(f.x * 0.004, f.y * 0.004, t * 0.15, cv);
      var wx = 0, wy = 0;
      if (Wd) { Wd.sample(f.x, f.y, t, wv); wx = wv[0] * 0.08; wy = wv[1] * 0.05; }
      f.vx += ((tx - f.x) * kp + cv[0] * 26 + wx - f.vx * 1.6) * dt; f.vy += ((ty - f.y) * kp + cv[1] * 26 + wy - f.vy * 1.6) * dt;
      if (t > 50 && inZone(f.x, f.y)) {                            // đẩy ra khỏi vùng lời chúc theo cạnh gần nhất
        var dl = f.x - zx0, dr = zx1 - f.x, dtp = f.y - zy0, db = zy1 - f.y, m = Math.min(dl, dr, dtp, db);
        if (m === dl) f.vx -= 500 * dt; else if (m === dr) f.vx += 500 * dt; else if (m === dtp) f.vy -= 500 * dt; else f.vy += 500 * dt;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      var u = ((t + f.c0) % (f.period + f.rest));                  // nhấp nháy: sáng nhanh – tắt chậm, rồi nghỉ
      f.b = u < f.period ? Math.pow(Math.sin(Math.PI * Math.pow(u / f.period, 0.8)), 1.6) : 0;
    }
    Fireflies.count = n;
  };
  Fireflies.prewarm = function (sec) { for (var i = 0, n = Math.ceil(sec / 0.1); i < n; i++) Fireflies.update(0.1); };

  /* ------------------------------------------------------------------- Vẽ */
  Fireflies.draw = function (ctx) {
    if (!ready) return;
    var t = TL.t, zf = ease.inOutCubic((t - 57) / 3), g, i, f, a, s, arr;
    ctx.globalCompositeOperation = 'lighter';
    for (g = 0; g < 3; g++) {
      cam.apply(ctx, PARS[g]);
      arr = byD[g];
      for (i = 0; i < arr.length; i++) {
        f = arr[i];
        if (f.v < 0.01 || f.b < 0.01) continue;
        a = f.b * f.v * ALPHA[g];
        if (zf > 0 && inZone(f.x, f.y)) a *= 1 - zf * (g === 2 ? 0.95 : 0.8);       // không làm nhiễu lời chúc
        if (a < 0.01) continue;
        s = f.size;
        if (g === 2) {                                             // gần: bokeh to và mờ
          ctx.globalAlpha = Math.min(1, a * 0.9); ctx.drawImage(spr.bokeh[f.cv], f.x - s / 2, f.y - s / 2, s, s);
        } else {
          ctx.globalAlpha = Math.min(1, a * 0.3); ctx.drawImage(spr.halo[f.cv], f.x - s * 2.5, f.y - s * 2.5, s * 5, s * 5);   // quầng lớn mờ
          ctx.globalAlpha = Math.min(1, a); ctx.drawImage(spr.core[f.cv], f.x - s * 0.85, f.y - s * 0.85, s * 1.7, s * 1.7);   // lõi sáng
          if (g === 1 && f.y > 0.74 * H) {                         // hắt ánh sáng yếu lên cỏ/thân cây ngay dưới
            ctx.save(); ctx.translate(f.x, f.y + 20); ctx.scale(1, 0.28);
            ctx.globalAlpha = Math.min(1, a * 0.16); ctx.drawImage(spr.halo[f.cv], -s * 3.5, -s * 3.5, s * 7, s * 7); ctx.restore();
          }
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  /* ---------------------------------------------------------- Điều khiển */
  Fireflies.setQuality = function (q) { maxN = Math.min(HQ, q.fireflies); if (ready) { var d = density; init(); density = d; } };
  Fireflies.setReduced = function (on) { density = on ? C.reduced.particles : 1; };
  Fireflies.reset = function () { if (ready) { var s = rng.seed; rng = U.makeRng(FC.seed); init(); } };
  TL.on('reset', Fireflies.reset);
})();
