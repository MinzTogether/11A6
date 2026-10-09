/* ============================================================================
 * js/main.js – Khởi động và điều phối toàn bộ (chạy sau tất cả module khác).
 *  Luồng: mở trang → hộp nhập tên → "Bắt đầu" (mở khoá âm thanh) → màn hình chờ (tải thật, có trọng số)
 *         → flash + cross-fade → cảnh chính (timeline ~66s) → lời chúc → "Xem lại" (reset sạch, không rò rỉ).
 *  Thứ tự vẽ 14 lớp (xa → gần): 1–4 trời/mặt trời/mây/đồi · 5 đồng cỏ + bóng đổ (+ cánh hoa đã lắng) · 6 cánh hoa sau cây
 *  · 7 cây · 8 stickman · 9 cánh hoa giữa · 10 cỏ, hoa dại, ao sen, cỏ cận cảnh · 11 đom đóm · 12 cánh hoa trước
 *  · 13 tia nắng + lens flare · 14 hậu kỳ.
 *  Tự hạ chất lượng (high → mid → low) khi FPS dưới ngưỡng (không tự nâng lại); tạm dừng khi tab ẩn;
 *  tôn trọng prefers-reduced-motion; ?debug=1 hiện FPS và phím ← → (tua ±5s), Space (dừng), ?t=45 nhảy tới giây 45.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, TC = C.timeline, QC = C.quality, TL = App.timeline, cam = App.camera;
  var Sky = App.sky, Tree = App.tree, Wind = App.wind, Petals = App.petals, Ground = App.ground, Pond = App.pond, Stick = App.stickman;
  var Fire = App.fireflies, PFX = App.postfx, Aud = App.audio, UI = App.ui;
  var canvas, ctx, running = false, raf = 0, last = 0, qIndex = 0, started = false, errCount = 0, reduce = false, debug = !!C.DEBUG;
  var fps = { acc: 0, n: 0, win: 0, hold: 0 }, dbgT = 0, wasPlaying = false, seekParam = null;

  function safe(fn, tag) { try { fn(); } catch (e) { if (window.console) console.error('[' + (tag || 'main') + ']', e); } }
  function query(name) {
    try { var v = new URLSearchParams(window.location.search).get(name); return v; } catch (e) { return null; }
  }

  /* ----------------------------------------------------------- Chất lượng */
  function applyQuality(name) {
    var q = QC.levels[name];
    qIndex = QC.order.indexOf(name);
    safe(function () { Tree.setQuality(q); Petals.setQuality(q); Ground.setQuality(q); Pond.setQuality(q); Fire.setQuality(q); PFX.setQuality(q); Sky.setQuality(q); }, 'quality');
    resizeCanvas();
  }
  function resizeCanvas() {
    var q = QC.levels[QC.order[qIndex]], d = Math.min(window.devicePixelRatio || 1, q.dprMax), w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.max(2, Math.round(w * d)); canvas.height = Math.max(2, Math.round(h * d));
    cam.resize(w, h, d);
    safe(function () { Tree.resize(); Ground.resize(); }, 'resize');
  }
  function degrade() {
    if (qIndex >= QC.order.length - 1) return;
    applyQuality(QC.order[qIndex + 1]);
    fps.hold = 4;                                                // chờ ổn định rồi mới đo lại; không tự nâng lại
  }
  function fpsCheck(dt) {                                        // trung bình trong cửa sổ fpsWindow giây
    if (document.hidden) return;
    if (fps.hold > 0) { fps.hold -= dt; fps.acc = fps.n = fps.win = 0; return; }
    fps.acc += dt; fps.n++; fps.win += dt;
    if (fps.win >= QC.fpsWindow) {
      var avg = fps.n / fps.acc;
      if (avg < QC.fpsFloor && TL.t > 2) degrade();
      fps.acc = fps.n = fps.win = 0;
    }
  }

  /* ---------------------------------------------------------- Cập nhật + vẽ */
  function update(dt) {
    TL.update(dt); Wind.update(dt); cam.update(); Sky.update();
    Tree.update(dt); Ground.update(dt); Petals.update(dt); Stick.update(dt); Pond.update(dt); Fire.update(dt);
    Aud.update(dt); UI.layoutWish();
  }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    Sky.drawBack(ctx);                                           // 1–4
    Ground.drawBack(ctx);                                        // 5: đồng cỏ + bóng đổ + đốm sáng lọt kẽ lá
    Petals.drawGround(ctx);                                      // 5: cánh hoa đã lắng trên đất
    Petals.drawBack(ctx);                                        // 6
    Tree.draw(ctx);                                              // 7
    cam.apply(ctx, 1); Stick.draw(ctx);                          // 8
    Petals.drawMid(ctx);                                         // 9
    Ground.drawFront(ctx);                                       // 10: bụi hoa, cỏ động, hoa dại
    Pond.draw(ctx);                                              // 10: ao sen tiền cảnh
    Ground.drawNear(ctx);                                        // 10: cỏ cận cảnh (rack focus)
    Fire.draw(ctx);                                              // 11
    Petals.drawFront(ctx);                                       // 12
    Sky.drawFront(ctx);                                          // 13: god rays + lens flare
    PFX.apply(ctx);                                              // 14
  }
  function frame(dt) { update(dt); render(); }
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    var dt = Math.min(C.maxDt, Math.max(0, (ts - last) / 1000));
    last = ts;
    try { frame(dt); } catch (e) { if (++errCount <= 3 && window.console) console.error('[frame]', e); }
    fpsCheck(dt);
    if (debug) {
      dbgT += dt;
      if (dbgT > 0.5) { dbgT = 0; UI.debug((1 / Math.max(dt, 0.001)).toFixed(0) + ' fps | ' + QC.order[qIndex] + ' | t=' + TL.t.toFixed(1) + ' | ' + TL.phase() + ' | hạt ' + Petals.count + ' | đom đóm ' + Fire.count); }
    }
  }
  function startLoop() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stopLoop() { running = false; cancelAnimationFrame(raf); }

  function seekTo(s) {                                           // nhảy tới mốc s: dựng lại trạng thái hạt/đom đóm cho khỏi "trống"
    TL.seek(s); cam.update(); Sky.update(); Wind.update(0); Tree.update(0.016);
    Petals.prewarm(7); Fire.prewarm(4); Stick.update(0);
  }

  /* ---------------------------------------------------------- Tải thật */
  function runList(list, key, done) {
    var i = 0, n = list.length;
    (function next() {
      if (i >= n) { UI.loadSet(key, 1); if (done) done(); return; }
      safe(list[i++], 'task:' + key);
      UI.loadSet(key, i / n);
      setTimeout(next, 0);                                       // nhường luồng để thanh tiến độ và hoa sen vẫn mượt
    })();
  }
  function loadFonts() {
    var fin = false, n = 0, list = ['700 40px "Dancing Script"', '600 40px "Playfair Display"', '40px "Pacifico"'], sample = 'Chúc mừng ngày 20/10 ạảãàáâấầẩẫậăắằẳẵặ';
    function end() { if (!fin) { fin = true; UI.loadSet('font', 1); } }
    setTimeout(end, 4000);
    if (!document.fonts || !document.fonts.load) { end(); return; }
    function step() { n++; UI.loadSet('font', n / list.length); if (n >= list.length) end(); }
    list.forEach(function (f) { try { document.fonts.load(f, sample).then(step, step); } catch (e) { step(); } });
  }
  function warmup() {                                            // render thử vài khung: nạp JIT, dựng cache gỗ, rồi quay về 0s
    return [
      function () { seekTo(2); frame(0.016); },
      function () { seekTo(34); frame(0.016); },
      function () { seekTo(62); frame(0.016); },
      function () { TL.reset(); Petals.reset(); Fire.reset(); Pond.reset(); Ground.reset(); Stick.reset(); Tree.reset(); Wind.reset(); cam.update(); }
    ];
  }
  function beginLoad() {
    var sk = Sky.tasks(), tt = Tree.tasks(), gt = Ground.tasks();
    safe(loadFonts, 'fonts');
    safe(function () {
      Aud.load(function (p) { UI.loadSet('music', p * 0.95); }, function (ok) { UI.loadSet('music', 1); if (!ok) UI.loadNote(C.loading.musicFail); });
    }, 'music');
    runList(tt.structure, 'tree', function () {
      var sprites = tt.sprites.concat(Petals.tasks(), gt.sprites);
      runList(sprites, 'sprites', function () {
        var caches = sk.concat(gt.caches, Pond.tasks(), Fire.tasks());
        runList(caches, 'cache', function () { runList(warmup(), 'warmup'); });
      });
    });
  }

  /* ------------------------------------------------------------ Cảnh chính */
  function startScene() {
    started = true;
    TL.reset();
    if (seekParam !== null) seekTo(seekParam); else { cam.update(); Sky.update(); }
    TL.start();
    UI.showSound(true); UI.syncSound();
    Aud.onBlocked(function () { UI.showPrompt(true); });
    Aud.start();
    startLoop();
  }
  function replay() {
    UI.hideWish(); UI.showPrompt(false);
    TL.reset();                                                  // reset sạch: các module tự dọn qua sự kiện 'reset' (không rò rỉ bộ nhớ)
    cam.update(); Sky.update();
    TL.start();
    Aud.restart();
    if (!running) startLoop();
  }
  function onVisibility() {
    if (document.hidden) {
      wasPlaying = TL.playing; TL.pause(); Aud.pause();
    } else if (started) {
      if (wasPlaying) TL.resume();
      Aud.resume(); last = performance.now();
    }
  }
  function onKey(e) {
    if (!debug || !started) return;
    if (e.key === 'ArrowRight') seekTo(TL.t + 5);
    else if (e.key === 'ArrowLeft') seekTo(Math.max(0, TL.t - 5));
    else if (e.key === ' ') { TL.playing ? TL.pause() : TL.resume(); e.preventDefault(); }
  }

  /* -------------------------------------------------------------- Khởi động */
  function boot() {
    canvas = document.getElementById('scene');
    ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { UI.init({}); UI.toast('Trình duyệt chưa hỗ trợ canvas 2D, hãy thử trình duyệt khác nhé.', 8000); return; }
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    reduce = !!(mq && mq.matches);
    if (query('debug') === '1') debug = true;
    var qt = query('t'); seekParam = qt !== null && isFinite(parseFloat(qt)) ? Math.max(0, parseFloat(qt)) : null;
    cam.reduce = reduce; UI.setReduced(reduce); Petals.setReduced(reduce); Fire.setReduced(reduce); PFX.setReduced(reduce);
    var mobile = (navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 820) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
    applyQuality(mobile ? QC.mobileStart : QC.start);
    TL.cue(TC.wishAt, function () { UI.showWish(UI.name); });    // lời chúc hiện ở mốc wishAt (kể cả khi tua qua)
    Aud.prepare();                                               // bắt đầu tải nhạc ngay khi mở trang
    UI.init({ onStart: function () { UI.beginLoading(startScene); beginLoad(); }, onReplay: replay });
    if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { reduce = e.matches; cam.reduce = reduce; UI.setReduced(reduce); Petals.setReduced(reduce); Fire.setReduced(reduce); PFX.setReduced(reduce); });
    window.addEventListener('resize', U.debounce(function () { resizeCanvas(); }, 150));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', function (e) {        // chạm/nhấp: xung gió cục bộ làm cánh hoa quanh đó bay tung lên
      if (!started) return;
      var p = cam.screenToWorld(e.clientX, e.clientY, 1, [0, 0]);
      Wind.pulse(p[0], p[1]);
    });
  }
  boot();
})();
