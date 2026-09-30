# Chặng 4. Khử trùng lặp theo đối tượng, cơ chế suppression và kiểm thử tích hợp

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Phân định ranh giới rành mạch giữa khử trùng lặp thẻ công việc và cơ chế ngăn đề xuất lại bản vá bị từ chối.
Khử trùng lặp thẻ theo loại đối tượng và điểm kết nối tài khoản.
Tích hợp cơ chế suppression của Khối 10 bền vững trước sự cố restart tiến trình.
Xác định rõ quyền sở hữu của worker trong việc ghi nhận lỗi và tạo đề xuất.
Hoàn thiện bộ kiểm thử tự động toàn diện từ EX01 đến EX12.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/exception/dedup.ts`.
Xây dựng hàm tạo khóa gom cụm thẻ công việc `computeTaskDedupKey` bao gồm:
1. `tenantId`: mã doanh nghiệp.
2. `entityType`: loại đối tượng gồm `connection`, `product` hoặc `order`.
3. `targetId`: mã định danh đối tượng mục tiêu.
4. `storeId`: mã cửa hàng kết nối.
5. `mode`: chế độ chạy `live` hoặc `demo`.
6. `failureClass`: lớp lỗi được xác định.
Nếu 5 sản phẩm gặp lỗi token hết hạn xuất phát từ cùng một tài khoản kết nối sàn, hệ thống gom chung thành một thẻ công việc kết nối lại duy nhất cho `connection` đó.
Event do hàng đợi phân phối lại không làm tăng số lần lỗi hoặc số lần thử.
Định nghĩa quy tắc mở lại thẻ công việc khi phát sinh mã lỗi mới hoặc khi người dùng thao tác.

Tạo mới file `src/ai/agents/exception/suppression.ts`.
Tích hợp cơ chế suppression theo hợp đồng Khối 10.
Lưu vết mã băm nội dung bản vá `patchDiffHash` và các phiên bản dữ liệu nguồn khi người bán bấm từ chối đề xuất.
Thông tin suppression được lưu trữ bền vững để không bị mất khi tiến trình restart.
Khi lỗi tương tự lặp lại trên cùng phiên bản dữ liệu nguồn, hệ thống kiểm tra kho suppression.
Nếu bản vá trùng khớp với bản đã bị từ chối, hệ thống ngăn chặn việc tạo lại đề xuất cũ để ép người bán duyệt.

Tạo mới file `src/ai/agents/exception/index.ts`.
Xuất khẩu các hàm công khai gồm phân loại lỗi thuần túy, thẩm định bản vá, khử trùng lặp và kiểm tra suppression.

Tích hợp với worker và luồng điều phối:
Worker thực thi sàn sở hữu việc ghi nhận lỗi, gọi hàm phân loại, nhận token lượt thử nguyên tử và lưu trữ thẻ công việc.
Giai đoạn đầu nghiệm thu với adapter giả lập demo trong bộ nhớ.
Chỉ tuyên bố tích hợp toàn trình khi có adapter sàn thực tế được xác minh tài liệu.

Cập nhật file `tests/ai/exception-agent.test.mjs`.
Bổ sung các ca kiểm thử cho gom thẻ theo connection, kiểm tra tính bền vững của suppression qua restart và tích hợp với adapter demo.

## Cấu trúc dữ liệu

`TaskDedupKeyComponents`: các thành phần cấu tạo khóa gồm mã doanh nghiệp, loại đối tượng, mã đối tượng, mã cửa hàng, chế độ chạy và lớp lỗi.
`SuppressionRecord`: bản ghi ngăn chặn gồm mã đối tượng, mã băm thay đổi của bản vá, phiên bản dữ liệu nguồn và thời điểm từ chối.
`WorkerErrorResolution`: kết quả xử lý của worker gồm chỉ thị hàng đợi, thẻ công việc cập nhật và mã đề xuất mới nếu vượt qua kiểm tra suppression.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy toàn bộ kiểm thử đơn vị và tích hợp tác nhân ngoại lệ:
`node --experimental-strip-types --test tests/ai/exception-agent.test.mjs`

Xác minh ca gom thẻ connection: Năm sản phẩm cùng báo lỗi hết hạn token từ một cửa hàng. Hệ thống tạo đúng một thẻ công việc kết nối lại cho cửa hàng đó.
Xác minh ca suppression qua restart: Người bán từ chối bản vá. Tiến trình được khởi động lại và lỗi lặp lại nguyên trạng. Hệ thống không tạo lại cùng bản vá cũ.
Xác minh ca queue giao lại: Cùng một message lỗi được queue phân phối lại. Thẻ công việc không bị tăng số lần đếm lỗi.
