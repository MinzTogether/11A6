/* ============================================================================
 * js/stickman.js – Stickman procedural (bộ xương + IK 2 khớp), vẽ ở lớp 8.
 *  Máy trạng thái (hàm của timeline → tua/xem lại luôn nhất quán):
 *    vào cảnh → đi → giảm tốc (~2s) → dừng → quay người (đầu quay trước, thân theo sau, ~0.8s)
 *    → hạ người ngồi (~2.2s, tay chống đất, hông hạ bằng easing, lưng chạm thân cây) → ngồi yên
 *  Stickman.update(dt)            → tính tư thế (xương, IK) cho khung hiện tại
 *  Stickman.draw(ctx)             → nét liền mượt đầu mút bo tròn + viền sáng cam mảnh phía mặt trời (blend lighter)
 *  Stickman.catchPetal(x,y,size)  → true nếu cánh hoa đậu lên vai/đầu (nằm lại); petals.js gọi cho lớp giữa
 *  Stickman.state / x / y / head  → cho module khác (đom đóm bay quanh stickman…); Stickman.reset()
 * Bộ xương: đầu, cổ, cột sống 2 đoạn (cong được), xương chậu, tay (cánh tay trên/dưới), chân (đùi/cẳng).
 * Toạ độ cục bộ (X tiến, Y lên, Z ngang) → màn hình qua phép quay quanh trục dọc (yaw) nên quay người
 * trông tự nhiên (chân/vai dang ra khi nhìn chính diện). Bóng đổ được đăng ký với Ground.addCaster.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, SC = C.stickman, TL = App.timeline;
  var W = C.virtual.w, H = C.virtual.h, TAU = U.TAU, PI = Math.PI, DEG = U.DEG;
  var clamp = U.clamp, lerp = U.lerp, ease = U.ease, css = U.css;
  var Hs = SC.heightPx, GY = C.layout.stickmanY * H, LW = SC.lineRatio * Hs;
  var THIGH = 0.25 * Hs, SHIN = 0.25 * Hs, UARM = 0.17 * Hs, LARM = 0.16 * Hs, SP1 = 0.17 * Hs, SP2 = 0.15 * Hs, NECK = 0.04 * Hs, HEAD = 0.07 * Hs;
  var HP_STAND = 0.465 * Hs, SL = 0.36 * Hs, ANK = 0.03 * Hs, HIPZ = 0.035 * Hs, SHZ = 0.05 * Hs;

  var Stickman = App.stickman = { state: 'hidden', x: -999, y: GY, head: [0, 0], sitting: false };
  var J = {}, perch = [], plan = null, wv = [0, 0];
  var names = ['px', 'py', 'chx', 'chy', 'nbx', 'nby', 'hx', 'hy', 'shx', 'shy',
    'hipLx', 'hipLy', 'kneeLx', 'kneeLy', 'ankLx', 'ankLy', 'toeLx', 'toeLy', 'hipRx', 'hipRy', 'kneeRx', 'kneeRy', 'ankRx', 'ankRy', 'toeRx', 'toeRy',
    'shLx', 'shLy', 'elbLx', 'elbLy', 'handLx', 'handLy', 'shRx', 'shRy', 'elbRx', 'elbRy', 'handRx', 'handRy'];
  for (var i = 0; i < names.length; i++) J[names[i]] = 0;

  /** IK 2 khớp trong mặt phẳng (X,Y): trả về khuỷu/gối. bend = +1: gập về phía trước; −1: gập ra sau. */
  var ikOut = [0, 0];
  function ik(ax, ay, bx, by, l1, l2, bend) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    d = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
    var ux = dx / Math.sqrt(dx * dx + dy * dy || 1e-6), uy = dy / Math.sqrt(dx * dx + dy * dy || 1e-6);
    var a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    ikOut[0] = ax + ux * a - uy * h * bend; ikOut[1] = ay + uy * a + ux * h * bend;
    return ikOut;
  }

  /* --------------------------------------------------- Kế hoạch thời gian */
  function makePlan() {
    var T = App.tree, seatH = 0.36 * Hs, edge = T ? T.trunkEdge(seatH, -1) : 0.39 * W - 28;
    var seatX = edge - LW * 0.5 - 2.5, stopX = seatX + 10, startX = SC.startX, v0 = SC.walkSpeed, dec = SC.decelTime;
    var D = stopX - startX, sd = v0 * dec / 2, cruise;
    if (D < sd) { dec = 2 * D / v0; cruise = 0; } else cruise = (D - sd) / v0;
    var b1 = cruise, b2 = b1 + dec, b3 = b2 + SC.pauseTime, b4 = b3 + SC.turnTime, b5 = b4 + SC.sitTime;
    plan = { final: TL.t >= 33, seatX: seatX, stopX: stopX, startX: startX, v0: v0, dec: dec, sd: sd, b1: b1, b2: b2, b3: b3, b4: b4, b5: b5, x1: startX + v0 * cruise };
  }

  /* ------------------------------------------------------------------ Tư thế */
  var P = { px: 0, th: 0, thH: 0, phi: 0, sp: 0, sitU: 0, state: 'hidden' };
  function solveTime(t) {
    var tr = t - SC.enterAt, u;
    if (!plan || (!plan.final && t >= 33)) makePlan();       // chờ thân cây dày đủ (t ≥ 33s) rồi mới chốt chỗ ngồi
    P.th = 0; P.thH = 0; P.sitU = 0; P.sp = 0;
    if (tr < 0) { P.state = 'hidden'; P.px = plan.startX; P.phi = 0; return; }
    if (tr < plan.b1) { P.state = 'walk'; P.px = plan.startX + plan.v0 * tr; P.sp = 1; }
    else if (tr < plan.b2) { u = (tr - plan.b1) / plan.dec; P.state = 'decel'; P.px = plan.x1 + plan.sd * (1 - (1 - u) * (1 - u)); P.sp = 1 - u; }
    else if (tr < plan.b3) { P.state = 'pause'; P.px = plan.stopX; }
    else if (tr < plan.b4) {
      u = (tr - plan.b3) / SC.turnTime; P.state = 'turn'; P.px = plan.stopX;
      P.thH = PI * ease.inOutCubic(clamp(u / 0.6, 0, 1)); P.th = PI * ease.inOutCubic(clamp((u - 0.25) / 0.75, 0, 1));
    } else if (tr < plan.b5) {
      u = (tr - plan.b4) / SC.sitTime; P.state = 'sit'; P.sitU = u; P.th = P.thH = PI;
      P.px = lerp(plan.stopX, plan.seatX, ease.inOutCubic(clamp((u - 0.3) / 0.6, 0, 1)));
    } else { P.state = 'idle'; P.px = plan.seatX; P.sitU = 1; P.th = P.thH = PI; }
    P.phi = (P.px - plan.startX) / (2 * SL);
    if (P.state === 'walk' || P.state === 'decel') P.sp = clamp(P.sp, 0, 1);
  }

  var cT = 1, sT = 0;
  function put(nx, ny, X, Y, Z, px, gy) { J[nx] = px + X * cT + Z * sT; J[ny] = gy - Y; }      // cục bộ → màn hình

  function computePose(t) {
    var env = TL.env, Wd = App.wind, st = P.state, sp = P.sp, amp = U.smoothstep(0, 0.35, sp), i;
    var phi = P.phi, sit = P.sitU, sitting = st === 'sit' || st === 'idle';
    cT = Math.cos(P.th); sT = Math.sin(P.th);
    var br = 0.5 + 0.5 * Math.sin(TAU * SC.breathHz * t), bob = SC.bobRatio * Hs * 0.5 * -Math.cos(4 * PI * phi) * amp;
    var sway = 0;
    if (Wd && sitting) { Wd.sample(P.px, GY - 60, t, wv); sway = clamp(wv[0] / 100, -1.5, 1.5) * 0.012 * (0.4 + env.windStrength); }
    var sEase = ease.inOutCubic(clamp(sit, 0, 1)), crouch = Math.sin(PI * clamp(sit / 0.6, 0, 1));
    var seatPh = st === 'sit' ? clamp((sit - 0.4) / 0.6, 0, 1) : (st === 'idle' ? 1 : 0), fe = ease.inOutCubic(seatPh);
    var hpSeat = 0.06 * Hs + LW * 0.5, Hp = lerp(HP_STAND, hpSeat, sEase) + (sitting ? 0 : bob);
    var a1 = (SC.leanDeg * DEG * amp) + (sit > 0 ? lerp(0, -4 * DEG, ease.inOutCubic(clamp(sit / 0.9, 0, 1))) + 0.2 * crouch + sway : 0);
    var a2 = a1 * 1.3 + (sitting ? -0.02 * br : 0), headUp = (sit > 0.5 ? SC.headUpDeg * DEG : 0);
    var look = sitting ? Math.max(0, U.noise1(t * 0.13 + 3) - 0.25) * 0.5 : 0;              // thỉnh thoảng cúi nhìn cánh hoa rơi
    var a3 = a2 - headUp * 0 + look * 0.6, X, Y;
    var px = P.px, gy = GY;
    // Cột sống 2 đoạn (hông → ngực → gốc cổ), cổ, đầu
    var Px = 0, Py = Hp, Cx = Px + Math.sin(a1) * SP1, Cy = Py + Math.cos(a1) * SP1;
    var l2 = SP2 * (1 + 0.025 * br), Nx = Cx + Math.sin(a2) * l2, Ny = Cy + Math.cos(a2) * l2;
    var Hx = Nx + Math.sin(a3) * (NECK + HEAD) + 0.02 * Hs, Hy = Ny + Math.cos(a3) * (NECK + HEAD);
    put('px', 'py', Px, Py, 0, px, gy); put('chx', 'chy', Cx, Cy, 0, px, gy); put('nbx', 'nby', Nx, Ny, 0, px, gy);
    // Đầu dùng yaw riêng (quay trước thân): chỉ ảnh hưởng tới độ lệch tiến của tâm đầu
    var cH = Math.cos(P.thH), sH = Math.sin(P.thH);
    J.hx = px + (Nx + Math.sin(a3) * (NECK + HEAD)) * cT + 0.02 * Hs * cH; J.hy = gy - Hy;
    // Vai: hơi dưới gốc cổ
    var sx = Nx - Math.sin(a2) * 0.025 * Hs, sy = Ny - Math.cos(a2) * 0.025 * Hs;
    put('shLx', 'shLy', sx, sy, -SHZ, px, gy); put('shRx', 'shRy', sx, sy, SHZ, px, gy); J.shx = J.shRx; J.shy = J.shRy;
    // Chân: chu kỳ bước (đi) hoặc tư thế ngồi (một chân duỗi, một chân co)
    var A = 0.5 * SL * amp, side, c, fx, fy, fa;
    for (side = 0; side < 2; side++) {
      var Z = side ? HIPZ : -HIPZ, hipY = Hp;
      if (!sitting) {
        c = U.fract(phi + side * 0.5);
        if (c < 0.5) { fx = A * (1 - 4 * c); fy = 0; fa = lerp(0.2, -0.45, ease.inQuad(c / 0.5)) * amp; }
        else { var u2 = (c - 0.5) / 0.5; fx = -A + 2 * A * ease.inOutSine(u2); fy = 0.1 * Hs * amp * Math.pow(Math.sin(PI * u2), 0.8); fa = lerp(-0.45, 0.2, ease.inOutSine(u2)) * amp; }
        if (st === 'sit') {                                      // đang hạ người: chân giữ chỗ rồi trượt ra phía trước
          fx = lerp(side ? -0.04 * Hs : 0.04 * Hs, side ? 0.24 * Hs : 0.46 * Hs, fe); fy = 0; fa = 0;
        } else if (st === 'pause' || st === 'turn') { fx = side ? -0.04 * Hs : 0.04 * Hs; fy = 0; fa = 0; }
      } else { fx = side ? 0.24 * Hs : 0.46 * Hs; fy = 0; fa = 0; }
      var ankX = fx, ankY = ANK + fy;
      var k = ik(0, hipY, ankX, ankY, THIGH, SHIN, 1), kx = k[0], ky = k[1];
      var tag = side ? 'R' : 'L';
      put('hip' + tag + 'x', 'hip' + tag + 'y', 0, hipY, Z, px, gy); put('knee' + tag + 'x', 'knee' + tag + 'y', kx, ky, Z, px, gy);
      put('ank' + tag + 'x', 'ank' + tag + 'y', ankX, ankY, Z, px, gy);
      put('toe' + tag + 'x', 'toe' + tag + 'y', ankX + Math.cos(fa) * 0.1 * Hs, ankY - Math.sin(fa) * 0.1 * Hs + (side ? 0 : 0), Z, px, gy);
      if (side) { J._kneeRX = kx; J._kneeRY = ky; } else { J._kneeLX = kx; J._kneeLY = ky; }
    }
    // Tay: vung ngược pha chân khi đi; khi ngồi một tay chống đất, một tay đặt lên đầu gối
    for (side = 0; side < 2; side++) {
      var tg = side ? 'R' : 'L', swing = -Math.cos(TAU * (phi + side * 0.5)) * SC.armSwingDeg * DEG * amp, hxT, hyT, bend = -1;
      var shZ = side ? SHZ : -SHZ;
      hxT = sx + Math.sin(swing + a1) * 0.3 * Hs; hyT = sy - Math.cos(swing + a1) * 0.3 * Hs;
      if (st === 'sit' || sitting) {
        var gu = ease.inOutCubic(clamp(sit / 0.4, 0, 1)), ku = ease.inOutCubic(clamp((sit - 0.75) / 0.25, 0, 1));
        var gX = -0.12 * Hs + 0.02 * Hs, gY = LW * 0.5;                                    // tay chống đất phía sau hông
        if (side === 0) { hxT = lerp(hxT, gX, gu); hyT = lerp(hyT, gY, gu); }
        else {
          var kneeLocalX = J._kneeRX, kneeLocalY = J._kneeRY;                                // gối chân co (chân phải) – toạ độ cục bộ
          hxT = lerp(hxT, kneeLocalX + 0.01 * Hs, ku); hyT = lerp(hyT, kneeLocalY + LW * 0.7, ku);
          if (sit < 0.75) { hxT = lerp(sx + Math.sin(swing + a1) * 0.3 * Hs, gX, gu); hyT = lerp(sy - Math.cos(swing + a1) * 0.3 * Hs, gY, gu); }
        }
      }
      var e = ik(sx, sy, hxT, hyT, UARM, LARM, bend);
      put('sh' + tg + 'x', 'sh' + tg + 'y', sx, sy, shZ, px, gy);
      put('elb' + tg + 'x', 'elb' + tg + 'y', e[0], e[1], shZ, px, gy);
      put('hand' + tg + 'x', 'hand' + tg + 'y', hxT, hyT, shZ, px, gy);
    }
    J.shx = J.shRx; J.shy = J.shRy - 2;
    Stickman.x = px; Stickman.y = gy; Stickman.head[0] = J.hx; Stickman.head[1] = J.hy; Stickman.state = st; Stickman.sitting = sitting;
  }

  Stickman.update = function () {
    var t = TL.t;
    if (!plan) makePlan();
    solveTime(t);
    if (P.state === 'hidden') { Stickman.state = 'hidden'; Stickman.x = -999; return; }
    computePose(t);
  };

  /* ---------------------------------------------------------------------- Vẽ */
  function trace(g) {
    g.beginPath();
    g.moveTo(J.px, J.py); g.lineTo(J.chx, J.chy); g.lineTo(J.nbx, J.nby); g.lineTo(J.hx, J.hy + HEAD * 0.9);      // cột sống, cổ
    g.moveTo(J.hipLx, J.hipLy); g.lineTo(J.kneeLx, J.kneeLy); g.lineTo(J.ankLx, J.ankLy); g.lineTo(J.toeLx, J.toeLy);
    g.moveTo(J.hipRx, J.hipRy); g.lineTo(J.kneeRx, J.kneeRy); g.lineTo(J.ankRx, J.ankRy); g.lineTo(J.toeRx, J.toeRy);
    g.moveTo(J.shLx, J.shLy); g.lineTo(J.elbLx, J.elbLy); g.lineTo(J.handLx, J.handLy);
    g.moveTo(J.shRx, J.shRy); g.lineTo(J.elbRx, J.elbRy); g.lineTo(J.handRx, J.handRy);
    g.moveTo(J.shLx, J.shLy); g.lineTo(J.shRx, J.shRy);                                                            // vai
    g.moveTo(J.hipLx, J.hipLy); g.lineTo(J.hipRx, J.hipRy);                                                        // xương chậu
  }
  Stickman.draw = function (ctx) {
    if (P.state === 'hidden') return;
    var sun = App.sky && App.sky.sun, i, q;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = LW; ctx.strokeStyle = ctx.fillStyle = C.palette.stickman;
    trace(ctx); ctx.stroke();
    ctx.beginPath(); ctx.arc(J.hx, J.hy, HEAD, 0, TAU); ctx.fill();                                                // đầu tròn
    if (sun) {                                                                                                      // viền sáng cam mảnh phía mặt trời
      var ox = sun.toX * LW * 0.3, oy = sun.toY * LW * 0.3;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = LW * 0.3; ctx.strokeStyle = css(sun.rim, 0.55 * sun.rimAlpha);
      ctx.save(); ctx.translate(ox, oy); trace(ctx); ctx.stroke();
      ctx.beginPath(); ctx.arc(J.hx, J.hy, HEAD - LW * 0.15, PI * 0.85, PI * 1.55); ctx.stroke(); ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
    for (i = 0; i < perch.length; i++) {                                                                            // cánh hoa đã đậu
      q = perch[i];
      var jx = q.j ? J.hx : J.shx, jy = q.j ? J.hy - HEAD * 0.6 : J.shy;
      ctx.save(); ctx.translate(jx + q.ox, jy + q.oy); ctx.rotate(q.ang); ctx.globalAlpha = Math.min(1, q.age / 0.5) * 0.95;
      ctx.fillStyle = q.kind ? '#B5603F' : '#FFC1D6'; ctx.beginPath(); ctx.ellipse(0, 0, q.size * 0.5, q.size * 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-q.size * 0.1, -q.size * 0.07, q.size * 0.2, q.size * 0.08, 0, 0, TAU); ctx.fill();
      ctx.restore();
      q.age += 0.016;
    }
    ctx.restore();
  };

  /** Cánh hoa/lá đậu lên vai hoặc đầu khi stickman đang ngồi. */
  Stickman.catchPetal = function (x, y, size) {
    if (!Stickman.sitting || perch.length >= 5) return false;
    var dh = Math.hypot(x - J.hx, y - (J.hy - HEAD * 0.6)), ds = Math.hypot(x - J.shx, y - J.shy), r = 16 + size * 0.5;
    if (dh < r && Math.random() < 0.5) { perch.push({ j: 1, ox: (x - J.hx) * 0.3, oy: -2, ang: Math.random() * PI, size: Math.min(size, 11), kind: 0, age: 0 }); return true; }
    if (ds < r && Math.random() < 0.5) { perch.push({ j: 0, ox: (x - J.shx) * 0.3, oy: -3, ang: Math.random() * PI, size: Math.min(size, 11), kind: 0, age: 0 }); return true; }
    return false;
  };
  Stickman.reset = function () { perch.length = 0; P.state = 'hidden'; Stickman.state = 'hidden'; Stickman.sitting = false; };
  TL.on('reset', Stickman.reset);
  TL.on('seek', Stickman.reset);

  if (App.ground && App.ground.addCaster) {                       // bóng đổ khớp từng khung: cùng bộ xương, chiếu bằng skew + scaleY
    App.ground.addCaster(function (g, setBase) {
      if (P.state === 'hidden') return;
      setBase(GY); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = LW;
      trace(g); g.stroke(); g.beginPath(); g.arc(J.hx, J.hy, HEAD, 0, TAU); g.fill();
    });
  }
})();
