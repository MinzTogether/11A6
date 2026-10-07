/* ============================================================================
 * js/utils.js – Tiện ích dùng chung (không phụ thuộc file nào khác)
 *  - Toán học: clamp, lerp, remap, smoothstep, damp, lò xo giảm chấn, Bézier
 *  - Easing: easeInOutCubic, easeOutBack, easeOutExpo, ... (không có tuyến tính)
 *  - Màu: parse hex, nội suy màu, keyframe màu/số theo thời gian, HSL
 *  - Số ngẫu nhiên CÓ SEED: mulberry32 + bộ tiện ích; seed cây dựng sẵn
 *  - Noise: simplex 2D/3D, value noise 2D/3D, fbm, curl noise 2D/3D
 *  - Pool đối tượng, canvas offscreen, debounce
 * Namespace toàn cục: window.App.utils  (script cổ điển, chạy được qua file://)
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils = {};
  var PI = Math.PI, TAU = PI * 2;
  U.PI = PI; U.TAU = TAU; U.DEG = PI / 180;

  /* ---------------------------------------------------------------- Toán học */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return a === b ? 0 : (v - a) / (b - a); }
  /** Đổi v từ khoảng [a,b] sang [c,d]; mặc định kẹp trong khoảng đích (noClamp=true để không kẹp). */
  function remap(v, a, b, c, d, noClamp) {
    var t = invLerp(a, b, v);
    if (!noClamp) t = clamp(t, 0, 1);
    return c + (d - c) * t;
  }
  function smoothstep(e0, e1, x) {
    if (e0 === e1) return x < e0 ? 0 : 1;
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function smootherstep(e0, e1, x) {
    if (e0 === e1) return x < e0 ? 0 : 1;
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function mod(a, n) { return ((a % n) + n) % n; }
  function fract(x) { return x - Math.floor(x); }
  /** Làm mượt độc lập tốc độ khung hình: lambda lớn = bám nhanh. */
  function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }
  /** Nội suy góc theo đường ngắn nhất. */
  function lerpAngle(a, b, t) { return a + (mod(b - a + PI, TAU) - PI) * t; }
  /**
   * Lò xo giảm chấn (semi-implicit Euler, tự chia bước nhỏ cho ổn định).
   * s = {x, v} được sửa trực tiếp (không cấp phát); k = độ cứng, c = hệ số giảm chấn.
   */
  function springStep(s, target, k, c, dt) {
    var steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
    for (var i = 0; i < steps; i++) {
      s.v += (k * (target - s.x) - c * s.v) * h;
      s.x += s.v * h;
    }
    return s.x;
  }
  function qbez(a, b, c, t) { var u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }
  function cbez(a, b, c, d, t) {
    var u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }
  U.clamp = clamp; U.lerp = lerp; U.invLerp = invLerp; U.remap = remap;
  U.smoothstep = smoothstep; U.smootherstep = smootherstep; U.mod = mod; U.fract = fract;
  U.damp = damp; U.lerpAngle = lerpAngle; U.springStep = springStep; U.qbez = qbez; U.cbez = cbez;

  /* ------------------------------------------------------------------ Easing
   * Mọi hàm nhận t (tự kẹp về 0..1) và trả giá trị đã làm mượt. */
  var ease = U.ease = {
    inQuad: function (t) { t = clamp(t, 0, 1); return t * t; },
    outQuad: function (t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); },
    inOutQuad: function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    inCubic: function (t) { t = clamp(t, 0, 1); return t * t * t; },
    outCubic: function (t) { t = clamp(t, 0, 1); var u = 1 - t; return 1 - u * u * u; },
    inOutCubic: function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outQuart: function (t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 4); },
    inOutQuart: function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },
    outSine: function (t) { t = clamp(t, 0, 1); return Math.sin(t * PI / 2); },
    inOutSine: function (t) { t = clamp(t, 0, 1); return -(Math.cos(PI * t) - 1) / 2; },
    outExpo: function (t) { t = clamp(t, 0, 1); return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutExpo: function (t) {
      t = clamp(t, 0, 1);
      if (t <= 0) return 0; if (t >= 1) return 1;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    /** s = độ vọt lố (mặc định 1.70158). */
    outBack: function (t, s) {
      t = clamp(t, 0, 1); var c1 = s === undefined ? 1.70158 : s, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    inOutBack: function (t) {
      t = clamp(t, 0, 1); var c1 = 1.70158, c2 = c1 * 1.525;
      return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
                     : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },
    outElastic: function (t) {
      t = clamp(t, 0, 1); if (t <= 0) return 0; if (t >= 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
    }
  };
  U.easeInOutCubic = ease.inOutCubic; U.easeOutCubic = ease.outCubic; U.easeOutBack = ease.outBack;
  U.easeOutExpo = ease.outExpo; U.easeInOutSine = ease.inOutSine;
  function smooth01(u) { return u * u * (3 - 2 * u); }

  /* --------------------------------------------------------------------- Màu */
  var colorCache = {};
  /** '#RGB' | '#RRGGBB' | [r,g,b] → [r,g,b] (có cache; KHÔNG sửa mảng trả về). */
  function parseColor(c) {
    if (typeof c !== 'string') return c;
    var v = colorCache[c];
    if (v) return v;
    var h = c.charAt(0) === '#' ? c.slice(1) : c;
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h.slice(0, 6), 16);
    v = colorCache[c] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return v;
  }
  function ch(v) { return (clamp(v, 0, 255) + 0.5) | 0; }
  /** Nội suy tuyến tính hai màu (hex hoặc mảng) → mảng [r,g,b]; truyền out để khỏi cấp phát. */
  function mix(a, b, t, out) {
    a = parseColor(a); b = parseColor(b); out = out || [0, 0, 0];
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  }
  /** Mảng/hex → chuỗi CSS rgba(); alpha mặc định 1. */
  function css(c, alpha) {
    c = parseColor(c);
    var a = alpha === undefined ? 1 : clamp(alpha, 0, 1);
    return 'rgba(' + ch(c[0]) + ',' + ch(c[1]) + ',' + ch(c[2]) + ',' + (Math.round(a * 1000) / 1000) + ')';
  }
  function rgba(r, g, b, a) {
    return 'rgba(' + ch(r) + ',' + ch(g) + ',' + ch(b) + ',' + (Math.round(clamp(a === undefined ? 1 : a, 0, 1) * 1000) / 1000) + ')';
  }
  function toHex(c) {
    c = parseColor(c);
    return '#' + ((1 << 24) | (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2])).toString(16).slice(1);
  }
  /** Cộng/nhân sáng: amount > 0 pha trắng, < 0 pha tím đêm (không dùng đen thuần). */
  function shade(c, amount, out) {
    return amount >= 0 ? mix(c, '#FFF8F0', amount, out) : mix(c, '#1D1B4A', -amount, out);
  }
  function rgbToHsl(c, out) {
    c = parseColor(c); out = out || [0, 0, 0];
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 1e-6) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    out[0] = h; out[1] = s; out[2] = l;
    return out;
  }
  function hue2rgb(p, q, t) {
    t = mod(t, 1);
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  /** h,s,l trong 0..1 → [r,g,b] 0..255. */
  function hslToRgb(h, s, l, out) {
    out = out || [0, 0, 0];
    if (s <= 1e-6) { out[0] = out[1] = out[2] = l * 255; return out; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    out[0] = hue2rgb(p, q, h + 1 / 3) * 255; out[1] = hue2rgb(p, q, h) * 255; out[2] = hue2rgb(p, q, h - 1 / 3) * 255;
    return out;
  }
  /** Lệch màu theo HSL (dh, ds, dl) – dùng để tạo biến thể màu cánh hoa, lá. */
  function shiftHsl(c, dh, ds, dl, out) {
    var hsl = rgbToHsl(c);
    return hslToRgb(hsl[0] + dh, clamp(hsl[1] + ds, 0, 1), clamp(hsl[2] + dl, 0, 1), out);
  }
  U.parseColor = parseColor; U.mix = mix; U.css = css; U.rgba = rgba; U.toHex = toHex; U.shade = shade;
  U.rgbToHsl = rgbToHsl; U.hslToRgb = hslToRgb; U.shiftHsl = shiftHsl;

  /* ---------------------------------------------- Keyframe theo thời gian
   * keys = [[t0, giá_trị0], [t1, giá_trị1], ...] đã sắp xếp theo t.
   * Giữa hai mốc nội suy bằng ef (mặc định smoothstep) → không có chuyển động tuyến tính. */
  function keyNum(keys, t, ef) {
    var n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    var i = 1; while (i < n - 1 && t > keys[i][0]) i++;
    var k0 = keys[i - 1], k1 = keys[i], u = (t - k0[0]) / (k1[0] - k0[0]);
    u = (ef || smooth01)(u);
    return k0[1] + (k1[1] - k0[1]) * u;
  }
  /** Như keyNum nhưng giá trị là màu (hex/mảng); trả về mảng [r,g,b] (ghi vào out nếu có). */
  function keyColor(keys, t, out, ef) {
    var n = keys.length; out = out || [0, 0, 0];
    if (t <= keys[0][0]) return mix(keys[0][1], keys[0][1], 0, out);
    if (t >= keys[n - 1][0]) return mix(keys[n - 1][1], keys[n - 1][1], 0, out);
    var i = 1; while (i < n - 1 && t > keys[i][0]) i++;
    var k0 = keys[i - 1], k1 = keys[i], u = (t - k0[0]) / (k1[0] - k0[0]);
    return mix(k0[1], k1[1], (ef || smooth01)(u), out);
  }
  U.keyNum = keyNum; U.keyColor = keyColor;

  /* ------------------------------------------------- Số ngẫu nhiên có seed */
  /** mulberry32: trả về hàm () => số thực trong [0,1). */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** Bộ RNG có seed (số hoặc chuỗi) kèm các hàm tiện dụng. Cùng seed → cùng kết quả. */
  function makeRng(seed) {
    var base = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
    var f = mulberry32(base), spare = null;
    return {
      seed: base,
      next: f,
      range: function (a, b) { return a + (b - a) * f(); },
      int: function (a, b) { return a + Math.floor(f() * (b - a + 1)); },
      chance: function (p) { return f() < p; },
      sign: function () { return f() < 0.5 ? -1 : 1; },
      pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
      /** Phân phối chuẩn N(0,1) (Box–Muller). */
      gauss: function () {
        if (spare !== null) { var s = spare; spare = null; return s; }
        var u = 0; while (u === 0) u = f();
        var v = f(), m = Math.sqrt(-2 * Math.log(u));
        spare = m * Math.sin(TAU * v);
        return m * Math.cos(TAU * v);
      },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(f() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      /** RNG con xác định theo (seed gốc, nhãn) – không làm đổi trạng thái RNG cha. */
      fork: function (label) { return makeRng((base ^ hashStr(String(label))) >>> 0); }
    };
  }
  U.mulberry32 = mulberry32; U.hashStr = hashStr; U.makeRng = makeRng;
  /** Vài seed dựng sẵn cho hình dáng cây (chọn bằng config.tree.seedIndex). */
  U.TREE_SEEDS = [20251020, 1020, 7203, 41027, 90210, 31415];

  /* ------------------------------------------------------------------- Noise */
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function hash2(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3(x, y, z, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1013904223) + Math.imul(s | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  var F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3 = 1 / 6;
  var GRAD3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

  /**
   * Tạo bộ noise riêng theo seed. Trả về:
   *  simplex2(x,y), simplex3(x,y,z) → [-1,1]     value2(x,y), value3(x,y,z) → [0,1]
   *  fbm2(x,y,oct,lac,gain), fbm3(...) → ~[-1,1]
   *  curl2(x,y,t,out) → dòng chảy 2D không nén, biến thiên theo thời gian t (out = [vx,vy])
   *  curl3(x,y,z,out) → trường xoáy 3D (out = [vx,vy,vz])
   * Giá trị curl ở đơn vị "trên mỗi đơn vị toạ độ noise"; nhân với tần số/biên độ mong muốn.
   */
  function makeNoise(seed) {
    var rng = makeRng(seed), p = new Uint8Array(256), i;
    for (i = 0; i < 256; i++) p[i] = i;
    rng.shuffle(p);
    var perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
    var vs = (rng.next() * 65536) | 0;

    function simplex2(xin, yin) {
      var s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s), t = (i + j) * G2;
      var x0 = xin - (i - t), y0 = yin - (j - t), i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      var ii = i & 255, jj = j & 255, n0 = 0, n1 = 0, n2 = 0, gi;
      var t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) { gi = pm12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0); }
      var t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) { gi = pm12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1); }
      var t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) { gi = pm12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2); }
      return 70 * (n0 + n1 + n2);
    }

    function simplex3(xin, yin, zin) {
      var s = (xin + yin + zin) * F3, i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      var t = (i + j + k) * G3, x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      var i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      var x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      var x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      var x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      var ii = i & 255, jj = j & 255, kk = k & 255, n0 = 0, n1 = 0, n2 = 0, n3 = 0, gi;
      var t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 >= 0) { gi = pm12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0 + GRAD3[gi + 2] * z0); }
      var t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 >= 0) { gi = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1 + GRAD3[gi + 2] * z1); }
      var t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 >= 0) { gi = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2 + GRAD3[gi + 2] * z2); }
      var t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 >= 0) { gi = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (GRAD3[gi] * x3 + GRAD3[gi + 1] * y3 + GRAD3[gi + 2] * z3); }
      return 32 * (n0 + n1 + n2 + n3);
    }

    function value2(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi);
      var a = hash2(xi, yi, vs), b = hash2(xi + 1, yi, vs), c = hash2(xi, yi + 1, vs), d = hash2(xi + 1, yi + 1, vs);
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }
    function value3(x, y, z) {
      var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      var u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
      var a0 = hash3(xi, yi, zi, vs), b0 = hash3(xi + 1, yi, zi, vs), c0 = hash3(xi, yi + 1, zi, vs), d0 = hash3(xi + 1, yi + 1, zi, vs);
      var a1 = hash3(xi, yi, zi + 1, vs), b1 = hash3(xi + 1, yi, zi + 1, vs), c1 = hash3(xi, yi + 1, zi + 1, vs), d1 = hash3(xi + 1, yi + 1, zi + 1, vs);
      var l0 = (a0 + (b0 - a0) * u) + ((c0 + (d0 - c0) * u) - (a0 + (b0 - a0) * u)) * v;
      var l1 = (a1 + (b1 - a1) * u) + ((c1 + (d1 - c1) * u) - (a1 + (b1 - a1) * u)) * v;
      return l0 + (l1 - l0) * w;
    }
    function fbm2(x, y, oct, lac, gain) {
      oct = oct || 4; lac = lac || 2; gain = gain || 0.5;
      var sum = 0, amp = 1, norm = 0, f = 1;
      for (var o = 0; o < oct; o++) { sum += amp * simplex2(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
      return sum / norm;
    }
    function fbm3(x, y, z, oct, lac, gain) {
      oct = oct || 4; lac = lac || 2; gain = gain || 0.5;
      var sum = 0, amp = 1, norm = 0, f = 1;
      for (var o = 0; o < oct; o++) { sum += amp * simplex3(x * f, y * f, z * f); norm += amp; amp *= gain; f *= lac; }
      return sum / norm;
    }
    var E = 0.01, INV2E = 1 / (2 * E);
    /** Curl 2D từ thế vô hướng ψ(x,y,t)=simplex3: v = (∂ψ/∂y, −∂ψ/∂x). */
    function curl2(x, y, t, out) {
      out = out || [0, 0]; t = t || 0;
      out[0] = (simplex3(x, y + E, t) - simplex3(x, y - E, t)) * INV2E;
      out[1] = -(simplex3(x + E, y, t) - simplex3(x - E, y, t)) * INV2E;
      return out;
    }
    /** Curl 3D từ thế vectơ P = (n(x,y,z), n(x+a,…), n(x+b,…)): v = ∇ × P. */
    function curl3(x, y, z, out) {
      out = out || [0, 0, 0];
      var ax = 31.4, ay = 15.7, az = 9.2, bx = -47.3, by = 23.1, bz = -12.6;
      var dPz_dy = (simplex3(x + bx, y + by + E, z + bz) - simplex3(x + bx, y + by - E, z + bz)) * INV2E;
      var dPy_dz = (simplex3(x + ax, y + ay, z + az + E) - simplex3(x + ax, y + ay, z + az - E)) * INV2E;
      var dPx_dz = (simplex3(x, y, z + E) - simplex3(x, y, z - E)) * INV2E;
      var dPz_dx = (simplex3(x + bx + E, y + by, z + bz) - simplex3(x + bx - E, y + by, z + bz)) * INV2E;
      var dPy_dx = (simplex3(x + ax + E, y + ay, z + az) - simplex3(x + ax - E, y + ay, z + az)) * INV2E;
      var dPx_dy = (simplex3(x, y + E, z) - simplex3(x, y - E, z)) * INV2E;
      out[0] = dPz_dy - dPy_dz; out[1] = dPx_dz - dPz_dx; out[2] = dPy_dx - dPx_dy;
      return out;
    }
    return { simplex2: simplex2, simplex3: simplex3, value2: value2, value3: value3, fbm2: fbm2, fbm3: fbm3, curl2: curl2, curl3: curl3 };
  }
  U.makeNoise = makeNoise;
  /** Bộ noise mặc định dùng chung (seed cố định → cảnh luôn lặp lại được). */
  var N = U.noise = makeNoise(1337);
  U.noise1 = function (x) { return N.simplex2(x, 17.3); };
  U.noise2 = N.simplex2; U.noise3 = N.simplex3; U.value2 = N.value2; U.value3 = N.value3;
  U.fbm2 = N.fbm2; U.fbm3 = N.fbm3; U.curl2 = N.curl2; U.curl3 = N.curl3;

  /* ------------------------------------------------ Pool, canvas, debounce */
  /**
   * Pool đối tượng cố định kích thước (không tạo object mới trong vòng lặp nóng).
   * spawn() trả về phần tử rảnh (alive=true) hoặc null nếu đã đầy; kill(o) trả về pool.
   */
  function Pool(factory, size) {
    this.size = size; this.items = new Array(size); this.cursor = 0; this.count = 0;
    for (var i = 0; i < size; i++) { var o = factory(i); o.alive = false; this.items[i] = o; }
  }
  Pool.prototype.spawn = function () {
    var n = this.size;
    for (var k = 0; k < n; k++) {
      var i = (this.cursor + k) % n, o = this.items[i];
      if (!o.alive) { o.alive = true; this.cursor = (i + 1) % n; this.count++; return o; }
    }
    return null;
  };
  Pool.prototype.kill = function (o) { if (o.alive) { o.alive = false; this.count--; } };
  Pool.prototype.clear = function () {
    for (var i = 0; i < this.size; i++) this.items[i].alive = false;
    this.count = 0; this.cursor = 0;
  };
  U.Pool = Pool;

  /** Tạo canvas offscreen kích thước nguyên dương. */
  U.createCanvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  };
  U.debounce = function (fn, ms) {
    var id = 0;
    return function () {
      var a = arguments, self = this;
      clearTimeout(id);
      id = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  };
})();
