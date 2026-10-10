/* ============================================================================
 * js/ui.js – Giao diện DOM (chữ sắc nét ở mọi mức zoom): nhập tên, màn hình chờ, lời chúc, nút điều khiển.
 *  UI.init({onStart(tên), onReady(), onReplay()})  → gắn sự kiện, tự focus ô nhập, chạy cảnh trang trí
 *  Bước 1  Nhập tên: kiểm tra rỗng (rung nhẹ + lỗi dịu), trim, gộp khoảng trắng, ≤30 ký tự, viết hoa chữ đầu theo 'vi';
 *          không gửi khi đang gõ dở Telex/VNI (isComposing, compositionend, keyCode 229); chỉ dùng textContent.
 *  Bước 2  UI.beginLoading(onReady), UI.loadSet(khoá, 0..1), UI.loadNote(chữ): tiến độ có trọng số thật (config.loading),
 *          hoa sen nở theo %, thanh đuổi theo bằng easing và không lùi, tối thiểu ~3s, tối đa 15s, flash rồi cross-fade.
 *  Bước 4  UI.showWish(tên), UI.layoutWish() (mỗi khung: neo theo điểm focus thế giới), UI.hideWish()
 *  Nút     UI.showSound/showReplay/showPrompt, UI.syncSound(), UI.toast(), UI.debug(), UI.setReduced()
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, WC = C.wish, LC = C.loading, cam = App.camera;
  var TAU = U.TAU, PI = Math.PI, clamp = U.clamp, lerp = U.lerp, ease = U.ease;
  var UI = App.ui = { name: '' };
  var el = {}, hooks = {}, timers = [], composing = false, lastComp = -999, enterBlocked = false, busy = false, wishOn = false, toastT = 0, reduce = false;
  var lastPos = { x: -1e9, y: -1e9, w: -1e9 }, tA = [0, 0], tB = [0, 0];

  function $(id) { return document.getElementById(id); }
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers.length = 0; }
  function dpr() { return Math.min(2, window.devicePixelRatio || 1); }

  /** Chuẩn hoá tên: NFC, trim, gộp khoảng trắng, ≤30 ký tự (theo ký tự, không cắt giữa dấu), viết hoa chữ cái đầu mỗi từ theo tiếng Việt. */
  function normalizeName(raw) {
    var s = String(raw == null ? '' : raw);
    if (s.normalize) s = s.normalize('NFC');
    s = s.replace(/\s+/g, ' ').trim();
    var chars = Array.from(s);
    if (chars.length > 30) chars = chars.slice(0, 30);
    s = chars.join('').trim();
    return s.split(' ').map(function (w) {
      if (!w) return w;
      var cs = Array.from(w.toLocaleLowerCase('vi'));
      cs[0] = cs[0].toLocaleUpperCase('vi');
      return cs.join('');
    }).join(' ');
  }
  UI.normalizeName = normalizeName;

  /* ----------------------------------------------- Hoa vẽ procedural (vector) */
  function notchPath(g, Lp, w) {                                 // cánh anh đào có khía
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(-w * Lp * 0.95, -Lp * 0.18, -w * Lp * 1.05, -Lp * 0.78, -w * Lp * 0.3, -Lp * 0.96);
    g.quadraticCurveTo(-w * Lp * 0.1, -Lp * 0.9, 0, -Lp * 0.8);
    g.quadraticCurveTo(w * Lp * 0.1, -Lp * 0.9, w * Lp * 0.3, -Lp * 0.96);
    g.bezierCurveTo(w * Lp * 1.05, -Lp * 0.78, w * Lp * 0.95, -Lp * 0.18, 0, 0); g.closePath();
  }
  function cherry(g, x, y, R, rot) {
    var i, a, l;
    g.save(); g.translate(x, y); g.rotate(rot);
    for (i = 0; i < 5; i++) {
      g.save(); g.rotate(i * TAU / 5);
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, R); gr.addColorStop(0, '#FFF8F0'); gr.addColorStop(0.5, '#FFC1D6'); gr.addColorStop(1, '#F48FB1');
      notchPath(g, R, 0.72); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = R * 0.02; g.stroke();
      g.restore();
    }
    for (i = 0; i < 9; i++) {
      a = i * TAU / 9 + 0.3; l = R * 0.3;
      g.strokeStyle = '#D45A7A'; g.lineWidth = R * 0.02; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
      g.fillStyle = '#FFD27A'; g.beginPath(); g.arc(Math.cos(a) * l, Math.sin(a) * l, R * 0.035, 0, TAU); g.fill();
    }
    g.fillStyle = '#FFD27A'; g.beginPath(); g.arc(0, 0, R * 0.08, 0, TAU); g.fill();
    g.restore();
  }
  /** Hoa sen 3 lớp cánh nhọn: lớp ngoài mở trước, lớp trong mở sau theo open (0..1). */
  function lotus(g, x, y, R, open) {
    var LY = [[8, 1, 1.5, 0], [7, 0.85, 1.1, 0.25], [5, 0.65, 0.7, 0.5]], k, j;
    for (k = 0; k < 3; k++) {
      var o = ease.inOutCubic(clamp((open - LY[k][3]) / 0.5, 0, 1)), n = LY[k][0], spread = lerp(0.1, LY[k][2], o), len = R * LY[k][1] * (0.7 + 0.3 * o);
      for (j = 0; j < n; j++) {
        var a = (j / (n - 1) - 0.5) * 2 * spread;
        g.save(); g.translate(x, y); g.rotate(a);
        var gr = g.createLinearGradient(0, 0, 0, -len); gr.addColorStop(0, '#FFF8F0'); gr.addColorStop(0.5, '#FFD3E2'); gr.addColorStop(1, k === 2 ? '#E8588F' : '#F27AA6');
        g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-len * 0.34, -len * 0.25, -len * 0.3, -len * 0.75, 0, -len); g.bezierCurveTo(len * 0.3, -len * 0.75, len * 0.34, -len * 0.25, 0, 0);
        g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.stroke();
        g.restore();
      }
    }
    if (open > 0.55) {                                           // đài sen vàng
      var pr = R * 0.14 * clamp((open - 0.55) / 0.4, 0, 1);
      g.fillStyle = '#F2E36E'; g.beginPath(); g.ellipse(x, y - R * 0.12, pr, pr * 0.8, 0, 0, TAU); g.fill();
    }
  }
  function sparkle(g, x, y, r) {
    g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
  }

  /* ------------------------------------------- Cảnh trang trí sau hộp thoại */
  var intro = { cv: null, g: null, w: 0, h: 0, d: 1, raf: 0, on: false, t0: 0, last: 0, petals: [] };
  function introSize() {
    if (!intro.cv) return;
    intro.d = dpr(); intro.w = window.innerWidth; intro.h = window.innerHeight;
    intro.cv.width = Math.round(intro.w * intro.d); intro.cv.height = Math.round(intro.h * intro.d);
  }
  function introFrame(ts) {
    if (!intro.on) return;
    intro.raf = requestAnimationFrame(introFrame);
    var dt = Math.min(0.05, (ts - intro.last) / 1000), t = (ts - intro.t0) / 1000, g = intro.g, w = intro.w, h = intro.h, i, p, m = Math.min(w, h);
    intro.last = ts;
    g.setTransform(intro.d, 0, 0, intro.d, 0, 0); g.clearRect(0, 0, w, h);
    for (i = 0; i < intro.petals.length; i++) {                  // vài cánh hoa bay chậm phía sau
      p = intro.petals[i];
      p.y += p.vy * dt; p.x += Math.sin(t * 0.8 + p.ph) * 14 * dt; p.rot += p.spin * dt;
      if (p.y > h + 24) { p.y = -24; p.x = Math.random() * w; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(t * 0.9 + p.ph)));
      g.fillStyle = 'rgba(255,230,238,' + p.a + ')'; g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.6, 0, 0, TAU); g.fill(); g.restore();
    }
    cherry(g, w * 0.87, h * 0.85, m * 0.15, 0.3 + Math.sin(t * 0.9) * 0.08);          // khẽ đung đưa
    g.save(); g.translate(w * 0.12, h * 0.92); g.rotate(Math.sin(t * 0.7 + 1) * 0.05); lotus(g, 0, 0, m * 0.14, 1); g.restore();
  }
  UI.startIntro = function () {
    if (intro.on || !intro.cv) return;
    intro.on = true; intro.t0 = intro.last = performance.now();
    for (var i = intro.petals.length; i < 26; i++) intro.petals.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, vy: 14 + Math.random() * 22, ph: Math.random() * TAU, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 1.2, s: 5 + Math.random() * 6, a: (0.25 + Math.random() * 0.4).toFixed(2) });
    intro.raf = requestAnimationFrame(introFrame);
  };
  UI.stopIntro = function () { intro.on = false; cancelAnimationFrame(intro.raf); };

  /* ------------------------------------------------------------ Bước 1: tên */
  function shake() {
    el.field.classList.remove('shake'); void el.field.offsetWidth; el.field.classList.add('shake');
  }
  function showError(msg) {
    el.error.textContent = msg; el.error.classList.add('show');
    el.input.classList.add('invalid'); el.input.setAttribute('aria-invalid', 'true');
    shake(); el.input.focus({ preventScroll: true });
  }
  function ripple(btn, e) {
    var r = btn.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span'), cx = e && e.clientX ? e.clientX - r.left : r.width / 2, cy = e && e.clientY ? e.clientY - r.top : r.height / 2;
    s.className = 'ripple'; s.style.setProperty('--d', d + 'px'); s.style.setProperty('--x', cx + 'px'); s.style.setProperty('--y', cy + 'px');
    btn.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 900);
  }
  function onSubmit(e) {
    e.preventDefault();
    if (composing || enterBlocked || performance.now() - lastComp < 60) { enterBlocked = false; return; }   // đang gõ dở: không gửi
    if (busy) return;
    var n = normalizeName(el.input.value);
    if (!n) { showError('Bạn hãy cho mình biết tên nhé, chỉ một cái tên thôi cũng được.'); return; }
    busy = true; UI.name = n;
    el.error.classList.remove('show'); el.input.classList.remove('invalid'); el.input.setAttribute('aria-invalid', 'false');
    if (App.audio) App.audio.unlock();                           // ngay trong cú click/Enter (cử chỉ người dùng) để mở khoá âm thanh
    UI.hideName();
    if (hooks.onStart) hooks.onStart(n);
  }
  UI.hideName = function () {
    el.nameOv.classList.add('off');
    later(UI.stopIntro, 1900);
  };

  /* ---------------------------------------------------- Bước 2: màn hình chờ */
  var ld = { on: false, t0: 0, last: 0, keys: {}, target: 0, disp: 0, finishing: false, raf: 0, cv: null, g: null, s: 0, d: 1, txt: '', petals: [] };
  var KEYS = Object.keys(LC.weights);
  function recompute() {
    var s = 0, i;
    for (i = 0; i < KEYS.length; i++) s += LC.weights[KEYS[i]] * (ld.keys[KEYS[i]] || 0);
    ld.target = Math.min(1, s);
  }
  UI.loadSet = function (key, f) { var v = clamp(f, 0, 1); if (v > (ld.keys[key] || 0)) { ld.keys[key] = v; recompute(); } };
  UI.loadNote = function (msg) { el.note.textContent = msg; el.note.classList.add('show'); };
  function sizeLoad() {
    if (!ld.cv) return;
    ld.d = dpr(); ld.s = ld.cv.clientWidth || 300;
    ld.cv.width = Math.round(ld.s * ld.d); ld.cv.height = Math.round(ld.s * ld.d);
  }
  function loadFrame(ts) {
    if (!ld.on) return;
    ld.raf = requestAnimationFrame(loadFrame);
    var dt = Math.min(0.05, (ts - ld.last) / 1000), es = (ts - ld.t0) / 1000, i, g = ld.g, s = ld.s, t = es;
    ld.last = ts;
    if (!ld.finishing && es >= LC.maxTime) {                     // quá 15s: vẫn cho vào cảnh, báo nhẹ nếu nhạc lỗi
      for (i = 0; i < KEYS.length; i++) ld.keys[KEYS[i]] = 1;
      recompute();
      if (App.audio && !App.audio.ready) UI.loadNote(LC.musicFail);
    }
    var goal = Math.min(ld.target, clamp(0.1 + 0.95 * ease.outCubic(es / LC.minTime), 0, 1)), next = ld.disp + (goal - ld.disp) * (1 - Math.exp(-4 * dt));
    if (goal - next < 0.0005) next = goal;
    ld.disp = Math.max(ld.disp, next);                           // thanh đuổi theo tiến độ thật, không nhảy lùi
    var txt = LC.texts[0][1];
    for (i = 0; i < LC.texts.length; i++) if (ld.disp >= LC.texts[i][0]) txt = LC.texts[i][1];
    if (txt !== ld.txt) { ld.txt = txt; el.loadText.textContent = txt; }
    el.percent.textContent = Math.round(ld.disp * 100) + '%';
    el.bar.style.transform = 'scaleX(' + ld.disp.toFixed(4) + ')';
    g.setTransform(ld.d, 0, 0, ld.d, 0, 0); g.clearRect(0, 0, s, s);
    var open = ld.finishing ? 1 : ld.disp;
    if (open > 0.97) {                                           // nở trọn: quầng sáng nhịp thở
      var gl = g.createRadialGradient(s / 2, s * 0.55, 0, s / 2, s * 0.55, s * 0.5);
      gl.addColorStop(0, 'rgba(255,214,170,' + (0.35 + 0.1 * Math.sin(t * 3)).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(255,214,170,0)');
      g.fillStyle = gl; g.fillRect(0, 0, s, s);
    }
    for (i = 0; i < ld.petals.length; i++) {                     // cánh hoa nhỏ rơi quanh
      var p = ld.petals[i], u = (t * p.v + p.ph) % 1;
      g.save(); g.translate(s * (0.1 + 0.8 * p.x) + Math.sin(t * 1.3 + p.ph * 9) * 10, s * (-0.05 + 1.1 * u)); g.rotate(t * p.r + p.ph * 5);
      g.fillStyle = 'rgba(255,214,226,' + (0.7 * Math.sin(PI * u)).toFixed(3) + ')'; g.beginPath(); g.ellipse(0, 0, 5, 3, 0, 0, TAU); g.fill(); g.restore();
    }
    lotus(g, s / 2, s * 0.62, s * 0.36, open);
    if (!ld.finishing && ld.target >= 0.999 && es >= LC.minTime && ld.disp >= 0.995) finishLoading();
  }
  function finishLoading() {
    ld.finishing = true; ld.disp = 1;
    el.percent.textContent = '100%'; el.bar.style.transform = 'scaleX(1)';
    later(function () { el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on'); }, 650);          // hoa nở trọn → flash sáng dịu
    later(function () { el.loading.classList.add('off'); if (hooks.onReady) hooks.onReady(); }, 1130);                              // cross-fade điện ảnh
    later(function () { ld.on = false; cancelAnimationFrame(ld.raf); el.flash.classList.remove('on'); }, 3400);
  }
  UI.beginLoading = function (onReady) {
    hooks.onReady = onReady;
    ld.on = true; ld.t0 = ld.last = performance.now(); ld.keys = {}; ld.disp = 0; ld.target = 0; ld.finishing = false; ld.txt = '';
    for (var i = ld.petals.length; i < 14; i++) ld.petals.push({ x: Math.random(), v: 0.07 + Math.random() * 0.08, ph: Math.random(), r: (Math.random() - 0.5) * 2 });
    el.note.classList.remove('show'); el.note.textContent = '';
    el.loading.classList.remove('off'); sizeLoad();
    ld.raf = requestAnimationFrame(loadFrame);
  };

  /* ------------------------------------------------------- Bước 4: lời chúc */
  function addText(parent, s) {                                  // "20/10" dùng Playfair Display
    var parts = s.split(/(20\/10)/), i, n;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (parts[i] === '20/10') { n = document.createElement('span'); n.className = 'num'; n.style.fontFamily = 'var(--serif)'; n.style.fontWeight = '700'; n.style.letterSpacing = '0.04em'; n.textContent = parts[i]; parent.appendChild(n); }
      else parent.appendChild(document.createTextNode(parts[i]));
    }
  }
  function addMixed(parent, s, name) {                           // chỗ {tên} → span.name (textContent, không innerHTML)
    var segs = s.split('\u0001'), i, nm;
    for (i = 0; i < segs.length; i++) {
      if (i > 0) { nm = document.createElement('span'); nm.className = 'name'; nm.textContent = name; parent.appendChild(nm); }
      addText(parent, segs[i]);
    }
  }
  function buildLine(cl, name) {
    var div = document.createElement('div'), text = cl.text.split('{tên}').join('\u0001'), toks, j, w;
    div.className = 'wl' + (cl.title ? ' title' : '');
    if (cl.words) {                                              // dòng đầu hiện theo từng từ
      toks = text.split(' ');
      for (j = 0; j < toks.length; j++) {
        w = document.createElement('span'); w.className = 'w'; w.style.transitionDelay = (j * WC.wordGap).toFixed(2) + 's';
        addMixed(w, toks[j], name); div.appendChild(w);
        if (j < toks.length - 1) div.appendChild(document.createTextNode(' '));
      }
    } else addMixed(div, text, name);
    return div;
  }
  function drawOrnament() {                                      // hoạ tiết: một bông sen, một bông anh đào, vài tia sáng
    var cv = el.orn, d = dpr(), g = cv.getContext('2d');
    cv.width = 320 * d; cv.height = 110 * d;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, 320, 110);
    var gl = g.createRadialGradient(160, 62, 0, 160, 62, 120); gl.addColorStop(0, 'rgba(255,214,170,0.28)'); gl.addColorStop(1, 'rgba(255,214,170,0)');
    g.fillStyle = gl; g.fillRect(0, 0, 320, 110);
    lotus(g, 108, 84, 40, 1); cherry(g, 218, 66, 27, 0.35);
    g.fillStyle = 'rgba(255,240,200,0.9)'; sparkle(g, 160, 28, 7); sparkle(g, 60, 40, 4); sparkle(g, 268, 36, 5); sparkle(g, 290, 84, 3);
  }
  UI.showWish = function (name) {
    var box = el.lines, i, line, divs = [], n = WC.lines.length, t0 = (reduce ? 0.3 : WC.startDelay) * 1000, gap = (reduce ? 0.8 : WC.lineGap) * 1000;
    clearTimers();
    box.textContent = '';
    for (i = 0; i < n; i++) { line = buildLine(WC.lines[i], name); box.appendChild(line); divs.push(line); }
    el.wish.classList.add('on'); wishOn = true; lastPos.x = -1e9; UI.layoutWish();
    for (i = 0; i < n; i++) later((function (d) { return function () { d.classList.add('show'); }; })(divs[i]), t0 + i * gap);
    drawOrnament();
    later(function () { el.orn.classList.add('show'); }, t0 + n * gap + 700);
    later(function () { UI.showReplay(true); if (hooks.onWishDone) hooks.onWishDone(); }, t0 + n * gap + 2200);
  };
  UI.hideWish = function () {
    clearTimers(); wishOn = false;
    el.wish.classList.remove('on'); el.orn.classList.remove('show'); el.lines.textContent = '';
    UI.showReplay(false);
  };
  /** Neo hộp lời chúc vào điểm focus (toạ độ thế giới) → luôn khớp vị trí sau zoom/xoay; gọi mỗi khung. */
  UI.layoutWish = function () {
    if (!wishOn) return;
    var f = cam.focusWorld(tA), p = cam.worldToScreen(f[0], f[1], 1, tB), Z = C.layout.wishZone, sc = cam.base * cam.zoom;
    var ww = Math.min((Z.x1 - Z.x0) * C.virtual.w * sc * 0.95, cam.cssW - 32), x = clamp(p[0], ww / 2 + 16, cam.cssW - ww / 2 - 16), y = p[1];
    if (Math.abs(x - lastPos.x) < 0.4 && Math.abs(y - lastPos.y) < 0.4 && Math.abs(ww - lastPos.w) < 0.4) return;
    lastPos.x = x; lastPos.y = y; lastPos.w = ww;
    el.wish.style.setProperty('--wx', x.toFixed(1) + 'px'); el.wish.style.setProperty('--wy', y.toFixed(1) + 'px'); el.wish.style.setProperty('--ww', ww.toFixed(1) + 'px');
  };

  /* ------------------------------------------------------- Nút & thông báo */
  UI.showSound = function (on) { el.sound.classList.toggle('show', !!on); };
  UI.showReplay = function (on) { el.replay.classList.toggle('show', !!on); };
  UI.showPrompt = function (on) { el.prompt.classList.toggle('show', !!on); };
  UI.syncSound = function () { el.sound.setAttribute('aria-pressed', String(!(App.audio && App.audio.muted))); };
  UI.toast = function (msg, ms) {
    el.toast.textContent = msg; el.toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { el.toast.classList.remove('show'); }, ms || 3200);
  };
  UI.debug = function (txt) {
    if (txt === null || txt === undefined) { el.debug.classList.remove('on'); return; }
    el.debug.textContent = txt; el.debug.classList.add('on');
  };
  UI.setReduced = function (on) { reduce = !!on; document.documentElement.classList.toggle('reduce', reduce); };

  UI.init = function (h) {
    hooks = h || {};
    el.nameOv = $('nameOverlay'); el.form = $('nameForm'); el.field = $('nameField'); el.input = $('nameInput'); el.error = $('nameError'); el.start = $('startBtn');
    el.loading = $('loading'); el.percent = $('loadPercent'); el.loadText = $('loadText'); el.bar = $('loadBar'); el.note = $('loadNote'); el.flash = $('flash');
    el.wish = $('wish'); el.lines = $('wishLines'); el.orn = $('wishOrnament'); el.sound = $('soundBtn'); el.prompt = $('musicPrompt'); el.replay = $('replayBtn');
    el.toast = $('toast'); el.debug = $('debug');
    intro.cv = $('introCanvas'); intro.g = intro.cv.getContext('2d'); ld.cv = $('lotusCanvas'); ld.g = ld.cv.getContext('2d');

    el.input.addEventListener('compositionstart', function () { composing = true; });
    el.input.addEventListener('compositionend', function () { composing = false; lastComp = performance.now(); });
    el.input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      enterBlocked = !!(e.isComposing || composing || e.keyCode === 229);
      setTimeout(function () { enterBlocked = false; }, 0);      // submit (nếu có) chạy đồng bộ ngay sau keydown; hết lượt thì mở lại để nút "Bắt đầu" không bị chặn nhầm
    });
    el.input.addEventListener('input', function () {
      if (el.input.classList.contains('invalid')) { el.input.classList.remove('invalid'); el.input.setAttribute('aria-invalid', 'false'); el.error.classList.remove('show'); }
    });
    el.form.addEventListener('submit', onSubmit);
    el.start.addEventListener('pointerdown', function (e) { ripple(el.start, e); });
    el.sound.addEventListener('click', function () {
      if (App.audio) App.audio.toggle();
      UI.syncSound();
    });
    el.prompt.addEventListener('click', function () { if (App.audio) App.audio.start(); UI.showPrompt(false); });
    el.replay.addEventListener('click', function (e) { ripple(el.replay, e); UI.showReplay(false); if (hooks.onReplay) hooks.onReplay(); });
    window.addEventListener('resize', U.debounce(function () { introSize(); if (ld.on) sizeLoad(); }, 150));

    introSize(); UI.startIntro();
    later(function () { el.input.focus({ preventScroll: true }); }, 350);       // tự focus khi hộp thoại đã hiện
    el.input.focus({ preventScroll: true });
    UI.syncSound();
  };
})();
