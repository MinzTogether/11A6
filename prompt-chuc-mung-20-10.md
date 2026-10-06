# PROMPT: Website chúc mừng 20/10 – "Hoàng hôn dưới tán anh đào"

> **Cách dùng:** Gửi nguyên văn nội dung bên dưới cho AI, đính kèm file nhạc nền (đổi tên thành `music.mp3`, hoặc nói rõ tên file).

---

## 0. VAI TRÒ & MỤC TIÊU

Bạn là một **Creative Developer kiêm Technical Artist** hàng đầu về đồ hoạ web. Hãy xây dựng một trang web chúc mừng **Ngày Phụ nữ Việt Nam 20/10** có chất lượng như một đoạn phim hoạt hình điện ảnh dài khoảng 65 giây.

**Thước đo thành công:**
1. Người xem cảm nhận được sự yên bình, ấm áp, lãng mạn ngay từ vài giây đầu.
2. Mọi chuyển động đều mềm, có quán tính và có easing. Không có chuyển động tuyến tính, không giật, không "cứng", không giống template.
3. Ánh sáng hoàng hôn có chiều sâu thật: có hướng sáng, bóng đổ, rim light, tia nắng, tán xạ khí quyển.
4. Chạy mượt khoảng 60fps trên máy tầm trung, và vẫn chạy ổn trên điện thoại.

**Ưu tiên:** ĐỒ HOẠ và CHUYỂN ĐỘNG là số 1. Khi phải đánh đổi, hãy giữ chất lượng thị giác ở những vùng mắt người nhìn nhiều nhất (cây, bầu trời, stickman, chữ chúc).

---

## 1. CÔNG NGHỆ & KIẾN TRÚC

### 1.1 Nguyên tắc
- **HTML + CSS + JavaScript thuần**, không dùng framework nặng, không dùng ảnh ngoài. Toàn bộ hình ảnh được vẽ **procedural** bằng Canvas 2D nhiều lớp (có thể dùng WebGL cho hạt/phát sáng nếu thật sự cần, nhưng phải có phương án dự phòng).
- **Phải chạy được khi mở trực tiếp `index.html` bằng `file://`**: không dùng ES module (`type="module"`), không dùng `fetch` tới file cục bộ. Dùng thẻ `<script src>` cổ điển với một namespace toàn cục (ví dụ `window.App`).
- Chữ chúc và UI dùng **DOM overlay** (chữ sắc nét ở mọi mức zoom), đồ hoạ cảnh dùng Canvas.
- Vòng lặp `requestAnimationFrame` dùng **delta-time** (giới hạn dt tối đa khoảng 50ms để không "nhảy" khi tab bị treo).
- Dùng **bộ sinh số ngẫu nhiên có seed** (mulberry32 hoặc tương đương) để cây và cảnh luôn đẹp và lặp lại được. Kèm một vài seed đã chọn sẵn cho hình dáng cây đẹp.
- Có sẵn hàm tiện ích: easing (easeInOutCubic, easeOutBack, easeOutExpo, smoothstep), `lerp`, `clamp`, `remap`, nội suy màu, **simplex/value noise 2D/3D**, **curl noise**.

### 1.2 Cấu trúc file
```
/index.html
/style.css
/music.mp3                (file tôi gửi kèm)
/js/utils.js              (easing, noise, rng, màu)
/js/config.js             (TẤT CẢ tham số chỉnh được)
/js/timeline.js
/js/camera.js
/js/sky.js                (trời, mặt trời, mây, núi, sương, ánh sáng)
/js/tree.js               (thân, cành, hoa, lá)
/js/wind.js
/js/petals.js             (cánh hoa và lá rơi)
/js/ground.js             (đất, cỏ, hoa dại, bồ công anh)
/js/pond.js               (ao sen)
/js/stickman.js
/js/fireflies.js
/js/postfx.js             (bloom giả, vignette, grain, color grading)
/js/audio.js
/js/ui.js                 (overlay nhập tên, loading, lời chúc, nút)
/js/main.js
```

### 1.3 Thứ tự vẽ các lớp (từ xa đến gần, mỗi lớp có hệ số parallax riêng)
1. Bầu trời gradient + sao mờ (xuất hiện cuối cảnh)
2. Mặt trời + bloom + lens flare
3. Mây (2–3 lớp)
4. Núi/đồi xa (3–4 lớp, càng xa càng nhạt và xanh) + dải sương
5. Đồng cỏ phía sau, bóng đổ dài của cây trên mặt đất
6. Cánh hoa rơi **lớp sau cây** (mờ nhẹ)
7. Cây anh đào: thân → cành → tán hoa (nhiều lớp độ sâu)
8. Stickman + bóng của stickman
9. Cánh hoa/lá rơi **lớp giữa**
10. Cỏ, hoa dại, ao sen ở tiền cảnh
11. Đom đóm (nhiều lớp độ sâu)
12. Cánh hoa rơi **lớp trước** (to, mờ, lướt gần camera)
13. God rays + đốm sáng (blend `lighter`/`screen`)
14. Post FX: color grading ấm, vignette, film grain rất nhẹ
15. DOM overlay: lời chúc, nút, UI

