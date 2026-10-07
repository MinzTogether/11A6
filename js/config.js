/* ============================================================================
 * js/config.js – TẤT CẢ tham số chỉnh được của cảnh (chú thích tiếng Việt).
 * Toạ độ cảnh dùng hệ ảo 1920×1080; các giá trị dạng tỉ lệ (0..1) là % khung hình.
 * Bảng keyframe dạng [[giây, giá_trị], ...] được nội suy mượt theo timeline.
 * ========================================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  App.config = {
    DEBUG: false,              // true (hoặc ?debug=1): hiện bảng FPS, bật phím mũi tên để tua
    maxDt: 0.05,               // dt tối đa mỗi khung (giây) để không "nhảy" khi tab bị treo

    /* ---- Âm thanh: ĐƯỜNG DẪN NHẠC CHỈ ĐỔI Ở ĐÂY ---- */
    audio: {
      src: 'music.mp3',        // file nhạc đặt cùng thư mục với index.html
      volume: 0.7,             // âm lượng tối đa 0..1
      fadeIn: 3,               // giây fade-in khi cảnh chính bắt đầu
      resumeFade: 1.2,         // giây fade-in khi quay lại tab
      hideFade: 0.4            // giây fade-out khi tab bị ẩn
    },

    virtual: { w: 1920, h: 1080 },

    /* ---- Bảng màu ---- */
    palette: {
      pink: '#FFC1D6', rose: '#F48FB1', ivory: '#FFF8F0', orange: '#FF9A4D', gold: '#FFD27A',
      violet: '#6A3D86', night: '#1D1B4A', leaf: '#7FBF7A',
      stickman: '#2A2438', fireflyA: '#D9FF7A', fireflyB: '#FFF3A0',
      shadow: '#3A2150'        // màu bóng đổ: tím đậm (không dùng đen thuần)
    },

    /* ---- Bố cục (tỉ lệ khung hình) ---- */
    layout: {
      horizonY: 0.71,                                   // đường chân trời
      treeX: 0.39, treeBaseY: 0.80,                     // gốc cây
      stickmanY: 0.815,                                 // mặt đất nơi stickman đi/ngồi
      sunX: 0.14,                                       // mặt trời bên trái
      wishZone: { x0: 0.58, y0: 0.38, x1: 0.90, y1: 0.68 }, // vùng đặt lời chúc: KHÔNG đặt vật cản
      pondRect: { x0: 0.02, y0: 0.86, x1: 0.46, y1: 0.99 }  // ao sen tiền cảnh
    },

    /* ---- Mốc thời gian (giây) ---- */
    timeline: {
      wishAt: 66,                                       // lời chúc hiện ra
      phases: [['intro', 0], ['sprout', 3], ['grow', 8], ['bloom', 26], ['finish', 38], ['walk', 46], ['zoom', 58], ['wish', 66]],
      sproutStart: 3, growStart: 8, growEnd: 26,        // nảy mầm, thân vươn lên
      firstBloomAt: 16, bloomMassStart: 26, bloomMassEnd: 38, // nụ đầu tiên, hoa bung hàng loạt
      windAt: 38,                                       // gió nổi, đom đóm xuất hiện
      walkStart: 46, walkEnd: 58,                       // stickman đi vào và ngồi
      zoomStart: 58, zoomEnd: 66                        // camera zoom cuối
    },

    /* ---- Các đại lượng môi trường theo thời gian (nội suy mượt, không bật/tắt) ---- */
    env: {
      sunAlt:       [[0, 50], [26, 26], [40, 10], [60, 2.5]],            // độ cao mặt trời (độ)
      dusk:         [[0, 0], [26, 0.3], [40, 0.8], [60, 1]],             // mức hoàng hôn 0..1
      night:        [[0, 0], [38, 0.04], [48, 0.22], [60, 0.62], [66, 0.7]], // độ tối (đom đóm, sao)
      windStrength: [[0, 0.05], [26, 0.1], [38, 0.22], [46, 0.8], [66, 1]],  // cường độ gió
      godRays:      [[0, 0], [26, 0.15], [40, 0.7], [60, 1]],            // độ sáng tia nắng
      shadowLen:    [[0, 0.35], [26, 0.9], [40, 1.8], [60, 3.2]],        // độ dài bóng (hệ số)
      petalRate:    [[0, 0], [15.9, 0], [18, 0.12], [26, 0.45], [38, 0.8], [46, 1], [66, 1]], // mật độ cánh rơi
      fireflies:    [[0, 0], [37.9, 0], [42, 0.3], [52, 0.7], [66, 1]],  // lượng đom đóm
      stars:        [[0, 0], [48, 0], [60, 0.7], [70, 1]],               // sao mờ cuối cảnh
      grassGrow:    [[0, 0], [4, 0], [8, 0.4], [20, 1]],                 // cỏ mọc dần
      warmth:       [[0, 0], [26, 0.4], [40, 0.8], [60, 1]],             // độ ấm color grading
      vignette:     [[0, 0.16], [58, 0.26], [66, 0.55]],                 // độ đậm vignette
      fade:         [[0, 0], [3, 1]]                                     // fade-in đầu cảnh
    },

    /* ---- Bầu trời: 4 tầng màu theo keyframe (0s / 26s / 40s / 60s) ---- */
    sky: {
      top:     [[0, '#4AA8E8'], [26, '#5E9ED8'], [40, '#3B3A7A'], [60, '#1D1B4A']],
      mid:     [[0, '#8CCBF2'], [26, '#C7C4D8'], [40, '#C9568A'], [60, '#4A3278']],
      low:     [[0, '#BFE3FA'], [26, '#FFD9A0'], [40, '#FF9A6B'], [60, '#B8527A']],
      horizon: [[0, '#E8F6FF'], [26, '#FFC27A'], [40, '#FFB347'], [60, '#F27A54']],
      sunColor: [[0, '#EAF6FF'], [26, '#FFE9B0'], [40, '#FFB070'], [60, '#FF7A4A']], // trắng xanh → vàng → cam đỏ
      sunRadius: 46,                                     // bán kính đĩa mặt trời (đơn vị ảo)
      cloudLayers: 3, cloudDrift: 6,                     // số lớp mây, tốc độ trôi (px/s)
      hillLayers: 4                                      // số lớp đồi/núi xa
    },

    /* ---- Chất lượng (tự hạ mức khi FPS thấp, không tự nâng lại) ---- */
    quality: {
      order: ['high', 'mid', 'low'],
      start: 'high', mobileStart: 'mid',
      fpsFloor: 45, fpsWindow: 2,                        // dưới 45fps trung bình trong 2 giây → hạ một mức
      levels: {
        high: { flowers: 3800, flying: 350, fireflies: 90, grass: 800, grassStatic: 2600, godRays: 10, dprMax: 2,   bloomScale: 0.5,  rayScale: 0.5 },
        mid:  { flowers: 2200, flying: 220, fireflies: 60, grass: 500, grassStatic: 1800, godRays: 7,  dprMax: 1.5, bloomScale: 0.4,  rayScale: 0.4 },
        low:  { flowers: 1100, flying: 110, fireflies: 40, grass: 250, grassStatic: 1000, godRays: 4,  dprMax: 1,   bloomScale: 0.3,  rayScale: 0.3 }
      }
    },

    /* ---- Cây anh đào ---- */
    tree: {
      seedIndex: 1,                                      // chọn trong App.utils.TREE_SEEDS (0..5); 1 = tán rộng, lệch phải
      depth: 8,                                          // độ sâu đệ quy (7–9)
      children: { min: 2, max: 3, pThree: 0.35 },        // số nhánh con, xác suất có nhánh thứ ba
      lengthRatio: [0.68, 0.8],                          // tỉ lệ dài con/cha
      angleDeg: [16, 38],                                // góc rẽ so với nhánh cha (độ)
      lean: 0.22,                                        // thiên hướng tán lệch sang phải (0..1)
      lightBias: 0.12,                                   // thiên hướng vươn lên phía ánh sáng
      droop: 0.22,                                       // độ rủ của cành mảnh
      trunkHeight: 300, trunkWidth: 54,                  // chiều cao/độ dày thân (đơn vị ảo)
      fitTop: 0.1,                                       // đỉnh tán không cao quá mức này (tỉ lệ chiều cao khung); thân tự co lại cho vừa
      lowest: 0.5,                                       // ngọn cành cấp ≥3 không thấp hơn mức này (tỉ lệ chiều cao khung)
      rootFlare: 1.7, rootCount: 4,                      // chân rễ nở rộng, số rễ nổi
      childStart: [0.7, 0.85],                           // nhánh con bắt đầu khi cha đạt 70–85%
      bloomDelayPerDepth: 0.55,                          // trễ nở hoa theo độ sâu cành (giây) → sóng lan ra ngoài
      budDuration: [1.2, 2.6],                           // nụ → hé → nở trọn (giây)
      clearMargin: 24                                    // lề an toàn quanh vùng lời chúc
    },

    /* ---- Gió ---- */
    wind: {
      baseSpeed: 34,                                     // gió nền trái → phải (px/s ở cường độ 1)
      baseAngleDeg: -6,                                  // hơi hướng lên
      curlScale: 0.0016, curlSpeed: 0.12, curlAmp: 30,   // curl noise không gian–thời gian
      gust: { interval: [4, 9], attack: 1, hold: 1.5, release: 2, amp: 85 }, // đợt gió giật
      sway: { ampDeg: 1.5, freq: 0.85, lag: 0.55, thinBoost: 2.4, fineJitter: 0.25, spring: { k: 38, c: 5 } },
      clickPulse: { enabled: true, radius: 230, strength: 460, duration: 1.2 } // chạm màn hình → xung gió
    },

    /* ---- Cánh hoa & lá rơi ---- */
    petals: {
      fall: [40, 110],                                   // vận tốc rơi giới hạn (px/s) tuỳ khối lượng
      mass: [0.6, 1.4], flutterAmp: [18, 42],            // khối lượng, biên độ lắc ngang
      layers: { back: 0.25, mid: 0.5, front: 0.25 },     // tỉ lệ hạt: sau cây / giữa / trước cây
      groundMax: 700,                                    // số cánh tối đa tích tụ trên đất
      leafShare: 0.22, leafFrom: 38                      // tỉ lệ lá rơi và thời điểm bắt đầu
    },

    /* ---- Mặt đất, cỏ, hoa dại ---- */
    ground: {
      daisies: 38, dandelions: 14, roseBushes: 2, hydrangeas: 2,
      dappledSpots: 28,                                  // đốm sáng lọt kẽ lá
      seed: 777
    },

    /* ---- Ao sen ---- */
    pond: { lotus: 6, pads: 9, ripplesMax: 28, glitter: 120, seed: 424 },

    /* ---- Stickman ---- */
    stickman: {
      heightPx: 150, lineRatio: 0.05,                    // chiều cao ảo, độ dày nét theo chiều cao
      enterAt: 46, startX: -90,                          // thời điểm vào, vị trí xuất phát (đơn vị ảo)
      sitX: 0.352,                                       // chỗ ngồi (tỉ lệ W), bên trái gốc cây
      walkSpeed: 132,                                    // tốc độ đi (px/s ảo)
      decelTime: 2.0, pauseTime: 0.25,                   // giảm tốc, dừng trước khi quay
      turnTime: 0.8, sitTime: 2.2,                       // quay người, hạ người ngồi
      bobRatio: 0.03, leanDeg: 3, armSwingDeg: 25,       // nhấp nhô, nghiêng thân, vung tay
      breathHz: 0.4, headUpDeg: 6                        // hơi thở, ngẩng đầu khi ngồi
    },

    /* ---- Đom đóm ---- */
    fireflies: {
      startAt: 38, blink: [0.8, 2.5], rest: [0.2, 1.2],  // chu kỳ nhấp nháy, quãng nghỉ (giây)
      nearShare: 0.25, aroundStickman: 0.3, aroundPond: 0.25,
      seed: 99
    },

    /* ---- Camera ---- */
    camera: {
      parallax: { sky: 0.05, far: 0.1, mid: 0.25, world: 1, fore: 1.25, grass: 1.4 },
      breath: { zoomFrom: 1.0, zoomTo: 1.06, zoomUntil: 58, osc: 0.004, oscPeriod: 9, posAmp: 3, posPeriod: 13 },
      final: { start: 58, end: 66, zoom: 1.8, rotDeg: 1.2, swayDeg: 0.25, swayPeriod: 11 }, // zoom cuối
      focus: { x: 0.72, y: 0.52 },                       // tâm vùng đặt lời chúc
      rack: { blurPx: 5 },                               // mờ tiền cảnh (rack focus) ở cuối
      portrait: { aspectFrom: 1.0, aspectTo: 0.6, zoomOut: 0.72, centerX: 0.44, centerY: 0.52 } // màn dọc
    },

    /* ---- Hậu kỳ ---- */
    postfx: {
      grain: 0.04, grainSize: 1,                         // film grain rất nhẹ
      warmColor: '#FFB070', warmStrength: 0.12,          // color grading ấm
      vignetteColor: '#1D1B4A',                          // vignette tím đêm (không đen thuần)
      bloomThreshold: 0.62, bloomStrength: 0.55
    },

    /* ---- Lời chúc ({tên} được thay bằng tên người dùng) ---- */
    wish: {
      startDelay: 0.6, lineGap: 1.05, wordGap: 0.16,     // giây
      lines: [
        { text: 'Gửi {tên},', words: true },
        { text: 'Chúc {tên} ngày 20/10 thật rạng rỡ như hoa sen, dịu dàng như hoa anh đào.' },
        { text: 'Mong mọi điều bình yên, hạnh phúc và may mắn luôn nở rộ trên hành trình của bạn.' },
        { text: 'Happy Vietnamese Women\u2019s Day 20/10!', title: true }
      ]
    },

    /* ---- Màn hình chờ ---- */
    loading: {
      weights: { font: 0.10, music: 0.25, sprites: 0.20, tree: 0.15, cache: 0.15, warmup: 0.15 }, // tổng = 1
      minTime: 3, maxTime: 15,                           // chờ tối thiểu / tối đa (giây)
      texts: [[0, 'Đang gieo hạt…'], [0.35, 'Đang pha màu hoàng hôn…'], [0.7, 'Đang vẽ từng cánh hoa…'], [0.88, 'Đang thắp đom đóm…']],
      musicFail: 'Không tải được nhạc'
    },

    /* ---- Giảm chuyển động (prefers-reduced-motion) ---- */
    reduced: { particles: 0.5, cameraShake: false }
  };
})();
