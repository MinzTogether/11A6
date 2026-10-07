/* ============================================================================
 * js/camera.js – Camera ảo trên hệ toạ độ 1920×1080.
 *  - cam.x, cam.y: điểm thế giới ở tâm khung hình; cam.zoom; cam.rot (radian)
 *  - Parallax theo lớp: cam.apply(ctx, par) đặt phép biến đổi cho một lớp
 *    (par: sky 0.05, far 0.1, mid 0.25, world 1, fore 1.25, grass 1.4 – xem config.camera.parallax)
 *  - Lớp gần (par > 1) còn phóng đại thêm khi zoom (zoom^par) để có chiều sâu
 *  - "Thở" nhẹ suốt cảnh (zoom 1.00→1.06 rất chậm + dao động vài px), zoom cuối 58–66s
 *    với easeInOutCubic tới điểm focus, xoay nhẹ; cam.rack (0..1) = mức rack focus tiền cảnh
 *  - Màn dọc: zoom nhẹ ra và dịch tâm về phía gốc cây (cam.portrait 0..1)
 *  - Quy ước: cssW/cssH là pixel CSS; cam.sw/sh là kích thước canvas (pixel thiết bị)
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config;
  var W = C.virtual.w, H = C.virtual.h, K = C.camera, B = K.breath, F = K.final, TAU = U.TAU;
  var tmp = [0, 0], tmp2 = [0, 0];

  var cam = App.camera = {
    W: W, H: H,
    x: W / 2, y: H / 2, zoom: 1, rot: 0,
    rack: 0,            // 0..1: mức mờ tiền cảnh (rack focus) trong lúc zoom cuối
    finalT: 0,          // 0..1: tiến độ zoom cuối (đã easing)
    cssW: W, cssH: H, dpr: 1, sw: W, sh: H,
    base: 1,            // pixel CSS trên mỗi đơn vị ảo ở zoom 1
    portrait: 0,        // 0 = ngang, 1 = dọc hoàn toàn
    homeX: W / 2, homeY: H / 2,
    reduce: false       // true khi prefers-reduced-motion: không rung, không xoay
  };

  /** Hệ số zoom áp cho lớp có parallax par (lớp gần phóng đại mạnh hơn). */
  cam.zoomFor = function (par) { return par > 1 ? Math.pow(cam.zoom, par) : cam.zoom; };
  /** Pixel THIẾT BỊ trên mỗi đơn vị ảo của lớp par ở thời điểm hiện tại. */
  cam.scaleFor = function (par) { return cam.base * cam.dpr * cam.zoomFor(par); };
  /** Pixel thiết bị trên mỗi đơn vị ảo ở zoom TỐI ĐA – dùng để chọn độ phân giải cache không bị vỡ. */
  cam.maxPx = function (par) { return cam.base * cam.dpr * Math.pow(F.zoom * 1.02, par > 1 ? par : 1); };
  /** Tâm nhìn (toạ độ lớp) của lớp par. */
  cam.layerCenter = function (par, out) {
    out = out || [0, 0];
    out[0] = cam.homeX + (cam.x - cam.homeX) * par;
    out[1] = cam.homeY + (cam.y - cam.homeY) * par;
    return out;
  };

  /** Gọi khi đổi kích thước (đã debounce ở main.js). KHÔNG đụng tới timeline. */
  cam.resize = function (cssW, cssH, dpr) {
    var P = K.portrait;
    cam.cssW = cssW; cam.cssH = cssH; cam.dpr = dpr;
    cam.sw = Math.max(1, Math.round(cssW * dpr)); cam.sh = Math.max(1, Math.round(cssH * dpr));
    var cover = Math.max(cssW / W, cssH / H);
    cam.portrait = U.smoothstep(P.aspectFrom, P.aspectTo, cssW / cssH);
    cam.base = cover * U.lerp(1, P.zoomOut, cam.portrait);
    cam.homeX = U.lerp(W / 2, P.centerX * W, cam.portrait);
    cam.homeY = U.lerp(H / 2, P.centerY * H, cam.portrait);
  };

  /** Tính trạng thái camera từ timeline (hàm của t → luôn nhất quán khi tua/reset). */
  cam.update = function () {
    var t = App.timeline.t, quiet = cam.reduce && !C.reduced.cameraShake;
    var zPre = U.lerp(B.zoomFrom, B.zoomTo, U.ease.inOutSine(t / B.zoomUntil));
    if (!quiet) zPre += B.osc * Math.sin(TAU * t / B.oscPeriod);
    var u = U.ease.inOutCubic((t - F.start) / (F.end - F.start));
    cam.finalT = u; cam.rack = u;
    cam.zoom = U.lerp(zPre, F.zoom, u);
    cam.rot = quiet ? 0 : (F.rotDeg * u + F.swayDeg * Math.sin(TAU * t / F.swayPeriod) * u) * U.DEG;
    var jx = quiet ? 0 : B.posAmp * U.noise1(t / B.posPeriod);
    var jy = quiet ? 0 : B.posAmp * 0.7 * U.noise1(t / B.posPeriod + 41.7);
    var x = U.lerp(cam.homeX, K.focus.x * W, u) + jx;
    var y = U.lerp(cam.homeY, K.focus.y * H, u) + jy;
    // Giữ khung nhìn trong 1920 chiều ngang (kể cả phần dư do xoay)
    var s = cam.base * cam.zoom, hw = cam.cssW / (2 * s), hh = cam.cssH / (2 * s);
    var mw = hw + Math.abs(Math.sin(cam.rot)) * hh;
    cam.x = 2 * mw < W ? U.clamp(x, mw, W - mw) : W / 2;
    cam.y = y;
  };

  /** Đặt phép biến đổi canvas cho lớp có parallax par: toạ độ ảo → pixel thiết bị. */
  cam.apply = function (ctx, par) {
    var s = cam.scaleFor(par), c = Math.cos(cam.rot) * s, sn = Math.sin(cam.rot) * s;
    cam.layerCenter(par, tmp);
    ctx.setTransform(c, sn, -sn, c, cam.sw / 2 - (c * tmp[0] - sn * tmp[1]), cam.sh / 2 - (sn * tmp[0] + c * tmp[1]));
  };

  /** Toạ độ lớp → pixel CSS trên màn hình (dùng cho DOM overlay như lời chúc). */
  cam.worldToScreen = function (x, y, par, out) {
    out = out || [0, 0];
    var s = cam.base * cam.zoomFor(par), c = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    cam.layerCenter(par, tmp2);
    var dx = x - tmp2[0], dy = y - tmp2[1];
    out[0] = cam.cssW / 2 + (c * dx - sn * dy) * s;
    out[1] = cam.cssH / 2 + (sn * dx + c * dy) * s;
    return out;
  };

  /** Pixel CSS trên màn hình → toạ độ lớp (dùng cho chạm/nhấp tạo xung gió). */
  cam.screenToWorld = function (sx, sy, par, out) {
    out = out || [0, 0];
    var s = cam.base * cam.zoomFor(par), c = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    cam.layerCenter(par, tmp2);
    var dx = sx - cam.cssW / 2, dy = sy - cam.cssH / 2;
    out[0] = tmp2[0] + (c * dx + sn * dy) / s;
    out[1] = tmp2[1] + (-sn * dx + c * dy) / s;
    return out;
  };

  /** Hộp bao {x0,y0,x1,y1} vùng đang nhìn thấy của lớp par (toạ độ lớp) – dùng để tô sky/ground tràn khung. */
  cam.viewRect = function (par, out) {
    out = out || { x0: 0, y0: 0, x1: 0, y1: 0 };
    var xs = [0, cam.cssW, 0, cam.cssW], ys = [0, 0, cam.cssH, cam.cssH];
    out.x0 = out.y0 = Infinity; out.x1 = out.y1 = -Infinity;
    for (var i = 0; i < 4; i++) {
      cam.screenToWorld(xs[i], ys[i], par, tmp);
      if (tmp[0] < out.x0) out.x0 = tmp[0]; if (tmp[0] > out.x1) out.x1 = tmp[0];
      if (tmp[1] < out.y0) out.y0 = tmp[1]; if (tmp[1] > out.y1) out.y1 = tmp[1];
    }
    return out;
  };

  /** Điểm focus cuối (tâm vùng lời chúc) theo toạ độ thế giới. */
  cam.focusWorld = function (out) {
    out = out || [0, 0];
    out[0] = K.focus.x * W; out[1] = K.focus.y * H;
    return out;
  };

  cam.resize(W, H, 1);
})();