### 1.4 Cache và hiệu năng
- Tạo sẵn **sprite trên offscreen canvas**: cánh hoa (nhiều hình dạng, nhiều màu, 3 mức mờ theo độ sâu), cụm hoa anh đào, nụ hoa, lá, đom đóm (quầng sáng), cánh bồ công anh, giọt nước.
- Phần **gỗ của cây đã mọc xong** và các lớp tĩnh (núi, mây nền, đồng cỏ) phải được cache. Cache cần được dựng ở độ phân giải **đủ cho mức zoom tối đa** (hoặc dựng lại khi dừng zoom) để **không bị vỡ hình khi camera zoom**.
- Hỗ trợ `devicePixelRatio` (giới hạn tối đa 2), resize có debounce và **không reset timeline** khi đổi kích thước.
- **Ba mức chất lượng** (high / mid / low). Theo dõi FPS trung bình trong 2 giây; nếu dưới 45fps thì tự hạ một mức (giảm số hạt, số hoa, độ phân giải god rays/bloom, DPR), nếu ổn định thì giữ nguyên, không nâng lên lại để tránh nhấp nháy.
- Không tạo object mới trong vòng lặp nóng (dùng object pool cho hạt). Không rò rỉ bộ nhớ khi bấm "Xem lại".

---

## 2. BỐ CỤC CẢNH (rất quan trọng)

Dùng **hệ toạ độ ảo 1920×1080**, scale vừa khít theo màn hình (cover), có xử lý riêng cho màn dọc của điện thoại (zoom nhẹ ra, dịch cây vào giữa hơn).

| Thành phần | Vị trí gợi ý (theo % khung hình) |
|---|---|
| Đường chân trời | y ≈ 70–72% |
| Gốc cây anh đào | x ≈ 38–40%, đứng trên mặt đất |
| Tán cây | Rộng, **lệch sang phải** để tạo khoảng trống rộng bên dưới tán ở phía phải |
| Mặt trời | Bên **trái**, thấp dần về chân trời (x ≈ 10–18%) |
| Hướng đổ bóng | Sang **phải** (ngược hướng mặt trời) |
| Stickman | Ngồi ở **bên trái gốc cây** (phía hướng về mặt trời), lưng tựa vào thân, nhìn về phía hoàng hôn |
| Ao sen | Tiền cảnh **góc dưới trái đến giữa**, không che stickman |
| **Vùng đặt lời chúc** | Khoảng trống **bên phải, dưới tán cây** (x ≈ 58–90%, y ≈ 38–68%). **Không đặt hoa to, cánh hoa lớn hay vật cản nào che vùng này** |
| Điểm focus của camera cuối | Tâm vùng đặt lời chúc (x ≈ 72%, y ≈ 52%) |

---

## 3. PHONG CÁCH & BẢNG MÀU

- **Chủ đạo:** hoa anh đào và hoa sen. **Bổ sung:** cúc họa mi, hoa hồng, cẩm tú cầu, bồ công anh, cỏ dại có hoa nhỏ.
- **Bảng màu:** hồng phấn `#FFC1D6`, hồng đậm `#F48FB1`, trắng ngà `#FFF8F0`, cam hoàng hôn `#FF9A4D`, vàng nắng `#FFD27A`, tím dịu `#6A3D86`, tím đêm `#1D1B4A`, xanh lục mềm `#7FBF7A`.
- **Cảm giác:** yên bình, ấm áp, lãng mạn, như tranh minh hoạ điện ảnh. Tránh màu bão hoà gắt, ưu tiên sắc độ mềm, gradient mượt.

---

## 4. LUỒNG TRẢI NGHIỆM

