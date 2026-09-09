# TikTokFlow Client Agent (Deep Sweeper Windows)

Bộ công cụ thu thập số liệu TikTok Studio chuyên sâu, chạy hoàn toàn độc lập và an toàn tuyệt đối trên máy trạm Windows của nhân viên.

---

## ⚡ ĐÓNG GÓI SẴN (ZERO PREREQUISITES - KHÔNG CẦN CÀI ĐẶT GÌ THÊM)

- ✅ **Đã tích hợp sẵn Portable Node.js Runtime:** Không cần lên mạng tải hay cài đặt Node.js.
- ✅ **Đã tích hợp sẵn Playwright Core:** Không cần gõ lệnh `npm install`, không cần tải 200MB Chromium.
- ✅ **Đã tự động nhúng Token & Email cá nhân:** File `config.json` đã được máy chủ điền sẵn thông tin khi bạn bấm nút tải về.
- 🚀 **Chỉ cần giải nén và nhấp đúp chạy ngay 100%!**

---

## 🚀 HƯỚNG DẪN SỬ DỤNG NHANH

### Cách 1: Chạy Quét Ngay Lập Tức (Thủ Công)
1. Tải file `.zip` từ trang **Tiện Ích (`/extensions`)** trên hệ thống TikTokFlow.
2. Giải nén vào một thư mục cố định trên ổ đĩa (ví dụ: `D:\TikTokFlow-Agent`).
3. Nhấp đúp chuột vào file:
   ```cmd
   run-agent.bat
   ```
   Cửa sổ tiến độ sẽ hiện ra, tự động snapshot và cào toàn bộ số liệu TikTok Studio đẩy về Cloud.

---

### Cách 2: Tự Động Chạy Ngầm Mỗi Khi Mở Máy Tính (Khuyến Nghị)
Bạn không cần phải nhớ mở phần mềm mỗi ngày!
1. Trong thư mục vừa giải nén, nhấp đúp chuột vào file:
   ```cmd
   setup-agent.bat
   ```
2. Nhấn phím **`1`** và bấm Enter.
3. **Hoàn tất!**
   - Từ nay, mỗi khi bạn bật máy tính và đăng nhập Windows, Agent sẽ **tự động chạy ngầm 100% vô hình** (không mở cửa sổ đen, không làm phiền công việc).
   - Agent sẽ tự động đồng bộ theo đúng **Lịch Trình (Schedule) được thiết lập trong Settings** của hệ thống TikTokFlow.
   - Khi hết giờ làm việc hoặc đến giờ hẹn (ví dụ 18:00), Agent sẽ tự động cào số liệu và gửi báo cáo về máy chủ.

---

## 🛑 CÁCH TẮT HOẶC GỠ BỎ CLIENT AGENT

Nếu bạn muốn dừng hoạt động hoặc tắt hoàn toàn phần mềm, có 3 cách rất dễ dàng:

### 1. Dừng Ngay Lập Tức (1-Click Stop)
- Trong thư mục, nhấp đúp chuột vào file:
  ```cmd
  stop-agent.bat
  ```
- File này sẽ tự động tìm và tắt ngay lập tức toàn bộ tiến trình ngầm, giải phóng 100% RAM và dọn sạch các tệp tạm trong `%TEMP%`.
- Nó cũng sẽ hỏi bạn có muốn tắt luôn tự động khởi động cùng Windows hay không (chọn `Y` để tắt luôn, `N` để chỉ dừng lúc này).

### 2. Tắt Tự Động Khởi Động Cùng Windows
- Nhấp đúp chuột vào file:
  ```cmd
  setup-agent.bat
  ```
- Chọn phím **`2`** và Enter ➔ Hệ thống sẽ gỡ bỏ hoàn toàn tác vụ ngầm trong Windows Task Scheduler.

### 3. Tắt Từ Máy Chủ (Dành cho Quản Trị Viên)
- **Tắt lịch quét toàn hệ thống:** Vào trang **Cài Đặt (`/settings`)** trên web ➔ Tắt công tắc *"Quét vét tự động"*. Các Agent trên máy trạm sẽ tự động chuyển sang chế độ nghỉ.
- **Khóa quyền nhân viên:** Vào trang **Quản Lý Thành Viên (`/users`)** ➔ Tắt quyền Extension/Agent của nhân viên đó. Agent trên máy trạm của họ sẽ bị từ chối kết nối ngay lập tức.

---

## 🛡️ CAM KẾT BẢO MẬT & AN TOÀN DỮ LIỆU
1. **Chế độ CHỈ ĐỌC (Strict Read-Only):** Tuyệt đối không can thiệp, không sửa đổi hay xóa bất kỳ tệp tin nào trong thư mục profile GPMLogin gốc của bạn.
2. **Snapshot Cách Ly Hoàn Toàn:** Nhân bản phiên sang thư mục tạm `%TEMP%`, bỏ qua các tệp khóa (`SingletonLock`), không lo xung đột ngay cả khi trình duyệt đang mở.
3. **Hàng Rào Ironclad Temp Guard:** Cơ chế dọn dẹp kiểm tra chặt chẽ, chỉ xóa thư mục tạm của Agent, ngăn chặn triệt để nguy cơ xóa nhầm tệp cá nhân.
4. **Khử Tải Media & Anti-Zombie:** Tiết kiệm 85% băng thông và chỉ tiêu thụ ~60MB RAM; tự động dọn dẹp tiến trình Chrome ngầm khi dừng.
