# Chiến lược và ma trận kiểm thử Chatbot AI Tiếp nhận & Điều phối Công việc

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng chiến lược kiểm thử tự động toàn diện bao phủ toàn bộ luồng xử lý từ tiếp nhận văn bản, phân đoạn chunking, tạo vector nhúng OpenAI, truy xuất RAG, quản lý ngữ cảnh hai tầng LangChain và chuyển giao nhiệm vụ.
Ngăn chặn các lỗi nghiêm trọng gồm cắt gãy ngữ nghĩa câu, rò rỉ vector giữa các doanh nghiệp, tràn cửa sổ ngữ cảnh và chuyển giao nhiệm vụ thiếu căn cứ xác thực.

## Ma trận kiểm thử từ CB01 đến CB12

| Mã ca | Mục tiêu kiểm thử | Dữ liệu đầu vào thực tế | Kỳ vọng bắt buộc chứng minh | Tệp kiểm thử |
|---|---|---|---|---|
| CB01 | Phân đoạn văn bản đệ quy bảo toàn câu | Văn bản quy cách sản phẩm 2.000 ký tự tiếng Việt | Tách thành các đoạn dưới 500 ký tự, có 50 ký tự gối đầu và offset chính xác | `tests/ai/chatbot-rag.test.mjs` |
| CB02 | Bảo toàn câu phủ định và thông số | Văn bản chứa "Không sử dụng chất tạo màu hóa học" | Từ "Không" và cụm vị ngữ nằm trọn vẹn trong một đoạn chunk, không bị tách đôi | `tests/ai/chatbot-rag.test.mjs` |
| CB03 | Tạo vector nhúng chuẩn OpenAI | Đoạn văn bản mô tả đặc tính cà phê Robusta | Nhận về vector 1536 phần tử số thực chuẩn hóa độ dài đơn vị | `tests/ai/chatbot-rag.test.mjs` |
| CB04 | Bộ nhớ đệm cache vector nhúng | Gửi lại cùng một đoạn văn bản có mã băm trùng khớp | Nhận kết quả tức thì từ cache, số token phát sinh ghi nhận bằng 0 | `tests/ai/chatbot-rag.test.mjs` |
| CB05 | Tìm kiếm tương đồng cosine chuẩn xác | Truy vấn "nguồn gốc xuất xứ của trà" | Trả về đoạn văn bản chứa thông tin Lâm Đồng với điểm cosine trên 0.80 | `tests/ai/chatbot-rag.test.mjs` |
| CB06 | Cô lập kho vector đa doanh nghiệp | Doanh nghiệp A tìm kiếm tài liệu có từ khóa trùng doanh nghiệp B | Kết quả tìm kiếm lọc cứng theo tenantId, không trả về bất kỳ chunk nào của B | `tests/ai/chatbot-rag.test.mjs` |
| CB07 | Cửa sổ trượt ngắn hạn LangChain | Cuộc trò chuyện kéo dài liên tục 10 lượt chat | Chỉ giữ lại tối đa 6 lượt gần nhất trong ngữ cảnh và tổng token dưới 2.000 | `tests/ai/chatbot-rag.test.mjs` |
| CB08 | Trích xuất và nạp ký ức dài hạn | Phiên 1 lưu sở thích bán Shopee, mở phiên 2 mới | Phiên mới tự động nạp lại đúng sở thích và quy cách quen thuộc | `tests/ai/chatbot-rag.test.mjs` |
| CB09 | Lọc PII trong bộ nhớ theo vai trò | Tin nhắn cũ chứa số điện thoại, người dùng là Viewer | Bộ nhớ nạp vào mô hình tự động che giấu số điện thoại thành [REDACTED] | `tests/ai/chatbot-rag.test.mjs` |
| CB10 | Truy xuất RAG và tạo dẫn chứng | Người bán hỏi về chính sách bảo hành | Trả lời đúng chính sách và gắn mã tham chiếu chunkId chính xác | `tests/ai/chatbot-rag.test.mjs` |
| CB11 | Chuyển giao nhiệm vụ có cấu trúc | Người bán cung cấp thông tin sản phẩm mới | Trích xuất đúng ProductSnapshot và tạo WorkflowInput chuẩn bị bài đăng | `tests/ai/chatbot-rag.test.mjs` |
| CB12 | Kiểm thử toàn trình qua API route | Gửi yêu cầu HTTP POST tới /api/chatbot/intake | Trả về phản hồi đầy đủ câu trả lời, thẻ RAG và bản xem trước nhiệm vụ | `tests/ai/chatbot-rag.test.mjs` |

## Tiêu chí nghiệm thu thực tế

1. Tỷ lệ bảo toàn câu phủ định và thông số kỹ thuật trong quá trình phân đoạn đạt 100 phần trăm.
2. Tuyệt đối không phát sinh rò rỉ dữ liệu vector hoặc ký ức giữa các doanh nghiệp độc lập.
3. Cửa sổ ngữ cảnh hội thoại được kiểm soát chặt chẽ, không bao giờ vượt quá ngưỡng trần token quy định.
4. Mọi thông số sản phẩm do Chatbot trích xuất để chuyển giao nhiệm vụ đều có mã căn cứ tham chiếu nguồn xác thực.
5. Giao diện Copilot hiển thị trực quan các thẻ nguồn tri thức RAG và thẻ đề xuất nhiệm vụ tương tác thực tế.

## Lệnh thực thi kiểm thử

Chạy riêng bộ kiểm thử Chatbot RAG:
`node --experimental-strip-types --test tests/ai/chatbot-rag.test.mjs`

Chạy kiểm tra kiểu tĩnh và toàn bộ suite kiểm thử của dự án:
`npm run typecheck && npm test`

## Kiểm chứng nối các agent

Bắt buộc triển khai và chạy CBI01–CBI12 trong [hợp đồng tích hợp agent](agent-integration-contract.md), tại `tests/ai/chatbot-agent-integration.test.mjs`. CB11 chỉ kiểm tra cấu trúc không thay thế việc chạy Content, Keywords, Localization và orchestrator thật. Chỉ giả lập provider bên ngoài.

`node --experimental-strip-types --test tests/ai/chatbot-agent-integration.test.mjs`

Chưa có test này hoặc còn dùng Content stub thì phần tích hợp chưa hoàn thành.