### Bước 1 – Overlay nhập tên
- Toàn màn hình phủ mờ (**backdrop-filter blur**) trên nền cảnh trang trí nhẹ: gradient hồng-tím, vài cánh hoa anh đào bay chậm phía sau, một bông sen/anh đào vẽ procedural đang khẽ đung đưa.
- Hộp thoại **glassmorphism**: viền gradient mảnh, bo góc lớn, đổ bóng mềm. Hiện ra bằng animation scale + fade có spring.
- Tiêu đề: "Chào bạn, bạn tên là gì?" (chữ viết tay) + dòng phụ nhỏ "Một món quà nhỏ cho ngày 20/10".
- Ô nhập: placeholder "Nhập tên của bạn…", **glow hồng khi focus**, tự focus khi mở.
- Nút **"Bắt đầu"**: hiệu ứng ripple khi bấm, hover nhấc nhẹ.
- Kiểm tra: không để trống (có hiệu ứng rung nhẹ + thông báo lỗi dịu), `trim`, gộp khoảng trắng thừa, tối đa **30 ký tự**.
- Hỗ trợ gõ tiếng Việt (Telex/VNI): **không gửi khi đang gõ dở** (kiểm tra `event.isComposing` và `compositionend` khi nhấn Enter). Nhấn Enter để gửi.
- Hiển thị tên chỉ bằng `textContent` (chống XSS), không dùng `innerHTML`.
- Có `aria-label`, điều hướng bàn phím, độ tương phản đủ.
- Cú click "Bắt đầu" là **cử chỉ người dùng** để mở khoá âm thanh (xem mục 7).

### Bước 2 – Màn hình chờ (tải thật)
- Hiệu ứng: **hoa sen nở dần theo % tiến độ** (các lớp cánh sen từ ngoài vào trong hé mở theo tiến độ), cánh hoa nhỏ rơi quanh, hiển thị % và dòng chữ đổi theo giai đoạn ("Đang gieo hạt…", "Đang pha màu hoàng hôn…", "Đang thắp đom đóm…").
- Tiến độ có **trọng số thật**: font (10%), nhạc (25%), tạo sprite (20%), sinh cấu trúc cây (15%), dựng cache trời/núi/mây (15%), render thử khởi động (15%).
- Thanh hiển thị đuổi theo tiến độ thật bằng easing, **không nhảy lùi**.
- **Chờ tối thiểu ~3 giây** và chỉ vào cảnh khi mọi thứ sẵn sàng. Nếu nhạc lỗi hoặc quá 15 giây thì vẫn cho vào cảnh và báo nhẹ "Không tải được nhạc".
- Khi xong: hoa sen nở trọn, flash sáng dịu, rồi **cross-fade điện ảnh** sang cảnh chính.

### Bước 3 – Timeline chính (~66 giây)
Một **master timeline** điều phối tất cả. Mọi giá trị (màu trời, vị trí mặt trời, số hạt, cường độ gió, camera) đều là hàm của thời gian được nội suy mượt, không "bật/tắt" đột ngột.

| Thời gian | Sự kiện |
|---|---|
| 0–3s | Fade-in. Ban ngày trong trẻo, trời xanh sáng, mây trắng trôi chậm. Một hạt giống nằm trên đất |
| 3–8s | Hạt nảy mầm: rễ nhỏ, mầm nhô lên khỏi đất, hai lá mầm hé, cỏ mọc dần quanh gốc |
| 8–26s | Thân vươn lên, **phân nhánh đệ quy**, thân thon dần, nhánh lớn lên từ gốc đến ngọn. Trời chuyển dần từ xanh sáng sang nắng vàng chiều |
| 16s trở đi | Nụ hoa xuất hiện ở các đầu cành rồi nở dần (nụ → hé → nở trọn). **Cánh hoa bắt đầu rơi từ bông đầu tiên nở** và tăng mật độ dần |
| 26–38s | Hoa bung nở hàng loạt, tán cây dày và đồ sộ. Hoàng hôn buông: cam, hồng, tím. Mặt trời hạ thấp, bóng dài ra |
| 38–46s | Cây hoàn thiện. **Gió nổi lên**, cành đung đưa, cánh hoa và lá rơi bay theo gió. Đom đóm bắt đầu xuất hiện |
| 46–58s | **Stickman** đi vào từ mép trái, đi chậm lại khi tới gần, quay người, ngồi xuống dựa lưng vào gốc cây, ngắm hoàng hôn |
| 58–66s | **Camera zoom** (dolly mượt, hơi lệch góc, có chiều sâu) vào khoảng trống bên phải dưới tán cây |
| 66s trở đi | **Lời chúc** hiện ra với tên người dùng. Cảnh vẫn "sống" (gió, hoa rơi, đom đóm) |

---

## 5. YÊU CẦU ĐỒ HOẠ CHI TIẾT

### 5.1 Bầu trời & ánh sáng hoàng hôn (TRỌNG TÂM)

**Bầu trời:** gradient 4 tầng, nội suy theo timeline giữa các keyframe:

| Mốc | Đỉnh trời | Giữa | Gần chân trời | Chân trời |
|---|---|---|---|---|
| Ban ngày (0s) | `#4AA8E8` | `#8CCBF2` | `#BFE3FA` | `#E8F6FF` |
| Chiều vàng (26s) | `#5E9ED8` | `#C7C4D8` | `#FFD9A0` | `#FFC27A` |
| Hoàng hôn (40s) | `#3B3A7A` | `#C9568A` | `#FF9A6B` | `#FFB347` |
| Chạng vạng (60s) | `#1D1B4A` | `#4A3278` | `#B8527A` | `#F27A54` |

