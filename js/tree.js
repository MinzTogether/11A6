/* ============================================================================
 * js/tree.js – Cây anh đào: mầm → thân/cành đệ quy → hoa, nụ, lá.
 *  Tree.tasks()           → {structure:[...], sprites:[...]} tác vụ dựng (main.js gán trọng số 15% / 20%)
 *  Tree.update(dt)        → mọc từng nhánh (easeOutCubic), thân dày dần, lắc gió bằng lò xo giảm chấn, vị trí hoa
 *  Tree.draw(ctx)         → lớp 7: vẽ vào canvas riêng (để rim light/ánh trời bằng source-atop) rồi ghép lên ctx
 *  Tree.setQuality(q)     → lọc bớt hoa theo mức chất lượng;  Tree.reset(), Tree.resize()
 *  Tree.thickness(t)      → hệ số độ dày thân theo thời gian (0.07 → 1)
 *  Tree.trunkEdge(h,side) → x bề mặt thân tại độ cao h trên mặt đất (side −1 trái, +1 phải) – stickman tựa lưng
 *  Tree.pickSource(rng,o) → một bông hoa đang nở (x,y,layer,size) để petals.js sinh cánh hoa; Tree.pickLeaf
 *  Tree.sil               → {cv,x,y,w,h} silhouette phẳng (đã cache) để ground.js đổ bóng bằng skew + scaleY
 *  Tree.base, Tree.bbox, Tree.openCount
 * Gỗ cấp 0–3 cứng (không lắc) và được cache ở độ phân giải đủ cho zoom tối đa; cành mảnh + hoa vẽ động.
 * Hoa/cành/lá tránh hẳn vùng lời chúc (config.layout.wishZone + clearMargin).
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, T = C.tree, WS = C.wind.sway, TC = C.timeline, TL = App.timeline, cam = App.camera;
  var W = C.virtual.w, H = C.virtual.h, L = C.layout, DEG = U.DEG, TAU = U.TAU, PI = Math.PI;
  var clamp = U.clamp, lerp = U.lerp, ease = U.ease, css = U.css, mix = U.mix;
  var BX = L.treeX * W, BY = L.treeBaseY * H, CACHE_DEPTH = 3, CACHE_T = TC.growEnd + 6.5, HQ = C.quality.levels.high.flowers;
  var FIT_TOP = T.fitTop !== undefined ? T.fitTop : 0.1;   // đỉnh tán không được cao quá mức này (tỉ lệ chiều cao khung)
  var LOW = (T.lowest !== undefined ? T.lowest : 0.5) * H;   // ngọn cành cấp ≥3 không thấp hơn mức này (giữ khoảng trống trên đầu stickman)
  var ZR = L.wishZone, ZM = T.clearMargin;
  var zx0 = ZR.x0 * W - ZM, zx1 = ZR.x1 * W + ZM, zy0 = ZR.y0 * H - ZM, zy1 = ZR.y1 * H + ZM;

  var Tree = App.tree = { base: { x: BX, y: BY }, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, sil: null, openCount: 0, canopy: { x: BX, y: BY - 450, r: 400 } };
  var B = [], byDepth = [], F = [], FL = [[], [], []], LV = [], BC = [];
  var spr = { blossom: [[], [], []], half: [], cluster: [[], [], []], bud: [], leaf: [] };
  var frac = 1, openFull = 0, woodCv = null, woodInfo = null, layerCv = null, layerCtx = null, woodBox = null, wv = [0, 0], tp = [0, 0];
  var LX = new Float32Array(12), LY = new Float32Array(12), RX = new Float32Array(12), RY = new Float32Array(12);

  function inZone(x, y) { return x > zx0 && x < zx1 && y > zy0 && y < zy1; }
  function wrapPi(a) { return U.mod(a + PI, TAU) - PI; }
  function qb(a, b, c, u) { var v = 1 - u; return v * v * a + 2 * u * v * b + u * u * c; }
  Tree.thickness = function (t) { return lerp(0.07, 1, ease.outCubic((t - TC.growStart) / (TC.growEnd + 6 - TC.growStart))); };

  /* ------------------------------------------------------------ Sinh cấu trúc */
  function build(trunkLen) {
    var rng = U.makeRng(U.TREE_SEEDS[T.seedIndex % U.TREE_SEEDS.length]), D = T.depth, aT = -PI / 2 + T.lean * 0.9, d;
    B.length = 0; byDepth.length = 0;
    for (d = 0; d < D; d++) byDepth.push([]);

    function mk(parent, depth, a, len, ax, ay, w0) {
      var df = depth / (D - 1), sag = T.droop * len * 0.3 * Math.pow(df, 1.5), bend = rng.range(-0.18, 0.18) * len;
      var tries = 0, ex, ey, cx, cy, ok = false, lowY = depth === 0 ? 1e9 : (depth >= 3 ? LOW : (depth === 2 ? LOW + 0.08 * H : LOW + 0.18 * H));
      while (tries < 9) {
        ex = Math.cos(a) * len; ey = Math.sin(a) * len + sag;
        cx = ex * 0.5 - Math.sin(a) * bend; cy = ey * 0.5 + Math.cos(a) * bend;
        if (ay + ey < lowY && !inZone(ax + ex, ay + ey) && !inZone(ax + cx * 0.5 + ex * 0.25, ay + cy * 0.5 + ey * 0.25)) { ok = true; break; }
        a = U.lerpAngle(a, -PI / 2, 0.28); len *= 0.93; tries++;       // né vùng lời chúc: ngẩng lên, ngắn lại
      }
      if (!ok) return null;
      var b = {
        i: B.length, parent: parent, depth: depth, df: df, len: len, w0: w0, w1: w0 * rng.range(0.6, 0.7),
        ex0: ex, ey0: ey, cx0: cx, cy0: cy, ta: Math.atan2(ey - cy, ex - cx), ax: ax, ay: ay,
        start: 0, dur: (0.9 + 0.012 * len) * rng.range(0.9, 1.12), kids: [], g: 0, A: 0, s: { x: 0, v: 0 },
        phi: rng.range(0, TAU), amp: depth <= CACHE_DEPTH ? 0 : WS.ampDeg * DEG * (0.12 + WS.thinBoost * Math.pow(df, 1.6)),
        bx: BX, by: BY, cx: BX, cy: BY, ex: BX, ey: BY
      };
      B.push(b); byDepth[depth].push(b);
      return b;
    }
    function grow(b) {
      if (b.depth >= D - 1 || B.length > 1100) return;
      var n = b.depth === 0 ? 3 : (rng.chance(T.children.pThree) ? T.children.max : T.children.min);
      var spread = rng.range(T.angleDeg[0], T.angleDeg[1]) * DEG * (b.depth <= 1 ? 1.25 : 1), k;
      for (k = 0; k < n; k++) {
        var off = n === 2 ? (k === 0 ? -1 : 1) : (k - 1);
        var a = b.ta + off * spread * rng.range(0.75, 1.25) + rng.range(-0.12, 0.12);
        a = U.lerpAngle(a, aT, T.lightBias * (0.6 + 0.4 * b.df));        // vươn về phía ánh sáng, tán lệch phải
        var right = wrapPi(a + PI / 2) > 0;
        var len = b.len * rng.range(T.lengthRatio[0], T.lengthRatio[1]) * (b.depth < 5 ? (right ? 1 + T.lean * 0.7 : 1 - T.lean * 0.6) : 1);
        var c = mk(b, b.depth + 1, a, len, b.ax + b.ex0, b.ay + b.ey0, b.w1 * (n === 3 ? 0.74 : 0.82));
        if (c) { c.start = b.start + b.dur * rng.range(T.childStart[0], T.childStart[1]); b.kids.push(c); grow(c); }
      }
    }
    var tr = mk(null, 0, -PI / 2 + 0.04, trunkLen, BX, BY, T.trunkWidth);
    tr.start = TC.growStart; grow(tr);
    var minY = BY, i;
    for (i = 0; i < B.length; i++) minY = Math.min(minY, B[i].ay + B[i].ey0, B[i].ay + B[i].cy0 * 0.5 + B[i].ey0 * 0.25);
    return minY;
  }
  /** Sinh cây; tự co chiều cao thân nếu đỉnh tán vượt khỏi khung (đỉnh ≥ fitTop × H). */
  function generate() {
    var len = T.trunkHeight, topY = FIT_TOP * H, pass, minY;
    for (pass = 0; pass < 4; pass++) {
      minY = build(len);
      if (minY >= topY - 2 || pass === 3) break;
      len *= clamp((BY - topY) / (BY - minY), 0.5, 0.98);
    }
    finish();
  }
  function finish() {
    var D = T.depth, d, i, b;
    // Chuẩn hoá để nhánh cuối cùng mọc xong đúng lúc growEnd
    var maxEnd = 0;
    for (i = 0; i < B.length; i++) maxEnd = Math.max(maxEnd, B[i].start + B[i].dur);
    var k2 = (TC.growEnd - TC.growStart) / (maxEnd - TC.growStart);
    for (i = 0; i < B.length; i++) { b = B[i]; b.start = TC.growStart + (b.start - TC.growStart) * k2; b.dur = Math.max(0.35, b.dur * k2); }

    // Hộp bao, tâm tán, màu gỗ theo độ sâu
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, sx = 0, sy = 0, nt = 0;
    for (i = 0; i < B.length; i++) {
      b = B[i];
      var tx = b.ax + b.ex0, ty = b.ay + b.ey0;
      x0 = Math.min(x0, b.ax, tx); x1 = Math.max(x1, b.ax, tx); y0 = Math.min(y0, b.ay, ty); y1 = Math.max(y1, b.ay, ty);
      if (b.depth >= 4) { sx += tx; sy += ty; nt++; }
    }
    Tree.bbox.x0 = x0 - 70; Tree.bbox.y0 = y0 - 70; Tree.bbox.x1 = x1 + 70; Tree.bbox.y1 = Math.max(y1, BY) + 40;
    var cxn = sx / Math.max(1, nt), cyn = sy / Math.max(1, nt), ds = [];
    for (i = 0; i < B.length; i++) if (B[i].depth >= 4) ds.push(Math.hypot(B[i].ax + B[i].ex0 - cxn, B[i].ay + B[i].ey0 - cyn));
    ds.sort(function (p, q) { return p - q; });
    Tree.canopy.x = cxn; Tree.canopy.y = cyn; Tree.canopy.r = ds[Math.floor(ds.length * 0.9)] || 300;
    for (d = 0; d < D; d++) {
      var bark = mix('#4A3144', '#7A5568', d / (D - 1));
      BC[d] = { bark: css(bark), lit: css(mix(bark, '#C98A6A', 0.45)) };
    }
    var wx0 = 1e9, wy0 = 1e9, wx1 = -1e9, wy1 = -1e9;
    for (i = 0; i < B.length; i++) {
      b = B[i]; if (b.depth > CACHE_DEPTH) continue;
      var pad = b.w0 + 30;
      wx0 = Math.min(wx0, b.ax - pad, b.ax + b.ex0 - pad); wx1 = Math.max(wx1, b.ax + pad, b.ax + b.ex0 + pad);
      wy0 = Math.min(wy0, b.ay - pad, b.ay + b.ey0 - pad); wy1 = Math.max(wy1, b.ay + pad, b.ay + b.ey0 + pad);
    }
    woodBox = { x: wx0 - 40, y: wy0 - 40, w: wx1 - wx0 + 80, h: Math.max(wy1, BY + 60) - wy0 + 40 };
  }

  /* ------------------------------------------------------------ Hoa và lá */
  function makeFlowers() {
    var rng = U.makeRng(8128), cum = [], acc = 0, i, b, sum = 0, n = 0, R2 = 1, canopy = Tree.canopy;
    for (i = 0; i < B.length; i++) {
      b = B[i];
      acc += b.depth < 1 ? 0 : b.len * (b.depth >= 4 ? 1 : (b.depth === 3 ? 0.35 : 0.08));
      cum.push(acc);
      R2 = Math.max(R2, Math.hypot(b.ax + b.ex0 - BX, b.ay + b.ey0 - BY));
    }
    function pickBranch() {
      var r = rng.next() * acc, lo = 0, hi = cum.length - 1;
      while (lo < hi) { var m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
      return B[lo];
    }
    function restPos(br, u, out) { out[0] = br.ax + qb(0, br.cx0, br.ex0, u); out[1] = br.ay + qb(0, br.cy0, br.ey0, u); }
    function add(br, u, ox, oy, layer, cl, t0, p) {
      var size = (layer === 0 ? 20 : layer === 1 ? 17 : 13) + rng.range(-3, 3);
      F.push({ b: br, u: u, ox: ox, oy: oy, size: size * (cl ? 1.7 : 1), layer: layer, v: cl ? rng.int(0, 2) : rng.int(0, 3), cl: cl,
        keep: rng.next(), t0: t0, dur: rng.range(T.budDuration[0], T.budDuration[1]), x: p[0], y: p[1], st: 0 });
    }
    F.length = 0;
    var p = [0, 0], d1 = byDepth[1];
    for (i = 0; i < 8 && d1.length; i++) {                      // những bông đầu tiên (từ 16s) trên cành cấp 1
      var e = d1[i % d1.length], eu = rng.range(0.5, 1);
      restPos(e, eu, p);
      if (!inZone(p[0], p[1])) add(e, eu, rng.range(-6, 6), rng.range(-6, 6), 1, 0, Math.max(TC.firstBloomAt + i * 0.55 + rng.range(0, 0.6), e.start + e.dur * 0.8), p);
    }
    while (sum < HQ && n < 9000) {
      n++;
      var cl = rng.chance(0.12) ? 1 : 0, br = pickBranch(), u = rng.range(0.3, 1), ox = rng.gauss() * 7, oy = rng.gauss() * 7;
      restPos(br, u, p);
      p[0] += ox; p[1] += oy;
      if (inZone(p[0], p[1])) continue;                          // KHÔNG đặt hoa trong vùng lời chúc
      var d = Math.hypot(p[0] - canopy.x, p[1] - canopy.y) / canopy.r, layer = d < 0.5 ? 0 : (d < 0.82 ? 1 : 2);
      var wave = clamp(0.55 * br.df + 0.45 * Math.hypot(p[0] - BX, p[1] - BY) / R2, 0, 1);   // nở thành đợt, lan từ gốc ra ngoài
      var t0 = lerp(TC.firstBloomAt + 1.5, TC.bloomMassEnd - 4, Math.pow(wave, 1.5)) + rng.range(0, 4.5);
      add(br, u, ox, oy, layer, cl, Math.max(t0, br.start + br.dur * 0.8), p);
      sum += cl ? 5 : 1;
    }
    F.sort(function (a, c) { return a.t0 - c.t0; });
    for (i = 0; i < 3; i++) FL[i].length = 0;
    for (i = 0; i < F.length; i++) FL[F[i].layer].push(F[i]);
  }
  function makeLeaves() {
    var rng = U.makeRng(3131), i, b, tot = 0, cum = [];
    LV.length = 0;
    for (i = 0; i < B.length; i++) { tot += B[i].depth >= 3 ? B[i].len : 0; cum.push(tot); }
    for (i = 0; i < 150; i++) {
      var r = rng.next() * tot, lo = 0, hi = cum.length - 1;
      while (lo < hi) { var m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
      b = B[lo];
      var u = rng.range(0.3, 1), x = b.ax + qb(0, b.cx0, b.ex0, u), y = b.ay + qb(0, b.cy0, b.ey0, u);
      if (inZone(x, y)) continue;
      LV.push({ b: b, u: u, ox: rng.range(-9, 9), oy: rng.range(-6, 9), size: rng.range(13, 20), rot: rng.range(-PI, PI), v: rng.int(0, 1),
        keep: rng.next(), t0: rng.range(34, 46), dur: 2.4, x: x, y: y, st: 0 });
    }
    LV.sort(function (a, c) { return a.t0 - c.t0; });
  }

  /* ---------------------------------------------------------------- Sprite */
  var LC = [['#F3C6DA', '#E58AB0', '#A8609A'], ['#FFF0F4', '#FFC1D6', '#F48FB1'], ['#FFFFFF', '#FFEAF1', '#FFC9DC']];
  function bake(g, w, h) {                                       // rim light cam phía trái (mặt trời) + bóng tím phía phải
    g.globalCompositeOperation = 'source-atop';
    var a = g.createLinearGradient(0, 0, w, 0);
    a.addColorStop(0, 'rgba(255,170,90,0.34)'); a.addColorStop(0.5, 'rgba(255,170,90,0)'); a.addColorStop(1, 'rgba(106,61,134,0.2)');
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  }
  function petalPath(g, Lp, w) {                                 // cánh có khía nhẹ ở đầu
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(-w * Lp * 0.95, -Lp * 0.18, -w * Lp * 1.05, -Lp * 0.78, -w * Lp * 0.3, -Lp * 0.96);
    g.quadraticCurveTo(-w * Lp * 0.1, -Lp * 0.9, 0, -Lp * 0.8);
    g.quadraticCurveTo(w * Lp * 0.1, -Lp * 0.9, w * Lp * 0.3, -Lp * 0.96);
    g.bezierCurveTo(w * Lp * 1.05, -Lp * 0.78, w * Lp * 0.95, -Lp * 0.18, 0, 0);
    g.closePath();
  }
  function blossom(layer, open, rot, S, rng) {
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), R = S * 0.44, c = LC[layer], i;
    g.translate(S / 2, S / 2);
    for (i = 0; i < 5; i++) {
      g.save(); g.rotate(rot + i * TAU / 5);
      var Lp = R * (0.55 + 0.45 * open), gr = g.createRadialGradient(0, 0, 0, 0, 0, Lp);
      gr.addColorStop(0, c[0]); gr.addColorStop(0.5, c[1]); gr.addColorStop(1, c[2]);
      petalPath(g, Lp, 0.62 + 0.22 * open); g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = S * 0.012; g.stroke();
      g.strokeStyle = 'rgba(190,80,125,0.22)'; g.lineWidth = S * 0.008;           // gân mờ
      g.beginPath(); g.moveTo(0, -Lp * 0.12); g.lineTo(0, -Lp * 0.84); g.stroke();
      g.restore();
    }
    for (i = 0; i < 9; i++) {                                    // nhuỵ vàng–đỏ
      var a = rng.range(0, TAU), l = R * rng.range(0.16, 0.34) * (0.6 + 0.4 * open), px = Math.cos(a) * l, py = Math.sin(a) * l;
      g.strokeStyle = '#D45A7A'; g.lineWidth = S * 0.01; g.beginPath(); g.moveTo(0, 0); g.lineTo(px, py); g.stroke();
      g.fillStyle = '#FFD27A'; g.beginPath(); g.arc(px, py, S * 0.016, 0, TAU); g.fill();
    }
    g.fillStyle = '#FFD27A'; g.beginPath(); g.arc(0, 0, R * 0.07, 0, TAU); g.fill();
    g.fillStyle = '#E04A6E'; g.beginPath(); g.arc(0, 0, R * 0.032, 0, TAU); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0); bake(g, S, S);
    return cv;
  }
  function budSprite(rot, S) {                                   // nụ hình giọt nước hồng đậm + đài hoa
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), R = S * 0.36;
    g.translate(S / 2, S / 2); g.rotate(rot);
    var gr = g.createLinearGradient(0, -R, 0, R * 0.5); gr.addColorStop(0, '#FBB6CF'); gr.addColorStop(1, '#D9457A');
    g.beginPath(); g.moveTo(0, -R);
    g.bezierCurveTo(R * 0.62, -R * 0.45, R * 0.55, R * 0.35, 0, R * 0.42);
    g.bezierCurveTo(-R * 0.55, R * 0.35, -R * 0.62, -R * 0.45, 0, -R);
    g.fillStyle = gr; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-R * 0.2, -R * 0.35, R * 0.1, R * 0.28, 0.25, 0, TAU); g.fill();
    g.fillStyle = '#7A5A3A'; g.beginPath(); g.ellipse(0, R * 0.42, R * 0.26, R * 0.12, 0, 0, TAU); g.fill();
    g.strokeStyle = '#6E8A4A'; g.lineWidth = S * 0.02; g.beginPath();
    g.moveTo(-R * 0.2, R * 0.38); g.lineTo(-R * 0.38, R * 0.2); g.moveTo(R * 0.2, R * 0.38); g.lineTo(R * 0.38, R * 0.2); g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0); bake(g, S, S);
    return cv;
  }
  function clusterSprite(layer, n, S, rng) {                     // cụm 3–7 bông
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), i;
    for (i = 0; i < n; i++) {
      var a = rng.range(0, TAU), r = i === 0 ? 0 : S * rng.range(0.14, 0.27), s = S * rng.range(0.44, 0.6);
      g.save(); g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.rotate(rng.range(0, TAU));
      g.drawImage(spr.blossom[layer][rng.int(0, 3)], -s / 2, -s / 2, s, s); g.restore();
    }
    return cv;
  }
  function leafSprite(v, S) {                                    // lá non xanh–đồng
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), R = S * 0.46;
    g.translate(S / 2, S / 2);
    var gr = g.createLinearGradient(0, -R, 0, R);
    gr.addColorStop(0, v ? '#C9A35A' : '#9AD07A'); gr.addColorStop(0.5, v ? '#B58A4A' : '#7FBF7A'); gr.addColorStop(1, v ? '#8C5E3A' : '#B58A4A');
    g.beginPath(); g.moveTo(0, -R);
    g.bezierCurveTo(R * 0.7, -R * 0.4, R * 0.55, R * 0.5, 0, R); g.bezierCurveTo(-R * 0.55, R * 0.5, -R * 0.7, -R * 0.4, 0, -R);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(255,248,240,0.4)'; g.lineWidth = S * 0.018; g.beginPath(); g.moveTo(0, -R * 0.9); g.lineTo(0, R * 0.9); g.stroke();
    g.lineWidth = S * 0.01; g.beginPath();
    for (var i = -1; i <= 1; i++) { g.moveTo(0, i * R * 0.35); g.lineTo(R * 0.4, i * R * 0.35 - R * 0.22); g.moveTo(0, i * R * 0.35); g.lineTo(-R * 0.4, i * R * 0.35 - R * 0.22); }
    g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0); bake(g, S, S);
    return cv;
  }
  function buildSprites(layer) {
    var rng = U.makeRng(555 + layer * 31), i, opens = [0.82, 0.92, 1, 1];
    spr.blossom[layer].length = 0; spr.cluster[layer].length = 0;
    for (i = 0; i < 4; i++) spr.blossom[layer].push(blossom(layer, opens[i], rng.range(0, TAU), 128, rng));
    spr.half[layer] = blossom(layer, 0.45, rng.range(0, TAU), 128, rng);
    var ns = [4, 5, 7];
    for (i = 0; i < 3; i++) spr.cluster[layer].push(clusterSprite(layer, ns[i], 192, rng));
  }
  function buildMisc() {
    spr.bud = [budSprite(-0.35, 64), budSprite(0.3, 64)];
    spr.leaf = [leafSprite(0, 64), leafSprite(1, 64)];
  }

  /* -------------------------------------------------- Cập nhật mỗi khung */
  function windX(x, y, t) {
    var Wd = App.wind;
    if (Wd && Wd.sample) { Wd.sample(x, y, t, wv); return wv[0]; }
    return 34 * TL.env.windStrength * (1 + 0.5 * U.noise2(t * 0.3, x * 0.002));
  }
  function updateBranches(t, dt) {
    var env = TL.env, om = TAU * WS.freq, gust = (App.wind && App.wind.gust) || 0, i, b, p, bx, by, A, cs, sn, g, wx, tg;
    for (i = 0; i < B.length; i++) {
      b = B[i];
      g = ease.outCubic((t - b.start) / b.dur); b.g = g;
      if (g <= 0) continue;
      p = b.parent;
      if (p) { bx = p.ex; by = p.ey; A = p.A; } else { bx = BX; by = BY; A = 0; }
      if (b.amp > 0) {                                           // góc tích luỹ qua tổ tiên; trễ pha tăng dần về ngọn
        wx = windX(bx, by, t);
        tg = b.amp * (clamp(wx / 110, -1.6, 1.6) + Math.sin(om * t + b.phi + b.depth * WS.lag) * (0.3 + env.windStrength)
          + WS.fineJitter * Math.sin(om * 5.3 * t + b.phi * 1.7) * gust);
        U.springStep(b.s, tg, WS.spring.k, WS.spring.c, dt);
        A += b.s.x;
      }
      b.A = A; cs = Math.cos(A); sn = Math.sin(A);
      b.bx = bx; b.by = by;
      b.cx = bx + (cs * b.cx0 - sn * b.cy0) * g; b.cy = by + (sn * b.cx0 + cs * b.cy0) * g;
      b.ex = bx + (cs * b.ex0 - sn * b.ey0) * g; b.ey = by + (sn * b.ex0 + cs * b.ey0) * g;
    }
  }
  Tree.update = function (dt) {
    var t = TL.t, i, f, n = 0;
    updateBranches(t, dt || 0);
    for (i = 0; i < F.length; i++) {
      f = F[i];
      if (f.t0 > t) break;
      var b = f.b, u = f.u, v = 1 - u;
      f.x = v * v * b.bx + 2 * u * v * b.cx + u * u * b.ex + f.ox;
      f.y = v * v * b.by + 2 * u * v * b.cy + u * u * b.ey + f.oy;
      f.st = clamp((t - f.t0) / f.dur, 0, 1);
      if (f.st >= 0.6 && f.keep <= frac) n++;
    }
    var lim = t - T.budDuration[1] * 0.6, lo = 0, hi = F.length;     // số bông chắc chắn đã nở trọn (F đã sắp theo t0)
    while (lo < hi) { var m = (lo + hi) >> 1; if (F[m].t0 <= lim) lo = m + 1; else hi = m; }
    openFull = lo; Tree.openCount = n;
    for (i = 0; i < LV.length; i++) {
      f = LV[i];
      if (f.t0 > t) break;
      var lb = f.b, lu = f.u, lv = 1 - lu;
      f.x = lv * lv * lb.bx + 2 * lu * lv * lb.cx + lu * lu * lb.ex + f.ox;
      f.y = lv * lv * lb.by + 2 * lu * lv * lb.cy + lu * lu * lb.ey + f.oy;
      f.st = clamp((t - f.t0) / f.dur, 0, 1);
    }
    updateSil(t);
  };

  /* ------------------------------------------------------- Gỗ: thân, rễ, cành */
  function polyQ(g, x0, y0, cx, cy, x1, y1, wa, wb, n) {         // thêm một đa giác thon dần theo Bézier vào path hiện tại
    var i, u, v, x, y, dx, dy, d, w;
    for (i = 0; i <= n; i++) {
      u = i / n; v = 1 - u;
      x = v * v * x0 + 2 * u * v * cx + u * u * x1; y = v * v * y0 + 2 * u * v * cy + u * u * y1;
      dx = 2 * v * (cx - x0) + 2 * u * (x1 - cx); dy = 2 * v * (cy - y0) + 2 * u * (y1 - cy);
      d = Math.sqrt(dx * dx + dy * dy) || 1; w = lerp(wa, wb, u) * 0.5;
      LX[i] = x - dy / d * w; LY[i] = y + dx / d * w; RX[i] = x + dy / d * w; RY[i] = y - dx / d * w;
    }
    g.moveTo(LX[0], LY[0]);
    for (i = 1; i <= n; i++) g.lineTo(LX[i], LY[i]);
    for (i = n; i >= 0; i--) g.lineTo(RX[i], RY[i]);
    g.closePath();
  }
  function branchPoly(g, b, thick) {
    polyQ(g, b.bx, b.by, b.cx, b.cy, b.ex, b.ey, Math.max(0.45, b.w0 * thick), Math.max(0.4, lerp(b.w0, b.w1, b.g) * thick), clamp(Math.ceil(b.len * b.g / 55), 2, 9));
  }
  function woodStyle(g, b, thick) {                              // viền cam ấm phía mặt trời → nâu tím → tím sẫm phía khuất
    var sun = App.sky && App.sky.sun, tX = sun ? sun.toX : -0.64, tY = sun ? sun.toY : -0.77;
    var dx = b.ex - b.bx, dy = b.ey - b.by, d = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
    var s = (nx * tX + ny * tY) >= 0 ? 1 : -1, mx = (b.bx + b.ex) / 2, my = (b.by + b.ey) / 2, hw = Math.max(1, lerp(b.w0, b.w1, 0.5) * thick / 2 + 1);
    var gr = g.createLinearGradient(mx + nx * s * hw, my + ny * s * hw, mx - nx * s * hw, my - ny * s * hw);
    gr.addColorStop(0, '#E9A06A'); gr.addColorStop(0.16, BC[b.depth].lit); gr.addColorStop(0.55, BC[b.depth].bark); gr.addColorStop(1, '#2A1B34');
    return gr;
  }
  function deco(g, b, thick) {                                   // vân dọc, vằn ngang đặc trưng anh đào, mắt gỗ
    var rng = U.makeRng(77 + b.i), n = clamp(Math.ceil(b.len * b.g / 40), 3, 9), k, i, u, v, x, y, dx, dy, d, w, off;
    g.lineCap = 'round';
    for (k = 0; k < 5; k++) {
      off = (k - 2) * 0.17; g.strokeStyle = 'rgba(44,27,48,0.22)'; g.lineWidth = 1.2; g.beginPath();
      for (i = 0; i <= n; i++) {
        u = i / n; v = 1 - u;
        x = v * v * b.bx + 2 * u * v * b.cx + u * u * b.ex; y = v * v * b.by + 2 * u * v * b.cy + u * u * b.ey;
        dx = 2 * v * (b.cx - b.bx) + 2 * u * (b.ex - b.cx); dy = 2 * v * (b.cy - b.by) + 2 * u * (b.ey - b.cy); d = Math.sqrt(dx * dx + dy * dy) || 1;
        w = lerp(b.w0, lerp(b.w0, b.w1, b.g), u) * thick;
        if (i === 0) g.moveTo(x - dy / d * w * off, y + dx / d * w * off); else g.lineTo(x - dy / d * w * off, y + dx / d * w * off);
      }
      g.stroke();
    }
    for (k = 0; k < 12; k++) {                                   // vằn ngang
      u = rng.range(0.06, 0.94); v = 1 - u; off = rng.range(-0.36, 0.36);
      x = v * v * b.bx + 2 * u * v * b.cx + u * u * b.ex; y = v * v * b.by + 2 * u * v * b.cy + u * u * b.ey;
      w = lerp(b.w0, lerp(b.w0, b.w1, b.g), u) * thick; var ll = rng.range(5, 11);
      g.strokeStyle = 'rgba(190,150,175,0.34)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + off * w - ll / 2, y); g.lineTo(x + off * w + ll / 2, y + rng.range(-1, 1)); g.stroke();
    }
    for (k = 0; k < 2; k++) {                                    // mắt gỗ
      u = k ? 0.62 : 0.3; v = 1 - u; off = (k ? 0.15 : -0.18);
      x = v * v * b.bx + 2 * u * v * b.cx + u * u * b.ex; y = v * v * b.by + 2 * u * v * b.cy + u * u * b.ey; w = lerp(b.w0, b.w1, u) * thick;
      g.fillStyle = 'rgba(30,18,36,0.5)'; g.beginPath(); g.ellipse(x + off * w, y, w * 0.07 + 1, w * 0.11 + 1.5, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(233,160,106,0.4)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x + off * w, y, w * 0.09 + 1.5, w * 0.13 + 2, 0, 0.5, 2.6); g.stroke();
    }
  }
  function drawRoots(g, thick) {                                 // chân rễ nở rộng + vài rễ nổi
    var tr = byDepth[0][0], w = tr.w0 * thick, fl = T.rootFlare, i;
    g.fillStyle = BC[0].bark;
    g.beginPath(); g.moveTo(BX - w * 0.5, BY - 60 * thick - 6);
    g.quadraticCurveTo(BX - w * 0.56, BY - 10, BX - w * 0.5 * fl, BY + 3);
    g.lineTo(BX + w * 0.5 * fl, BY + 3); g.quadraticCurveTo(BX + w * 0.56, BY - 10, BX + w * 0.5, BY - 60 * thick - 6); g.closePath(); g.fill();
    var rs = [-1.0, -0.4, 0.45, 1.0];
    for (i = 0; i < T.rootCount && i < 4; i++) {
      var dx = rs[i] * w * 0.9;
      g.beginPath(); polyQ(g, BX + dx * 0.25, BY - 14 * thick, BX + dx * 0.7, BY - 2, BX + dx * 1.15, BY + 5, w * 0.3, Math.max(0.6, w * 0.05), 5); g.fill();
    }
  }
  function drawWood(g, thick) {
    var d, i, arr, b;
    drawRoots(g, thick);
    for (d = 0; d <= CACHE_DEPTH; d++) {
      arr = byDepth[d];
      for (i = 0; i < arr.length; i++) {
        b = arr[i];
        if (b.g <= 0) continue;
        g.beginPath(); branchPoly(g, b, thick); g.fillStyle = woodStyle(g, b, thick); g.fill();
        if (d <= 1 && b.w0 * thick > 8) deco(g, b, thick);
      }
    }
  }
  function buildWood() {
    var bb = woodBox, sc = Math.min(cam.maxPx(1), 4096 / Math.max(bb.w, bb.h));
    woodCv = U.createCanvas(Math.ceil(bb.w * sc), Math.ceil(bb.h * sc));
    var g = woodCv.getContext('2d');
    g.setTransform(sc, 0, 0, sc, -bb.x * sc, -bb.y * sc);
    drawWood(g, 1);
    woodInfo = { x: bb.x, y: bb.y, w: bb.w, h: bb.h, sc: sc };
  }
  function drawFine(g, thick) {                                  // cành mảnh: mỗi cấp một lần tô
    for (var d = CACHE_DEPTH + 1; d < byDepth.length; d++) {
      var arr = byDepth[d], i, any = false;
      g.beginPath();
      for (i = 0; i < arr.length; i++) if (arr[i].g > 0) { branchPoly(g, arr[i], thick); any = true; }
      if (any) { g.fillStyle = BC[d].bark; g.fill(); }
    }
  }

  /* ------------------------------------------------------------------ Mầm */
  function drawSprout(g, t) {                                    // hạt → rễ → mầm → hai lá mầm (3–8s)
    var a = t < 8 ? 1 : 1 - ease.inOutCubic((t - 8) / 2.5);
    if (a <= 0.01) return;
    var sa = 1 - ease.inOutCubic((t - 3.4) / 1.4), ru = ease.outCubic((t - 3.4) / 3.1), su = ease.outCubic((t - 4) / 4), co = ease.outBack((t - 6) / 2), s;
    if (sa > 0.01) {
      g.globalAlpha = a * sa; g.fillStyle = '#6B4A38'; g.beginPath(); g.ellipse(BX, BY + 3, 8, 5, -0.2, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,214,170,0.45)'; g.beginPath(); g.ellipse(BX - 2.5, BY + 1.2, 3.2, 1.5, -0.3, 0, TAU); g.fill();
    }
    g.globalAlpha = a; g.lineCap = 'round';
    if (ru > 0) {
      g.strokeStyle = '#E8D9C0'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(BX, BY + 4); g.quadraticCurveTo(BX - 6 * ru, BY + 12 * ru, BX - 3 * ru, BY + 22 * ru);
      g.moveTo(BX - 4 * ru, BY + 14 * ru); g.lineTo(BX - 11 * ru, BY + 18 * ru); g.moveTo(BX - 4 * ru, BY + 17 * ru); g.lineTo(BX + 3 * ru, BY + 24 * ru); g.stroke();
    }
    if (su > 0) {
      var h = 30 * su, sw = Math.sin(t * 1.3) * 1.2 * su;
      g.strokeStyle = css(mix('#9BD27F', '#8A6A58', clamp((t - 6) / 3, 0, 1))); g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(BX, BY + 2); g.quadraticCurveTo(BX + sw * 2, BY - h * 0.5, BX + sw, BY - h); g.stroke();
      if (co > 0) for (s = -1; s <= 1; s += 2) {
        g.save(); g.translate(BX + sw, BY - h); g.rotate(s * (0.2 + 0.95 * co));
        g.fillStyle = '#8CCB72'; g.beginPath(); g.ellipse(0, -11 * co - 1, 5.5 * co + 0.5, 11 * co + 1, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,248,240,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -20 * co); g.stroke();
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  /* --------------------------------------------------------- Hoa, lá, ánh sáng */
  function drawFlowers(g, layer, t) {
    var arr = FL[layer], i, f, s, img, k, r;
    for (i = 0; i < arr.length; i++) {
      f = arr[i];
      if (f.t0 > t) break;
      if (f.keep > frac) continue;
      s = f.st;
      if (s < 0.3) { img = spr.bud[f.v & 1]; k = lerp(0.45, 0.95, s / 0.3) * (f.cl ? 1.3 : 1) * 0.9; }
      else if (s < 0.55) { img = spr.half[layer]; k = lerp(0.55, 0.9, (s - 0.3) / 0.25); }
      else { img = f.cl ? spr.cluster[layer][f.v % 3] : spr.blossom[layer][f.v & 3]; k = lerp(0.82, 1, ease.outBack((s - 0.55) / 0.45)); }
      r = f.size * k;
      g.drawImage(img, f.x - r, f.y - r, r * 2, r * 2);
    }
  }
  function drawLeaves(g, t) {
    for (var i = 0; i < LV.length; i++) {
      var f = LV[i];
      if (f.t0 > t) break;
      if (f.keep > frac + 0.3) continue;
      var k = ease.outBack(f.st) * f.size, sw = Math.sin(t * 1.4 + f.rot * 3) * 0.12;
      g.save(); g.translate(f.x, f.y); g.rotate(f.rot + sw); g.drawImage(spr.leaf[f.v], -k / 2, -k / 2, k, k); g.restore();
    }
  }
  function lightPass(g) {                                        // rim light cam phía mặt trời, ánh trời tím lạnh phía khuất (source-atop)
    var sun = App.sky && App.sky.sun; if (!sun) return;
    var bb = Tree.bbox, d = cam.dpr, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i, cx = [bb.x0, bb.x1, bb.x0, bb.x1], cy = [bb.y0, bb.y0, bb.y1, bb.y1];
    for (i = 0; i < 4; i++) {
      cam.worldToScreen(cx[i], cy[i], 1, tp);
      x0 = Math.min(x0, tp[0] * d); x1 = Math.max(x1, tp[0] * d); y0 = Math.min(y0, tp[1] * d); y1 = Math.max(y1, tp[1] * d);
    }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(cam.sw, x1); y1 = Math.min(cam.sh, y1);
    if (x1 <= x0 || y1 <= y0) return;
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2, dusk = sun.dusk;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
    var a = g.createLinearGradient(mx + sun.toX * R, my + sun.toY * R, mx - sun.toX * R * 0.25, my - sun.toY * R * 0.25);
    a.addColorStop(0, css(sun.rim, 0.5 * sun.rimAlpha)); a.addColorStop(0.5, css(sun.rim, 0.12 * sun.rimAlpha)); a.addColorStop(1, css(sun.rim, 0));
    g.fillStyle = a; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    var b2 = g.createLinearGradient(mx - sun.toX * R * 0.1, my - sun.toY * R * 0.1, mx - sun.toX * R, my - sun.toY * R);
    b2.addColorStop(0, css(sun.ambient, 0)); b2.addColorStop(1, css(sun.ambient, 0.28 * (0.6 + 0.4 * dusk)));
    g.fillStyle = b2; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.globalCompositeOperation = 'source-over';
  }
  function ensureLayer() {
    if (!layerCv) { layerCv = U.createCanvas(cam.sw, cam.sh); layerCtx = layerCv.getContext('2d'); }
    else if (layerCv.width !== cam.sw || layerCv.height !== cam.sh) { layerCv.width = cam.sw; layerCv.height = cam.sh; }
  }

  Tree.draw = function (ctx) {
    var t = TL.t, thick = Tree.thickness(t), g, bb;
    ensureLayer(); g = layerCtx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, layerCv.width, layerCv.height);
    cam.apply(g, 1);
    g.imageSmoothingEnabled = true;
    if (t < 11) drawSprout(g, t);
    if (t >= CACHE_T) {                                          // gỗ chính đã mọc xong → cache ở độ phân giải đủ cho zoom tối đa
      var want = Math.min(cam.maxPx(1), 4096 / Math.max(woodBox.w, woodBox.h));
      if (!woodCv || woodInfo.sc < want * 0.85) buildWood();
      g.drawImage(woodCv, woodInfo.x, woodInfo.y, woodInfo.w, woodInfo.h);
    } else drawWood(g, thick);
    drawFlowers(g, 0, t);                                        // lớp trong: đậm, dày
    drawFine(g, thick);
    drawFlowers(g, 1, t);                                        // lớp giữa
    drawLeaves(g, t);
    drawFlowers(g, 2, t);                                        // lớp ngoài: sáng, thưa, trắng hồng
    lightPass(g);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layerCv, 0, 0);
  };

  /* ---------------------------------------- Silhouette cho bóng đổ (đã cache) */
  function initSil() {
    var bb = Tree.bbox, sc = 0.5;
    Tree.sil = { cv: U.createCanvas((bb.x1 - bb.x0) * sc, (bb.y1 - bb.y0) * sc), x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0, sc: sc, built: -99 };
  }
  function updateSil(t) {
    var s = Tree.sil; if (!s || !s.cv) return;
    if (t - s.built < (t < 48 ? 0.35 : 1) && t >= s.built) return;
    var g = s.cv.getContext('2d'), thick = Tree.thickness(t), i, d, arr, f;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, s.cv.width, s.cv.height);
    g.setTransform(s.sc, 0, 0, s.sc, -s.x * s.sc, -s.y * s.sc);
    g.fillStyle = '#3A2150';
    g.beginPath();
    for (i = 0; i < B.length; i++) if (B[i].g > 0) branchPoly(g, B[i], thick);
    g.fill();
    g.beginPath();
    for (i = 0; i < F.length; i++) { f = F[i]; if (f.t0 > t) break; if (f.keep > frac || f.st < 0.3) continue; g.moveTo(f.x + f.size * 0.85, f.y); g.arc(f.x, f.y, f.size * 0.85, 0, TAU); }
    g.fill();
    s.built = t;
  }

  /* ------------------------------------------------------------------ API */
  var pick = { x: 0, y: 0, layer: 1, size: 16, v: 0 };
  Tree.pickSource = function (rng, out) {
    out = out || pick;
    if (openFull < 1) return null;
    for (var k = 0; k < 8; k++) {
      var f = F[(rng.next() * openFull) | 0];
      if (f.keep <= frac && f.st >= 0.6) { out.x = f.x; out.y = f.y; out.layer = f.layer; out.size = f.size; out.v = f.v; return out; }
    }
    return null;
  };
  Tree.pickLeaf = function (rng, out) {
    out = out || pick;
    var n = 0, t = TL.t;
    while (n < LV.length && LV[n].t0 + 1 <= t) n++;
    if (n < 1) return null;
    var f = LV[(rng.next() * n) | 0];
    out.x = f.x; out.y = f.y; out.layer = 1; out.size = f.size; out.v = f.v;
    return out;
  };
  /** x của bề mặt thân tại độ cao h (đơn vị ảo) trên mặt đất; side −1 = mép trái (phía mặt trời), +1 = mép phải. */
  Tree.trunkEdge = function (h, side) {
    var b = byDepth[0][0], lo = 0, hi = 1, u = 0.5, k;
    for (k = 0; k < 14; k++) { u = (lo + hi) / 2; if (BY + qb(0, b.cy0, b.ey0, u) > BY - h) lo = u; else hi = u; }
    var x = BX + qb(0, b.cx0, b.ex0, u), w = lerp(b.w0, b.w1, u) * Tree.thickness(TL.t) * 0.5, fl = 1 + (T.rootFlare - 1) * clamp(1 - h / 60, 0, 1);
    return x + side * w * fl;
  };
  Tree.setQuality = function (q) { frac = clamp(q.flowers / HQ, 0.05, 1); };
  Tree.reset = function () {
    for (var i = 0; i < B.length; i++) { B[i].s.x = 0; B[i].s.v = 0; B[i].g = 0; }
    if (Tree.sil) Tree.sil.built = -99;
  };
  Tree.resize = function () { woodCv = null; };
  TL.on('reset', Tree.reset);
  TL.on('seek', Tree.reset);

  Tree.tasks = function () {
    return {
      structure: [generate, function () { makeFlowers(); makeLeaves(); initSil(); }],
      sprites: [function () { buildSprites(0); }, function () { buildSprites(1); }, function () { buildSprites(2); }, buildMisc]
    };
  };
})();
