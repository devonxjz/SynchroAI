# 23. Chatbot AI Tiếp nhận đầu vào & RAG Điều phối

[Xem Kế hoạch chi tiết 5 chặng triển khai](23-chatbot-rag-intake/overview.md)

## Mục tiêu

Chatbot AI trong webapp đóng vai trò tiếp nhận thông tin đầu vào từ người bán, phân tích tài liệu quy cách sản phẩm và điều phối giao việc vào hệ thống.
Áp dụng quy trình chuẩn gồm phân tách tài liệu (Chunking), nhúng vector ngữ nghĩa qua mô hình OpenAI (Embedding), truy xuất tri thức tăng cường (RAG) và quản lý ngữ cảnh hai tầng ngắn hạn và dài hạn qua LangChain.
Module phụ thuộc vào Khối 01, 03, 04 và 14.
Mã nguồn nằm tại `src/ai/chatbot/` và điểm cuối API tại `src/app/api/chatbot/intake/`.

## Đầu vào và đầu ra

Đầu vào gồm văn bản yêu cầu tự do của người bán, tài liệu quy cách sản phẩm (nhập tay hoặc dán văn bản), mã phiên hội thoại, thông tin ngữ cảnh máy chủ xác thực và khóa bất biến idempotency.
Đầu ra có cấu trúc gồm câu trả lời diễn đạt bằng tiếng Việt tự nhiên, danh sách đoạn tri thức tham chiếu RAG có điểm tương đồng, huy hiệu ký ức dài hạn được áp dụng và bản nháp nhiệm vụ `WorkflowInput` sẵn sàng chuyển giao cho quy trình điều phối.

| Bước xử lý | Trách nhiệm và công nghệ | Ranh giới an toàn |
|---|---|---|
| Phân đoạn văn bản (Chunking) | `RecursiveTextChunker` phân tách theo dấu câu và ranh giới đoạn | Không cắt rời câu phủ định hoặc thông số định lượng, bảo toàn offset |
| Nhúng vector (Embeddings) | Mô hình OpenAI `text-embedding-3-small` (1536 chiều) | Tích hợp gateway ngân sách và bộ nhớ đệm cache theo mã băm |
| Kho vector (Vector Store) | `TenantIsolatedVectorStore` tính điểm tương đồng cosine | Lọc cứng theo `tenantId` và `mode`, tuyệt đối không rò rỉ chéo |
| Ngữ cảnh ngắn hạn (Short-term) | LangChain `ChatMessageHistory` với cửa sổ trượt | Giới hạn 6 lượt gần nhất hoặc trần 2.000 token, lọc PII theo vai trò |
| Ngữ cảnh dài hạn (Long-term) | LangChain `LongTermMemoryStore` lưu thực thể và sở thích | Lưu trữ sở thích bán hàng và thuật ngữ quen thuộc xuyên phiên |
| Truy xuất tri thức (RAG) | `RagRetrieverPipeline` lọc theo ngưỡng điểm tương đồng | Chỉ đưa các đoạn tri thức có điểm trên 0.70 vào prompt đối chiếu |
| Chuyển giao nhiệm vụ (Intake Dispatch) | `IntakeTaskDispatcher` trích xuất `ProductSnapshot` | Khởi tạo `WorkflowInput` chuyển giao sang `StepPipelineEngine`, không tự gửi sàn |

## Các nguyên tắc triển khai

1. Phân đoạn văn bản nhận biết câu tiếng Việt. Thuật toán chunking ưu tiên ngắt theo các mốc ngữ pháp tự nhiên. Mỗi đoạn chunk được gắn siêu dữ liệu nguồn rõ ràng để phục vụ việc trích dẫn bằng chứng.
2. Kiểm soát chi phí mô hình nhúng OpenAI. Việc gọi API nhúng được theo dõi chặt chẽ qua sổ cái ngân sách `BudgetLedger`. Các đoạn văn bản có nội dung không đổi được tái sử dụng vector từ bộ nhớ đệm.
3. Cô lập dữ liệu vector tuyệt đối. Mọi thao tác tìm kiếm tương đồng vector đều được lọc theo doanh nghiệp tại tầng lưu trữ trước khi tính toán điểm số.
4. Quản lý ngữ cảnh hai tầng bảo vệ cửa sổ ngữ cảnh. Tầng ngắn hạn cắt tỉa các tin nhắn cũ để không làm tràn token mô hình. Tầng dài hạn trích xuất sở thích người bán để cá nhân hóa câu trả lời mà không phải hỏi lại nhiều lần.
5. Giao việc có cấu trúc và có căn cứ xác thực. Chatbot không trực tiếp gửi bài lên sàn thương mại điện tử. Chatbot bóc tách dữ liệu thành bản chụp sự thật sản phẩm có dẫn chứng và kích hoạt quy trình kiểm tra quy tắc sàn Khối 08 và chính sách Khối 09.

## Ma trận kiểm thử

| Mã ca | Kỳ vọng kiểm thử |
|---|---|
| CB01 | Phân đoạn đệ quy bảo toàn câu và ranh giới đoạn dưới 500 ký tự |
| CB02 | Câu phủ định và thông số đo lường không bị cắt rời sang đoạn khác |
| CB03 | Tạo vector nhúng 1536 chiều với mô hình OpenAI text-embedding-3-small |
| CB04 | Gửi lại đoạn văn bản cũ nhận kết quả tức thì từ cache với 0 token tiêu tốn |
| CB05 | Tìm kiếm cosine đạt độ tương đồng cao trên tài liệu tiếng Việt |
| CB06 | Truy vấn vector của doanh nghiệp A không trả về bất kỳ kết quả nào của B |
| CB07 | Cửa sổ trượt ngắn hạn LangChain cắt tỉa lượt cũ giữ tổng token dưới 2.000 |
| CB08 | Mở phiên mới tự động nạp lại sở thích bán hàng dài hạn đã lưu |
| CB09 | Người dùng vai trò Viewer được che giấu PII trong toàn bộ bộ nhớ |
| CB10 | Truy xuất RAG trả về câu trả lời có dẫn chứng tham chiếu chunkId chính xác |
| CB11 | Chuyển giao văn bản đầu vào thành ProductSnapshot và WorkflowInput chuẩn mực |
| CB12 | Kiểm thử toàn trình qua điểm cuối API POST /api/chatbot/intake và xử lý khóa bất biến |

Điều kiện hoàn thành khi bộ kiểm thử 12 ca đạt 100% thành công, giao diện Copilot hiển thị trực quan các khối tri thức RAG và thẻ chuyển giao nhiệm vụ hoạt động chuẩn xác.