**Mặt trời:** ở bên trái, độ cao giảm dần theo timeline (từ khoảng 50° xuống gần chân trời). Có đĩa sáng, **bloom** nhiều lớp, **lens flare** nhẹ (vài vòng sáng mờ dọc theo trục mặt trời đến tâm màn hình), quầng sáng lớn tán xạ trong khí quyển. Nhiệt độ màu của nguồn sáng chuyển từ trắng xanh sang vàng rồi cam đỏ.

**Mây:** 2–3 lớp mây procedural (nhiều đốm mềm chồng nhau, noise). Phần dưới mây hứng nắng nhuộm cam-hồng, phần trên tím nhạt, viền sáng (silver lining). Mây trôi chậm theo gió, parallax khác nhau.

**Núi/đồi xa:** 3–4 lớp đường chân đồi sinh bằng noise, càng xa càng nhạt, xanh và nhoè (tán xạ khí quyển), có **dải sương** mỏng ở chân đồi lấy màu từ chân trời.

**Ánh sáng lên cảnh vật (làm rõ ràng, nhất quán):**
- **Rim light:** phần cây, cánh hoa, stickman hướng về mặt trời có viền sáng cam ấm; phần khuất ngả tím lạnh. Thực hiện bằng một lượt vẽ lại với `source-atop` hoặc gradient định hướng.
- **Cánh hoa trong mờ (translucency):** cánh hoa nằm giữa mặt trời và camera sáng hơn, ấm hơn, hơi trong suốt.
- **God rays (tia nắng thể tích):** 6–10 chùm sáng xuyên qua khe tán lá, dùng blend `screen`/`lighter`, độ sáng dao động rất chậm theo noise, **mạnh dần khi hoàng hôn**, hướng toả ra từ mặt trời.
- **Đốm sáng lọt qua kẽ lá** (dappled light) trên mặt đất: dùng một "gobo" tạo từ hình dạng tán lá, hơi chuyển động theo gió.
- **Bóng đổ:** bóng của cây, stickman, bụi hoa, cỏ **đổ dài và mềm sang phải**. Chiếu bóng bằng phép skew + scaleY từ chính silhouette đã cache, làm mờ nhiều lượt với alpha thấp, **độ dài tăng dần khi mặt trời hạ**, nhạt dần theo khoảng cách. Màu bóng tím đậm trong suốt (không dùng đen thuần).
- **Ánh sáng môi trường:** phần bóng đổ nhận ánh trời tím lạnh, vùng được chiếu nhận cam ấm. Mặt đất phản chiếu nhẹ màu trời.
- **Hậu kỳ:** color grading ấm, vignette nhẹ (đậm dần khi zoom cuối), film grain rất nhẹ, bloom giả cho vùng sáng.

### 5.2 Cây anh đào – thân và cành

- Sinh cấu trúc bằng **L-system/đệ quy**: mỗi nhánh là một object `{gốc, góc, chiều dài, độ dày, độ sâu, thời điểm bắt đầu, thời lượng, con[]}`. Độ sâu 7–9 cấp, mỗi nhánh có 2–3 nhánh con, tỉ lệ chiều dài con/cha 0.68–0.8, góc rẽ ngẫu nhiên có kiểm soát, thêm thiên hướng **vươn về phía ánh sáng** và hơi rủ xuống ở cành mảnh để ra dáng anh đào.
- **Tiến độ mọc riêng từng nhánh** (easeOutCubic); nhánh con bắt đầu khi nhánh cha đạt khoảng 70–85% để cây lớn lên hữu cơ chứ không đồng loạt.
- Mỗi nhánh vẽ thành **đa giác thon dần** theo đường cong Bézier nhẹ (không phải đoạn thẳng), gốc cây có **chân rễ nở rộng** và vài rễ nổi.
- **Vỏ cây:** màu nâu tím sẫm, thêm các nét vân dọc thân, vài mắt gỗ và vết sần ngang đặc trưng của anh đào. Mặt hướng nắng có viền cam ấm, mặt khuất ngả tím.
- Khi cây mọc xong, **cache phần thân và cành chính**; chỉ vẽ động phần cành nhỏ và cụm hoa để giữ hiệu năng.
- **Lắc theo gió:** góc lệch tích luỹ qua các cấp tổ tiên, `A · sin(ωt + φ + độ_sâu · độ_trễ) · hệ_số_gió`, **trễ pha tăng dần về phía ngọn**, cành mảnh lắc nhiều hơn cành to, có thêm dao động nhỏ tần số cao khi gió giật. Cành trở về vị trí cũ theo kiểu lò xo giảm chấn.

