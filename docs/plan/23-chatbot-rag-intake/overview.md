# Kế hoạch triển khai Chatbot AI Tiếp nhận & Điều phối Công việc (Chatbot Intake RAG & Context Management)

## Bối cảnh

Người bán khi sử dụng webapp thường cung cấp thông tin sản phẩm, tài liệu nhà cung cấp hoặc yêu cầu kinh doanh dưới dạng văn bản tự do và hội thoại không có cấu trúc.
Chatbot AI tiếp nhận đóng vai trò làm cửa ngõ đầu vào thông minh.
Hệ thống chịu trách nhiệm phân tách tài liệu, nhúng vector ngữ nghĩa qua mô hình OpenAI, truy xuất thông tin liên quan qua cơ chế RAG và quản lý ngữ cảnh ngắn hạn lẫn dài hạn qua LangChain.
Từ các thông tin đã được kiểm chứng, Chatbot tự động tạo bản nháp nhiệm vụ và chuyển giao vào quy trình điều phối chuẩn của hệ thống.

## Phạm vi

### Bao gồm

1. Định nghĩa kiểu dữ liệu cho đoạn văn bản chunk, bản ghi vector, yêu cầu nhúng ngữ nghĩa, ngữ cảnh hội thoại và bản nháp nhiệm vụ tại `src/ai/chatbot/types.ts`.
2. Bộ phân tách văn bản nhận biết câu và ranh giới đoạn `RecursiveTextChunker`, bảo toàn vị trí offset và dữ liệu siêu thông tin tại `src/ai/chatbot/chunker.ts`.
3. Bộ tạo vector nhúng sử dụng mô hình OpenAI `text-embedding-3-small` qua cổng gateway có kiểm soát ngân sách và bộ nhớ đệm tại `src/ai/chatbot/embeddings.ts`.
4. Kho lưu trữ vector có phân vùng cô lập tuyệt đối theo doanh nghiệp và chế độ chạy tại `src/ai/chatbot/vector-store.ts`.
5. Quản lý ngữ cảnh ngắn hạn trong phiên qua LangChain buffer window và quản lý ngữ cảnh dài hạn xuyên phiên tại `src/ai/chatbot/context-manager.ts`.
6. Luồng truy xuất thông tin RAG kết hợp điểm tương đồng cosine, ngưỡng lọc điểm số và cơ chế chống ảo giác tại `src/ai/chatbot/rag.ts`.
7. Bộ tiếp nhận và chuyển giao nhiệm vụ `IntakeTaskDispatcher` chuyển đổi yêu cầu hội thoại thành `WorkflowInput` cho quy trình chuẩn bị sản phẩm tại `src/ai/chatbot/dispatcher.ts`.
8. Tích hợp điểm cuối API `POST /api/chatbot/intake` và cập nhật giao diện chat webapp hiển thị thẻ kiến thức truy xuất và đề xuất giao việc.
9. Ma trận kiểm thử tự động toàn diện từ CB01 đến CB12 tại `tests/ai/chatbot-rag.test.mjs`.

### Loại trừ

1. Không cho phép tìm kiếm vector xuyên doanh nghiệp. Toàn bộ truy vấn bắt buộc phải lọc cứng theo `tenantId` và `mode`.
2. Không tự ý thực thi các thao tác gửi sàn hoặc thay đổi giá mà không thông qua bản xem trước và quy trình phê duyệt của Khối 10.
3. Không tự động gọi lại mô hình nhúng nếu nội dung văn bản không thay đổi mã băm nội dung.
4. Không đưa dữ liệu cá nhân nhạy cảm của khách hàng vào kho lưu trữ vector dài hạn.

## Ràng buộc và ranh giới an toàn

1. Cô lập phân vùng vector đa doanh nghiệp. Mỗi vector nhúng lưu trữ kèm định danh `tenantId`, `mode`, mã tài liệu nguồn và phiên bản dữ liệu. Mọi câu lệnh truy vấn tìm kiếm tương đồng cosine bắt buộc phải áp dụng bộ lọc trước tại tầng lưu trữ.
2. Kiểm soát ngân sách mô hình nhúng OpenAI. Việc gọi API nhúng của OpenAI phải đi qua `BudgetLedger` của cổng gateway. Áp dụng mã băm nội dung để lưu cache kết quả nhúng cho các đoạn văn bản tĩnh.
3. Bảo toàn ranh giới câu khi phân đoạn văn bản. Thuật toán chunking ưu tiên ngắt theo dấu câu kết thúc đoạn và kết thúc câu tiếng Việt. Tuyệt đối không cắt ngang câu phủ định hoặc chia cắt thông số kỹ thuật với đơn vị đo lường.
4. Quản lý ngữ cảnh hai tầng qua LangChain. Ngữ cảnh ngắn hạn lưu vết các lượt chat gần nhất trong phiên với giới hạn trần số lượng token để bảo vệ cửa sổ ngữ cảnh. Ngữ cảnh dài hạn trích xuất sở thích người bán và sự thật doanh nghiệp đã xác nhận, lưu trữ có phiên bản và truy xuất theo độ liên quan.
5. Chuyển giao nhiệm vụ có cấu trúc. Chatbot không trực tiếp ghi dữ liệu vào sàn. Chatbot chỉ phân tích văn bản, trích xuất sự thật sản phẩm và khởi tạo bản nháp nhiệm vụ để chuyển giao cho `StepPipelineEngine` xử lý theo quy trình kiểm tra quy tắc sàn.

