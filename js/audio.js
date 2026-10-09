/* ============================================================================
 * js/audio.js – Nhạc nền bằng thẻ <audio id="bgm"> (an toàn cho file://), loop, preload auto.
 *  Đường dẫn nhạc CHỈ nằm ở config.audio.src (file music.mp3 đặt cùng thư mục với index.html).
 *  Audio.prepare()            → gán src và bắt đầu tải ngay khi trang mở (gọi từ main.js)
 *  Audio.load(onProg, onDone) → báo tiến độ tải thật cho màn hình chờ (25%); lỗi/thiếu file → onDone(false), trang vẫn chạy
 *  Audio.unlock()             → gọi ĐỒNG BỘ trong cú click "Bắt đầu": play() rồi pause() ngay để mở khoá autoplay
 *  Audio.start()              → phát từ đầu, fade-in ~3s (easing); bị chặn → gọi hàm đăng ký bằng Audio.onBlocked(fn)
 *  Audio.toggle()/setMuted()  → nút âm thanh; trạng thái nhớ trong phiên (sessionStorage, có dự phòng khi bị chặn)
 *  Audio.pause()/resume()     → tab ẩn: tạm dừng; quay lại: fade-in tiếp tục
 *  Audio.restart()            → "Xem lại": chỉ có MỘT phần tử audio nên nhạc không bao giờ chồng lên nhau
 *  Audio.update(dt)           → chạy fade mỗi khung
 * Lưu ý: iOS bỏ qua audio.volume nên không fade được (nhạc vào thẳng âm lượng đầy); WebAudio không dùng vì
 * createMediaElementSource trả về im lặng với file:// trên Chrome.
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, AC = App.config.audio;
  var A = App.audio = { ready: false, failed: false, muted: false, started: false, blocked: false, unlocked: false, progress: 0 };
  var el = null, prepared = false, waiters = [], fade = { from: 0, to: 0, t: 0, dur: 1, on: false }, wasPlaying = false, blockedCb = null, memMuted = false;

  function getEl() { if (!el) el = document.getElementById('bgm'); return el; }
  function readMuted() { try { return window.sessionStorage.getItem('hh_muted') === '1'; } catch (e) { return memMuted; } }
  function saveMuted() { memMuted = A.muted; try { window.sessionStorage.setItem('hh_muted', A.muted ? '1' : '0'); } catch (e) { /* bị chặn: dùng biến tạm */ } }
  A.muted = readMuted();

  function notify(done, ok) {
    for (var i = 0; i < waiters.length; i++) { if (waiters[i].prog) waiters[i].prog(A.progress); if (done && waiters[i].done) waiters[i].done(ok); }
    if (done) waiters.length = 0;
  }
  function finish(ok) {
    if (A.ready || A.failed) return;
    A.ready = ok; A.failed = !ok; A.progress = 1;
    notify(true, ok);
  }

  A.prepare = function () {
    var a = getEl();
    if (prepared) return;
    prepared = true;
    if (!a) { finish(false); return; }
    try {
      a.loop = true; a.preload = 'auto'; a.volume = 0; a.muted = A.muted;
      a.addEventListener('canplaythrough', function () { finish(true); });
      a.addEventListener('error', function () { if (!A.ready) finish(false); A.failed = true; });
      a.addEventListener('progress', function () {
        if (A.ready || !a.duration || !a.buffered.length) return;
        A.progress = Math.min(0.98, a.buffered.end(a.buffered.length - 1) / a.duration); notify(false);
      });
      a.src = AC.src;                                            // MỘT chỗ duy nhất: config.audio.src
      a.load();
      setTimeout(function () { if (!A.ready && !A.failed) finish(a.readyState >= 3); }, 14000);
    } catch (e) { finish(false); }
  };
  A.load = function (onProg, onDone) {
    A.prepare();
    if (A.ready || A.failed) { if (onProg) onProg(1); if (onDone) onDone(A.ready); return; }
    waiters.push({ prog: onProg, done: onDone });
  };

  /** Gọi trực tiếp trong handler click/Enter: mở khoá phát âm thanh về sau (Safari/Chrome). */
  A.unlock = function () {
    var a = getEl();
    if (!a || A.unlocked || A.failed) return;
    try {
      a.volume = 0;
      var p = a.play();
      if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; A.unlocked = true; }, function () { /* sẽ hiện nút "Chạm để bật nhạc" */ });
      else { a.pause(); A.unlocked = true; }
    } catch (e) { /* bỏ qua */ }
  };

  function fadeTo(v, dur) {
    var a = getEl();
    fade.from = a ? a.volume : 0; fade.to = v; fade.t = 0; fade.dur = Math.max(0.01, dur); fade.on = true;
  }
  A.start = function () {
    var a = getEl();
    if (!a || A.failed) return;
    try {
      a.muted = A.muted; a.volume = 0; a.currentTime = 0;
      var p = a.play();
      var ok = function () { A.started = true; A.blocked = false; wasPlaying = true; fadeTo(AC.volume, AC.fadeIn); };
      var no = function () { A.blocked = true; if (blockedCb) blockedCb(); };
      if (p && p.then) p.then(ok, no); else ok();
    } catch (e) { A.blocked = true; if (blockedCb) blockedCb(); }
  };
  A.onBlocked = function (fn) { blockedCb = fn; };

  A.setMuted = function (m) {
    var a = getEl();
    A.muted = !!m; saveMuted();
    if (a) a.muted = A.muted;
  };
  A.toggle = function () { A.setMuted(!A.muted); return A.muted; };

  A.pause = function () {                                        // tab ẩn: tạm dừng ngay (rAF cũng dừng nên không fade-out)
    var a = getEl();
    if (!a || !A.started) return;
    wasPlaying = !a.paused; fade.on = false;
    try { a.pause(); } catch (e) { /* bỏ qua */ }
  };
  A.resume = function () {                                       // quay lại: phát tiếp và fade-in
    var a = getEl();
    if (!a || !A.started || !wasPlaying || A.failed) return;
    try {
      a.volume = 0;
      var p = a.play();
      if (p && p.then) p.then(function () { fadeTo(AC.volume, AC.resumeFade); }, function () { A.blocked = true; if (blockedCb) blockedCb(); });
      else fadeTo(AC.volume, AC.resumeFade);
    } catch (e) { /* bỏ qua */ }
  };
  A.restart = function () {                                      // "Xem lại": cùng một phần tử audio → không chồng nhạc
    var a = getEl();
    if (!a || A.failed) return;
    fade.on = false;
    try { a.pause(); a.currentTime = 0; } catch (e) { /* bỏ qua */ }
    A.started = false;
    A.start();
  };

  A.update = function (dt) {
    if (!fade.on) return;
    var a = getEl();
    if (!a) { fade.on = false; return; }
    fade.t += dt;
    var u = U.clamp(fade.t / fade.dur, 0, 1);
    a.volume = U.clamp(fade.from + (fade.to - fade.from) * U.ease.inOutSine(u), 0, 1);
    if (u >= 1) fade.on = false;
  };
})();
