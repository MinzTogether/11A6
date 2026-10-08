/* ============================================================================
 * js/ground.js – Mặt đất, cỏ, hoa dại, bóng đổ và đốm sáng lọt kẽ lá.
 *  Ground.tasks()          → {sprites:[...], caches:[...]} tác vụ dựng (sprite hoa/bụi; cache cỏ tĩnh, đốm nắng…)
 *  Ground.update(dt)       → gió trên lưới cỏ (lò xo), màu theo hoàng hôn, hạt bồ công anh
 *  Ground.drawBack(ctx)    → lớp 5: đồng cỏ, hàng cỏ sau (cache tĩnh), BÓNG ĐỔ, đốm sáng lọt kẽ lá
 *  Ground.drawFront(ctx)   → lớp 10 (par 1): bụi hoa → cỏ động → cúc/bồ công anh → hạt bồ công anh bay
 *  Ground.drawNear(ctx)    → lớp 10 (par 1.4): cỏ cận cảnh, nhoè dần khi rack focus (gọi SAU ao sen)
 *  Ground.addCaster(fn)    → đăng ký vật đổ bóng: fn(ctx, setBase) vẽ silhouette ở toạ độ thế giới sau setBase(yMặtĐất)
 *                            (stickman dùng để có bóng khớp từng khung hình)
 *  Ground.setQuality(q), Ground.resize(), Ground.reset()
 * Bóng: silhouette (Tree.sil) chiếu bằng skew + scaleY, chia dải theo độ cao để nhạt dần theo khoảng cách,
 * vẽ vào canvas nhỏ rồi ghép 3 lượt lệch nhau với alpha thấp (bóng mềm); màu tím đậm trong suốt, dài ra khi mặt trời hạ.
 * Cỏ và hoa chỉ mọc ở vùng KHÔNG có vật cản đối với lời chúc (y ≥ 0.72H) và tránh ao sen, stickman.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, GC = C.ground, TC = C.timeline, TL = App.timeline, cam = App.camera;
  var W = C.virtual.w, H = C.virtual.h, L = C.layout, TAU = U.TAU, PI = Math.PI, HZ = L.horizonY * H, BX = L.treeX * W, BY = L.treeBaseY * H;
  var clamp = U.clamp, lerp = U.lerp, ease = U.ease, css = U.css, mix = U.mix, sstep = U.smoothstep;
  var SMX = C.stickman.sitX * W, SMY = L.stickmanY * H;
  var PR = L.pondRect, px0 = PR.x0 * W - 20, px1 = PR.x1 * W + 20, py0 = PR.y0 * H - 14, py1 = PR.y1 * H + 20;
  var GX0 = -100, GWID = W + 200;
  function inPond(x, y) { return x > px0 && x < px1 && y > py0 && y < py1; }
  function inStick(x, y) { return x > SMX - 100 && x < SMX + 70 && y > SMY - 200 && y < SMY + 40; }

  var Ground = App.ground = {};
  var Q = C.quality.levels.high, frac = 1;
  var wv = [0, 0], view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  var cols = { mTop: '', mMid: '', mBot: '', dyn: [], dynS: [], fore: [] };
  var casters = [];

  /* ------------------------------------------------------------ Bảng màu cỏ */
  var RAMP_DAY = ['#6DAF6A', '#7FBF7A', '#8FCB7E', '#A6D687', '#5F9F63', '#7CB86B'];
  var RAMP_DUSK = ['#6C7F4E', '#8A8F52', '#A39A58', '#B5A25E', '#586A4A', '#7C8553'];
  function rampCol(i, dusk, haze, hazeC) {
    var c = mix(RAMP_DAY[i % 6], RAMP_DUSK[i % 6], dusk);
    return haze ? mix(c, hazeC, haze) : c;
  }

  /* ---------------------------------------------------------------- Sprite */
  var spr = {};
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function bakeRim(g, w, h) {                                    // rim cam phía trái (mặt trời), bóng tím phía phải/dưới
    g.globalCompositeOperation = 'source-atop';
    var a = g.createLinearGradient(0, 0, w, 0);
    a.addColorStop(0, 'rgba(255,170,90,0.32)'); a.addColorStop(0.45, 'rgba(255,170,90,0)'); a.addColorStop(1, 'rgba(106,61,134,0.22)');
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    var b = g.createLinearGradient(0, h * 0.5, 0, h);
    b.addColorStop(0, 'rgba(58,33,80,0)'); b.addColorStop(1, 'rgba(58,33,80,0.28)');
    g.fillStyle = b; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
  function daisySprite(S) {
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), i;
    g.translate(S / 2, S / 2);
    for (i = 0; i < 14; i++) {
      g.save(); g.rotate(i * TAU / 14);
      var gr = g.createLinearGradient(0, 0, 0, -S * 0.46); gr.addColorStop(0, '#FFF8F0'); gr.addColorStop(0.7, '#FFFFFF'); gr.addColorStop(1, '#FFD9E4');
      ell(g, 0, -S * 0.3, S * 0.055, S * 0.17, 0); g.fillStyle = gr; g.fill();
      g.restore();
    }
    var cg = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.14); cg.addColorStop(0, '#FFE27A'); cg.addColorStop(1, '#E8A93A');
    g.fillStyle = cg; g.beginPath(); g.arc(0, 0, S * 0.14, 0, TAU); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0); bakeRim(g, S, S);
    return cv;
  }
  function dandBloom(S) {
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), i, r = U.makeRng(5);
    g.translate(S / 2, S / 2);
    for (i = 0; i < 44; i++) {
      g.save(); g.rotate(r.range(0, TAU)); g.fillStyle = i % 2 ? '#FFD84A' : '#F5B82E';
      ell(g, 0, -S * r.range(0.14, 0.3), S * 0.03, S * 0.11, 0); g.fill(); g.restore();
    }
    g.fillStyle = '#E8A93A'; g.beginPath(); g.arc(0, 0, S * 0.1, 0, TAU); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0); bakeRim(g, S, S);
    return cv;
  }
  function puffSprite(S) {
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), i, r = U.makeRng(6);
    g.translate(S / 2, S / 2);
    var hg = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.46); hg.addColorStop(0, 'rgba(255,255,255,0.35)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg; g.beginPath(); g.arc(0, 0, S * 0.46, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.8; g.fillStyle = '#FFFFFF';
    for (i = 0; i < 70; i++) {
      var a = r.range(0, TAU), l = S * r.range(0.34, 0.44);
      g.beginPath(); g.moveTo(Math.cos(a) * S * 0.06, Math.sin(a) * S * 0.06); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
      g.beginPath(); g.arc(Math.cos(a) * l, Math.sin(a) * l, 1.4, 0, TAU); g.fill();
    }
    g.fillStyle = '#A99C7A'; g.beginPath(); g.arc(0, 0, S * 0.06, 0, TAU); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0); bakeRim(g, S, S);
    return cv;
  }
  function seedSprite(S) {                                       // dù bồ công anh: tia toả hình bán cầu + hạt nhỏ
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), i;
    g.translate(S / 2, S * 0.42);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.8;
    for (i = 0; i < 15; i++) {
      var a = -PI + 0.35 + i * (PI - 0.7) / 14;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * S * 0.4, Math.sin(a) * S * 0.4 * 0.8); g.stroke();
    }
    g.strokeStyle = 'rgba(200,190,170,0.9)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, S * 0.3); g.stroke();
    g.fillStyle = '#8A7A5A'; ell(g, 0, S * 0.33, S * 0.035, S * 0.07, 0); g.fill();
    return cv;
  }
  function floret(S, c) {                                        // cẩm tú cầu: hoa nhỏ 4 cánh
    var cv = U.createCanvas(S, S), g = cv.getContext('2d'), i;
    g.translate(S / 2, S / 2);
    for (i = 0; i < 4; i++) { g.save(); g.rotate(i * PI / 2 + 0.3); g.fillStyle = c; ell(g, 0, -S * 0.24, S * 0.2, S * 0.26, 0); g.fill(); g.restore(); }
    g.fillStyle = '#F6E7B0'; g.beginPath(); g.arc(0, 0, S * 0.07, 0, TAU); g.fill();
    return cv;
  }
  function rose(g, x, y, r, c0, c1) {                            // hoa hồng: các vòng cánh xoắn đồng tâm
    var i;
    for (i = 0; i < 5; i++) {
      var rr = r * (1 - i * 0.17), gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, i % 2 ? c1 : c0); gr.addColorStop(1, i % 2 ? c0 : c1);
      g.fillStyle = gr; ell(g, x + (i % 2 ? 1 : -1) * r * 0.06, y, rr, rr * (0.9 - i * 0.03), i * 0.7); g.fill();
      g.strokeStyle = 'rgba(120,30,60,0.25)'; g.lineWidth = 0.8; g.stroke();
    }
  }
  function bushSprite(kind, w, h, rngSeed) {
    var cv = U.createCanvas(w, h), g = cv.getContext('2d'), r = U.makeRng(rngSeed), i, k;
    for (i = 0; i < 80; i++) {                                   // tán lá dạng vòm
      var a = r.range(PI, TAU), d = Math.sqrt(r.next()), x = w / 2 + Math.cos(a) * w * 0.46 * d, y = h * 0.94 + Math.sin(a) * h * 0.78 * d;
      var lg = g.createLinearGradient(x, y - 14, x, y + 14); lg.addColorStop(0, '#6FAE62'); lg.addColorStop(1, '#2F6A45');
      g.fillStyle = lg; ell(g, x, y, w * 0.07, w * 0.036, r.range(-1.2, 1.2)); g.fill();
    }
    if (kind === 'rose') {
      for (i = 0; i < 10; i++) {
        var a2 = r.range(PI * 1.1, PI * 1.9), d2 = Math.sqrt(r.next()) * 0.85;
        rose(g, w / 2 + Math.cos(a2) * w * 0.4 * d2, h * 0.9 + Math.sin(a2) * h * 0.7 * d2, r.range(w * 0.036, w * 0.056), r.chance(0.5) ? '#F48FB1' : '#E8788E', '#FFC1D6');
      }
    } else {
      var fl = [floret(14, '#8E8CD8'), floret(14, '#B596E0'), floret(14, '#F2A6C8'), floret(14, '#9C9AE0')];
      for (k = 0; k < 7; k++) {
        var a3 = r.range(PI * 1.08, PI * 1.92), d3 = Math.sqrt(r.next()) * 0.8, cx = w / 2 + Math.cos(a3) * w * 0.38 * d3, cy = h * 0.88 + Math.sin(a3) * h * 0.66 * d3, rr = w * 0.07;
        for (i = 0; i < 46; i++) {
          var aa = r.range(0, TAU), dd = Math.sqrt(r.next()) * rr;
          g.drawImage(fl[(k + i) % 4], cx + Math.cos(aa) * dd - 7, cy + Math.sin(aa) * dd * 0.9 - 7);
        }
      }
    }
    bakeRim(g, w, h);
    return cv;
  }
  function buildSprites() {
    spr.daisy = daisySprite(96); spr.bloom = dandBloom(64); spr.puff = puffSprite(96); spr.seed = seedSprite(32);
    spr.rose = bushSprite('rose', 384, 288, 31); spr.rose2 = bushSprite('rose', 384, 288, 57);
    spr.hyd = bushSprite('hyd', 384, 288, 73); spr.hyd2 = bushSprite('hyd', 384, 288, 91);
  }

  /* ------------------------------------------------------- Bố cục: cỏ & hoa */
  var ROWS = [
    { y0: 0.725 * H, y1: 0.775 * H, hMin: 14, hMax: 26, delay: 0, share: 0.55, haze: 0.4 },
    { y0: 0.775 * H, y1: 0.835 * H, hMin: 20, hMax: 36, delay: 0.12, share: 0.45, haze: 0.22 }
  ];
  var DYN = { n: 0, x: null, y: null, h: null, w: null, lean: null, c: null, ph: null, dl: null, keep: null, cell: null };
  var CELL = 48, NCX = Math.ceil(GWID / CELL), NCY = 3, cells = [], heads = [], bushes = [], fore = [], seeds = null;
  var mottle = null, gobo = null, shadow = null, soil = null;
  var BUF = [], BN = new Int32Array(12), RIM = null, RN = 0;   // bộ đệm toạ độ ngọn cỏ theo nhóm màu (dựng một lần)

  function genRows() {
    var r = U.makeRng(GC.seed), ri, i;
    for (ri = 0; ri < ROWS.length; ri++) {
      var R = ROWS[ri], n = Math.round(Q.grassStatic * R.share), b = [];
      for (i = 0; i < n; i++) {
        var x = r.range(GX0, GX0 + GWID), y = r.range(R.y0, R.y1);
        if (inPond(x, y)) continue;
        b.push({ x: x, y: y, h: r.range(R.hMin, R.hMax), w: r.range(1.6, 2.8), lean: r.range(-0.22, 0.22), curve: r.range(-1, 1), c: r.int(0, 5) });
      }
      R.blades = b;
    }
  }
  function genDynamic() {
    var r = U.makeRng(GC.seed + 5), n = Q.grass, i, cx;
    DYN.n = 0;
    DYN.x = new Float32Array(n); DYN.y = new Float32Array(n); DYN.h = new Float32Array(n); DYN.w = new Float32Array(n); DYN.lean = new Float32Array(n);
    DYN.c = new Uint8Array(n); DYN.ph = new Float32Array(n); DYN.dl = new Float32Array(n); DYN.keep = new Float32Array(n); DYN.cell = new Uint16Array(n);
    var tmp = [];
    for (i = 0; i < n * 1.4 && tmp.length < n; i++) {
      var x = r.range(GX0, GX0 + GWID), y = r.range(0.80 * H, 0.935 * H);
      if (inPond(x, y)) continue;
      tmp.push({ x: x, y: y });
    }
    tmp.sort(function (a, b) { return a.y - b.y; });               // vẽ từ xa tới gần
    for (i = 0; i < tmp.length; i++) {
      var t = tmp[i], k = DYN.n++, dist = clamp(Math.hypot(t.x - BX, (t.y - BY) * 2) / 1200, 0, 1);
      DYN.x[k] = t.x; DYN.y[k] = t.y; DYN.h[k] = r.range(30, 62) * (inStick(t.x, t.y) ? 0.35 : 1); DYN.w[k] = r.range(2, 3.4);
      DYN.lean[k] = r.range(-0.2, 0.2); DYN.c[k] = r.int(0, 5); DYN.ph[k] = r.range(0, TAU);
      DYN.dl[k] = clamp(0.5 * dist + 0.4 * r.next(), 0, 0.72); DYN.keep[k] = r.next();
      cx = clamp(Math.floor((t.x - GX0) / CELL), 0, NCX - 1);
      DYN.cell[k] = cx * NCY + clamp(Math.floor((t.y - 0.80 * H) / (0.045 * H)), 0, NCY - 1);
    }
    cells.length = 0;
    for (i = 0; i < NCX * NCY; i++) cells.push({ x: 0, v: 0 });
    for (i = 0; i < 12; i++) BUF[i] = new Float32Array(DYN.n * 10 + 10);
    RIM = new Float32Array(DYN.n * 6 + 6);
  }
  function genFlowers() {
    var r = U.makeRng(GC.seed + 9), i, x, y, tries;
    heads.length = 0;
    function place(kind, n, dlMin) {
      for (i = 0; i < n; i++) {
        tries = 0;
        do { x = r.range(20, W - 20); y = r.range(0.815 * H, 0.965 * H); tries++; } while ((inPond(x, y) || inStick(x, y) || Math.abs(x - BX) < 40) && tries < 20);
        if (tries >= 20) continue;
        heads.push({ kind: kind, x: x, y: y, h: kind === 'daisy' ? r.range(22, 46) : r.range(30, 56), lean: r.range(-0.1, 0.1), ph: r.range(0, TAU),
          dl: r.range(dlMin, dlMin + 0.3), s: kind === 'daisy' ? r.range(9, 14) : r.range(9, 13), rot: r.range(0, TAU), puff: kind === 'dand' && i < Math.ceil(n * 0.6), acc: r.next() });
      }
    }
    place('daisy', GC.daisies, 0.55); place('dand', GC.dandelions, 0.5);
    heads.sort(function (a, b) { return a.y - b.y; });
    bushes.length = 0;
    var spec = [['rose', 0.045, 'rose'], ['hyd', 0.115, 'hyd'], ['rose', 0.205, 'rose2'], ['hyd', 0.255, 'hyd2']], nr = 0, nh = 0;
    for (i = 0; i < spec.length; i++) {
      if (spec[i][0] === 'rose') { if (nr++ >= GC.roseBushes) continue; } else if (nh++ >= GC.hydrangeas) continue;
      bushes.push({ kind: spec[i][0], x: spec[i][1] * W, y: 0.835 * H, w: 150, h: 112, spr: spec[i][2], dl: 0.45 + i * 0.08, ph: i * 1.7 });
    }
    seeds = new U.Pool(function () { return { x: 0, y: 0, vx: 0, vy: 0, ang: 0, spin: 0, age: 0, life: 14, size: 12, ph: 0 }; }, 60);
  }
  function genFore() {
    var r = U.makeRng(GC.seed + 21), i, n = Math.round(60 * frac);
    fore.length = 0;
    for (i = 0; i < n; i++) fore.push({ x: r.range(-200, W + 250), y: r.range(1.03 * H, 1.1 * H), h: r.range(140, 260), w: r.range(5, 9), lean: r.range(-0.18, 0.18), c: r.int(0, 5), ph: r.range(0, TAU) });
  }

  /* ------------------------------------------------- Cache: cỏ tĩnh, đốm, đất */
  function bladeTo(g, x, y, h, w, lean, curve) {
    var tx = x + lean * h, ty = y - h, cx = x + lean * h * 0.3 + curve * h * 0.15, cy = y - h * 0.62;
    g.moveTo(x - w / 2, y); g.quadraticCurveTo(cx - w * 0.3, cy, tx, ty); g.quadraticCurveTo(cx + w * 0.3, cy, x + w / 2, y);
  }
  function buildRow(ri) {
    var R = ROWS[ri], sc = Math.min(cam.maxPx(1), 3), tw = Math.floor(4096 / sc), nt = Math.ceil(GWID / tw), v, k, i, c;
    var y0 = R.y0 - R.hMax - 8, ch = R.y1 - y0 + 8;
    R.sc = sc; R.cy0 = y0; R.ch = ch; R.tw = tw; R.tiles = [[], []];
    for (v = 0; v < 2; v++) {
      for (k = 0; k < nt; k++) {
        var x0 = GX0 + k * tw, cv = U.createCanvas(Math.min(tw, GX0 + GWID - x0) * sc, ch * sc), g = cv.getContext('2d');
        g.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
        for (c = 0; c < 6; c++) {
          g.beginPath();
          for (i = 0; i < R.blades.length; i++) {
            var b = R.blades[i];
            if (b.c !== c || b.x < x0 - 12 || b.x > x0 + tw + 12) continue;
            bladeTo(g, b.x, b.y, b.h, b.w, b.lean, b.curve);
          }
          g.fillStyle = css(rampCol(c, v, R.haze, v ? '#C9A7C8' : '#C7DDE8')); g.fill();
        }
        R.tiles[v].push({ cv: cv, x: x0, w: Math.min(tw, GX0 + GWID - x0) });
      }
    }
  }
  function buildMottle() {                                       // đốm sáng/tối theo noise (độ phân giải thấp, phóng to mượt)
    var w = 512, h = 128, cv = U.createCanvas(w, h), g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data, x, y, i = 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++, i += 4) {
      var n = U.fbm2(x * 0.018, y * 0.03, 3, 2, 0.5), lit = n > 0;
      d[i] = lit ? 255 : 70; d[i + 1] = lit ? 236 : 48; d[i + 2] = lit ? 170 : 110; d[i + 3] = Math.min(255, Math.abs(n) * 150);
    }
    g.putImageData(im, 0, 0);
    mottle = cv;
  }
  function buildGobo() {                                         // gobo: tán lá che phần lớn nắng, chỉ chừa các khe sáng nhỏ
    var w = 512, h = 160, cv = U.createCanvas(w, h), g = cv.getContext('2d'), r = U.makeRng(444), i;
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    for (i = 0; i < 170; i++) {
      var x = r.range(-10, w + 10), y = r.range(-10, h + 10), rad = r.range(14, 30), gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    gobo = cv;
  }
  function buildSoil() {                                         // mảng đất trống quanh gốc (nơi hạt nảy mầm)
    var w = 120, h = 40, cv = U.createCanvas(w, h), g = cv.getContext('2d'), r = U.makeRng(8), i;
    var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(92,64,52,0.95)'); gr.addColorStop(0.65, 'rgba(110,80,60,0.7)'); gr.addColorStop(1, 'rgba(110,80,60,0)');
    g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w); g.translate(-w / 2, -h / 2); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore();
    for (i = 0; i < 14; i++) { g.fillStyle = 'rgba(170,140,120,0.5)'; ell(g, r.range(25, 95), r.range(12, 28), r.range(1.2, 2.6), r.range(0.8, 1.6), 0); g.fill(); }
    soil = cv;
  }
  function buildShadow() {
    shadow = { sc: 0.35, x0: -100, y0: 0.74 * H, w: W + 400, h: 0.4 * H };
    shadow.cv = U.createCanvas(shadow.w * shadow.sc, shadow.h * shadow.sc); shadow.ctx = shadow.cv.getContext('2d');
  }

  Ground.tasks = function () {
    return {
      sprites: [buildSprites],
      caches: [function () { genRows(); genDynamic(); genFlowers(); genFore(); }, function () { buildRow(0); }, function () { buildRow(1); }, buildMottle, buildGobo, buildSoil, buildShadow]
    };
  };

  /* -------------------------------------------------------------- Cập nhật */
  function shadeAt(x, K) { return sstep(BX - 30, BX + 260, x) * (1 - sstep(BX + 520 * K, BX + 900 * K + 400, x)); }
  Ground.update = function (dt) {
    var t = TL.t, env = TL.env, Wd = App.wind, sky = App.sky, i, c, s = env.windStrength, dusk = env.dusk;
    if (Wd) {                                                    // lưới gió trên cỏ: mỗi ô một lò xo giảm chấn
      for (i = 0; i < cells.length; i++) {
        var cx = GX0 + (Math.floor(i / NCY) + 0.5) * CELL, cy = 0.80 * H + ((i % NCY) + 0.5) * 0.045 * H;
        Wd.sample(cx, cy, t, wv);
        U.springStep(cells[i], clamp(wv[0] / 100, -1.5, 1.5), 26, 5, dt);
      }
    }
    for (c = 0; c < 6; c++) {
      var base = mix(RAMP_DAY[c], RAMP_DUSK[c], dusk);
      cols.dyn[c] = css(base); cols.dynS[c] = css(mix(base, '#4A3A6A', 0.4)); cols.fore[c] = css(mix(RAMP_DAY[c], '#2E2A4E', 0.35 + 0.35 * dusk));
    }
    var hz = sky ? sky.colors.horizon : [232, 246, 255];
    cols.mTop = css(mix(mix('#9CCB8A', '#C9A864', dusk), hz, 0.32)); cols.mMid = css(mix('#7FB872', '#8F8F52', dusk)); cols.mBot = css(mix('#5E9E62', '#4E4A78', dusk * 0.85));
    if (seeds) {                                                 // hạt bồ công anh: nhẹ, bay theo gió, hơi bổng lên
      var n, hd;
      for (i = 0; i < heads.length; i++) {
        hd = heads[i];
        if (!hd.puff || t < 22 || env.grassGrow < hd.dl + 0.25) continue;
        hd.acc += 0.35 * (0.4 + s) * dt;
        if (hd.acc >= 1) {
          hd.acc -= 1;
          var p = seeds.spawn();
          if (p) {
            p.x = hd.x + hd.lean * hd.h; p.y = hd.y - hd.h; p.vx = 10; p.vy = -6; p.ang = hd.rot; p.spin = (hd.ph - 3) * 0.3; p.age = 0;
            p.life = 11 + (hd.ph % 1) * 6; p.size = 11 + (hd.ph % 1) * 6; p.ph = hd.ph;
          }
        }
      }
      for (i = 0; i < seeds.size; i++) {
        var q = seeds.items[i];
        if (!q.alive) continue;
        q.age += dt;
        if (Wd) Wd.sample(q.x, q.y, t, wv); else { wv[0] = 20; wv[1] = 0; }
        var k = Math.min(1, 1.2 * dt);
        q.vx += (wv[0] * 0.95 + 12 * Math.sin(1.7 * t + q.ph) - q.vx) * k; q.vy += (wv[1] - 14 + 8 * Math.sin(2.3 * t + q.ph * 2) - q.vy) * k;
        q.x += q.vx * dt; q.y += q.vy * dt; q.ang += q.spin * dt;
        if (q.age > q.life || q.x > W + 300 || q.x < -300 || q.y < -100) seeds.kill(q);
      }
    }
  };

  /* ------------------------------------------------------------------ Vẽ lớp 5 */
  function drawShadow(ctx, sun, env) {
    var S = shadow, g = S.ctx, sc = S.sc, K = Math.min(sun.shadowK, 2.6), Sy = 0.2, T = App.tree, i, b;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, S.cv.width, S.cv.height);
    function setBase(y0) { g.setTransform(sc, 0, -sc * K, -sc * Sy, sc * (K * y0 - S.x0), sc * ((1 + Sy) * y0 - S.y0)); }
    g.fillStyle = '#3A2150'; g.strokeStyle = '#3A2150';
    if (T && T.sil && T.sil.cv) {                                // cây: chia dải theo độ cao → xa hơn thì nhạt hơn
      var sl = T.sil, bands = 8, bh = sl.cv.height / bands;
      setBase(BY);
      for (i = 0; i < bands; i++) {
        var yc = sl.y + sl.h * (i + 0.5) / bands;
        g.globalAlpha = lerp(1, 0.25, clamp((BY - yc) / 700, 0, 1));
        g.drawImage(sl.cv, 0, i * bh, sl.cv.width, bh + 1, sl.x, sl.y + sl.h * i / bands, sl.w, sl.h / bands + 0.5);
      }
      g.globalAlpha = 1;
    }
    for (i = 0; i < bushes.length; i++) {                        // bụi hoa: elip đặc
      b = bushes[i]; var gr = ease.outBack(clamp((env.grassGrow - b.dl) / 0.3, 0, 1));
      if (gr <= 0) continue;
      setBase(b.y); g.beginPath(); g.ellipse(b.x, b.y - b.h * 0.4 * gr, b.w * 0.45 * gr, b.h * 0.42 * gr, 0, 0, TAU); g.fill();
    }
    for (i = 0; i < heads.length; i++) {                         // hoa dại: thân mảnh + đầu
      var hd = heads[i], hg = ease.outBack(clamp((env.grassGrow - hd.dl) / 0.2, 0, 1));
      if (hg <= 0) continue;
      setBase(hd.y); g.lineWidth = 1.6; g.beginPath(); g.moveTo(hd.x, hd.y); g.lineTo(hd.x + hd.lean * hd.h * hg, hd.y - hd.h * hg); g.stroke();
      g.beginPath(); g.arc(hd.x + hd.lean * hd.h * hg, hd.y - hd.h * hg, hd.s * 0.6 * hg, 0, TAU); g.fill();
    }
    for (i = 0; i < casters.length; i++) { g.save(); casters[i](g, setBase); g.restore(); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // ghép 3 lượt lệch nhau với alpha thấp → bóng mềm; dài hơn thì nhoè rộng hơn
    var A = lerp(0.3, 0.5, env.dusk) * env.fade, d = (3 + 4 * K) * 0.5;
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = A / 2; ctx.drawImage(S.cv, S.x0 - d, S.y0, S.w, S.h);
    ctx.drawImage(S.cv, S.x0 + d, S.y0, S.w, S.h);
    ctx.globalAlpha = A * 0.55; ctx.drawImage(S.cv, S.x0, S.y0 + d * 0.4, S.w, S.h);
    ctx.globalAlpha = 1;
  }

  Ground.drawBack = function (ctx) {
    var t = TL.t, env = TL.env, sun = App.sky && App.sky.sun, v, i, R, g, gr, dusk = env.dusk;
    cam.apply(ctx, 1);
    v = cam.viewRect(1, view);
    var x0 = v.x0 - 60, xw = v.x1 - v.x0 + 120, y1 = Math.max(v.y1, H + 200);
    g = ctx.createLinearGradient(0, HZ, 0, H);                   // đồng cỏ: xanh lục → ô liu (nắng), tím sâu ở gần
    g.addColorStop(0, cols.mTop); g.addColorStop(0.35, cols.mMid); g.addColorStop(1, cols.mBot);
    ctx.fillStyle = g; ctx.fillRect(x0, HZ - 2, xw, y1 - HZ + 2);
    ctx.globalAlpha = 0.5; ctx.drawImage(mottle, GX0, HZ, GWID, y1 - HZ); ctx.globalAlpha = 1;
    if (sun) {                                                   // vùng nắng ấm (phía mặt trời) và phản chiếu màu trời
      gr = ctx.createLinearGradient(GX0, 0, GX0 + GWID * 0.8, 0);
      gr.addColorStop(0, css(sun.rim, 0.12 + 0.2 * dusk)); gr.addColorStop(1, css(sun.rim, 0));
      ctx.fillStyle = gr; ctx.fillRect(x0, HZ, xw, y1 - HZ);
    }
    var sa = 1 - sstep(10, 22, t);                               // mảng đất trống quanh gốc (cho giai đoạn hạt giống)
    if (sa > 0.01) { ctx.globalAlpha = sa; ctx.drawImage(soil, BX - 60, BY - 14, 120, 40); ctx.globalAlpha = 1; }
    for (i = 0; i < ROWS.length; i++) {                          // hàng cỏ sau: cache tĩnh (2 phiên bản ngày/hoàng hôn), lớn lên theo timeline
      R = ROWS[i];
      if (!R.tiles || R.sc < cam.maxPx(1) * 0.7 && R.sc < 3) buildRow(i);
      var gs = ease.outBack(clamp((env.grassGrow - R.delay) / 0.4, 0, 1));
      if (gs <= 0.001) continue;
      ctx.save(); ctx.translate(0, R.y1); ctx.scale(1, gs); ctx.translate(0, -R.y1);
      ctx.imageSmoothingEnabled = true;
      for (var vi = 0; vi < 2; vi++) {
        ctx.globalAlpha = vi === 0 ? 1 : dusk;
        if (vi === 1 && dusk < 0.01) break;
        for (var k = 0; k < R.tiles[vi].length; k++) { var tl = R.tiles[vi][k]; ctx.drawImage(tl.cv, tl.x, R.cy0, tl.w, R.ch); }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (sun && shadow) drawShadow(ctx, sun, env);
    if (sun && gobo) {                                           // đốm nắng lọt kẽ lá: vùng dưới tán, trôi nhẹ theo gió
      var K = Math.min(sun.shadowK, 2.6), span = clamp(300 + 420 * K, 500, 1200), da = 0.2 * (0.3 + 0.7 * dusk) * env.fade;
      var ox = 14 * Math.sin(t * 0.31) + 8 * Math.sin(t * 0.77 + 1.3), oy = 4 * Math.sin(t * 0.43);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = da; ctx.drawImage(gobo, BX - 80 + ox, 0.80 * H + oy, span + 80, 0.19 * H);
      ctx.globalAlpha = da * 0.6; ctx.drawImage(gobo, BX - 40 - ox * 0.7, 0.83 * H - oy, span + 40, 0.15 * H);
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  /* ------------------------------------------------------------------ Vẽ lớp 10 */
  function drawBushes(ctx, t, env) {
    var Wd = App.wind, i, b, gr, k;
    for (i = 0; i < bushes.length; i++) {
      b = bushes[i]; gr = ease.outBack(clamp((env.grassGrow - b.dl) / 0.3, 0, 1));
      if (gr <= 0.01) continue;
      k = (Wd && cells.length ? clamp(cells[clamp(Math.floor((b.x - GX0) / CELL), 0, NCX - 1) * NCY].x, -1.5, 1.5) : 0) * 0.06 + 0.012 * Math.sin(t * 1.4 + b.ph) * (0.4 + env.windStrength);
      ctx.save(); ctx.translate(b.x, b.y); ctx.transform(1, 0, -k, 1, 0, 0);
      ctx.drawImage(spr[b.spr], -b.w / 2 * gr, -b.h * gr, b.w * gr, b.h * gr);
      ctx.restore();
    }
  }
  function drawGrass(ctx, t, env, sun) {
    var n = DYN.n, i, S = env.windStrength, G = env.grassGrow, K = sun ? Math.min(sun.shadowK, 2.6) : 1, bi, a, m;
    for (bi = 0; bi < 12; bi++) BN[bi] = 0;
    RN = 0;
    for (i = 0; i < n; i++) {
      if (DYN.keep[i] > frac) continue;
      var gr = ease.outCubic(clamp((G - DYN.dl[i]) / 0.28, 0, 1));
      if (gr <= 0.001) continue;
      var x = DYN.x[i], y = DYN.y[i], h = DYN.h[i] * gr, w = DYN.w[i], cell = cells[DYN.cell[i]];
      var bend = (cell ? cell.x : 0) * 0.5 + Math.sin(2.1 * t + DYN.ph[i]) * 0.07 * (0.4 + S), ln = DYN.lean[i] + bend * 0.55;
      var tx = x + ln * h, ty = y - h * (1 - 0.15 * Math.abs(ln)), cx = x + ln * h * 0.3, cy = y - h * 0.62;
      var sh = shadeAt(x, K) > 0.5 ? 1 : 0;
      bi = DYN.c[i] * 2 + sh; a = BUF[bi]; m = BN[bi];
      a[m] = x - w / 2; a[m + 1] = y; a[m + 2] = cx - w * 0.3; a[m + 3] = cy; a[m + 4] = tx; a[m + 5] = ty;
      a[m + 6] = cx + w * 0.3; a[m + 7] = cy; a[m + 8] = x + w / 2; a[m + 9] = y; BN[bi] = m + 10;
      if (!sh && sun) { RIM[RN] = x - w / 2; RIM[RN + 1] = y; RIM[RN + 2] = cx - w * 0.3; RIM[RN + 3] = cy; RIM[RN + 4] = tx; RIM[RN + 5] = ty; RN += 6; }
    }
    for (bi = 0; bi < 12; bi++) {
      if (!BN[bi]) continue;
      a = BUF[bi]; ctx.beginPath();
      for (i = 0; i < BN[bi]; i += 10) { ctx.moveTo(a[i], a[i + 1]); ctx.quadraticCurveTo(a[i + 2], a[i + 3], a[i + 4], a[i + 5]); ctx.quadraticCurveTo(a[i + 6], a[i + 7], a[i + 8], a[i + 9]); }
      ctx.fillStyle = (bi & 1) ? cols.dynS[bi >> 1] : cols.dyn[bi >> 1]; ctx.fill();
    }
    if (sun && RN) {                                             // viền sáng ấm ở mép trái ngọn cỏ (phía mặt trời)
      ctx.beginPath();
      for (i = 0; i < RN; i += 6) { ctx.moveTo(RIM[i], RIM[i + 1]); ctx.quadraticCurveTo(RIM[i + 2], RIM[i + 3], RIM[i + 4], RIM[i + 5]); }
      ctx.strokeStyle = css(sun.rim, 0.5 * sun.rimAlpha); ctx.lineWidth = 0.9; ctx.stroke();
    }
  }
  function drawHeads(ctx, t, env) {
    var i, h, gr, hx, hy, bend, cell, Wd = App.wind, G = env.grassGrow, S = env.windStrength;
    ctx.beginPath();
    for (i = 0; i < heads.length; i++) {                         // thân hoa: gom một lần stroke
      h = heads[i]; gr = ease.outBack(clamp((G - h.dl) / 0.2, 0, 1));
      if (gr <= 0.01) continue;
      cell = cells[clamp(Math.floor((h.x - GX0) / CELL), 0, NCX - 1) * NCY + 1];
      bend = (cell ? cell.x : 0) * 0.5 + Math.sin(1.7 * t + h.ph) * 0.06 * (0.4 + S);
      hx = h.x + (h.lean + bend * 0.5) * h.h * gr; hy = h.y - h.h * gr;
      h._x = hx; h._y = hy; h._b = bend; h._g = gr;
      ctx.moveTo(h.x, h.y); ctx.quadraticCurveTo(h.x + (h.lean + bend * 0.2) * h.h * gr * 0.4, h.y - h.h * gr * 0.6, hx, hy);
    }
    ctx.strokeStyle = cols.dyn[4]; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.stroke();
    for (i = 0; i < heads.length; i++) {
      h = heads[i]; gr = h._g;
      if (!gr || gr <= 0.01) continue;
      var img = h.kind === 'daisy' ? spr.daisy : (h.puff ? spr.puff : spr.bloom), s = h.s * 2 * gr * (h.puff ? 1.15 : 1);
      ctx.save(); ctx.translate(h._x, h._y); ctx.rotate(h.rot * 0.15 + h._b * 0.8);
      ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
    }
  }
  function drawSeeds(ctx) {
    if (!seeds) return;
    for (var i = 0; i < seeds.size; i++) {
      var q = seeds.items[i];
      if (!q.alive) continue;
      var a = Math.min(1, q.age / 0.6) * (1 - sstep(q.life - 2.5, q.life, q.age)), s = q.size;
      ctx.globalAlpha = a * 0.9; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.sin(q.ang) * 0.5);
      ctx.drawImage(spr.seed, -s / 2, -s * 0.42, s, s); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  Ground.drawFront = function (ctx) {
    var t = TL.t, env = TL.env, sun = App.sky && App.sky.sun;
    cam.apply(ctx, 1);
    drawBushes(ctx, t, env);
    drawGrass(ctx, t, env, sun);
    drawHeads(ctx, t, env);
    drawSeeds(ctx);
  };

  Ground.drawNear = function (ctx) {                             // cỏ cận cảnh par 1.4: nhoè dần khi rack focus
    var t = TL.t, env = TL.env, i, f, sun = App.sky && App.sky.sun, S = env.windStrength, rack = cam.rack, G = env.grassGrow, p;
    cam.apply(ctx, 1.4);
    var gr = ease.outCubic(clamp((G - 0.35) / 0.4, 0, 1));
    if (gr <= 0.01) return;
    var passes = rack > 0.05 ? 3 : 1, dx = rack * 4;
    for (p = 0; p < passes; p++) {
      ctx.save();
      ctx.globalAlpha = passes === 1 ? 0.92 : (p === 1 ? 0.5 : 0.3) * 0.92;
      ctx.translate(p === 0 ? 0 : (p === 1 ? -dx : dx), 0);
      for (i = 0; i < fore.length; i++) {
        f = fore[i];
        var sway = Math.sin(1.6 * t + f.ph) * 0.08 * (0.4 + S) + (App.wind ? clamp(App.wind.gust, 0, 1) * 0.08 : 0), ln = f.lean + sway, h = f.h * gr;
        ctx.beginPath(); bladeTo(ctx, f.x, f.y, h, f.w, ln, 0.4);
        ctx.fillStyle = cols.fore[f.c % 6] || '#3E5A4E'; ctx.fill();
        if (p === 0 && sun) { ctx.strokeStyle = css(sun.rim, 0.4 * sun.rimAlpha); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(f.x - f.w / 2, f.y); ctx.quadraticCurveTo(f.x + ln * h * 0.3 - f.w * 0.3, f.y - h * 0.62, f.x + ln * h, f.y - h); ctx.stroke(); }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------------------------------------------------- Điều khiển */
  Ground.addCaster = function (fn) { casters.push(fn); };
  Ground.setQuality = function (q) { frac = clamp(q.grass / Q.grass, 0.1, 1); };
  Ground.resize = function () { for (var i = 0; i < ROWS.length; i++) ROWS[i].tiles = null; };
  Ground.reset = function () {
    for (var i = 0; i < cells.length; i++) { cells[i].x = 0; cells[i].v = 0; }
    if (seeds) seeds.clear();
    for (i = 0; i < heads.length; i++) { heads[i].acc = (heads[i].ph % 1); heads[i]._g = 0; }
  };
  TL.on('reset', Ground.reset);
  TL.on('seek', Ground.reset);
})();
