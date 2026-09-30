# Chặng 2. Mô hình nhúng OpenAI, cache ngân sách và kho vector cô lập

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng bộ tạo vector nhúng sử dụng mô hình OpenAI `text-embedding-3-small`.
Tích hợp kiểm soát ngân sách token và bộ nhớ đệm kết quả nhúng theo mã băm văn bản.
Xây dựng kho lưu trữ vector có khả năng tính toán điểm tương đồng cosine và áp dụng bộ lọc phân vùng doanh nghiệp nghiêm ngặt.

## Thay đổi dự kiến

Tạo mới file `src/ai/chatbot/embeddings.ts`.
Triển khai lớp `OpenAIEmbeddingProvider` kết nối với API nhúng của OpenAI.
Sử dụng mô hình mặc định `text-embedding-3-small` tạo ra vector có kích thước 1536 chiều.
Tích hợp với `BudgetLedger` của cổng gateway để kiểm soát chi phí token trước khi gửi yêu cầu.
Áp dụng cơ chế lưu đệm `EmbeddingCache` dựa trên mã băm nội dung của đoạn văn bản và phiên bản mô hình để tránh tính toán lại các đoạn trùng lặp.
Cung cấp phương thức xử lý theo mẻ (batching) tối đa 20 đoạn mỗi yêu cầu để tối ưu hóa thời gian mạng.

Tạo mới file `src/ai/chatbot/vector-store.ts`.
Triển khai kho lưu trữ vector trong bộ nhớ `TenantIsolatedVectorStore`.
Cung cấp phương thức nạp dữ liệu `addChunks` ghi nhận mảng vector kèm theo siêu dữ liệu.
Cung cấp phương thức tìm kiếm tương đồng `similaritySearch` tiếp nhận vector câu hỏi, bộ lọc siêu dữ liệu, số lượng kết quả tối đa `topK` và ngưỡng tương đồng tối thiểu `scoreThreshold`.
Tính toán độ tương đồng cosine giữa vector truy vấn và các vector trong kho.
Áp dụng bộ lọc trước bắt buộc: Chỉ duyệt qua các vector có `tenantId` và `mode` khớp hoàn toàn với ngữ cảnh gọi, loại bỏ triệt để nguy cơ rò rỉ dữ liệu giữa các doanh nghiệp.

Cập nhật file `tests/ai/chatbot-rag.test.mjs`.
Thêm các ca kiểm thử cho tạo vector nhúng, kiểm tra bộ nhớ đệm cache hit, kiểm tra tính toán điểm cosine và kiểm thử chặn tìm kiếm xuyên doanh nghiệp.

## Cấu trúc dữ liệu

`EmbeddingResponse`: kết quả nhúng gồm mảng vector số thực, số token đã tiêu thụ và thời gian xử lý.
`VectorSearchFilter`: bộ lọc bắt buộc gồm `tenantId`, `mode`, mã tài liệu tùy chọn và khoảng thời gian.
`VectorSearchResult`: kết quả tìm kiếm gồm đoạn văn bản nguồn `chunk`, điểm tương đồng `score` và vị trí tham chiếu.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 2:
`node --experimental-strip-types --test tests/ai/chatbot-rag.test.mjs`

Xác minh ca nhúng văn bản: Đoạn văn bản mẫu nhận về vector 1536 phần tử số thực chuẩn hóa.
Xác minh ca cache: Gửi lại cùng một đoạn văn bản nhận lại vector tức thì từ cache với số token ghi nhận là 0.
Xác minh ca cô lập doanh nghiệp: Doanh nghiệp A tìm kiếm tài liệu có từ khóa trùng với tài liệu của doanh nghiệp B. Kết quả tìm kiếm hoàn toàn không chứa bất kỳ đoạn văn bản nào của doanh nghiệp B.
