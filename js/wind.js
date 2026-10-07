/* ============================================================================
 * js/wind.js – Hệ thống gió dùng chung cho cành, cỏ, hoa, cánh hoa, mây, đom đóm, bồ công anh.
 *  Wind.sample(x, y, t, out) → out = [vx, vy] (px/s): gió nền trái → phải (hơi hướng lên)
 *                              + curl noise không gian–thời gian + đợt gió giật + xung gió khi chạm.
 *  Wind.update(dt)           → tính Wind.gust (0..1, đường bao đợt giật hiện tại) và Wind.strength (hàm của timeline)
 *  Wind.pulse(x, y)          → xung gió cục bộ (nhấp/chạm) – toạ độ thế giới; tắt/bật bằng config.wind.clickPulse.enabled
 *  Wind.reset()              → xoá xung gió (dùng cho "Xem lại"/tua)
 * Các đợt giật được sinh trước từ seed (mỗi 4–9s: tăng ~1s, giữ ~1.5s, giảm ~2s) nên xác định theo thời gian:
 * tua tới mốc nào cũng ra đúng trạng thái gió của mốc đó.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, WC = C.wind, G = WC.gust, TL = App.timeline, DEG = U.DEG;
  var clamp = U.clamp, ease = U.ease;

  var gusts = [], cv = [0, 0], pulses = [], cacheT = -1, cacheG = 0;
  var D_ATT = G.attack, D_HOLD = G.hold, D_REL = G.release, D_TOT = D_ATT + D_HOLD + D_REL;
  var dirX = Math.cos(WC.baseAngleDeg * DEG), dirY = Math.sin(WC.baseAngleDeg * DEG);

  (function buildSchedule() {                                    // lịch gió giật xác định (seed cố định)
    var rng = U.makeRng(6060), t = 6 + rng.range(0, 3);
    for (var i = 0; i < 900; i++) {
      gusts.push({ t0: t, amp: rng.range(0.65, 1.15) });
      t += rng.range(G.interval[0], G.interval[1]);
    }
  })();
  for (var i = 0; i < 8; i++) pulses.push({ x: 0, y: 0, t0: -99, on: false });

  function envOne(dt) {                                          // tăng mượt → giữ → giảm mượt
    if (dt < 0 || dt >= D_TOT) return 0;
    if (dt < D_ATT) return ease.inOutSine(dt / D_ATT);
    if (dt < D_ATT + D_HOLD) return 1;
    return 1 - ease.inOutSine((dt - D_ATT - D_HOLD) / D_REL);
  }
  function gustAt(t) {
    var lo = 0, hi = gusts.length - 1;
    while (lo < hi) { var m = (lo + hi + 1) >> 1; if (gusts[m].t0 <= t) lo = m; else hi = m - 1; }
    var a = envOne(t - gusts[lo].t0) * gusts[lo].amp, b = lo > 0 ? envOne(t - gusts[lo - 1].t0) * gusts[lo - 1].amp : 0;
    return Math.max(a, b);                                       // hai đợt có thể chồng nhau
  }

  var Wind = App.wind = { gust: 0, strength: 0, dirX: dirX, dirY: dirY };

  Wind.update = function () {
    var t = TL.t;
    Wind.strength = TL.env.windStrength;
    Wind.gust = cacheG = clamp(gustAt(t), 0, 1.2); cacheT = t;
    for (var i = 0; i < pulses.length; i++) if (pulses[i].on && t - pulses[i].t0 > WC.clickPulse.duration) pulses[i].on = false;
  };

  Wind.sample = function (x, y, t, out) {
    var S = TL.env.windStrength, gu = t === cacheT ? cacheG : gustAt(t);
    var c = U.curl2(x * WC.curlScale, y * WC.curlScale, t * WC.curlSpeed, cv);
    var turb = WC.curlAmp * (0.35 + S) * (1 + 1.2 * gu) * 0.5, push = WC.baseSpeed * S + G.amp * gu * S;
    var vx = push * dirX + c[0] * turb, vy = push * dirY - G.amp * gu * S * 0.12 + c[1] * turb;
    var P = WC.clickPulse;
    if (P.enabled) {
      for (var i = 0; i < pulses.length; i++) {
        var p = pulses[i];
        if (!p.on) continue;
        var age = t - p.t0;
        if (age < 0 || age > P.duration) continue;
        var dx = x - p.x, dy = y - p.y, r2 = dx * dx + dy * dy;
        if (r2 >= P.radius * P.radius) continue;
        var r = Math.sqrt(r2) + 0.001, f = 1 - r / P.radius, dec = 1 - age / P.duration;
        var k = P.strength * f * f * dec * dec * Math.min(1, age / 0.1);   // lan ra nhanh rồi tắt dần
        vx += dx / r * k; vy += dy / r * k - k * 0.35;                       // đẩy ra xa và hơi hất lên
      }
    }
    out[0] = vx; out[1] = vy;
    return out;
  };

  Wind.pulse = function (x, y) {
    if (!WC.clickPulse.enabled) return;
    var slot = pulses[0], i;
    for (i = 0; i < pulses.length; i++) { if (!pulses[i].on) { slot = pulses[i]; break; } if (pulses[i].t0 < slot.t0) slot = pulses[i]; }
    slot.x = x; slot.y = y; slot.t0 = TL.t; slot.on = true;
  };

  Wind.reset = function () {
    for (var i = 0; i < pulses.length; i++) pulses[i].on = false;
    cacheT = -1; Wind.gust = 0;
  };
  TL.on('reset', Wind.reset);
  TL.on('seek', Wind.reset);
})();
