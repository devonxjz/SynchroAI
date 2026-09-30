# Chặng 1. Hợp đồng dữ liệu, quyền hạn động và khóa bất biến bền vững

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng nền tảng kiểu dữ liệu cho toàn bộ module Trợ lý công việc.
Đóng kín ngữ cảnh máy chủ gồm định danh doanh nghiệp, người dùng, quyền hiện hành và chế độ chạy.
Xử lý tình huống hạ quyền người dùng và lọc sạch thông tin cá nhân trong lịch sử hội thoại cũ.
Triển khai cơ chế khóa bất biến toàn diện, chống race condition và phát hiện xung đột nội dung.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/assistant/types.ts`.
Định nghĩa kiểu dữ liệu `ServerContext` chứa `tenantId`, `userId`, `role`, `mode`, `permissions` và `userTimezone`.
Quy định rõ phiên bản đầu không sử dụng cache dùng chung của gateway cho câu trả lời hội thoại.
Bổ sung các trạng thái phản hồi chi tiết vào `AssistantResponseStatus` gồm `answered`, `needs_clarification`, `preview_ready`, `partial_deadline_exceeded`, `partial_budget_exceeded` và `unavailable`.
Định nghĩa cấu trúc khẳng định có cấu trúc do máy chủ kiểm soát `ServerStructuredAssertion`.

Tạo mới file `src/ai/agents/assistant/conversation.ts`.
Quản lý phiên hội thoại gắn chặt với `tenantId`, `userId` và `mode`.
Khi nạp lại lịch sử hội thoại cũ, hệ thống bắt buộc tái thẩm định quyền hiện hành của người gọi.
Nếu người dùng từng có quyền xem dữ liệu cá nhân nhưng hiện tại bị hạ quyền xuống Viewer, hệ thống tự động bóc tách số điện thoại, địa chỉ và thông tin nhạy cảm trong các tin nhắn cũ trước khi đưa vào mô hình.
Chuyển đổi doanh nghiệp hoặc dùng mã phiên khác chế độ chạy sẽ bị từ chối với lỗi 404.

Tạo mới file `src/ai/agents/assistant/idempotency.ts`.
Triển khai trình quản lý khóa bất biến `IdempotencyManager` lưu trữ bền vững.
Khóa được định danh theo phạm vi `tenantId + userId + mode + idempotencyKey` và lưu kèm mã băm của yêu cầu `payloadHash`.
Khi có hai yêu cầu cùng khóa đến đồng thời, hệ thống sử dụng khóa nguyên tử để chỉ cho phép một yêu cầu thực thi, yêu cầu thứ hai chờ kết quả hoặc nhận phản hồi đang xử lý.
Nếu gửi cùng một khóa nhưng nội dung tin nhắn khác nhau, hệ thống trả về lỗi xung đột HTTP 409.
Nếu máy chủ đã xử lý và tạo bản xem trước nhưng kết nối mạng bị gián đoạn, lượt gửi lại nhận lại đúng phản hồi đã lưu mà không tạo bản xem trước mới.
Khi tiến trình restart và người dùng gửi lại yêu cầu cũ, hệ thống kiểm tra lại quyền hiện tại trước khi trả về kết quả đã lưu.

Tạo mới file `tests/ai/assistant-agent.test.mjs`.
Thiết lập các ca kiểm thử cho việc lọc thông tin cá nhân trong lịch sử khi bị hạ quyền, kiểm tra hai yêu cầu đồng thời cùng khóa bất biến và kiểm tra xung đột mã băm.

## Cấu trúc dữ liệu

`ServerContext`: ngữ cảnh máy chủ xác thực động chứa mã doanh nghiệp, mã người dùng, vai trò, quyền hạn hiện hành, chế độ chạy và múi giờ.
`IdempotencyRecord`: bản ghi khóa bất biến gồm khóa định danh, mã băm nội dung, trạng thái xử lý, kết quả phản hồi và thời điểm hết hạn.
`SanitizedConversationHistory`: lịch sử hội thoại đã được lọc sạch thông tin nhạy cảm phù hợp với quyền hạn tại thời điểm gửi yêu cầu.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 1:
`node --experimental-strip-types --test tests/ai/assistant-agent.test.mjs`

Xác minh ca hạ quyền: Tài khoản Admin từng tra cứu số điện thoại khách hàng trong lịch sử. Sau đó tài khoản bị hạ xuống Viewer và tiếp tục chat. Lịch sử gửi cho mô hình đã bị che chắn toàn bộ số điện thoại.
Xác minh ca hai yêu cầu đồng thời: Hai yêu cầu cùng khóa bất biến đến cùng một thời điểm. Chỉ một tiến trình thực thi, không tạo ra hai lượt gọi song song.
Xác minh ca xung đột khóa: Cùng một `idempotencyKey` nhưng nội dung tin nhắn khác nhau. Hệ thống trả về lỗi 409 Conflict.
