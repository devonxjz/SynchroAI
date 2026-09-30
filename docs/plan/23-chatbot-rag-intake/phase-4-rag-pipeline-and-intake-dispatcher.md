# Chặng 4. Quy trình RAG, tạo dẫn chứng và bộ chuyển giao nhiệm vụ

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng quy trình truy xuất RAG kết hợp vector tương đồng và bóc tách thực thể.
Ghép nối các đoạn tri thức truy xuất được vào prompt có cấu trúc để mô hình đối chiếu lập luận.
Xây dựng bộ chuyển giao nhiệm vụ `IntakeTaskDispatcher` trích xuất thông số sản phẩm và tạo `WorkflowInput` chuẩn mực cho quy trình điều phối `StepPipelineEngine`.
Đảm bảo mọi thông số kỹ thuật tạo ra đều có căn cứ tham chiếu nguồn cụ thể.

## Thay đổi dự kiến

Tạo mới file `src/ai/chatbot/rag.ts`.
Triển khai bộ điều phối RAG `RagRetrieverPipeline`.
Tiếp nhận câu hỏi hoặc văn bản đầu vào từ người bán.
Tạo vector nhúng cho câu truy vấn và tìm kiếm các đoạn chunk có điểm tương đồng cao nhất trong kho vector của doanh nghiệp.
Lọc bỏ các đoạn có điểm tương đồng dưới ngưỡng `scoreThreshold` (mặc định 0.70).
Định dạng các đoạn kiến thức trích xuất thành khối ngữ cảnh có gắn mã định danh `chunkId` và tên tài liệu gốc.
Tạo danh sách nguồn dẫn chứng `Citation` tương ứng cho từng đoạn được sử dụng.

Tạo mới file `src/ai/chatbot/dispatcher.ts`.
Triển khai bộ tiếp nhận và chuyển giao nhiệm vụ `IntakeTaskDispatcher`.
Phân tích yêu cầu hội thoại kết hợp dữ liệu tri thức đã truy xuất để nhận diện loại nhiệm vụ:
- `prepare_listing`: yêu cầu tạo bài đăng mới từ văn bản mô tả hoặc tài liệu sản phẩm.
- `rewrite_content`: yêu cầu tối ưu lại nội dung văn bản.
- `retry_step`: yêu cầu chạy lại bước bị lỗi.
Trích xuất dữ liệu có cấu trúc `ProductSnapshot` gồm tiêu đề, mô tả và các thuộc tính chi tiết `attributes`.
Gắn mã bám sát sự thật `sourceRefs` trỏ trực tiếp vào các `chunkId` đã đối chiếu.
Tạo cấu trúc `WorkflowInput` hoàn chỉnh tương thích với `src/ai/workflows/prepare-listing/types.ts`.
Chỉ lưu bản nháp nhiệm vụ ở bước intake. Sau xác nhận kích hoạt riêng, gọi `PrepareListingOrchestrator.start`; yêu cầu retry gọi `retryStep` với run ID và step cụ thể. Không gọi trực tiếp engine.

Thực hiện [hợp đồng tích hợp agent](agent-integration-contract.md), gồm nối Content thật, thống nhất fact IDs/provenance, giữ locale nguồn và kiểm tra các cảnh báo downstream.
Tuyệt đối không tự ý gửi bài lên sàn, bảo đảm mọi kết quả đều phải đi qua bước kiểm tra quy tắc sàn Khối 08 và cổng chính sách Khối 09.

Cập nhật file `tests/ai/chatbot-rag.test.mjs`.
Thêm các ca kiểm thử cho quy trình RAG truy xuất chính xác đoạn quy cách, kiểm tra trích xuất đúng `ProductSnapshot` và kiểm tra chuyển giao sang `WorkflowInput`.

## Cấu trúc dữ liệu

`RagContextBundle`: gói tri thức RAG gồm danh sách đoạn trích dẫn, điểm tương đồng, mã tham chiếu và thời điểm truy xuất.
`ExtractedProductFact`: sự thật sản phẩm trích xuất được gồm tên thuộc tính, giá trị, đơn vị đo và mã đoạn nguồn chứng minh.
`DispatchedIntakeResult`: kết quả chuyển giao gồm mã nhiệm vụ, trạng thái khởi tạo quy trình, cấu trúc `WorkflowInput` và danh sách cảnh báo.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 4:
`node --experimental-strip-types --test tests/ai/chatbot-rag.test.mjs`

Xác minh ca RAG: Đặt câu hỏi về nguồn gốc xuất xứ của Cà phê Robusta. Hệ thống truy xuất chính xác đoạn văn bản chứa "Đắk Lắk" với điểm tương đồng trên 0.85.
Xác minh ca trích xuất thông số: Người bán gửi đoạn văn bản giới thiệu sản phẩm mới. Hệ thống trích xuất đúng tiêu đề, khối lượng 500g và xuất xứ vào cấu trúc `ProductSnapshot`.
Xác minh ca chuyển giao: Khởi tạo thành công `WorkflowInput` có `intent: 'prepare_listing'` sẵn sàng cho quy trình điều phối Khối 04.
