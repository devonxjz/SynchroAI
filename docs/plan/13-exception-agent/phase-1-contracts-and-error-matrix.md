# Chặng 1. Hợp đồng dữ liệu, bằng chứng dispatch và bộ lọc an toàn

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng nền tảng kiểu dữ liệu cho toàn bộ tác nhân ngoại lệ.
Tiếp nhận hợp đồng bằng chứng dispatch từ Khối 11 gồm các trạng thái xác định rõ ràng.
Định nghĩa ma trận ánh xạ mã lỗi sàn có gắn nhãn demo fixture và liên kết tài liệu xác thực.
Xây dựng bộ lọc an toàn dựa trên danh sách trường cho phép thay vì chỉ quét chuỗi thô.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/exception/types.ts`.
Định nghĩa các kiểu dữ liệu cho trạng thái dispatch từ adapter sàn gồm `confirmed`, `rejected`, `retryable_not_sent` và `unknown`.
Định nghĩa thông tin năng lực adapter gồm cờ hỗ trợ chống trùng `supportsIdempotency`.
Định nghĩa kiểu dữ liệu cho lớp lỗi, hành vi xử lý, ranh giới bản vá và ngữ cảnh thao tác.
Quy định rõ `failureClass` và `nextAction` chỉ do mã nguồn xác định và gán sau cùng.
Mô hình ngôn ngữ không được phép cung cấp hoặc thay đổi hai trường này.

Tạo mới file `src/ai/agents/exception/matrix.ts`.
Thiết lập bảng tra cứu mã lỗi chuẩn hóa cho adapter demo và adapter Shopee tương lai.
Mỗi bảng ánh xạ gắn với thao tác cụ thể, phiên bản adapter, trạng thái dispatch tương ứng và nguồn tài liệu xác minh.
Mã lỗi `error_auth` được gắn nhãn rõ là fixture demo cho đến khi có tài liệu chính thức từ sàn.
Các mã lỗi không nằm trong danh mục xác nhận tự động rơi vào nhóm không xác định.

Tạo mới file `src/ai/agents/exception/sanitizer.ts`.
Xây dựng hàm tạo `SanitizedErrorPayload` theo nguyên tắc danh sách trường cho phép.
Hệ thống chỉ trích xuất các trường an toàn gồm mã lỗi chuẩn hóa, thông điệp an toàn đã lọc, mã lỗi phụ, mã tương quan và thời điểm phát sinh.
Mặc định không sao chép toàn bộ body hoặc header phản hồi của sàn vào cấu trúc dữ liệu.
Bổ sung lớp quét chuỗi để che giấu các khóa bí mật hoặc số điện thoại nếu xuất hiện trong thông điệp an toàn.
Việc lọc sạch được thực hiện trước khi ghi log lỗi, lưu trạng thái hoặc gửi cho mô hình.

Tạo mới file `tests/ai/exception-agent.test.mjs`.
Thiết lập các ca kiểm thử cho việc tạo dữ liệu an toàn, kiểm tra payload thực tế gửi tới provider, kiểm tra bản ghi công việc và log lỗi.

## Cấu trúc dữ liệu

`DispatchStatus`: union trạng thái kết quả từ adapter gồm `confirmed`, `rejected`, `retryable_not_sent` và `unknown`.
`AdapterCapabilities`: thông tin năng lực gồm `supportsIdempotency` và `adapterVersion`.
`SanitizedErrorPayload`: cấu trúc lỗi an toàn chỉ giữ lại các trường cho phép, loại bỏ hoàn toàn header và body thô.
`ExceptionAnalysisResult`: kết quả phân tích gồm tóm tắt tiếng Việt, bằng chứng, danh sách bản vá, cảnh báo, lớp lỗi và hướng xử lý do mã nguồn ấn định.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 1:
`node --experimental-strip-types --test tests/ai/exception-agent.test.mjs`

Xác minh ca EX07: Phản hồi lỗi chứa header ủy quyền và body chứa thông tin nhạy cảm. Cấu trúc `SanitizedErrorPayload` chỉ giữ lại mã lỗi và thông điệp an toàn. Dữ liệu thực tế gửi tới mô hình, bản ghi task và log hoàn toàn sạch bí mật.
Xác minh ca bảng ánh xạ: Mã fixture demo được nhận diện đúng lớp lỗi và trạng thái dispatch.
Xác minh ca mã lạ: Mã lỗi chưa ghi nhận trong bảng đi vào `unknown` kèm theo bằng chứng dispatch chưa xác định.
