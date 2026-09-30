# Chặng 1. Hợp đồng dữ liệu, tái sử dụng facts và danh sách từ cấm

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng hệ thống kiểu dữ liệu nghiệp vụ chặt chẽ cho tác nhân từ khóa.
Tái sử dụng logic trích xuất thuộc tính sự thật sản phẩm từ khối nội dung hiện có.
Thiết lập quy tắc phân giải dữ liệu thuộc tính từ bản chụp và quản lý danh sách từ cấm có gắn phiên bản.

## Thay đổi dự kiến

Tạo file mới `src/ai/agents/keywords/types.ts`.
File này chứa các kiểu dữ liệu sử dụng discriminated union để ngăn chặn các trạng thái mâu thuẫn.
Định nghĩa rõ hai trạng thái kết quả đầu ra gồm hoàn thành thành công hoặc chế độ fallback có mã lỗi và cảnh báo.
Không chứa các cờ làm suy yếu kiểm tra như cho phép số đo không kiểm chứng hay biến nguồn tham chiếu thành tùy chọn.

Tạo file mới `src/ai/agents/keywords/facts.ts`.
File này tái xuất khẩu và tái sử dụng trực tiếp các hàm `buildProductFacts` và `createFactLookup` từ module `content/facts.ts`.
Bổ sung hàm phân giải thuộc tính thương hiệu và danh mục từ bản chụp sản phẩm.
Thương hiệu được lấy từ tham số truyền vào hoặc trường thuộc tính của bản chụp.
Nếu thiếu hoặc có xung đột, thương hiệu được đánh dấu là chưa xác nhận.
Danh mục xác nhận chỉ được nhận khi có nguồn từ người bán hoặc tham số rõ ràng.
Tuyệt đối không tự động nâng danh mục do mô hình suy đoán thành danh mục xác nhận.

Tạo file mới `src/ai/agents/keywords/forbidden.ts`.
File này chứa cấu trúc danh sách từ cấm có trường phiên bản và các hàm kiểm tra đối soát.
Khớp từ cấm theo ranh giới cụm từ thay vì so khớp chuỗi con thô sơ.

Tạo khung kiểm thử ban đầu tại `tests/ai/keywords-agent.test.mjs`.

## Cấu trúc dữ liệu

`ProductFactKeywordItem`: kiểu từ khóa fact gồm phrase, reason, sourceRefs, basis giá trị product_fact và groundingStatus nhận verified hoặc unverified_semantic.
`MeasuredDatasetKeywordItem`: kiểu từ khóa đo lường gồm phrase, reason, sourceRefs, basis giá trị measured_dataset, groundingStatus giá trị verified, metricRef chuỗi và datasetId chuỗi.
`KeywordItem`: kiểu hợp phân biệt giữa ProductFactKeywordItem và MeasuredDatasetKeywordItem.
`KeywordOutput`: kiểu đầu ra gồm status nhận completed hoặc fallback, errorCode tùy chọn, keywords mảng KeywordItem, warnings mảng chuỗi, snapshotVersion số nguyên và forbiddenListVersion chuỗi.
`KeywordValidationResult`: kiểu hợp phân biệt gồm nhánh thành công chứa data hợp lệ và nhánh thất bại chứa errors mảng chuỗi.
`ForbiddenKeywordList`: kiểu đối tượng danh sách cấm gồm version chuỗi và terms mảng chuỗi.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

Lệnh này phải vượt qua và xác nhận không có xung đột kiểu.

### Chạy thực tế

Chạy file kiểm thử khung vừa tạo:
`node --experimental-strip-types --test tests/ai/keywords-agent.test.mjs`

Xác minh việc tái sử dụng fact từ content hoạt động chính xác với bản chụp mẫu.
Xác minh hàm kiểm tra từ cấm nhận diện đúng từ cấm theo phiên bản và không khớp nhầm chuỗi con vô hại.
Xác minh hàm phân giải không tự nâng danh mục suy đoán thành danh mục xác nhận.
