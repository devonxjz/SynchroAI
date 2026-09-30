# Chặng 3. Quản lý ngữ cảnh hai tầng ngắn hạn và dài hạn qua LangChain

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Quản lý ngữ cảnh hội thoại hai tầng sử dụng kiến trúc trừu tượng bộ nhớ của LangChain.
Tầng ngắn hạn lưu vết các lượt trao đổi trong phiên hiện tại với giới hạn cửa sổ trượt để bảo vệ số lượng token.
Tầng dài hạn lưu trữ các thông tin thực thể, sở thích người bán và sự thật doanh nghiệp xuyên suốt nhiều phiên làm việc.
Đảm bảo cơ chế phân quyền và cô lập bộ nhớ nghiêm ngặt theo người dùng và doanh nghiệp.

## Thay đổi dự kiến

Tạo mới file `src/ai/chatbot/context-manager.ts`.
Triển khai bộ quản lý ngữ cảnh hai tầng `ChatbotContextManager`.

1. Quản lý ngữ cảnh ngắn hạn (Short-term Context):
Sử dụng trừu tượng `ChatMessageHistory` và cửa sổ trượt `WindowBufferMemory` của LangChain.
Lưu giữ tối đa 6 lượt hội thoại gần nhất hoặc trần 2.000 token trong phiên trò chuyện hiện tại.
Tự động cắt tỉa các tin nhắn cũ hơn khi phiên trò chuyện kéo dài mà không làm mất thông điệp hệ thống.
Tích hợp bộ bóc tách thông tin cá nhân PII động theo quyền hiện hành của người gọi.

2. Quản lý ngữ cảnh dài hạn (Long-term Context):
Triển khai kho lưu trữ thực thể và sở thích `LongTermMemoryStore`.
Trích xuất và lưu giữ các thông tin cốt lõi xuyên phiên gồm:
- Sở thích bán hàng của người bán (sàn ưu tiên Shopee, phong cách diễn đạt, chính sách đổi trả mặc định).
- Thuật ngữ ngành hàng và quy cách đóng gói quen thuộc của doanh nghiệp.
- Lịch sử các nhiệm vụ đã từng chuyển giao thành công.
Mỗi bản ghi nhớ dài hạn có khóa định danh theo `tenantId`, `userId`, loại thực thể và phiên bản.
Khi người bán mở phiên hội thoại mới, hệ thống truy xuất các bản ghi nhớ dài hạn có liên quan để nạp vào ngữ cảnh ban đầu.

Cập nhật file `tests/ai/chatbot-rag.test.mjs`.
Thêm các ca kiểm thử cho cơ chế trượt cửa sổ ngắn hạn, kiểm tra trích xuất và nạp lại sở thích dài hạn xuyên phiên, kiểm tra xóa bỏ PII khi nạp bộ nhớ.

## Cấu trúc dữ liệu

`ShortTermTurn`: lượt trò chuyện trong phiên gồm vai trò người gửi, nội dung văn bản, số token ước tính và thời gian.
`LongTermMemoryEntry`: bản ghi nhớ dài hạn gồm mã doanh nghiệp, mã người dùng, loại ký ức (sở thích, thực thể, quy tắc), khóa định danh, giá trị có cấu trúc và phiên bản.
`SessionContextBundle`: gói ngữ cảnh hoàn chỉnh kết hợp danh sách lượt ngắn hạn và danh sách ký ức dài hạn liên quan.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 3:
`node --experimental-strip-types --test tests/ai/chatbot-rag.test.mjs`

Xác minh ca cửa sổ ngắn hạn: Hội thoại kéo dài 10 lượt chat. Ngữ cảnh ngắn hạn nạp vào mô hình chỉ giữ đúng 6 lượt gần nhất và tổng token không vượt quá 2.000.
Xác minh ca ký ức dài hạn: Phiên 1 người bán thiết lập sở thích "ưu tiên đóng gói 250g và xuất khẩu Thái Lan". Phiên 2 được mở mới hoàn toàn, hệ thống tự động tải lại đúng sở thích này.
Xác minh ca cô lập ký ức: Ký ức dài hạn của người dùng A không xuất hiện trong ngữ cảnh của người dùng B thuộc doanh nghiệp khác.
