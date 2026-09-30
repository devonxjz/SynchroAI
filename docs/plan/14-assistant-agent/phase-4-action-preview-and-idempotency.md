# Chặng 4. Bản xem trước, tích hợp Khối 10, giao diện Copilot và kiểm thử

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng công cụ tạo bản xem trước hành động `prepareActionPreview` theo hợp đồng Khối 10.
Chuyển tiếp yêu cầu phê duyệt sang dịch vụ phê duyệt tập trung của Khối 10, không dựng luồng duyệt riêng trong chat.
Ràng buộc câu lệnh "đồng ý" trong chat với bản xem trước cụ thể được chỉ định rõ ràng.
Cập nhật giao diện AI Copilot M16 thành trang hoạt động thực tế và loại bỏ hoàn toàn các tuyên bố mẫu nguy hiểm.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/assistant/tools/action-preview.ts`.
Triển khai công cụ `prepareActionPreview`.
Tạo bản nháp đề xuất nội bộ có gắn mã băm dữ liệu `proposalHash` và phiên bản dữ liệu nguồn.
Tuyệt đối không thực thi thao tác trực tiếp lên sàn hoặc cơ sở dữ liệu.
Xử lý các câu lệnh diện rộng như "đăng hết đi": Hệ thống từ chối cấp phép tự động đăng hàng loạt, chỉ trả về danh sách các bài đăng đủ điều kiện và yêu cầu người bán duyệt từng mục.

Tạo mới file `src/ai/agents/assistant/approval-bridge.ts`.
Kết nối yêu cầu phê duyệt trong chat với dịch vụ phê duyệt dùng chung của Khối 10 (`ApprovalService`).
Khi người dùng nói "đồng ý" trong chat, hệ thống kiểm tra số lượng bản nháp đang chờ:
1. Nếu có nhiều bản nháp đang chờ, trợ lý yêu cầu người dùng xác định rõ mã đề xuất cụ thể cần duyệt.
2. Khi đã xác định được mã đề xuất, hệ thống chuyển tiếp yêu cầu sang dịch vụ Khối 10 để kiểm tra toàn diện: phiên bản đề xuất, mã băm dữ liệu do máy chủ tính, quy tắc chính sách, quyền hiện tại của người duyệt và tính bất biến giao dịch.
3. Bản đầu khuyến khích người dùng sử dụng nút bấm duyệt trực tiếp trên thẻ xem trước để bảo đảm an toàn tối đa.

Cập nhật giao diện `src/app/dashboard/ai/page.tsx`.
Loại bỏ toàn bộ dữ liệu tĩnh và câu mẫu nguy hiểm "tôi sẽ tự động đăng lại bài".
Kết nối giao diện với điểm cuối `POST /api/assistant/messages`:
1. Hiển thị danh sách tin nhắn thực tế kèm thời gian.
2. Hiển thị các nguồn dẫn chứng với liên kết nội bộ hợp lệ.
3. Hiển thị thẻ bản xem trước đề xuất kèm nút bấm "Duyệt đề xuất" kết nối thẳng với dịch vụ Khối 10.
4. Hiển thị trạng thái đang xử lý và cảnh báo khi kết quả chỉ hoàn thành một phần do chạm trần thời gian.
5. Khi người dùng chuyển đổi doanh nghiệp trên thanh điều hướng, tự động hủy bỏ các yêu cầu đang chờ phản hồi từ doanh nghiệp cũ.
6. Duy trì các liên kết thao tác thủ công để người bán làm việc bình thường khi mô hình ngôn ngữ gặp sự cố.

Cập nhật file `tests/ai/assistant-agent.test.mjs`.
Bổ sung các ca kiểm thử cho chuyển tiếp phê duyệt sang Khối 10, xử lý câu nói "đồng ý" khi có nhiều bản nháp, kiểm tra hủy yêu cầu khi chuyển tenant và kiểm thử toàn trình từ giao diện qua API route.

## Cấu trúc dữ liệu

`ProposalPreviewDraft`: bản nháp đề xuất chuẩn Khối 10 gồm mã đề xuất, thao tác dự kiến, danh sách thay đổi và mã băm toàn vẹn do máy chủ tính.
`ChatApprovalIntent`: cấu trúc nhận diện phê duyệt gồm mã đề xuất được người dùng xác nhận và trạng thái chuyển tiếp sang dịch vụ Khối 10.
`CopilotUiState`: trạng thái giao diện gồm danh sách tin nhắn, trạng thái kết nối, mã băm yêu cầu đang gửi và thông tin doanh nghiệp hiện hành.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy toàn bộ kiểm thử đơn vị và tích hợp trợ lý công việc:
`node --experimental-strip-types --test tests/ai/assistant-agent.test.mjs`

Xác minh ca nhiều bản nháp: Có 2 bản nháp đang chờ duyệt và người dùng nói "đồng ý". Trợ lý yêu cầu người dùng chỉ rõ muốn duyệt bản nháp nào, không tự ý chọn bừa.
Xác minh ca thay đổi payload đề xuất: Sản phẩm giữ nguyên phiên bản nhưng nội dung đề xuất bị thay đổi sau khi tạo preview. Dịch vụ Khối 10 từ chối lệnh duyệt cũ do sai lệch mã băm.
Xác minh ca chuyển tenant khi đang gửi request: Yêu cầu của doanh nghiệp A đang xử lý thì người dùng chuyển sang doanh nghiệp B. Phản hồi của doanh nghiệp A bị loại bỏ, không hiển thị trên giao diện của doanh nghiệp B.
