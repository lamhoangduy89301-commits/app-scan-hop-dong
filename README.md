# 📄 Scan Hợp Đồng - Jan Motorbike

> Ứng dụng Web PWA chụp, xử lý ảnh tài liệu/CCCD, tự động nắn phẳng góc, xuất file PDF chuẩn A4 và tải thẳng lên Google Drive của khách hàng. Giao diện 100% tiếng Việt, tối ưu hoá trải nghiệm cảm ứng trên điện thoại (Mobile-first) và máy tính.

---

## 🌟 Tính năng nổi bật

1. **Chụp ảnh & Nhận diện thông minh**:
   - Chụp trực tiếp bằng camera (ưu tiên camera sau, hỗ trợ đèn flash/torch, nút chụp liên tục nhiều trang).
   - Tự động nhận diện khung viền giấy tờ/hợp đồng/CCCD và nắn phẳng (perspective warp).
   - Cho phép cắt chỉnh tay 4 góc linh hoạt kèm kính lúp phóng to vị trí ngón tay.
   - Chọn nhiều ảnh cùng lúc từ thư viện thiết bị.

2. **Bộ lọc tăng cường chất lượng tài liệu**:
   - **Màu rõ nét (Magic Color)**: Tự động cân bằng trắng nền giấy, giữ đậm nét mực, chữ ký và con dấu đỏ.
   - **Trắng đen tài liệu**: Chuyển đổi nhị phân độ tương phản cao, loại bỏ hoàn toàn bóng đổ và vết bẩn mặt bàn.
   - **Thang xám (Grayscale)** & **Ảnh gốc**.
   - Thanh trượt tùy chỉnh Độ sáng và Độ tương phản.
   - Tính năng "Áp dụng cho tất cả các trang" tiện lợi.

3. **Sắp xếp & Xử lý trang kéo thả**:
   - Kéo thả đổi thứ tự trang trực quan bằng thư viện `@dnd-kit` tối ưu cho màn hình cảm ứng điện thoại.
   - Xoay 90° từng trang nhanh chóng.
   - Chế độ **CCCD / Giấy tờ nhỏ**: Tự động ghép Mặt trước + Mặt sau vào chung 1 trang A4 chuẩn.

4. **Tích hợp Google Drive API sâu & bảo mật**:
   - Đăng nhập bảo mật qua Google Identity Services (GIS) với quyền tối thiểu `drive.file` (chỉ truy cập các tệp do ứng dụng tạo ra, bảo mật tuyệt đối).
   - Bộ duyệt cây thư mục đa cấp (lồng nhau không giới hạn: *Hợp đồng thuê xe -> Tháng 10 -> Tên khách hàng*).
   - Ghi nhớ các **thư mục gần đây** để chọn nhanh 1 chạm.
   - **Tạo thư mục mới** ngay trong ứng dụng không cần mở app Google Drive.

5. **Xuất PDF & Lưu trữ**:
   - Đặt tên file tự động theo định dạng chuẩn: `HopDong_[TênKhách]_[YYYY-MM-DD].pdf`.
   - 3 mức nén thông minh: Nhẹ (chất lượng cao), Cân bằng (khuyên dùng ~200-350KB/trang), Nhỏ nhất (siêu nén).
   - Hiển thị ước tính dung lượng file trước khi xuất.
   - Tải thẳng lên thư mục đã chọn trên Google Drive kèm thanh tiến trình trực tiếp.
   - Nút dự phòng: **"Tải PDF về máy"** khi không có mạng hoặc chưa kết nối tài khoản Drive.
   - Lịch sử hợp đồng đã scan lưu tại máy, tìm kiếm nhanh theo tên khách.

6. **PWA (Progressive Web App)**:
   - Cài đặt trực tiếp ra màn hình chính của điện thoại (Android & iOS).
   - Mở toàn màn hình không có thanh địa chỉ trình duyệt, trải nghiệm mượt mà như app gốc.
   - Toàn bộ khâu xử lý ảnh diễn ra tại trình duyệt (Client-side), không tốn tài nguyên máy chủ và bảo mật tối đa.

---

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS (Mobile-first, Dark theme hiện đại)
- **Xử lý ảnh client**: HTML5 Canvas Triangulation Perspective Warp + OpenCV.js CDN fallback
- **Tạo file PDF**: `pdf-lib`
- **Kéo thả sắp xếp**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- **Icon hệ thống**: `lucide-react`
- **Hiệu ứng**: `canvas-confetti`
- **Tích hợp Drive**: Google Identity Services + Google Drive REST API v3
- **Lưu trữ lịch sử**: LocalStorage / IndexedDB

---

## 🚀 Hướng dẫn chạy thử nghiệm tại máy (Local Development)

### 1. Cài đặt thư viện:
```bash
npm install
```

