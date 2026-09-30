# Chặng 2. Công cụ đọc, tìm kiếm phụ trợ và tính toán số liệu chuẩn xác

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng danh mục công cụ đọc dữ liệu kèm công cụ tìm kiếm phụ trợ theo tên.
Ngăn chặn hoàn toàn việc mô hình ngôn ngữ tự phỏng đoán mã định danh ID.
Chuẩn hóa các định nghĩa tính toán số lượng công việc, doanh thu và khoảng thời gian theo múi giờ.
Tách biệt nhóm tiền tệ khác nhau và bóc tách thông tin cá nhân theo vai trò người gọi.

## Thay đổi dự kiến

Tạo mới file `src/ai/agents/assistant/tools/read-tools.ts`.
Bổ sung công cụ tìm kiếm phụ trợ `searchCatalogOrTasks` cho phép tìm sản phẩm, bài đăng hoặc công việc theo từ khóa tên gọi với giới hạn tối đa 5 kết quả.
Nếu không tìm thấy hoặc có nhiều kết quả tương đồng, trợ lý trả về yêu cầu làm rõ `needs_clarification`, tuyệt đối không để mô hình tự bịa mã ID.
Triển khai 5 công cụ đọc dữ liệu:
1. `listPendingTasks`: tra cứu công việc chờ xử lý theo bộ lọc và phân trang.
2. `getProductStatus`: tra cứu sự thật sản phẩm và trạng thái bài đăng theo mã sản phẩm đã xác thực.
3. `getListingStatus`: tra cứu phiên bản bài đăng đã gửi và phản hồi từ sàn.
4. `getOrderIssue`: tra cứu sự cố đơn hàng. Tự động che giấu họ tên, số điện thoại và địa chỉ nếu người dùng thuộc vai trò Viewer.
5. `getInventoryStatus`: tra cứu tồn kho khả dụng và số lượng đã chốt.

Tạo mới file `src/ai/agents/assistant/aggregators.ts`.
Chuẩn hóa các phép tính tổng hợp bằng mã nguồn thuần túy:
1. "Việc hôm nay": xác định là các công việc được tạo hoặc đến hạn trong khoảng nửa mở `[đầu ngày, đầu ngày kế tiếp)` theo múi giờ người dùng, sau đó chuyển đổi sang dải thời gian UTC tương ứng.
2. Tổng số công việc chờ: tính toán bằng truy vấn đếm tổng trong cơ sở dữ liệu, không lấy bằng độ dài của một trang phân trang.
3. Doanh thu: chỉ tính trên các đơn hàng ở trạng thái đã xác nhận hoặc đã hoàn thành, loại trừ triệt để các đơn hủy hoặc hoàn tiền.
4. Xử lý đa tiền tệ: phân nhóm và hiển thị riêng biệt theo từng loại tiền tệ (ví dụ 5.000.000 VND và 1.200 THB), tuyệt đối không cộng gộp các loại tiền khác nhau thành một con số duy nhất.

Cập nhật file `tests/ai/assistant-agent.test.mjs`.
Thêm các ca kiểm thử cho công cụ tìm kiếm theo tên, kiểm tra tính toán việc hôm nay theo múi giờ, kiểm tra đếm tổng việc ngoài giới hạn phân trang và kiểm tra tách nhóm doanh thu đa tiền tệ.

## Cấu trúc dữ liệu

`SearchMatchResult`: kết quả tìm kiếm gồm loại đối tượng, mã định danh thật, tên hiển thị và điểm phù hợp.
`TimezoneTimeRange`: khoảng thời gian nửa mở chứa thời điểm bắt đầu và kết thúc quy đổi sang chuẩn UTC.
`CurrencyAmountGroup`: bản ghi nhóm tiền tệ gồm mã tiền tệ chuẩn ISO 4217, tổng số tiền bằng số nguyên và số lượng đơn hàng tương ứng.
`AggregatedBusinessMetrics`: cấu trúc số liệu kinh doanh chuẩn xác gồm tổng số việc chờ, danh sách doanh thu theo tiền tệ và cảnh báo dữ liệu.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị cho chặng 2:
`node --experimental-strip-types --test tests/ai/assistant-agent.test.mjs`

Xác minh ca tìm kiếm bài Trà Ô Long: Người dùng hỏi về bài đăng Trà Ô Long mà không có ID. Hệ thống gọi công cụ tìm kiếm phụ trợ để xác định chính xác `listingId` trước khi gọi `getListingStatus`.
Xác minh ca tính tổng việc: Tổng số việc chờ là 120 mục. Phân trang trả về 20 mục nhưng số liệu tổng hiển thị vẫn là 120 việc.
Xác minh ca đa tiền tệ: Cửa hàng có đơn hàng bằng cả VND và THB. Kết quả trả về hai dòng doanh thu tách biệt, không cộng lẫn lộn.
