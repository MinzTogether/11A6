<div align="center">

# 🌸 Hoàng Hôn Dưới Tán Anh Đào 🪷

### Món quà nhỏ cho ngày Phụ nữ Việt Nam 20/10

*Một đoạn phim hoạt hình điện ảnh dài ~65 giây, vẽ hoàn toàn bằng code.*

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Canvas](https://img.shields.io/badge/Canvas_2D-FF6F91?style=for-the-badge)
![No Dependencies](https://img.shields.io/badge/Dependencies-0-7FBF7A?style=for-the-badge)

**[✨ Xem demo](https://TEN-BAN.github.io/TEN-REPO/)** · **[🐛 Báo lỗi](../../issues)** · **[💡 Góp ý](../../issues)**

</div>

---

## 🎬 Giới thiệu

Bạn nhập tên, chờ hoa sen nở trên màn hình tải, rồi cùng ngắm một hạt giống nảy mầm, lớn lên thành cây anh đào đồ sộ khi hoàng hôn buông xuống. Một chàng stickman bước tới, ngồi tựa lưng vào gốc cây ngắm trời chiều giữa những cánh hoa rơi và đàn đom đóm. Cuối cùng, camera lướt tới khoảng trống dưới tán cây, nơi lời chúc dành riêng cho **bạn** hiện ra.

> Toàn bộ hình ảnh được **vẽ bằng code (procedural)**: không ảnh, không video, không thư viện ngoài.

<!-- 📸 Thêm ảnh/GIF demo ở đây:
<p align="center"><img src="docs/demo.gif" width="720" alt="Demo"></p>
-->

---

## ✨ Điểm nổi bật

| | |
|---|---|
| 🌱 **Cây lớn lên hữu cơ** | Thân và cành sinh bằng đệ quy, mỗi nhánh mọc với nhịp riêng, từ mầm nhỏ thành tán hoa hoành tráng |
| 🌸 **Hoa anh đào nở theo đợt** | Nụ hé, xoè cánh, nở rộ như sóng lan từ gốc ra ngọn |
| 🍃 **Cánh hoa rơi chân thực** | Có trọng lực, lực cản, gió giật, lật 3D giả, độ sâu và bokeh |
| 🌇 **Hoàng hôn điện ảnh** | Bầu trời chuyển màu theo thời gian, rim light, tia nắng xuyên tán lá, bóng đổ dài |
| 🚶 **Stickman có hồn** | Bộ xương procedural (IK): đi, giảm tốc, quay người, ngồi, thở, ngắm hoàng hôn |
| ✨ **Đom đóm lung linh** | Nhấp nháy theo nhịp riêng, hắt sáng lên cỏ và thân cây |
| 🪷 **Ao sen tiền cảnh** | Mặt nước phản chiếu trời chiều, sen nở dần, lá sen đọng sương |
| 🎥 **Camera mượt mà** | Parallax nhiều lớp và dolly zoom vào lời chúc |
| 💌 **Lời chúc cá nhân hoá** | Hiện từng dòng, làm nét dần, tên người nhận nổi bật |
| 🎵 **Nhạc nền** | Fade-in nhẹ nhàng, có nút bật/tắt |

---

## 🕰️ Dòng thời gian

| Thời gian | Cảnh |
|---|---|
| `0 – 8s` | Ban ngày trong trẻo, hạt nảy mầm |
| `8 – 26s` | Thân vươn lên, phân nhánh, nụ hoa xuất hiện |
| `26 – 38s` | Hoa bung nở, hoàng hôn buông |
| `38 – 46s` | Gió nổi, lá và cánh hoa bay, đom đóm xuất hiện |
| `46 – 58s` | Stickman đến và ngồi tựa gốc cây |
| `58 – 66s` | Camera zoom vào khoảng trống dưới tán |
| `66s →` | Lời chúc hiện ra 💗 |

---

## 🚀 Chạy thử

Không cần cài đặt gì cả.

```bash
# Tải về
git clone https://github.com/TEN-BAN/TEN-REPO.git
cd TEN-REPO
```

Sau đó **mở file `index.html`** bằng trình duyệt (Chrome, Edge, Firefox, Safari đều được). Chỉ cần vậy là xong!

> 💡 Nên dùng bản desktop hoặc điện thoại tầm trung trở lên để có trải nghiệm mượt nhất. Trang tự giảm chất lượng đồ hoạ nếu máy yếu.

### 🌐 Đưa lên mạng bằng GitHub Pages

1. Vào **Settings → Pages**
2. Ở mục *Build and deployment*, chọn **Deploy from a branch**
3. Chọn nhánh `main`, thư mục `/ (root)`, rồi bấm **Save**
4. Chờ 1-2 phút, link sẽ có dạng `https://TEN-BAN.github.io/TEN-REPO/`

---

## 🗂️ Cấu trúc dự án

```
.
├── index.html
├── style.css
├── music.mp3              # nhạc nền (thay bằng bài của bạn)
└── js/
    ├── utils.js           # easing, noise, số ngẫu nhiên có seed
    ├── config.js          # ⭐ tất cả tham số chỉnh được
    ├── timeline.js        # điều phối toàn bộ cảnh
    ├── camera.js          # parallax và zoom
    ├── sky.js             # trời, mặt trời, mây, núi, ánh sáng
    ├── tree.js            # thân, cành, hoa, lá
    ├── wind.js            # hệ thống gió
    ├── petals.js          # cánh hoa và lá rơi
    ├── ground.js          # đất, cỏ, hoa dại
    ├── pond.js            # ao sen
    ├── stickman.js        # nhân vật
    ├── fireflies.js       # đom đóm
    ├── postfx.js          # bloom, vignette, grain, color grading
    ├── audio.js           # nhạc nền
    ├── ui.js              # nhập tên, loading, lời chúc
    └── main.js
```

---

## 🎛️ Tuỳ chỉnh

Mọi tham số đều nằm trong **`js/config.js`** và có chú thích tiếng Việt. Một số thứ bạn có thể chỉnh nhanh:

| Muốn thay đổi | Chỉnh ở đâu |
|---|---|
| 💬 Nội dung lời chúc | `CONFIG.wish` |
| 🎵 Bài nhạc nền | `CONFIG.audio.src` (hoặc thay file `music.mp3`) |
| 🌅 Độ ấm của hoàng hôn, màu trời | `CONFIG.sky` |
| 🌸 Độ dày của tán hoa | `CONFIG.tree.blossomCount` |
| 🍃 Số cánh hoa rơi, độ mạnh của gió | `CONFIG.petals`, `CONFIG.wind` |
| ✨ Số lượng đom đóm | `CONFIG.fireflies.count` |
| ⏱️ Độ dài từng giai đoạn | `CONFIG.timeline` |
| 🔍 Mức zoom cuối | `CONFIG.camera.finalZoom` |

> Tên các khoá có thể khác đôi chút tuỳ phiên bản code của bạn, hãy mở `config.js` để xem chính xác.

### 🧪 Chế độ debug

Thêm `?t=45` vào cuối đường dẫn để nhảy tới giây thứ 45 của cảnh, rất tiện để chỉnh từng đoạn.

---

## ♿ Trải nghiệm & hiệu năng

- Tự động giảm chất lượng (số hạt, số hoa, độ phân giải hiệu ứng) khi FPS thấp
- Tôn trọng `prefers-reduced-motion` cho người nhạy cảm với chuyển động
- Tự tạm dừng khi chuyển tab, tiếp tục khi quay lại
- Hỗ trợ màn hình dọc trên điện thoại
- Tên người dùng chỉ xử lý trên trình duyệt, **không gửi đi đâu và không lưu lại**

---

## 🎵 Về nhạc nền

File `music.mp3` chỉ là bài ví dụ. Nếu bạn để repo **public**, hãy dùng nhạc **miễn phí bản quyền** hoặc nhạc bạn có quyền sử dụng, vì ai cũng có thể tải file về từ repo.

---

## 🛠️ Công nghệ

- **HTML5 Canvas 2D** nhiều lớp, vẽ toàn bộ bằng code
- **JavaScript thuần**, `requestAnimationFrame` với delta-time
- **Procedural graphics**: L-system, simplex/curl noise, IK, vật lý hạt đơn giản
- **CSS**: glassmorphism, backdrop blur, animation chữ

---

## 🤝 Đóng góp

Mọi ý tưởng đều được chào đón! Bạn có thể:

1. Fork repo này
2. Tạo nhánh mới: `git checkout -b feature/y-tuong-moi`
3. Commit: `git commit -m "Thêm ..."`
4. Push và mở Pull Request

---

## 📜 Giấy phép

Phát hành theo giấy phép [MIT](LICENSE). Bạn tự do sử dụng, chỉnh sửa và chia sẻ. Nếu thấy hay, tặng repo một ⭐ nhé!

---

<div align="center">

**Chúc các chị em, các bạn nữ một ngày 20/10 thật rạng rỡ như hoa sen, dịu dàng như hoa anh đào** 🌸🪷

*Made with 💗 and a lot of petals*

</div>
