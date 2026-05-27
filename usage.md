# Hướng dẫn Cấu hình Bộ lọc Video Quảng cáo Rác (Junk Video Regex Filters)

Khi tải phim bằng torrent (đặc biệt qua các trang tracker công cộng), các nhà phân phối torrent thường chèn thêm các video ngắn quảng cáo thương hiệu, game 18+, hoặc website cá cược (ví dụ: `18+游戏大全(996gg.cc)...mp4`). 

**AVsub PRO** tích hợp sẵn **Bộ lọc video ngoại lai bằng biểu thức chính quy (Regex)** hoạt động tự động tại **Bước 0** của quy trình xử lý sau khi tải (Post-Download Pipeline) giúp tự động tìm và xóa bỏ hoàn toàn các tệp tin rác này trước khi đổi tên và lưu trữ.

---

## 🧭 Vị trí cấu hình trên Giao diện

1. Truy cập vào giao diện web của **AVsub PRO**.
2. Chuyển sang thẻ **Watcher** (Giám sát 24/7).
3. Cuộn xuống phần **🚫 Bộ Lọc Video Ngoại Lai (Junk Video Regex Filters)**.

---

## ✍️ Cách thêm mẫu Regex lọc tệp rác

Trong ô nhập liệu cấu hình, nhập mỗi dòng là một mẫu biểu thức chính quy (Regex). 

### 💡 Các Ví dụ Thiết thực:

| Mẫu Regex | Tệp tin mẫu sẽ bị khớp và xóa | Giải thích |
| :--- | :--- | :--- |
| `996gg\.cc` | `18+游戏(996gg.cc)-xyz.mp4` | Xóa mọi video có chứa tên miền quảng cáo `996gg.cc` (ký tự `.` cần thêm dấu gạch chéo `\` trước nó). |
| `18\+游戏` | `18+游戏大全-七龍珠H版.mp4` | Xóa mọi video chứa cụm từ `18+游戏` (ký tự `+` cần thêm `\` trước nó thành `\+`). |
| `游戏大全` | `游戏大全(jav321).mp4` | Xóa mọi video chứa cụm từ `游戏大全`. |
| `promo` | `MIMK-267-promo.mp4` | Xóa mọi video chứa cụm từ `promo` (quảng cáo). |
| `h-game` | `h-game-ad.mp4` | Xóa mọi video chứa cụm từ `h-game`. |

### ⚠️ Lưu ý kỹ thuật quan trọng khi viết Regex:
* **Escape các ký tự đặc biệt:** Nếu cụm từ quảng cáo chứa các ký tự đặc biệt của Regex như `.`, `+`, `?`, `*`, `(`, `)`, `[`, `]`, bạn **bắt buộc** phải thêm dấu gạch chéo ngược `\` phía trước để hệ thống hiểu đó là văn bản thông thường (ví dụ: `\.` thay vì `.`, `\+` thay vì `+`).
* **Không phân biệt chữ hoa/thường:** Bộ lọc tự động thiết lập cờ `i` (Case-Insensitive), do đó mẫu `promo` sẽ khớp với cả `Promo`, `PROMO` hay `pRoMo`.
* **Chỉ áp dụng cho tệp Video:** Bộ lọc sẽ **chỉ quét và xóa** các tệp video có đuôi mở rộng: `.mp4`, `.mkv`, `.avi`, `.wmv`, `.mov` khớp với mẫu Regex để tránh việc xóa nhầm phụ đề hoặc các tệp cấu hình quan trọng.

---

## 🔑 Kiểm tra Quyền Ghi/Xóa (Write/Delete Permissions)

Để bộ lọc hoạt động chính xác, container chạy AVsub cần có đủ quyền hạn tác động vật lý lên thư mục `/movies` trên ổ đĩa/NAS của bạn:
* Kiểm tra thẻ **Quyền xóa/ghi /movies** (🔑) tại lưới thông số trên cùng của tab Watcher.
* Trạng thái hiển thị **🟢 Đủ Quyền Xóa** chứng minh hệ thống đã thử nghiệm tạo và xóa tệp tạm thành công.
* Nếu hiển thị **🔴 Thiếu Quyền**, bạn cần kiểm tra lại phân quyền sở hữu (owner) hoặc nhóm quyền (chmod) của thư mục lưu trữ phim trên hệ điều hành máy chủ (Host Linux/NAS).

---

## ⚡ Quét và Dọn dẹp Thủ công lập tức

Hệ thống cung cấp một nút bấm **⚡ Quét & Dọn Dẹp Ngay** trực quan bên cạnh nút lưu cấu hình:
1. Nhấp nút này để kích hoạt quét đệ quy tức thời toàn bộ thư mục `/movies`.
2. Hệ thống sẽ trả về hộp báo cáo kết quả chi tiết hiển thị **Số lượng tệp đã xóa thành công** kèm đường dẫn cụ thể của từng tệp rác vừa dọn dẹp để bạn tiện theo dõi.
