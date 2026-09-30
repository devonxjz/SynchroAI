# Kế hoạch triển khai Trợ lý Công việc (Work Assistant Agent)

## Bối cảnh

Màn hình AI Copilot (M16) cho phép người bán tra cứu thông tin sản phẩm, bài đăng, đơn hàng, tồn kho và công việc cần xử lý bằng tiếng Việt tự nhiên.
Nếu trao quyền tùy ý cho mô hình ngôn ngữ, hệ thống đối mặt với nguy cơ rò rỉ dữ liệu giữa các doanh nghiệp, lộ thông tin cá nhân của người mua hoặc tự động đăng bài hàng loạt ngoài tầm kiểm soát.
Trợ lý công việc tuân thủ nguyên tắc đọc có phân quyền nghiêm ngặt và chỉ tạo bản xem trước hành động.
Toàn bộ số liệu tính toán đều do mã nguồn thực hiện. Câu trả lời bắt buộc phải kèm nguồn dẫn chứng có phiên bản và cấu trúc khẳng định do máy chủ kiểm soát.
Kế hoạch phân định rõ ràng giữa nghiệm thu demo với kho lưu trữ trong bộ nhớ và nghiệm thu tích hợp thật khi có cơ sở dữ liệu và phiên làm việc bền vững.

## Phạm vi

### Bao gồm

1. Định nghĩa kiểu dữ liệu cho hội thoại, ngữ cảnh máy chủ đóng kín, quyền hiện hành và các trạng thái phản hồi chi tiết tại `src/ai/agents/assistant/types.ts`.
2. Kiểm tra phân quyền động trên mỗi yêu cầu, bao gồm việc bóc tách thông tin nhạy cảm trong lịch sử hội thoại khi người dùng bị hạ quyền và cô lập hoàn toàn giữa chế độ live và demo tại `src/ai/agents/assistant/conversation.ts`.
3. Xử lý khóa bất biến `idempotencyKey` chống race condition, phát hiện xung đột nội dung và lưu trữ bền vững qua restart tại `src/ai/agents/assistant/idempotency.ts`.
4. Danh mục công cụ đọc có hỗ trợ tìm kiếm theo tên và các hàm tính toán tổng hợp số lượng, doanh thu và chuyển đổi múi giờ chuẩn xác tại `src/ai/agents/assistant/tools/read-tools.ts` và `src/ai/agents/assistant/aggregators.ts`.
5. Vòng lặp điều phối mô hình có giới hạn chung toàn request tối đa 5 tool calls, 3 model calls và deadline 30 giây, kết hợp cấu trúc khẳng định trung thực do máy chủ kiểm soát tại `src/ai/agents/assistant/agent.ts`.
6. Công cụ tạo bản xem trước hành động `prepareActionPreview` và chuyển tiếp phê duyệt sang dịch vụ chuẩn của Khối 10 tại `src/ai/agents/assistant/tools/action-preview.ts`.
7. Cập nhật giao diện AI Copilot M16 tại `src/app/dashboard/ai/page.tsx` thay thế dữ liệu mẫu bằng hội thoại thực tế và cung cấp lối tắt thủ công khi mô hình gặp sự cố.
8. Bộ kiểm thử tự động toàn diện bao phủ toàn bộ các ca từ AS01 đến AS14 tại `tests/ai/assistant-agent.test.mjs`.

### Loại trừ

1. Không sử dụng bộ nhớ đệm cache dùng chung của gateway cho các câu trả lời hội thoại có tính chất phân quyền động.
2. Không tự ý thực thi phê duyệt hoặc tạo mã lệnh gửi sàn độc lập. Toàn bộ thao tác phê duyệt chuyển giao cho dịch vụ Khối 10 xử lý.
3. Không hỗ trợ tính năng tự động đăng hàng loạt (batch publish) trong phiên bản đầu. Mọi yêu cầu đăng bài diện rộng chỉ tạo danh sách xem trước để duyệt riêng từng mục.
4. Không cho phép mô hình ngôn ngữ tự truyền định danh doanh nghiệp hoặc vai trò người dùng vào tham số của công cụ.

