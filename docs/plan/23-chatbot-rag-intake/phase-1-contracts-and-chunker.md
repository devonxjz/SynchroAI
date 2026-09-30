# Chặng 1. Hợp đồng dữ liệu, bộ phân tách văn bản và siêu dữ liệu

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng nền tảng kiểu dữ liệu cho toàn bộ module Chatbot AI tiếp nhận.
Triển khai thuật toán phân tách văn bản đệ quy nhận biết câu tiếng Việt và ranh giới đoạn.
Lưu giữ siêu dữ liệu nguồn gồm định danh doanh nghiệp, mã tài liệu, phần mục, phiên bản và vị trí ký tự offset.

## Thay đổi dự kiến

Tạo mới file `src/ai/chatbot/types.ts`.
Định nghĩa cấu trúc đoạn văn bản `DocumentChunk` chứa nội dung, vị trí bắt đầu và kết thúc, siêu dữ liệu ngữ cảnh.
Định nghĩa bản ghi lưu trữ vector `VectorIndexRecord` chứa mảng số thực vector nhúng, mã đoạn và bộ lọc phân vùng.
Định nghĩa các kiểu dữ liệu cho phiên hội thoại `ChatbotSessionContext`, mục nhớ ngắn hạn `ShortTermTurn` và mục nhớ dài hạn `LongTermMemoryEntry`.
Định nghĩa cấu trúc bản nháp nhiệm vụ tiếp nhận `IntakeTaskDraft` gồm mã nhiệm vụ, loại quy trình chỉ định, bản chụp sự thật sản phẩm trích xuất và trạng thái sẵn sàng chuyển giao.

Tạo mới file `src/ai/chatbot/chunker.ts`.
Triển khai lớp `RecursiveTextChunker` phân đoạn văn bản thông minh.
Ưu tiên ngắt đoạn theo dấu xuống dòng kép `\n\n`, dấu xuống dòng đơn `\n`, dấu chấm kết thúc câu `.`, dấu chấm than `!` hoặc dấu hỏi `?`.
Cung cấp tham số cấu hình kích thước đoạn mục tiêu `chunkSize` (mặc định 500 ký tự) và độ gối đầu `chunkOverlap` (mặc định 50 ký tự).
Đảm bảo không cắt đôi từ ngữ hoặc ngắt giữa các câu phủ định chứa từ "không", "chưa", "chẳng".
Gắn mã định danh duy nhất cho từng đoạn và tính toán chính xác vị trí offset so với văn bản gốc để phục vụ trích dẫn nguồn.

Tạo mới file `tests/ai/chatbot-rag.test.mjs`.
Thiết lập các ca kiểm thử cho việc phân đoạn văn bản dài, kiểm tra bảo tồn câu phủ định và kiểm tra việc gắn siêu dữ liệu doanh nghiệp cho từng đoạn chunk.

## Cấu trúc dữ liệu

`DocumentChunk`: cấu trúc đoạn văn bản gồm mã đoạn, nội dung chữ, vị trí ký tự đầu cuối, mã tài liệu nguồn, mã doanh nghiệp và phiên bản.
`ChunkerConfig`: cấu hình phân đoạn gồm kích thước tối đa, độ dài gối đầu và danh sách ký tự phân tách ưu tiên.
`IntakeTaskDraft`: cấu trúc nhiệm vụ tiếp nhận gồm mã dự thảo, loại quy trình chỉ định, dữ liệu sản phẩm bóc tách và các nguồn tham chiếu.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 1:
`node --experimental-strip-types --test tests/ai/chatbot-rag.test.mjs`

Xác minh ca phân đoạn: Văn bản quy cách sản phẩm 2.000 ký tự được tách thành các đoạn không vượt quá 500 ký tự và có 50 ký tự gối đầu.
Xác minh ca bảo toàn câu phủ định: Đoạn văn chứa câu "Sản phẩm không chứa chất bảo quản" không bị cắt rời từ "không" sang đoạn kế tiếp.
Xác minh ca vị trí offset: Trích xuất đoạn văn theo chỉ số offset mở lại khớp chính xác vị trí trong văn bản gốc.
