# Chặng 2. Phân loại lỗi bằng mã nguồn, kiểm tra dispatch và ngân sách nguyên tử

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng hàm phân loại lỗi thuần túy `classifyFailure` dựa trên bằng chứng dispatch từ adapter.
Xác định hướng xử lý an toàn cho các thao tác ghi và thao tác đọc.
Quản lý ngân sách thử lại nguyên tử, bền vững trước sự cố restart tiến trình và tranh chấp giữa các worker.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/exception/budget.ts`.
Quản lý ngân sách thử lại gắn với mã định danh hành động nghiệp vụ `actionId` và `attemptId`.
Hệ thống phân định rành mạch giữa 1 lần chạy ban đầu và số lần retry tối đa được phép.
Thực hiện thao tác nhận lượt thử bằng cơ chế nguyên tử trước khi worker dispatch sang sàn.
Nếu hai worker cùng tranh chấp lượt thử cuối cùng, chỉ một worker nhận được token và được phép dispatch.
Lưu vết trạng thái ngân sách bền vững để không bị cấp lại lượt thử khi tiến trình restart.
Nếu hàng đợi tin nhắn giao lại cùng một event, hệ thống phát hiện event trùng và không tính thêm một lần thử mới.
Lịch retry xác định rõ mốc thời gian cụ thể `nextAllowedAt` theo chuẩn ISO 8601.

Tạo mới file `src/ai/agents/exception/classifier.ts`.
Cung cấp hàm thuần túy `classifyFailure` tiếp nhận lỗi đã lọc, bằng chứng dispatch từ adapter và thông tin an toàn của thao tác.
Nếu adapter trả về `retryable_not_sent` và thao tác thuộc loại an toàn hoặc sàn hỗ trợ chống trùng, hệ thống cho phép retry có giới hạn ngân sách.
Nếu thao tác ghi gặp lỗi `unknown` hoặc timeout không rõ phản hồi từ sàn, hệ thống luôn ấn định hành động `reconcile_external` để đối soát, tuyệt đối cấm gửi lệnh tạo mới lần hai.
Khi ngân sách thử lại đã cạn, hệ thống chuyển sang hành động dừng chờ can thiệp thủ công `halt_for_human`.
Hàm phân loại gán cứng kết luận cuối cùng, mô hình ngôn ngữ không được phép can thiệp vào quyết định này.

Cập nhật file `tests/ai/exception-agent.test.mjs`.
Thêm các ca kiểm thử cho hai worker tranh chấp lượt retry cuối, kiểm tra restart sau khi hết ngân sách, kiểm tra queue giao lại cùng event và kiểm tra chuyển hướng đối soát khi gặp lỗi timeout không rõ dispatch.

## Cấu trúc dữ liệu

`AttemptToken`: token nguyên tử ghi nhận lượt dispatch gồm `actionId`, số thứ tự lượt thử, thời điểm cấp phát và chữ ký xác thực.
`ActionBudgetRecord`: bản ghi ngân sách bền vững gồm số lượt ban đầu, số lần retry tối đa, số lượt đã sử dụng và thời điểm được phép thử tiếp theo `nextAllowedAt`.
`DeterministicClassification`: kết luận phân loại do mã nguồn ấn định gồm lớp lỗi, hành động xử lý, lý do kỹ thuật và bằng chứng dispatch.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 2:
`node --experimental-strip-types --test tests/ai/exception-agent.test.mjs`

Xác minh ca tranh chấp: Hai worker cùng yêu cầu lượt thử cuối cùng cho cùng một action. Chỉ một worker nhận được token thành công.
Xác minh ca restart: Tiến trình khởi động lại sau khi ngân sách đã cạn kiệt. Hệ thống từ chối cấp thêm lượt thử.
Xác minh ca queue giao lại: Cùng một mã event được hàng đợi phân phối lại. Bộ đếm ngân sách không tăng thêm lần thử.
Xác minh ca timeout tạo bài: Sàn trả về lỗi timeout và dispatch ở trạng thái `unknown`. Hàm phân loại trả về `reconcile_external`, không cho phép gọi lại lệnh tạo mới.
