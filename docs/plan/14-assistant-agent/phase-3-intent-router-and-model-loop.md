# Chặng 3. Vòng lặp điều phối, khẳng định máy chủ và kiểm soát hạn mức

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng vòng lặp điều phối mô hình có hạn mức toàn request rõ ràng.
Truyền thời gian còn lại và tín hiệu hủy xuống toàn bộ các công cụ và lời gọi mô hình.
Áp dụng cơ chế khẳng định có cấu trúc do máy chủ kiểm soát để bảo đảm tính trung thực tuyệt đối của câu trả lời.
Thiết lập hệ thống phòng thủ đa tầng an toàn trước nguy cơ injection ngay tại ranh giới máy chủ.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/assistant/prompt.ts`.
Xây dựng system prompt định hướng vai trò diễn đạt cho mô hình ngôn ngữ.
Mô hình phải dựa trên các khẳng định có cấu trúc do máy chủ cung cấp để trả lời.
Nghiêm cấm mô hình đưa ra kết luận trái ngược với trạng thái kỹ thuật thực tế của hệ thống.

Tạo mới file `src/ai/agents/assistant/assertions.ts`.
Triển khai bộ kiểm soát khẳng định có cấu trúc `ServerStructuredAssertion`.
Máy chủ tiếp nhận kết quả từ các công cụ đọc và tự tạo ra các khẳng định chuẩn mực về số lượng, doanh thu và trạng thái bài đăng.
Nếu bài đăng đang ở trạng thái `queued` hoặc `pending`, khẳng định bắt buộc phải ghi nhận là "đang chờ xử lý".
Nếu văn bản trả về của mô hình chứa từ khóa tuyên bố "đã đăng thành công" trái với khẳng định của máy chủ, hệ thống tự động hiệu chỉnh câu chữ hoặc chặn kết luận sai lệch.
Nếu nguồn dẫn chứng bị xóa hoặc mất hiệu lực, toàn bộ kết luận phụ thuộc bị loại bỏ thay vì chỉ xóa đường link.

Tạo mới file `src/ai/agents/assistant/agent.ts`.
Điều phối vòng lặp thực thi với một hạn mức deadline chung cho toàn request (mặc định 30 giây).
Truyền thời gian còn lại `remainingMs` và tín hiệu hủy `AbortSignal` xuống từng công cụ và từng lời gọi `ModelCallGateway`.
Đếm riêng tổng số lần gọi công cụ (tối đa 5 lần) và tổng số lần gọi mô hình (tối đa 3 lần) để ngăn chặn vòng lặp mô hình gọi lại mà không gọi công cụ.
Tận dụng cơ chế hạch toán ngân sách sẵn có của `ModelCallGateway`, không thực hiện đặt trước trùng lặp trong agent.
Nếu chạm trần thời gian hoặc ngân sách, hệ thống ngắt vòng lặp và trả về phản hồi kèm trạng thái `partial_deadline_exceeded` hoặc `partial_budget_exceeded`.
Hệ thống phòng thủ an toàn tuyệt đối tại tầng schema và danh mục công cụ cố định: Mọi hành vi gọi công cụ lạ, truyền tham số `tenantId` giả mạo hoặc truy vấn bản ghi ngoài quyền đều bị máy chủ từ chối ngay lập tức mà không phụ thuộc vào việc phát hiện chuỗi prompt.

Cập nhật file `tests/ai/assistant-agent.test.mjs`.
Thêm các ca kiểm thử cho chặn khẳng định sai trạng thái dù citation hợp lệ, kiểm tra ngắt vòng lặp khi chạm deadline toàn request, kiểm tra đếm riêng lượt gọi mô hình và kiểm thử tấn công jailbreak gọi công cụ cấm.

## Cấu trúc dữ liệu

`RequestBudgetTracker`: bộ theo dõi toàn request gồm deadline tuyệt đối, thời gian còn lại, số lần gọi công cụ đã dùng và số lần gọi mô hình đã dùng.
`ServerAssertion`: khẳng định chuẩn hóa gồm chủ thể, thuộc tính, giá trị đã kiểm chứng và trạng thái nguồn dẫn.
`AssistantExecutionLoopResult`: kết quả vòng lặp gồm phản hồi hoàn chỉnh hoặc phản hồi một phần khi chạm trần tài nguyên.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 3:
`node --experimental-strip-types --test tests/ai/assistant-agent.test.mjs`

Xác minh ca trạng thái bài đăng: Bài đăng có trạng thái `queued`. Mô hình diễn đạt tuyên bố đã đăng thành công kèm citation đúng bài đăng đó. Máy chủ phát hiện mâu thuẫn với khẳng định kỹ thuật và ngăn chặn kết luận sai.
Xác minh ca deadline toàn request: Mô hình gọi công cụ chậm mất 28 giây. Lời gọi kế tiếp nhận thời gian còn lại là 2 giây và tự động hủy khi chạm mốc 30 giây, trả về `partial_deadline_exceeded`.
Xác minh ca jailbreak: Mô hình bị dẫn dụ và cố gắng gọi công cụ `executeSql` hoặc truyền `role: "admin"`. Máy chủ chặn ngay tại tầng thẩm định schema.
