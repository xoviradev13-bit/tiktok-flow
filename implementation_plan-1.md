# Kế hoạch Nâng Cấp Bộ Trích Xuất Dữ Liệu TikTok Studio Toàn Diện

Nâng cấp hệ thống trích xuất (`src/lib/tiktok-extractor.ts`) để cào trực tiếp từ giao diện **TikTok Studio** (`/tiktokstudio` và `/tiktokstudio/content`), hỗ trợ đầy đủ các trường dữ liệu theo mốc thời gian và tài chính.

---

## 📌 Các chỉ số được trích xuất tự động

1. **Lưu lượng Views**:
   - `viewsToday`: Lượt xem hôm nay (`pastDay=1`)
   - `views7d`: Lượt xem 7 ngày (`pastDay=7`)
   - `views14d`: Lượt xem 14 ngày (`pastDay=14`)
   - `views30d`: Lượt xem 30 ngày (`pastDay=28`)
   - `totalViews`: Tổng lượt xem trọn đời (Custom `startDate: "2020-01-01"`)

2. **Số lượng Video**:
   - `videosToday`: Số video đăng hôm nay (từ `/tiktokstudio/content`)
   - `videos7d`: Số video đăng trong 7 ngày
   - `videos14d`: Số video đăng trong 14 ngày
   - `videos30d`: Số video đăng trong 30 ngày
   - `totalVideos`: Tổng số video trên kênh

3. **Thông tin Kênh & Tương tác**:
   - `totalFollowers` (Followers count)
   - `totalFollowing` (Following count)
   - `totalLikes` (Likes count)
   - `nickname` (Tên hiển thị / Bio)

4. **Kinh tế & Kiếm tiền**:
   - `totalRevenue`: Tổng doanh thu (`Est. rewards`)
   - `rpm`: RPM trung bình
   - `currency`: Ký hiệu tiền tệ (`$`, `£`, `€`, `₫`)
   - `country`: Quốc gia kênh (US, UK, DE, FR, VN...)

---

## 🛠️ Các thay đổi đề xuất

### 1. Nâng cấp [`src/lib/tiktok-extractor.ts`](file:///c:/Users/datng/tiktok-automation/src/lib/tiktok-extractor.ts)
- Bổ sung helper `buildTikTokStudioCustomUrl(startDate, endDate)`.
- Viết hàm `fetchTikTokStudioFullData(profileId: string)`:
  - Mở URL Custom Date (`2020-01-01` $\rightarrow$ Hiện tại) để lấy: `totalViews`, `totalFollowers`, `totalLikes`, `totalRevenue`, `currency`, `nickname`.
  - Mở các mốc URL `pastDay: 1, 7, 14, 28` để lấy `viewsToday`, `views7d`, `views14d`, `views30d`.
  - Mở `/tiktokstudio/content` để phân loại và đếm video theo mốc thời gian: `videosToday`, `videos7d`, `videos14d`, `videos30d`, `totalVideos`.
- Tích hợp vào hàm tổng `detectTikTokAccountFromGpm(profileId)`.

### 2. Cập nhật Router Đồng bộ & Hiển thị
- Cập nhật [`src/trpc/routers/gpm.ts`](file:///c:/Users/datng/tiktok-automation/src/trpc/routers/gpm.ts) và [`src/trpc/routers/accounts.ts`](file:///c:/Users/datng/tiktok-automation/src/trpc/routers/accounts.ts) để lưu và trả về các trường thời gian mới.

---

## 🧪 Kế hoạch Kiểm tra (Verification)
1. Chạy test script `scripts/test-studio-extractor.ts` với GPM profile mẫu để xác thực dữ liệu cào về khớp 100% với màn hình TikTok Studio.
2. Kiểm tra kiểu dữ liệu và cú pháp với `npx tsc --noEmit`.