## Phương án thiết kế

### Phương án A. Đưa toàn bộ tài liệu thô vào system prompt

Gửi toàn bộ văn bản do người bán cung cấp trực tiếp vào prompt của mô hình ngôn ngữ lớn.
Ưu điểm là không cần xây dựng cơ chế chunking hay cơ sở dữ liệu vector.
Nhược điểm là nhanh chóng làm tràn cửa sổ ngữ cảnh, chi phí token rất cao và dễ gây ảo giác thông tin khi tài liệu dài.

### Phương án B. Tìm kiếm từ khóa thuần túy theo văn bản

Sử dụng tìm kiếm chuỗi ký tự hoặc Full-Text Search trong cơ sở dữ liệu.
Ưu điểm là tốc độ nhanh và không tốn chi phí gọi mô hình nhúng.
Nhược điểm là không hiểu được ngữ nghĩa tương đồng, không xử lý được các cách diễn đạt đồng nghĩa và khả năng truy xuất kém với tiếng Việt tự nhiên.

### Phương án C được chọn. Phân đoạn ngữ nghĩa, RAG vector OpenAI và quản lý ngữ cảnh LangChain hai tầng

Văn bản đầu vào được phân tách thành các đoạn chunk nhỏ có bảo toàn ranh giới câu.
Mô hình OpenAI `text-embedding-3-small` tạo vector nhúng ngữ nghĩa được lưu vào kho phân vùng theo doanh nghiệp.
Khi người bán đặt câu hỏi hoặc cung cấp yêu cầu, hệ thống truy xuất các đoạn kiến thức phù hợp nhất kết hợp ngữ cảnh ngắn hạn và dài hạn.
Mô hình ngôn ngữ sử dụng các đoạn trích dẫn này để lập luận, trích xuất sự thật và tạo bản nháp nhiệm vụ an toàn.

## Kỹ năng áp dụng

1. `principle-foundational-thinking`. Thiết lập cấu trúc kiểu dữ liệu cho chunk, vector, bộ nhớ ngắn hạn và dài hạn trước khi tích hợp thư viện LangChain.
2. `principle-boundary-discipline`. Khóa định danh doanh nghiệp tại tầng lọc vector và kiểm soát ngân sách gọi API OpenAI qua cổng gateway.
3. `principle-type-system-discipline`. Sử dụng discriminated union cho các loại mục nhớ và bản nháp nhiệm vụ đầu ra.
4. `principle-guard-the-context-window`. Áp dụng cơ chế trượt cửa sổ hội thoại và ước lượng token để không làm tràn ngữ cảnh mô hình.
5. `principle-laziness-protocol`. Triển khai kho vector trong bộ nhớ có sẵn hàm tính cosine similarity cho giai đoạn demo trước khi cài đặt thêm hạ tầng cơ sở dữ liệu chuyên biệt.
6. `principle-sequence-verifiable-units`. Chia nhỏ kế hoạch thành 5 chặng độc lập với mã kiểm thử xác minh ngay sau mỗi chặng.
7. `principle-prove-it-works`. Xây dựng ma trận kiểm thử thực tế kiểm tra độ chính xác truy xuất, khả năng cô lập dữ liệu và chuyển giao nhiệm vụ.

## Điều kiện tích hợp bắt buộc

Đọc [Hợp đồng tích hợp các agent hiện có](agent-integration-contract.md) trước chặng 4–5. Tài liệu này quy định đường gọi thật, chuyển đổi dữ liệu, xác thực, preview/activation và CBI01–CBI12. Các yêu cầu tích hợp trong tài liệu này thay thế cách hiểu rằng tạo đúng `WorkflowInput` hoặc gọi trực tiếp engine là đủ nghiệm thu.

## Năm chặng triển khai

1. [Chặng 1. Hợp đồng dữ liệu, bộ phân tách văn bản và siêu dữ liệu](phase-1-contracts-and-chunker.md)
2. [Chặng 2. Mô hình nhúng OpenAI, cache ngân sách và kho vector cô lập](phase-2-openai-embeddings-and-vector-store.md)
3. [Chặng 3. Quản lý ngữ cảnh hai tầng ngắn hạn và dài hạn qua LangChain](phase-3-langchain-memory-and-context.md)
4. [Chặng 4. Quy trình RAG, tạo dẫn chứng và bộ chuyển giao nhiệm vụ](phase-4-rag-pipeline-and-intake-dispatcher.md)
5. [Chặng 5. Tích hợp điểm cuối API, giao diện Copilot và kiểm thử toàn trình](phase-5-webapp-chat-integration-and-ui.md)
6. [Chiến lược và ma trận kiểm thử](testing.md)

## Lệnh xác minh dự án

Kiểm tra kiểu dữ liệu toàn dự án:
`npm run typecheck`

Chạy toàn bộ kiểm thử đơn vị và tích hợp:
`npm test`

Chạy riêng bộ kiểm thử chatbot RAG:
`node --experimental-strip-types --test tests/ai/chatbot-rag.test.mjs`

## Hướng dẫn thực thi

Người triển khai cần bảo đảm toàn bộ truy vấn vector đều có bộ lọc doanh nghiệp trước khi tính điểm tương đồng.
Chạy `/deslop` trên từng bản diff trước khi commit.
Tuân thủ nghiêm ngặt kỹ năng `unslop` cho toàn bộ tài liệu và mã nguồn.
Ghi lại nhật ký kỹ thuật bằng `show-me-your-work` trong suốt quá trình xây dựng.
