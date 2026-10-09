/* ============================================================================
 * js/postfx.js – Hậu kỳ (lớp 14), vẽ thẳng lên canvas chính sau cùng, không cần WebGL:
 *  1) Bloom giả: hạ mẫu khung hình → nhân với chính nó (bình phương, làm nổi vùng sáng) → phóng lại mượt
 *     ở hai bán kính, cộng vào bằng 'lighter'. Độ phân giải bloom theo mức chất lượng.
 *  2) Color grading ấm: lớp cam soft-light (đậm dần theo env.warmth) + bóng tím multiply ở nửa dưới.
 *  3) Vignette tím đêm (không đen thuần), đậm dần theo env.vignette (mạnh nhất ở zoom cuối).
 *  4) Film grain rất nhẹ: 4 tile nhiễu xám, blend overlay, đổi ~12 lần/giây (đứng yên khi giảm chuyển động).
 *  5) Fade-in 0–3s từ màu tím đêm.
 *  PostFX.apply(ctx), PostFX.setQuality(q), PostFX.setReduced(bool)
 * Nếu trình duyệt thiếu soft-light/overlay/multiply thì tự dùng phương án thay thế nhẹ hơn.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, PC = C.postfx, TL = App.timeline, cam = App.camera;
  var clamp = U.clamp, css = U.css;
  var PF = App.postfx = {};
  var scaleA = 0.25, A = null, T2 = null, B = null, ops = null, grain = [], gi = 0, gT = -1, gOX = 0, gOY = 0, reduce = false;

  function mk(w, h) { var cv = U.createCanvas(w, h); return { cv: cv, g: cv.getContext('2d') }; }
  function support(g, op) {
    var old = g.globalCompositeOperation;
    g.globalCompositeOperation = op;
    var ok = g.globalCompositeOperation === op;
    g.globalCompositeOperation = old;
    return ok;
  }
  function pickOps(g) {
    var ov = support(g, 'overlay');
    ops = { soft: support(g, 'soft-light') ? 'soft-light' : (ov ? 'overlay' : 'source-over'), overlay: ov ? 'overlay' : 'source-over',
      multiply: support(g, 'multiply') ? 'multiply' : 'source-over', lighter: support(g, 'lighter') ? 'lighter' : 'source-over' };
  }
  function buildGrain() {
    var n, i, k, rng = U.makeRng(2468);
    for (n = 0; n < 4; n++) {
      var cv = U.createCanvas(128, 128), g = cv.getContext('2d'), im = g.createImageData(128, 128), d = im.data;
      for (i = 0, k = 0; i < 128 * 128; i++, k += 4) { var v = 128 + (rng.next() + rng.next() + rng.next() - 1.5) * 90; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
      g.putImageData(im, 0, 0);
      grain.push({ cv: cv, pat: null });
    }
  }

  function bloom(ctx, env, sw, sh) {
    var w = Math.max(8, Math.round(sw * scaleA)), h = Math.max(8, Math.round(sh * scaleA)), k;
    if (!A || A.cv.width !== w || A.cv.height !== h) { A = mk(w, h); T2 = mk(w, h); B = mk(Math.max(4, w >> 2), Math.max(4, h >> 2)); }
    A.g.globalCompositeOperation = 'source-over'; A.g.globalAlpha = 1; A.g.imageSmoothingEnabled = true;
    A.g.drawImage(ctx.canvas, 0, 0, w, h);                          // 1) hạ mẫu
    T2.g.drawImage(A.cv, 0, 0);
    A.g.globalCompositeOperation = ops.multiply; A.g.drawImage(T2.cv, 0, 0);       // 2) bình phương: chỉ vùng sáng còn nổi
    if (PC.bloomThreshold >= 0.7) { T2.g.globalCompositeOperation = 'source-over'; T2.g.drawImage(A.cv, 0, 0); A.g.drawImage(T2.cv, 0, 0); }
    A.g.globalCompositeOperation = 'source-over';
    B.g.imageSmoothingEnabled = true; B.g.drawImage(A.cv, 0, 0, B.cv.width, B.cv.height);   // 3) bán kính rộng
    k = PC.bloomStrength * (0.7 + 0.6 * env.dusk) * clamp(0.4 + env.fade, 0, 1) * (ops.multiply === 'multiply' ? 1 : 0.25);
    ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = ops.lighter;
    ctx.globalAlpha = 0.45 * k; ctx.drawImage(A.cv, 0, 0, sw, sh);                           // 4) cộng lại: bán kính vừa + rộng
    ctx.globalAlpha = 0.6 * k; ctx.drawImage(B.cv, 0, 0, sw, sh);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  PF.apply = function (ctx) {
    var env = TL.env, sw = cam.sw, sh = cam.sh, t = TL.t, R = Math.hypot(sw, sh) / 2;
    if (!ops) pickOps(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    bloom(ctx, env, sw, sh);

    // Color grading ấm
    ctx.globalCompositeOperation = ops.soft;
    ctx.globalAlpha = clamp(PC.warmStrength * (1 + 2.2 * env.warmth), 0, 0.6) * (ops.soft === 'source-over' ? 0.3 : 1);
    ctx.fillStyle = PC.warmColor; ctx.fillRect(0, 0, sw, sh);
    ctx.globalCompositeOperation = ops.multiply; ctx.globalAlpha = 1;
    var lg = ctx.createLinearGradient(0, sh * 0.5, 0, sh);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, css('#8A6BB0', 0.2 * (0.3 + 0.7 * env.dusk) * (ops.multiply === 'multiply' ? 1 : 0.4)));
    ctx.fillStyle = lg; ctx.fillRect(0, sh * 0.5, sw, sh * 0.5);

    // Vignette tím đêm, đậm dần khi zoom cuối
    ctx.globalCompositeOperation = 'source-over';
    var va = env.vignette, g = ctx.createRadialGradient(sw / 2, sh / 2, R * 0.36, sw / 2, sh / 2, R * 1.02);
    g.addColorStop(0, css(PC.vignetteColor, 0)); g.addColorStop(0.62, css(PC.vignetteColor, va * 0.32)); g.addColorStop(1, css(PC.vignetteColor, va));
    ctx.fillStyle = g; ctx.fillRect(0, 0, sw, sh);

    // Film grain rất nhẹ
    if (PC.grain > 0) {
      if (!grain.length) buildGrain();
      if (!reduce && (t - gT > 0.083 || t < gT)) {
        gT = t; gi = (gi + 1 + ((Math.random() * 3) | 0)) % grain.length;
        gOX = -((Math.random() * 128) | 0); gOY = -((Math.random() * 128) | 0);
      }
      var tile = grain[gi], gs = Math.max(1, cam.dpr * PC.grainSize);
      if (!tile.pat) tile.pat = ctx.createPattern(tile.cv, 'repeat');
      if (tile.pat) {
        ctx.save(); ctx.setTransform(gs, 0, 0, gs, gOX * gs, gOY * gs);
        ctx.globalCompositeOperation = ops.overlay; ctx.globalAlpha = PC.grain * (ops.overlay === 'overlay' ? 2.2 : 0.5);
        ctx.fillStyle = tile.pat; ctx.fillRect(0, 0, sw / gs + 130, sh / gs + 130);
        ctx.restore();
      }
    }

    // Fade-in đầu cảnh (0–3s)
    if (env.fade < 0.999) { ctx.globalAlpha = 1 - env.fade; ctx.fillStyle = PC.vignetteColor; ctx.fillRect(0, 0, sw, sh); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  PF.setQuality = function (q) { scaleA = Math.max(0.1, q.bloomScale * 0.5); };
  PF.setReduced = function (on) { reduce = !!on; };
})();