### 2. Thiết lập file môi trường:
Tạo file `.env.local` tại thư mục gốc:
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
```
*(Nếu chưa có Client ID, bạn vẫn có thể chạy app và sử dụng mọi tính năng chụp, nắn góc, lọc màu và "Tải PDF về máy" bình thường).*

### 3. Chạy server phát triển:
```bash
npm run dev
```
Mở trình duyệt tại: `http://localhost:3000`

---

## 🔑 Hướng dẫn tạo Google Client ID trên Google Cloud Console

Để kích hoạt tính năng đăng nhập và lưu file trực tiếp vào Google Drive, bạn cần tạo OAuth Client ID theo các bước sau:

### Bước 1: Tạo dự án mới trên Google Cloud Console
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Đăng nhập bằng tài khoản Google quản lý của Jan Motorbike.
3. Bấm vào menu chọn dự án ở góc trên bên trái -> Chọn **New Project** (Dự án mới).
4. Đặt tên dự án: `Scan Hop Dong Jan Motorbike` -> Bấm **Create**.

### Bước 2: Bật Google Drive API
1. Vào thanh tìm kiếm phía trên, gõ **Google Drive API**.
2. Chọn **Google Drive API** từ danh sách kết quả.
3. Bấm nút **Enable** (Bật).

### Bước 3: Cấu hình Màn hình chấp thuận OAuth (OAuth Consent Screen)
1. Ở menu bên trái, vào mục **APIs & Services** -> **OAuth consent screen**.
2. Chọn loại người dùng:
   - **Internal** (Nội bộ): nếu bạn dùng Google Workspace của công ty (@janmotorbike.com).
   - **External** (Bên ngoài): nếu dùng tài khoản Gmail cá nhân.
3. Điền các thông tin cơ bản:
   - App name: `Scan Hợp Đồng`
   - User support email: Email của bạn
   - Developer contact information: Email của bạn
4. Bấm **Save and Continue**.
5. Mục **Scopes** (Phạm vi):
   - Bấm **Add or Remove Scopes**.
   - Tìm và tích chọn: `https://www.googleapis.com/auth/drive.file` (Quyền an toàn, chỉ truy cập các tệp do ứng dụng tải lên).
   - Tích thêm `.../auth/userinfo.profile` và `.../auth/userinfo.email`.
   - Bấm **Update** -> **Save and Continue**.
6. Nếu ở chế độ External (Testing): Thêm Gmail của các nhân viên sẽ dùng app vào mục **Test users**.

### Bước 4: Tạo OAuth 2.0 Client ID
1. Ở menu bên trái, vào **Credentials** (Thông tin xác thực) -> Bấm **+ CREATE CREDENTIALS** -> Chọn **OAuth client ID**.
2. **Application type**: Chọn **Web application**.
3. **Name**: `Scan Hop Dong Web Client`.
4. Tại mục **Authorized JavaScript origins** (Nguồn gốc JavaScript được phép), bấm **+ ADD URI** và thêm 2 địa chỉ sau:
   - `http://localhost:3000` (dùng khi kiểm tra trên máy tính)
   - `https://scan.janmotorbike.com` (domain chạy chính thức)
   - *(Nếu dùng domain Vercel mặc định, bạn có thể thêm cả `https://tên-dự-án.vercel.app`)*
5. Bấm **CREATE**.
6. Một cửa sổ hiện lên chứa **Your Client ID** (có dạng `xxxxxxx-xxxxxxx.apps.googleusercontent.com`).
7. Sao chép Client ID này dán vào biến `NEXT_PUBLIC_GOOGLE_CLIENT_ID` trong file `.env.local` và cấu hình trên Vercel.

---

## 🌐 Hướng dẫn triển khai lên Vercel & Cấu hình Domain

### Bước 1: Đẩy mã nguồn lên GitHub
1. Khởi tạo Git trong thư mục dự án (nếu chưa có):
   ```bash
   git init
   git add .
   git commit -m "feat: complete Scan Hop Dong PWA app"
   ```
2. Tạo một repository mới trên GitHub (ví dụ: `scan-hop-dong`).
3. Đẩy code lên:
   ```bash
   git remote add origin https://github.com/your-username/scan-hop-dong.git
   git branch -M main
   git push -u origin main
   ```

