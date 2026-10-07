/* ============================================================================
 * js/timeline.js – Master timeline điều phối mọi thứ theo thời gian t (giây).
 *  - TL.t, TL.playing, TL.update(dt), TL.seek(t), TL.reset(), TL.start(), TL.pause(), TL.resume()
 *  - TL.env: các đại lượng môi trường (hoàng hôn, gió, tia nắng, đom đóm...) tính MỘT lần mỗi khung
 *    từ bảng keyframe trong config.env, nội suy mượt (không bật/tắt đột ngột)
 *  - TL.range(a, b, easeFn): tiến độ 0..1 của cửa sổ [a,b]; TL.key(keys, easeFn)
 *  - TL.cue(giây, fn): gọi fn một lần khi t đi qua mốc; TL.on('seek'|'reset', fn)
 * ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  var U = App.utils, C = App.config, CT = C.timeline;
  var envCfg = C.env, names = Object.keys(envCfg);
  var env = { t: 0 }, cues = [], handlers = {}, nextId = 1, i;
  for (i = 0; i < names.length; i++) env[names[i]] = 0;

  function computeEnv(t) {
    env.t = t;
    for (var k = 0; k < names.length; k++) env[names[k]] = U.keyNum(envCfg[names[k]], t);
  }

  function emit(evt, a) {
    var list = handlers[evt];
    if (!list) return;
    for (var k = 0; k < list.length; k++) list[k](a);
  }

  var TL = App.timeline = {
    t: 0,
    wishAt: CT.wishAt,
    playing: false,
    speed: 1,
    env: env,

    /** Về 0, dừng, bật lại mọi cue (dùng cho "Xem lại"); không xoá cue đã đăng ký. */
    reset: function () {
      TL.t = 0; TL.playing = false;
      for (var k = 0; k < cues.length; k++) cues[k].fired = false;
      computeEnv(0);
      emit('reset');
    },
    start: function () { TL.playing = true; },
    pause: function () { TL.playing = false; },
    resume: function () { TL.playing = true; },

    /** Tiến thời gian; trả về t hiện tại. Gọi mỗi khung với dt đã giới hạn. */
    update: function (dt) {
      if (!TL.playing) return TL.t;
      TL.t = Math.min(TL.t + dt * TL.speed, 36000);
      computeEnv(TL.t);
      for (var k = 0; k < cues.length; k++) {
        var c = cues[k];
        if (!c.fired && c.time <= TL.t) { c.fired = true; c.fn(false); }
      }
      return TL.t;
    },

    /** Nhảy tới mốc t (kiểm thử ?t=45): cue bị bỏ qua được gọi với tham số true; cue phía sau được bật lại. */
    seek: function (t) {
      TL.t = Math.max(0, Math.min(t, 36000));
      computeEnv(TL.t);
      for (var k = 0; k < cues.length; k++) {
        var c = cues[k];
        if (c.time <= TL.t) { if (!c.fired) { c.fired = true; c.fn(true); } }
        else c.fired = false;
      }
      emit('seek', TL.t);
    },

    /** Tiến độ 0..1 của cửa sổ [a,b] tại thời điểm hiện tại; truyền easeFn để làm mượt (bắt buộc cho thứ nhìn thấy). */
    range: function (a, b, ef) {
      var u = U.clamp((TL.t - a) / (b - a), 0, 1);
      return ef ? ef(u) : u;
    },
    /** Giá trị tại thời điểm hiện tại của bảng keyframe số [[t, v], ...]. */
    key: function (keys, ef) { return U.keyNum(keys, TL.t, ef); },

    /** Tên giai đoạn hiện tại: intro, sprout, grow, bloom, finish, walk, zoom, wish. */
    phase: function () {
      var p = CT.phases, name = p[0][0];
      for (var k = 0; k < p.length; k++) if (TL.t >= p[k][1]) name = p[k][0];
      return name;
    },

    /** Đăng ký cue; trả về id. fn(seeked) – seeked = true nếu bị gọi do tua. */
    cue: function (time, fn) {
      var id = nextId++;
      cues.push({ id: id, time: time, fn: fn, fired: TL.t >= time });
      return id;
    },
    clearCues: function () { cues.length = 0; },
    on: function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
    off: function (evt, fn) {
      var list = handlers[evt];
      if (!list) return;
      var k = list.indexOf(fn);
      if (k >= 0) list.splice(k, 1);
    }
  };

  computeEnv(0);
})();
