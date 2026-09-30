# Chặng 3. Bộ giải thích bằng mô hình, danh sách trường bản vá và căn cứ fact

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Sinh thông điệp tóm tắt lỗi rõ ràng bằng tiếng Việt cho người bán.
Sử dụng mẫu văn bản cố định cho các lỗi vận hành rõ ràng để tối ưu chi phí.
Gọi mô hình ngôn ngữ khi cần phân tích lỗi phức tạp hoặc đề xuất bản vá nội dung.
Xây dựng bộ thẩm định bản vá nghiêm ngặt với đường dẫn trường cụ thể, gắn chặt với fact nguồn đã xác minh và phiên bản dữ liệu máy chủ.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/exception/prompt.ts`.
Thiết lập mẫu câu tóm tắt tiếng Việt cố định cho các lỗi token hết hạn, vượt tần suất hoặc ngắt kết nối trước khi gửi.
Xây dựng system prompt và schema JSON chặt chẽ cho tác vụ giải thích lỗi nhiều trường.
Ràng buộc mô hình chỉ được đề xuất bản vá trên các trường thuộc tính được chỉ định.
Nếu thông tin cần thiết không có trong sự thật sản phẩm, mô hình bắt buộc phải chuyển sang yêu cầu người bán bổ sung `needs_input`.
Tuyệt đối nghiêm cấm mô hình tự suy diễn hoặc phỏng đoán thương hiệu hoặc thành phần khi hồ sơ sự thật không có dữ liệu.

Tạo mới file `src/ai/agents/exception/patch-validator.ts`.
Triển khai hàm thẩm định bản vá `validateFieldPatches` với danh sách trường cho phép có cấu trúc cụ thể:
1. `title`: kiểu chuỗi, tuân thủ giới hạn độ dài của sàn.
2. `description`: kiểu chuỗi, tuân thủ định dạng văn bản.
3. `attributes.<attributeId>`: kiểu chuỗi, bắt buộc mã thuộc tính phải nằm trong danh mục hợp lệ của sàn.
Tuyệt đối không sử dụng mẫu ký tự đại diện `attributes.*` để ngăn chặn việc chèn lén giá bán, số lượng tồn kho hoặc mã SKU.
Bản vá phải gắn liền với mã đối tượng và phiên bản kỳ vọng `expectedVersion`.
Giá trị trước đó `previousValue` bắt buộc phải đối soát và lấy từ dữ liệu máy chủ, không lấy từ văn bản mô hình lặp lại.
Bản vá phải liên kết với fact nguồn đúng phiên bản `factSourceVersion`.
Việc tồn tại `sourceRef` không chứng minh giá trị mới là đúng nếu fact không chứa thông tin đó.
Bản vá hợp lệ chỉ được dùng để tạo bản nháp đề xuất mới theo hợp đồng Khối 10 và phải đi qua lại Review 08 và Policy 09.

Tạo mới file `src/ai/agents/exception/generator.ts`.
Điều phối luồng sinh tóm tắt và bản vá.
Lỗi có mẫu câu cố định được trả về ngay mà không qua mô hình.
Khi gọi mô hình qua `ModelCallGateway`, hệ thống gửi kèm bản chụp fact và dữ liệu lỗi đã lọc sạch.
Kiểm tra kết quả đầu ra qua bộ thẩm định bản vá.
Mã nguồn gán cứng lớp lỗi và hướng xử lý sau cùng, không nhận hai trường này từ mô hình.

Cập nhật file `tests/ai/exception-agent.test.mjs`.
Thêm các ca kiểm thử cho sinh tóm tắt bằng mẫu, kiểm tra bản vá thiếu fact Brand chuyển thành `needs_input`, kiểm tra từ chối bản vá trên version cũ và kiểm tra từ chối các trường cấm.

## Cấu trúc dữ liệu

`AllowedPatchFieldPath`: union các đường dẫn được phép sửa gồm `title`, `description` và `attributes.${string}` có mã thuộc tính cụ thể.
`ValidatedFieldPatch`: cấu trúc bản vá hợp lệ gồm đường dẫn trường cụ thể, giá trị cũ từ máy chủ, giá trị mới có căn cứ fact và phiên bản kỳ vọng.
`PatchValidationOutcome`: kết quả thẩm định gồm trạng thái hợp lệ, danh sách bản vá đã xác minh và yêu cầu bổ sung thông tin nếu thiếu fact nguồn.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 3:
`node --experimental-strip-types --test tests/ai/exception-agent.test.mjs`

Xác minh ca thiếu fact Brand: Sản phẩm bị từ chối do thiếu thuộc tính Brand và hồ sơ fact chưa có thông tin Brand. Hệ thống trả về yêu cầu người bán bổ sung thông tin, không cho phép mô hình tự đoán thương hiệu.
Xác minh ca version cũ: Bản vá được tạo cho phiên bản 1 nhưng dữ liệu máy chủ đã nâng lên phiên bản 2. Bộ thẩm định từ chối áp dụng bản vá.
Xác minh ca LLM đề xuất retry lỗi unknown: Mô hình gợi ý retry trong phần giải thích văn bản. Mã nguồn vẫn giữ nguyên quyết định đối soát kỹ thuật đã ấn định trước đó.