### Bước 2: Import vào Vercel
1. Đăng nhập vào [Vercel.com](https://vercel.com).
2. Bấm **Add New...** -> **Project**.
3. Chọn repository `scan-hop-dong` từ GitHub -> Bấm **Import**.
4. Tại mục **Environment Variables** (Biến môi trường), thêm biến:
   - **Key**: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - **Value**: Dán mã Client ID đã lấy từ Google Cloud Console ở trên.
5. Bấm **Deploy**. Vercel sẽ tự động build và cấp phát một URL dạng `https://scan-hop-dong-xxxx.vercel.app`.

### Bước 3: Trỏ tên miền `scan.janmotorbike.com`
1. Trong dashboard dự án trên Vercel, vào tab **Settings** -> **Domains**.
2. Nhập tên miền con: `scan.janmotorbike.com` -> Bấm **Add**.
3. Vercel sẽ hiển thị bản ghi DNS bạn cần cấu hình tại nhà cung cấp tên miền của `janmotorbike.com` (Cloudflare, Tenten, PA Vietnam, Namecheap,...):
   - **Loại bản ghi (Type)**: `CNAME`
   - **Tên (Name / Host)**: `scan`
   - **Giá trị (Value / Target)**: `cname.vercel-dns.com`
   - **TTL**: Tự động hoặc 3600
4. Sau khi thêm bản ghi DNS, chờ khoảng 1 - 5 phút để DNS cập nhật và Vercel tự động cấp chứng chỉ SSL (HTTPS) miễn phí.
5. Kiểm tra truy cập `https://scan.janmotorbike.com` trên điện thoại!

---

## 📱 Hướng dẫn cài đặt ứng dụng ra màn hình chính (PWA)

### Trên điện thoại Android (Chrome / Cốc Cốc):
1. Truy cập `https://scan.janmotorbike.com`.
2. Ứng dụng sẽ hiển thị thanh thông báo: *"Cài đặt ứng dụng Scan HĐ"* ở đáy màn hình.
3. Bấm **"Cài đặt"** -> Chọn **"Cài đặt"** trong hộp thoại xác nhận.
4. Biểu tượng ứng dụng "Scan Hợp Đồng" sẽ xuất hiện trên màn hình chính như ứng dụng tải từ CH Play.

### Trên iPhone / iPad (Safari):
1. Mở trình duyệt Safari và truy cập `https://scan.janmotorbike.com`.
2. Nhấn vào nút **Chia sẻ** (biểu tượng hình vuông có mũi tên chỉ lên ở thanh công cụ Safari phía dưới).
3. Cuộn xuống và chọn **"Thêm vào MH chính"** (Add to Home Screen).
4. Nhấn nút **"Thêm"** ở góc trên cùng bên phải.
5. Biểu tượng ứng dụng sẽ xuất hiện trên màn hình iPhone, bấm vào sẽ chạy toàn màn hình không có viền duyệt web.

---

## 📋 Kiểm tra luồng sử dụng hoàn chỉnh

1. **Bước 1**: Mở app -> Bấm **"Đăng nhập Drive"** ở góc trên -> Chọn tài khoản Google cấp quyền lưu file.
2. **Bước 2**: Bấm **"Chụp bằng Camera"** -> Căn giấy tờ vào khung viền xanh -> Bấm chụp liên tục trang 1, trang 2, trang 3 -> Bấm **"Xong (3)"**.
3. **Bước 3**: Tại danh sách trang:
   - Thử kéo thả thẻ trang 2 lên đầu để đổi vị trí.
   - Bấm nút **Xoay** nếu trang bị lộn ngược.
   - Bấm vào ảnh hoặc nút **Cắt góc** để chỉnh lại 4 góc hoặc chuyển chế độ lọc: **Màu rõ nét**, **Trắng đen**, kéo chỉnh sáng.
4. **Bước 4**: Bấm nút **"Xuất PDF & Lưu"**:
   - Nhập tên khách: `Nguyen Van A` -> Tên file tự sinh `HopDong_Nguyen_Van_A_2026-10-18.pdf`.
   - Bấm **"Đổi thư mục"** -> Duyệt vào thư mục *Hợp đồng thuê xe* -> Thử bấm nút **"Tạo mới"** để tạo thư mục khách hàng ngay tại đây.
   - Chọn mức nén: *Cân bằng* hoặc *Nhẹ*.
   - Nếu chụp 2 mặt CCCD: Bật tùy chọn **"Chế độ CCCD: Ghép 2 mặt"**.
5. **Bước 5**: Bấm **"Lưu thẳng lên Drive"** -> Thanh tiến trình hiển thị quá trình nén và tải lên -> Pháo hoa nổ chúc mừng kèm nút **"Mở file trên Google Drive"**.
6. **Bước 6**: Chuyển sang tab **"Lịch sử hợp đồng"** để xem lại danh sách hợp đồng vừa xuất.

---

## 🔒 Bản quyền & Bảo mật

- Phát triển dành riêng cho hệ thống quản lý hợp đồng **Jan Motorbike**.
- Dữ liệu hình ảnh được xử lý hoàn toàn trên thiết bị của người dùng và gửi thẳng lên Google Drive cá nhân/doanh nghiệp, không lưu trữ qua bất kỳ máy chủ trung gian nào.