### 5.3 Hoa anh đào

- **Sprite hoa:** 5 cánh có khía nhẹ ở đầu cánh, gradient từ trắng ngà ở tâm đến hồng đậm hơn ở mép, có gân mờ, nhuỵ vàng-đỏ nhỏ. Tạo 4–6 biến thể (độ nở, màu, độ xoay) và **cụm hoa** (3–7 bông) để dựng tán nhanh.
- **Nụ hoa:** hình giọt nước hồng đậm, có đài hoa nhỏ, nở theo chuỗi: nụ kín → hé → xoè cánh (easeOutBack) → nở trọn. Mỗi bông có độ trễ ngẫu nhiên theo độ sâu của cành để hoa nở **theo đợt**, như sóng lan từ gốc ra ngoài.
- **Chiều sâu của tán:** 3 lớp độ sâu. Lớp trong tán đậm và dày, tông hồng tím; lớp giữa là hồng chuẩn; lớp rìa ngoài **sáng, thưa, trắng hồng** để tán trông bồng bềnh. Rìa tán có viền sáng ấm phía mặt trời.
- **Số lượng:** high 3000–4500 bông, mid 1800–2500, low 900–1300 (điều chỉnh trong `config.js`).
- Sau khi cây hoàn thiện, thêm **vài lá non** màu xanh-đồng rải rác để tự nhiên.
- Hoa trên cành lắc cùng cành (theo toạ độ đầu cành), có xoay nhẹ.

### 5.4 Cánh hoa & lá rơi (càng chân thực càng tốt)

- **Sinh ra từ chính các bông hoa trong tán** (không rơi từ mép trên màn hình), mật độ tăng dần theo timeline.
- **Vật lý:** mỗi hạt có vị trí (x, y, z), vận tốc, khối lượng, hệ số cản, kích thước, góc xoay và tốc độ xoay riêng. Lực: trọng lực, lực cản không khí (vận tốc rơi giới hạn ~40–110 px/s tuỳ khối lượng), gió nền, **curl noise** biến thiên theo thời gian và **các đợt gió giật** (mỗi 4–9 giây: tăng dần trong ~1s, giữ ~1.5s, giảm dần trong ~2s).
- **Chuyển động lắc kiểu lá rơi (flutter):** dao động ngang dạng sin có pha riêng, kết hợp với **lật 3D giả** bằng `scaleX = cos(góc lật)`. Khi cánh hoa nằm nghiêng cạnh (scaleX gần 0) lực cản giảm nên rơi nhanh hơn, khi nằm phẳng thì lướt chậm hơn, để chuyển động trông có cơ học thật.
- **Chiều sâu (depth of field giả):** mỗi hạt có độ sâu z. Hạt xa thì nhỏ, mờ nhẹ, mờ nhạt, bay chậm; hạt gần thì to, **mờ bokeh**, bay nhanh, thỉnh thoảng lướt qua sát camera. Có ba lớp: **sau cây, giữa, trước cây**.
- **Chạm đất:** cánh hoa tắt dần và lắng xuống, tích tụ thành lớp cánh hoa mỏng trên mặt đất (giới hạn số lượng, vẽ vào cache nền). Cánh rơi xuống ao tạo **gợn sóng** và trôi nhẹ trên mặt nước.
- **Giai đoạn cây hoàn thiện:** thêm lá (xanh, đỏ nâu) lớn hơn, xoay chậm hơn, và cánh hoa **bay ngang theo gió** thành những dải xoáy mềm.
- Một số cánh hoa **đáp lên vai và tóc stickman**, một vài cánh đậu trên lá sen.

### 5.5 Hệ thống gió (module riêng `wind.js`)
- Gió nền theo hướng từ trái sang phải nhẹ, cộng curl noise không gian-thời gian, cộng các đợt gió giật.
- Cường độ gió là hàm theo timeline (rất nhẹ ở đầu, mạnh dần sau 38s). Cung cấp hàm `wind.sample(x, y, t)` dùng chung cho cành, cỏ, hoa, cánh hoa, mây, đom đóm, bồ công anh.
- **Tương tác:** nhấp/chạm vào màn hình tạo một xung gió cục bộ khiến cánh hoa quanh điểm chạm bay tung lên (tuỳ chọn, có thể bật/tắt trong config).

