# Chặng 5. Tích hợp điểm cuối API, giao diện Copilot và kiểm thử toàn trình

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng điểm cuối API `POST /api/chatbot/intake` phục vụ giao tiếp trực tiếp từ webapp.
Cập nhật giao diện Chatbot AI tiếp nhận trên trang AI Copilot M16.
Hiển thị trực quan các thẻ nguồn tri thức RAG, huy hiệu ghi nhớ ngữ cảnh dài hạn và thẻ đề xuất giao việc.
Hoàn thiện toàn bộ bộ kiểm thử tự động từ CB01 đến CB12.

## Thay đổi dự kiến

Tạo mới file `src/app/api/chatbot/intake/route.ts`.
Triển khai hàm xử lý HTTP `POST`.
Tiếp nhận nội dung yêu cầu văn bản hoặc tài liệu quy cách sản phẩm, mã phiên hội thoại và khóa bất biến `idempotencyKey`.
Trích xuất ngữ cảnh máy chủ `ServerContext` an toàn từ phiên đăng nhập.
Phân loại đầu vào trước: câu hỏi đi truy xuất hoặc công cụ Assistant, không tự lưu thành tài liệu; chỉ tài liệu được phép nhập mới qua chunking/embedding/indexing. Sau đó chọn ngữ cảnh, trích xuất facts ứng viên, xử lý thiếu dữ liệu/mâu thuẫn và lưu draft.

Bổ sung API kích hoạt draft và đường đọc trạng thái run có phân quyền theo [hợp đồng tích hợp agent](agent-integration-contract.md). Nút kích hoạt dùng expected version/hash và idempotency key; intake POST không tự chạy workflow.
Trả về phản hồi gồm câu trả lời tiếng Việt, danh sách thẻ tri thức RAG truy xuất được, thông tin ký ức áp dụng và thẻ xem trước nhiệm vụ đã chuyển giao.

Cập nhật giao diện `src/app/dashboard/ai/page.tsx`.
Bổ sung các thành phần giao diện phục vụ quy trình tiếp nhận thông minh:
1. Khu vực nhập liệu hỗ trợ dán quy cách văn bản sản phẩm hoặc tải tài liệu.
2. Hiển thị huy hiệu ký ức dài hạn `🧠 Ký ức bán hàng: Shopee VN • Đóng gói 250g`.
3. Hiển thị các khối dẫn chứng tri thức RAG `📚 Tri thức tham chiếu: [Đoạn 1], [Đoạn 2]`.
4. Hiển thị thẻ đề xuất giao việc tự động `🚀 Đề xuất nhiệm vụ: Chuẩn bị bài đăng sản phẩm mới` kèm nút bấm "Kích hoạt quy trình" để người bán xác nhận chuyển sang `StepPipelineEngine`.
5. Đảm bảo trạng thái tải và thông báo lỗi rõ ràng khi kết nối mạng hoặc mô hình gặp sự cố.

Cập nhật file `tests/ai/chatbot-rag.test.mjs`.
Bổ sung các ca kiểm thử tích hợp toàn trình qua API route, kiểm tra luồng tiếp nhận văn bản thô đến khi sinh ra đề xuất nhiệm vụ hoàn chỉnh.

## Cấu trúc dữ liệu

`IntakeApiRequest`: cấu trúc yêu cầu gồm văn bản đầu vào, mã phiên, khóa bất biến và tùy chọn tài liệu đính kèm.
`IntakeApiResponse`: phản hồi API gồm câu trả lời trợ lý, danh sách đoạn RAG, thẻ đề xuất nhiệm vụ, trạng thái ngữ cảnh và thời gian.
`IntakeChatUiState`: trạng thái hiển thị giao diện gồm danh sách tin nhắn, trạng thái phân đoạn, danh sách thẻ tri thức và nhiệm vụ đang chờ kích hoạt.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy toàn bộ kiểm thử đơn vị và tích hợp:
`node --experimental-strip-types --test tests/ai/chatbot-rag.test.mjs`

Xác minh ca toàn trình: Người bán gửi đoạn văn bản giới thiệu sản phẩm nông sản mới. Hệ thống phân đoạn, tạo vector nhúng, lưu vào kho, truy xuất RAG và tạo thành công thẻ đề xuất nhiệm vụ "Soạn bài đăng Shopee" trên giao diện.
Xác minh ca ký ức dài hạn: Hệ thống tự động điền sẵn thị trường mục tiêu và phong cách viết quen thuộc dựa trên ký ức dài hạn đã lưu.
Xác minh ca lỗi API: Khi API OpenAI gặp sự cố mạng, giao diện hiển thị cảnh báo thân thiện và giữ nguyên dữ liệu đã nhập của người bán.
