# Chặng 2. Chuẩn hóa, bộ kiểm tra ranh giới và kiểm thử bắt lỗi

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng quy trình tuần tự khép kín gồm chuẩn hóa, kiểm tra ranh giới, loại bỏ lỗi, khử trùng lặp và cắt tỉa danh sách.
Tách biệt hai mức kiểm tra gồm xác minh thuộc tính thực tế bằng code và gắn nhãn diễn đạt tự do chưa chứng minh ngữ nghĩa.
Chặn đứng các số đo giả mạo và các tuyên bố lưu lượng tìm kiếm ngầm trong văn bản.
Cài đặt các ca kiểm thử TDD bắt lỗi thực tế tương ứng với các ca K01, K02, K03 và K04.

## Thay đổi dự kiến

Tạo file mới `src/ai/agents/keywords/normalizer.ts`.
File này chứa các hàm chuẩn hóa chuỗi Unicode NFC, cắt tỉa khoảng trắng đầu cuối và gộp các khoảng trắng thừa.
Bảo toàn nguyên vẹn dấu tiếng Việt và cách viết hoa thường của tên thương hiệu hoặc mã SKU khi hiển thị.
Cung cấp hàm tạo khóa đối chiếu không phân biệt hoa thường phục vụ bước khử trùng lặp.
Hỗ trợ kiểm tra độ dài cụm từ theo số ký tự Unicode với ngưỡng tối đa 100 ký tự.

Tạo file mới `src/ai/agents/keywords/validator.ts`.
File này thực hiện kiểm tra nghiêm ngặt đầu ra thô của mô hình theo đúng thứ tự logic.
Kiểm tra đối soát mã `sourceRefs` có trong danh sách fact sản phẩm.
Kiểm tra số lượng và đơn vị đo lường trong cụm từ khớp chính xác với fact tham chiếu.
Phát hiện và từ chối các trường hợp tham chiếu mã khối lượng 250g nhưng cụm từ lại viết 500g.
Kiểm tra tên thương hiệu trong cụm từ phải trùng khớp thương hiệu sản phẩm và không chứa thương hiệu đối thủ.
Kiểm tra từ cấm theo danh sách có phiên bản.
Kiểm tra an toàn số đo: Trong bản đầu chưa có dataset thực tế, từ chối mọi đối tượng có `basis` là `measured_dataset` hoặc có trường `metricRef`.
Quét trường `reason` để phát hiện và ngăn chặn các tuyên bố số đo ngầm như nhắc đến lượt tìm kiếm trên tháng.
Phân loại kết quả thành hai mức: các cụm từ đạt đủ điều kiện kiểm tra code được gắn nhãn `verified`, các diễn đạt tự do chưa chứng minh được ngữ nghĩa được gắn nhãn `unverified_semantic`.
Loại bỏ hoàn toàn các mục vi phạm và ghi nhận lý do vào danh sách cảnh báo.

Tạo file mới `src/ai/agents/keywords/ranker.ts`.
File này nhận danh sách các từ khóa đã vượt qua bước kiểm tra ranh giới.
Thực hiện khử trùng lặp sau khi đã loại bỏ các mục lỗi, bảo đảm nếu có hai mục trùng nhau mà mục đầu sai mục sau đúng thì mục đúng vẫn được giữ lại.
Sắp xếp theo thứ tự công khai và ổn định: ưu tiên nhóm `verified` trước nhóm `unverified_semantic`, giữ nguyên thứ tự ban đầu của mô hình cho các mục cùng mức.
Cắt tỉa danh sách về tối đa 10 mục.
Nếu sau khi lọc và khử trùng chỉ còn 6 mục hợp lệ thì giữ nguyên 6 mục, không tự động bù thêm để đủ 10.

Cập nhật `tests/ai/keywords-agent.test.mjs` với các ca kiểm thử TDD viết trước và chạy thất bại trước khi cài đặt code.

## Cấu trúc dữ liệu

`NormalizerOptions`: kiểu tùy chọn chuẩn hóa gồm locale chuỗi và maxPhraseLength số nguyên.
`KeywordValidationContext`: kiểu ngữ cảnh kiểm tra gồm factLookup bản đồ fact, forbiddenList danh sách từ cấm và brand chuỗi tùy chọn.
`ProcessedKeywordCandidate`: kiểu nội bộ sau khi qua bộ lọc gồm item đối tượng KeywordItem và rawIndex số nguyên.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy toàn bộ các ca kiểm thử TDD cho Chặng 2:
`node --experimental-strip-types --test tests/ai/keywords-agent.test.mjs`

Xác minh ca K01: "cà phê" và "  cà   phê  " gộp thành một gợi ý duy nhất, giữ nguyên dấu tiếng Việt.
Xác minh ca K02: Cụm từ có ref fact nhưng ghi sai khối lượng 500g thay vì 250g bị loại bỏ hoặc đánh dấu không hợp lệ.
Xác minh ca K03: Cụm từ chứa metricRef hoặc trường reason ghi 10.000 lượt tìm kiếm trên tháng bị từ chối thẳng thừng.
Xác minh ca K04: Đầu vào 50 mục gồm cả trùng lặp và vi phạm được lọc và khử trùng trước khi cắt tỉa về tối đa 10 mục.
Xác minh ca khử trùng: Hai mục trùng nhau với mục đầu sai mục sau đúng thì mục đúng được bảo toàn thành công.