### 5.6 Mặt đất, cỏ và hoa dại
- Mặt đất gradient xanh lục → ô liu ở vùng có nắng, tím ở vùng bóng. Thêm đốm sáng/đốm tối theo noise để không bị phẳng.
- **Cỏ:** hàng nghìn ngọn cỏ cong theo Bézier, chia 2–3 hàng độ sâu; hàng sau cache tĩnh, hàng gần (~500–800 ngọn) đung đưa theo gió, ngọn cỏ có viền sáng ấm phía mặt trời.
- **Hoa dại:** cúc họa mi (trắng, nhuỵ vàng), **bồ công anh** (cánh bông tách ra bay theo gió, lẫn trong không khí), vài bụi **hoa hồng** hồng/đỏ nhạt và **cẩm tú cầu** (cụm hoa nhỏ 4 cánh xanh tím-hồng) ở rìa trái, gần ao. Tất cả đung đưa theo gió và có rim light.
- **Không đặt vật cản trong vùng đặt lời chúc** (mục 2).
- Cỏ và hoa mọc dần sau mốc nảy mầm, có animation lớn lên.

### 5.7 Ao sen (tiền cảnh)
- **Mặt nước** có phản chiếu gradient bầu trời hoàng hôn (lật dọc, mờ dần), **ánh lấp lánh mặt trời** (glitter) theo noise, **gợn sóng** lan toả từ cánh hoa rơi, và dao động nhẹ khi có gió. Phản chiếu mờ của cây và cánh hoa là một điểm cộng.
- **Lá sen:** hình tròn có khía, **gân toả tia**, mặt lá xanh đậm, có **giọt nước** (chấm sáng có highlight), lắc nhẹ trên mặt nước.
- **Hoa sen:** 5–7 bông ở nhiều giai đoạn (nụ nhọn → nở dần → nở rộ), 2–3 lớp cánh nhọn, trắng ở gốc và **hồng đậm dần ở đầu cánh**, đài sen vàng. Nở dần theo thời gian trong cảnh. Khi ngược sáng, cánh sen trong mờ. Thân sen cong mảnh, đung đưa nhẹ.
- Vị trí không che stickman và vùng lời chúc.

### 5.8 Stickman
- **Nét vẽ** liền mượt, đầu mút bo tròn, màu tím than đậm (`#2A2438`), độ dày theo tỉ lệ màn hình. Đầu hình tròn. Có **viền sáng cam mảnh** phía mặt trời (vẽ lại lượt mỏng hơn, lệch về phía nguồn sáng, blend `lighter`).
- **Bộ xương procedural:** đầu, cổ, cột sống (2 đoạn để có thể cong), xương chậu, cánh tay trên/dưới, đùi/cẳng chân. Dùng **IK 2 khớp** cho chân và tay, không hard-code từng khung hình.
- **Đi bộ:** chu kỳ bước với thân nhấp nhô lên xuống (~3% chiều cao), thân hơi nghiêng ~3°, tay vung ngược pha chân (±25°), bàn chân nhấc lên bằng easing, đặt gót trước mũi sau. **Giảm tốc dần trong ~2 giây cuối** khi đến gần cây.
- **Máy trạng thái:** `vào cảnh → đi → giảm tốc → dừng → quay người (đầu quay trước, thân theo sau, ~0.8s) → hạ người ngồi (~2.2s, tay chống đất, hông hạ xuống bằng easing, lưng chạm thân cây) → ngồi yên`.
- **Ngồi:** lưng tựa vào thân cây (tính vị trí bề mặt thân tại mặt đất để lưng chạm đúng), một chân co, một tay đặt lên đầu gối, đầu hơi ngẩng ~6° nhìn về mặt trời.
- **Sống động khi ngồi:** hơi thở nhẹ (~0.4Hz, lồng ngực nhấp nhô), đầu khẽ nghiêng, đôi lúc quay nhìn một cánh hoa rơi, hơi lắc nhẹ theo gió. Một vài cánh hoa đáp lên vai/đầu và nằm lại.
- **Bóng đổ** khớp hướng nguồn sáng, đổ dài sang phải, đồng bộ với từng khung hình của bộ xương.

### 5.9 Đom đóm
- 40–90 con (theo mức chất lượng), xuất hiện từ khoảng 38s và **tăng dần theo độ tối của trời**.
- Quỹ đạo mềm: Lissajous + curl noise, tốc độ khác nhau, đôi khi lơ lửng rồi bay vút.
- **Nhấp nháy** sáng-tối theo nhịp riêng (chu kỳ 0.8–2.5s, có quãng nghỉ), màu vàng chanh `#D9FF7A` → vàng nhạt `#FFF3A0`.
- Phát sáng bằng sprite quầng sáng + **blend cộng**, thêm quầng lớn mờ và **hắt ánh sáng yếu lên cỏ và thân cây** gần đó.
- Có độ sâu: con gần camera to và mờ kiểu bokeh, con xa nhỏ và sắc nét.
- Tập trung nhiều quanh stickman, bờ ao và mép cỏ, nhưng **không làm nhiễu độ đọc được của lời chúc**.