## Ràng buộc và ranh giới an toàn

1. Kiểm tra phân quyền động trên từng yêu cầu. Ngữ cảnh máy chủ xác thực danh tính và quyền hạn của người gọi tại thời điểm gửi yêu cầu. Nếu người dùng từng có quyền xem thông tin cá nhân nhưng sau đó bị hạ quyền xuống Viewer, hệ thống tự động bóc tách toàn bộ thông tin cá nhân trong lịch sử hội thoại trước khi nạp vào mô hình. Hội thoại gắn chặt với chế độ `live` hoặc `demo` để không lẫn lộn dữ liệu.
2. Không dùng cache dùng chung cho câu trả lời hội thoại. Nhằm tránh rủi ro rò rỉ dữ liệu giữa hai người dùng cùng doanh nghiệp nhưng khác quyền, phiên bản đầu không áp dụng cache gateway dùng chung cho câu trả lời hội thoại. Tuyệt đối không cache kết quả tạo bản xem trước hành động.
3. Khóa bất biến toàn diện và chống race condition. Khóa `idempotencyKey` được gắn với mã doanh nghiệp, mã người dùng và chế độ chạy. Hai yêu cầu cùng khóa đến đồng thời được xử lý tuần tự qua cơ chế khóa nguyên tử. Yêu cầu cùng khóa nhưng khác nội dung bị từ chối với lỗi xung đột 409. Khi tiến trình restart, hệ thống trả lại kết quả đã lưu kèm việc tái kiểm tra quyền hiện hành.
4. Phê duyệt hành động ủy thác cho Khối 10. Trợ lý chỉ tạo bản nháp đề xuất `prepareActionPreview` và ghi nhận mã băm dữ liệu. Khi người dùng nói "đồng ý" trong chat, hệ thống bắt buộc người dùng xác định rõ mã đề xuất cụ thể nếu có nhiều bản nháp đang chờ. Việc xác thực điều kiện phê duyệt do dịch vụ Khối 10 đảm nhiệm.
5. Cấu trúc khẳng định do máy chủ kiểm soát. Các số liệu quan trọng về số lượng, doanh thu và trạng thái bài đăng được biểu diễn dưới dạng cấu trúc dữ liệu do máy chủ tính toán. Mô hình chỉ đóng vai trò diễn đạt câu chữ. Nếu nguồn dẫn chứng bị xóa hoặc không hợp lệ, hệ thống loại bỏ cả kết luận phụ thuộc thay vì chỉ xóa đường link.
6. Hạn mức thời gian và ngân sách toàn request. Áp dụng một deadline chung cho toàn bộ lượt xử lý và truyền tín hiệu hủy xuống các công cụ và lời gọi mô hình. Đếm riêng số lần gọi công cụ (tối đa 5) và số lần gọi mô hình (tối đa 3). Khi chạm hạn mức, hệ thống trả về trạng thái một phần tương ứng.
7. An toàn tại ranh giới máy chủ trước nguy cơ injection. Hệ thống bảo đảm an toàn bằng schema, danh mục công cụ cố định và đóng kín ngữ cảnh máy chủ ngay cả khi mô hình bị dẫn dụ hoàn toàn.
8. Hoàn thiện giao diện người dùng AI Copilot. Loại bỏ câu chữ mẫu nguy hiểm và dữ liệu tĩnh. Hiển thị tin nhắn, nguồn dẫn chứng và thẻ bản xem trước thực tế. Tự động hủy yêu cầu đang chờ khi người dùng chuyển đổi doanh nghiệp.

## Phương án thiết kế

### Phương án A. Cho phép mô hình chạy truy vấn trực tiếp vào cơ sở dữ liệu

