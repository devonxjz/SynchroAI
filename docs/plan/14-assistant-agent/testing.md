# Chiến lược và ma trận kiểm thử Trợ lý Công việc

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng chiến lược kiểm thử tự động toàn diện cho module Trợ lý công việc và giao tiếp tiếng Việt.
Ngăn chặn các rủi ro bảo mật nghiêm trọng gồm rò rỉ dữ liệu giữa các doanh nghiệp, lộ thông tin cá nhân khi hạ quyền và tấn công prompt injection.
Đảm bảo tính trung thực tuyệt đối của câu trả lời thông qua khẳng định do máy chủ kiểm soát.
Bảo vệ hệ thống trước các lệnh thực thi diện rộng ngoài tầm kiểm soát.

## Ma trận kiểm thử từ AS01 đến AS14

| Mã ca | Mục tiêu kiểm thử | Dữ liệu đầu vào thực tế | Kỳ vọng bắt buộc chứng minh | Tệp kiểm thử |
|---|---|---|---|---|
| AS01 | Thống kê việc chờ trong ngày theo múi giờ | Câu hỏi "Hôm nay còn việc gì cần làm?" | Tính đúng dải UTC theo múi giờ người dùng, đếm tổng từ cơ sở dữ liệu và trả về liên kết thật | `tests/ai/assistant-agent.test.mjs` |
| AS02 | Hai người dùng cùng tenant khác quyền | User 1 là Admin, User 2 là Viewer cùng hỏi một nội dung | Không dùng chung cache, kết quả User 2 không chứa thông tin cá nhân | `tests/ai/assistant-agent.test.mjs` |
| AS03 | Admin bị hạ quyền mở lại chat cũ | Admin từng xem số điện thoại bị hạ xuống Viewer và tiếp tục chat | Lịch sử nạp vào mô hình và câu trả lời hoàn toàn bị che giấu số điện thoại | `tests/ai/assistant-agent.test.mjs` |
| AS04 | Chặn tự động đăng bài hàng loạt | Câu lệnh yêu cầu "Đăng hết tất cả các bài lên Shopee đi" | Không gọi bất kỳ lệnh gửi sàn nào, chỉ đưa ra bản xem trước danh sách điều kiện | `tests/ai/assistant-agent.test.mjs` |
| AS05 | Khẳng định máy chủ chặn kết luận sai | Bài đăng đang ở hàng đợi queued, mô hình nói đã đăng kèm citation thật | Khẳng định máy chủ ghi đè câu chữ, bắt buộc thông báo bài đăng đang chờ gửi | `tests/ai/assistant-agent.test.mjs` |
| AS06 | Đổi doanh nghiệp dùng phiên cũ | Chuyển sang doanh nghiệp khác và gửi tin nhắn với conversationId cũ | Máy chủ trả về lỗi 404 và không tải lại lịch sử hội thoại của doanh nghiệp cũ | `tests/ai/assistant-agent.test.mjs` |
| AS07 | Hai request đồng thời cùng idempotency key | Hai yêu cầu cùng khóa bất biến gửi tới cùng thời điểm | Chỉ có 1 lượt thực thi, tạo đúng 1 bản xem trước duy nhất | `tests/ai/assistant-agent.test.mjs` |
| AS08 | Cùng key nhưng nội dung tin nhắn khác nhau | Khách hàng gửi lại cùng idempotencyKey nhưng thay đổi câu hỏi | Máy chủ trả về lỗi 409 Conflict | `tests/ai/assistant-agent.test.mjs` |
| AS09 | Thay đổi payload đề xuất sau khi preview | Sản phẩm giữ nguyên version nhưng payload đề xuất bị thay đổi | Lệnh duyệt bản xem trước cũ bị từ chối do sai lệch mã băm | `tests/ai/assistant-agent.test.mjs` |
| AS10 | Hạn mức thời gian toàn request 30 giây | Công cụ hoặc mô hình chạy chậm vượt quá 30 giây toàn lượt | Hệ thống tự động hủy bằng AbortSignal và trả về trạng thái partial_deadline_exceeded | `tests/ai/assistant-agent.test.mjs` |
| AS11 | Chuyển doanh nghiệp khi request đang xử lý | Đang gửi yêu cầu doanh nghiệp A thì người dùng đổi sang B | Giao diện tự động hủy và loại bỏ phản hồi của doanh nghiệp A | `tests/ai/assistant-agent.test.mjs` |
| AS12 | Có nhiều proposal và người dùng nói đồng ý | Có 2 bản nháp đang chờ duyệt, người dùng chat "đồng ý" | Trợ lý yêu cầu người dùng xác định rõ bản nháp nào cần duyệt | `tests/ai/assistant-agent.test.mjs` |
| AS13 | Tấn công injection gọi công cụ cấm | Mô hình bị dẫn dụ và cố gắng gọi executeSql hoặc truyền tenantId giả | Máy chủ chặn ngay tại ranh giới schema, danh mục công cụ không bị suy suyển | `tests/ai/assistant-agent.test.mjs` |
| AS14 | Nghiệm thu 10 câu hỏi nghiệp vụ mẫu | Tập hợp 10 câu hỏi vận hành thực tế về sản phẩm, đơn hàng và tồn kho | Toàn bộ câu trả lời có nguồn trích dẫn hợp lệ và số liệu khớp 100 phần trăm | `tests/ai/assistant-agent.test.mjs` |

## Tiêu chí nghiệm thu phân tầng

### Nghiệm thu Demo

1. Chạy thành công toàn bộ 14 ca kiểm thử trên kho dữ liệu giả lập trong bộ nhớ.
2. Kiểm tra tính toàn vẹn của cơ chế phân quyền động, khóa bất biến nguyên tử và khẳng định do máy chủ kiểm soát.
3. Giao diện Copilot hiển thị tin nhắn, nguồn dẫn chứng và thẻ bản xem trước tương tác thực tế.

### Nghiệm thu Tích hợp Thật

1. Kết nối với dịch vụ xác thực phiên và cơ sở dữ liệu PostgreSQL có bảng lưu phiên hội thoại.
2. Tích hợp chuyển tiếp phê duyệt với dịch vụ phê duyệt tập trung của Khối 10.
3. Kiểm tra đồng bộ dữ liệu thời gian thực giữa giao diện Copilot và worker cập nhật đơn hàng.

## Lệnh thực thi kiểm thử

Chạy toàn bộ kiểm thử đơn vị và tích hợp trợ lý công việc:
`node --experimental-strip-types --test tests/ai/assistant-agent.test.mjs`

Chạy kiểm tra kiểu tĩnh và toàn bộ suite kiểm thử của dự án:
`npm run typecheck && npm test`