### 5.10 Camera
- Camera ảo có `x, y, zoom, rotation`. Áp dụng **parallax** theo lớp: trời 0.05, núi xa 0.1, đồi giữa 0.25, cây và mặt đất 1.0, tiền cảnh 1.25, cỏ gần 1.4.
- Xuyên suốt cảnh có **chuyển động thở nhẹ** (zoom 1.00 → 1.06 rất chậm, dao động vị trí vài pixel).
- **Zoom cuối (58–66s):** zoom 1.06 → ~1.8, di chuyển tới điểm focus (mục 2), xoay ±1–1.5°, easeInOutCubic. Tiền cảnh bị mờ nhẹ dần (**rack focus**), vignette đậm dần.
- Không được để hình bị vỡ pixel hoặc giật khi zoom.

---

## 6. LỜI CHÚC

- Hiển thị bằng **DOM overlay**, đặt ở vùng trống bên phải dưới tán cây (mục 2), neo theo toạ độ thế giới tại điểm focus nên khớp sau khi zoom.
- Phông chữ viết tay hỗ trợ tiếng Việt (Dancing Script, Pacifico hoặc Charm) cho lời chúc, Playfair Display cho "20/10". Luôn có font dự phòng. Kích thước dùng `clamp()` để responsive, lùi dòng thoáng.
- **Animation từng dòng** (cách nhau khoảng 0.9–1.2s): mờ dần vào + trượt lên nhẹ (~14px) + **làm nét dần từ blur 8px về 0**, chữ có bóng sáng ấm. Dòng đầu có thể hiện theo từng từ.
- **Tên người dùng** nổi bật: gradient hồng - vàng nhạt, glow nhẹ nhịp thở. Viết hoa chữ cái đầu mỗi từ theo quy tắc tiếng Việt (`toLocaleUpperCase('vi')`).
- Có một lớp nền rất nhẹ (radial gradient tím sẫm trong suốt) phía sau chữ để đảm bảo **dễ đọc** trên mọi nền.
- Cánh hoa vẫn rơi quanh chữ nhưng không che nội dung.
- Có hoạ tiết nhỏ (một bông sen, một bông anh đào vẽ procedural) làm điểm nhấn dưới chữ "Happy 20/10".
- **Nội dung mẫu** (có thể viết lại cho văn vẻ, tinh tế hơn nhưng giữ cấu trúc):

> Gửi **{tên}**,
> Chúc **{tên}** ngày 20/10 thật rạng rỡ như hoa sen, dịu dàng như hoa anh đào.
> Mong mọi điều bình yên, hạnh phúc và may mắn luôn nở rộ trên hành trình của bạn.
> *Happy Vietnamese Women's Day 20/10!*

---

## 7. ÂM THANH

- Dùng file nhạc tôi gửi kèm (`music.mp3`, đặt cùng thư mục; ghi rõ **một chỗ duy nhất** trong `config.js` để đổi đường dẫn).
- Dùng thẻ `<audio>` (an toàn cho `file://`), `loop = true`, `preload = "auto"`.
- **Mở khoá autoplay:** trong cú click "Bắt đầu", gọi `play()` rồi tạm dừng ngay (hoặc đặt volume 0) để mở khoá. Khi cảnh chính bắt đầu thì phát và **fade-in ~3 giây**. Nếu trình duyệt vẫn chặn, hiển thị nút nhỏ "Chạm để bật nhạc".
- Nút **bật/tắt âm thanh** góc màn hình (icon vẽ bằng SVG, có trạng thái animation), nhớ trạng thái trong phiên.
- Tab bị ẩn thì tạm dừng nhạc và timeline; quay lại thì fade-in tiếp tục.
- Xử lý lỗi nếu file thiếu hoặc không giải mã được: vẫn chạy bình thường, không báo lỗi thô.

---

## 8. HOÀN THIỆN & TRẢI NGHIỆM

- Nút **"Xem lại"** hiện sau khi lời chúc hiện xong (có animation nhẹ). Bấm sẽ reset sạch trạng thái, giải phóng hạt, phát lại timeline từ đầu với cùng tên (không hỏi tên lại).
- Tôn trọng **`prefers-reduced-motion`**: bản giảm chuyển động hiển thị cảnh gần hoàn chỉnh, ít hạt hơn, không rung camera, lời chúc hiện bằng fade đơn giản.
- Tab ẩn: tạm dừng toàn bộ (timeline, hạt, nhạc), quay lại thì tiếp tục mượt.
- Trên điện thoại: chạm không gây zoom/cuộn, hỗ trợ màn hình dọc, tôn trọng safe-area.
- Cho phép **nhảy nhanh tới một mốc** để kiểm thử: `?t=45` trên URL, và phím tắt (mũi tên) khi bật `DEBUG`. Kèm bảng hiển thị FPS khi bật `DEBUG`.