Mô hình tự chuyển câu hỏi tiếng Việt thành câu lệnh SQL hoặc API nội bộ.
Ưu điểm là linh hoạt.
Nhược điểm là nguy cơ rò rỉ dữ liệu đa doanh nghiệp, injection và không kiểm soát được quyền hạn.

### Phương án B. Chatbot đóng cứng chỉ trả lời theo mẫu câu có sẵn

Hệ thống chỉ nhận diện một số từ khóa cố định.
Ưu điểm là tuyệt đối an toàn.
Nhược điểm là trải nghiệm kém và không trích xuất được thông tin linh hoạt theo nhu cầu người bán.

### Phương án C được chọn. Danh mục công cụ đọc có kiểm soát và khẳng định do máy chủ kiểm soát

Hệ thống cung cấp danh mục công cụ đọc có schema chặt chẽ và công cụ tìm kiếm phụ trợ.
Ngữ cảnh phân quyền được xác thực động trên từng request.
Số liệu tổng hợp do mã nguồn tính toán.
Thao tác ghi chỉ tạo bản xem trước đề xuất và chuyển tiếp sang Khối 10 để phê duyệt.

## Kỹ năng áp dụng

1. `principle-foundational-thinking`. Thiết lập cấu trúc kiểu dữ liệu ngữ cảnh máy chủ, quyền hạn động và bản xem trước hành động trước khi viết logic mô hình.
2. `principle-type-system-discipline`. Sử dụng kiểu dữ liệu chặt chẽ cho đầu vào và đầu ra của từng công cụ để ngăn chặn dữ liệu giả mạo.
3. `principle-boundary-discipline`. Khóa định danh doanh nghiệp tại máy chủ, lọc dữ liệu cá nhân theo quyền hiện hành và không dùng cache dùng chung.
4. `principle-make-operations-idempotent`. Triển khai khóa bất biến chống race condition và lưu vết bền vững qua restart.
5. `principle-experience-first`. Cập nhật giao diện AI Copilot trực quan, có thẻ xem trước và giữ lối tắt thủ công khi mô hình lỗi.
6. `principle-sequence-verifiable-units`. Chia nhỏ kế hoạch thành 4 chặng độc lập với kiểm thử tự động riêng biệt.
7. `principle-prove-it-works`. Xây dựng ma trận kiểm thử bao phủ toàn bộ các tình huống hạ quyền, xung đột khóa bất biến và dẫn dụ mô hình.

## Bốn chặng triển khai

1. [Chặng 1. Hợp đồng dữ liệu, quyền hạn động và khóa bất biến bền vững](phase-1-contracts-and-tenant-context.md)
2. [Chặng 2. Công cụ đọc, tìm kiếm phụ trợ và tính toán số liệu chuẩn xác](phase-2-read-tools-and-sql-projections.md)
3. [Chặng 3. Vòng lặp điều phối, khẳng định máy chủ và kiểm soát hạn mức](phase-3-intent-router-and-model-loop.md)
4. [Chặng 4. Bản xem trước, tích hợp Khối 10, giao diện Copilot và kiểm thử](phase-4-action-preview-and-idempotency.md)
5. [Chiến lược và ma trận kiểm thử](testing.md)

## Lệnh xác minh dự án

Kiểm tra kiểu dữ liệu toàn dự án:
`npm run typecheck`

Chạy toàn bộ kiểm thử đơn vị và tích hợp:
`npm test`

Chạy riêng bộ kiểm thử trợ lý công việc:
`node --experimental-strip-types --test tests/ai/assistant-agent.test.mjs`

## Hướng dẫn thực thi

Người triển khai cần bảo đảm quyền hạn của người gọi được tái kiểm tra trên mỗi yêu cầu gửi lên.
Chạy `/deslop` trên từng bản diff trước khi commit.
Tuân thủ nghiêm ngặt kỹ năng `unslop` cho toàn bộ tài liệu và mã nguồn.
Ghi lại nhật ký kỹ thuật bằng `show-me-your-work` trong suốt quá trình xây dựng.