---

## 9. NGÂN SÁCH HIỆU NĂNG GỢI Ý

| Mục | High | Mid | Low |
|---|---|---|---|
| Hoa trên cây | 3000–4500 | 1800–2500 | 900–1300 |
| Cánh hoa/lá đang bay | 350 | 220 | 110 |
| Đom đóm | 90 | 60 | 40 |
| Ngọn cỏ động | 800 | 500 | 250 |
| Số chùm god rays | 10 | 7 | 4 |
| DPR tối đa | 2 | 1.5 | 1 |

Nhắm 60fps trên desktop, tối thiểu 30fps ổn định trên điện thoại tầm trung.

---

## 10. ĐẦU RA YÊU CẦU

1. **Mã hoàn chỉnh, chạy ngay khi mở `index.html`**, theo đúng cấu trúc file ở mục 1.2. Không dùng placeholder, không viết `// ... phần còn lại tương tự`, không bỏ sót hàm nào.
2. Nếu câu trả lời quá dài, hãy chia thành nhiều phần theo thứ tự file, **mỗi file đầy đủ và độc lập**; báo rõ "Phần x/y" và đợi tôi gõ "tiếp tục". Không cắt ngang giữa file.
3. **Chú thích tiếng Việt** ở các tham số dễ chỉnh, gom hết trong `config.js`: thời lượng từng giai đoạn, bảng màu trời, vị trí mặt trời, số lượng hạt/hoa/đom đóm/cỏ, tốc độ và độ giật của gió, độ sâu/độ rẽ nhánh của cây, tốc độ đi của stickman, mức zoom cuối, nội dung lời chúc.
4. Cuối cùng, liệt kê ngắn **10 tham số nên chỉnh** để tinh chỉnh cảm xúc cảnh (ví dụ: độ ấm của hoàng hôn, độ dày tán hoa, độ mạnh của gió, độ nhiều của đom đóm).
5. Trước khi trả lời, hãy **tự rà soát** theo danh sách kiểm tra dưới đây và sửa các lỗi tìm được.

### Danh sách tự kiểm tra
- [ ] Mở `index.html` bằng `file://` chạy được, không lỗi console.
- [ ] Nhập tên có dấu tiếng Việt (gõ Telex) hoạt động đúng, Enter không gửi khi đang gõ dở.
- [ ] Màn hình chờ tải thật, tối thiểu ~3s, có % và hoa sen nở theo tiến độ.
- [ ] Cây mọc từ mầm với từng nhánh tiến độ riêng, không mọc đồng loạt.
- [ ] Cánh hoa rơi từ bông đầu tiên nở, mật độ tăng dần, có 3 lớp độ sâu.
- [ ] Hoàng hôn chuyển mượt theo timeline, có rim light, god rays, bóng đổ dài sang phải.
- [ ] Sau 38s có gió, cành lắc trễ pha, lá và cánh hoa bay theo gió.
- [ ] Stickman đi, giảm tốc, quay người, ngồi, tựa lưng đúng vào thân cây, có bóng khớp.
- [ ] Đom đóm nhấp nháy, hắt sáng lên cỏ và thân cây.
- [ ] Camera zoom mượt vào vùng bên phải dưới tán, không vỡ hình.
- [ ] Lời chúc hiện từng dòng, tên nổi bật, dễ đọc, không bị che.
- [ ] Nhạc loop, fade-in, nút tắt/bật hoạt động, lỗi file nhạc không làm hỏng trang.
- [ ] "Xem lại" chạy sạch, không rò rỉ bộ nhớ, không tăng dần độ trễ.
- [ ] Tab ẩn thì tạm dừng, `prefers-reduced-motion` được tôn trọng.
- [ ] Tự hạ chất lượng khi FPS thấp, không nhấp nháy khi hạ.

---

## 11. ĐIỀU CẤM
- Không dùng chuyển động tuyến tính cho bất kỳ yếu tố nào nhìn thấy được.
- Không dùng ảnh/CSS animation có sẵn từ bên ngoài, không dùng thư viện nặng.
- Không dùng màu đen thuần cho bóng; không dùng bão hoà gắt.
- Không để hoa/vật thể che vùng lời chúc.
- Không dùng `innerHTML` với dữ liệu người dùng nhập.
- Không bật nhạc trước khi người dùng click; không để nhạc chồng khi "Xem lại".
- Không rút gọn mã, không bỏ qua phần khó (stickman IK, bóng đổ, god rays, cây đệ quy) bằng cách thay bằng hình đơn giản.
