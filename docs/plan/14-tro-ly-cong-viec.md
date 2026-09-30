# 14. Trợ lý công việc và yêu cầu bằng tiếng Việt

[Xem Kế hoạch chi tiết 4 chặng triển khai](14-assistant-agent/overview.md)

## Phạm vi

Giao diện AI Copilot M16 hỗ trợ trả lời về sản phẩm, bài đăng, đơn hàng, tồn kho, công việc chờ và trạng thái điều phối trong doanh nghiệp đang chọn.
Trợ lý có thể chuẩn bị đề xuất bản xem trước thao tác nhưng không có quyền tự ý đăng bài, đổi giá, trừ tồn kho hoặc đổi phân quyền.
Module phụ thuộc vào Khối 03, 09, 10, 11, 12 và 13.
Mã nguồn nằm tại `src/app/api/assistant/` và bộ điều phối tại `src/ai/agents/assistant/`.

## Hợp đồng hội thoại và công cụ

Hội thoại và tin nhắn gắn liền với doanh nghiệp, người dùng, chế độ thực thi và thời gian tạo.
Chuyển đổi doanh nghiệp không mang lịch sử hoặc nguồn dữ liệu của doanh nghiệp cũ vào phiên trò chuyện mới.
Yêu cầu `POST /api/assistant/messages` gồm mã phiên hội thoại, nội dung tin nhắn và khóa bất biến idempotency.
Máy chủ xác minh danh tính và quyền hạn động trên từng yêu cầu.
Nếu người dùng từng có quyền xem dữ liệu cá nhân nhưng sau đó bị hạ quyền xuống Viewer, hệ thống tự động bóc tách thông tin cá nhân trong lịch sử cũ trước khi nạp vào mô hình.

Danh mục công cụ:

| Công cụ | Đầu vào được schema kiểm tra | Đầu ra giới hạn an toàn |
|---|---|---|
| `searchCatalogOrTasks` | Từ khóa tên gọi, bộ lọc loại và giới hạn tối đa | Danh sách mã định danh thật, tên hiển thị và điểm phù hợp |
| `listPendingTasks` | Bộ lọc trạng thái, con trỏ và giới hạn tối đa | Mã công việc, tóm tắt và liên kết nội bộ hợp lệ |
| `getProductStatus` | Mã sản phẩm cụ thể | Sự thật sản phẩm, trạng thái chuẩn bị và liên kết bài đăng |
| `getListingStatus` | Mã bài đăng cụ thể | Phiên bản đã gửi và phản hồi xác nhận hoặc lỗi từ sàn |
| `getOrderIssue` | Mã đơn hàng cụ thể | Dòng hàng và vấn đề đã bóc tách thông tin cá nhân theo vai trò |
| `getInventoryStatus` | Mã biến thể SKU cụ thể | Tồn kho khả dụng, mức đệm an toàn và số lượng đã chốt |
| `prepareActionPreview` | Ý định hành động và danh sách mã đối tượng | Mã bản nháp đề xuất chuẩn Khối 10, tuyệt đối không thực thi |

Doanh nghiệp và quyền hạn được đóng kín trong ngữ cảnh máy chủ, không để mô hình tự truyền định danh doanh nghiệp hay vai trò vào tham số công cụ.
Mỗi công cụ xác minh lại phạm vi đối tượng, giới hạn và hình chiếu dữ liệu.
Hệ thống không sử dụng cache gateway dùng chung cho câu trả lời hội thoại để tránh rò rỉ dữ liệu giữa các quyền.
Khóa bất biến được lưu vết bền vững, xử lý tuần tự hai yêu cầu đồng thời và báo lỗi 409 khi nội dung thay đổi.

Đầu ra phản hồi gồm câu trả lời tiếng Việt, danh sách nguồn dẫn chứng có phiên bản, mã xem trước hành động nếu có, trạng thái và thời điểm chốt số liệu.
Các số liệu quan trọng và trạng thái bài đăng được biểu diễn qua cấu trúc khẳng định do máy chủ kiểm soát, mô hình không được nói ngược sự thật kỹ thuật.
Nguồn dẫn chứng trỏ tới bản ghi đã bị xóa hoặc ngoài phạm vi quyền bị loại bỏ ngay lập tức kèm theo việc loại bỏ kết luận phụ thuộc.

## Luồng triển khai

1. Xây dựng các công cụ đọc dữ liệu, tìm kiếm phụ trợ và kiểm thử phân quyền động trước khi kết nối với mô hình. Tổng số việc tính bằng truy vấn đếm tổng trong cơ sở dữ liệu. Doanh thu tính trên đơn hàng đã xác nhận hoặc hoàn thành và tách biệt rõ ràng theo từng loại tiền tệ.
2. Khoảng thời gian hôm nay được tính theo khoảng nửa mở `[đầu ngày, đầu ngày kế tiếp)` theo múi giờ địa phương của người dùng và chuyển đổi sang dải thời gian UTC tương ứng.
3. Áp dụng hạn mức chung toàn request tối đa 5 tool calls, 3 model calls và deadline 30 giây. Khi chạm giới hạn, hệ thống trả về phần kết quả đã có kèm trạng thái tương ứng.
4. Xử lý câu lệnh diện rộng như đăng hết bài: Chỉ hiển thị danh sách điều kiện dự kiến, không cấp phép tự động đăng hàng loạt. Phiên bản đầu yêu cầu người dùng duyệt từng bài đăng.
5. Với một hành động rõ ràng, hệ thống tạo bản xem trước đề xuất theo chuẩn Khối 10. Khi người dùng nói "đồng ý" trong chat mà có nhiều bản nháp, trợ lý yêu cầu chỉ rõ bản nháp cần duyệt. Yêu cầu phê duyệt được chuyển tiếp sang dịch vụ Khối 10 để thẩm định toàn diện.
6. Cập nhật giao diện AI Copilot loại bỏ văn bản mẫu nguy hiểm. Hiển thị tin nhắn, nguồn dẫn chứng và thẻ xem trước thực tế. Tự động hủy yêu cầu đang gửi khi người dùng chuyển đổi doanh nghiệp.
7. Khi mô hình ngôn ngữ gặp sự cố, giao diện M16 vẫn duy trì các liên kết thao tác thủ công bình thường, không khóa các nghiệp vụ quản trị vì sự cố trò chuyện.

## Ma trận kiểm thử

| Mã ca | Kỳ vọng kiểm thử |
|---|---|
| AS01 | Thống kê việc hôm nay tính đúng dải UTC theo múi giờ, đếm tổng từ cơ sở dữ liệu và trả liên kết thật |
| AS02 | Hai người dùng cùng doanh nghiệp khác quyền không dùng chung cache, Viewer không nhận dữ liệu cá nhân |
| AS03 | Admin bị hạ quyền xuống Viewer thì toàn bộ dữ liệu cá nhân trong lịch sử cũ bị che giấu |
| AS04 | Yêu cầu đăng hết bài chỉ tạo bản xem trước danh sách điều kiện và không gọi lệnh gửi sàn |
| AS05 | Bài đăng đang chờ trong hàng đợi thì khẳng định máy chủ chặn mô hình tuyên bố đã đăng |
| AS06 | Đổi doanh nghiệp rồi dùng mã phiên cũ bị trả về lỗi 404 và không dùng lịch sử cũ |
| AS07 | Hai request đồng thời cùng idempotency key chỉ có 1 lượt thực thi, tạo đúng 1 bản xem trước |
| AS08 | Cùng idempotency key nhưng nội dung tin nhắn khác nhau bị trả về lỗi 409 Conflict |
| AS09 | Sản phẩm giữ nguyên version nhưng payload đề xuất bị đổi thì lệnh duyệt cũ bị từ chối |
| AS10 | Hạn mức thời gian toàn request 30 giây tự động hủy tiến trình bằng AbortSignal |
| AS11 | Chuyển doanh nghiệp khi đang gửi yêu cầu thì tự động loại bỏ phản hồi của doanh nghiệp cũ |
| AS12 | Có nhiều bản nháp chờ duyệt và người dùng nói đồng ý thì yêu cầu chỉ rõ bản nháp |
| AS13 | Tấn công injection gọi công cụ lạ hoặc truyền tenantId giả bị chặn ngay tại ranh giới schema |
| AS14 | Mười câu hỏi nghiệp vụ mẫu có đáp án tính chính xác từ hệ thống và có nguồn dẫn hợp lệ |

Điều kiện hoàn thành khi nghiệm thu demo trong bộ nhớ vượt qua toàn bộ 14 ca kiểm thử, giao diện Copilot hoạt động tương tác thực tế và đáp ứng đầy đủ điều kiện kết nối với hạ tầng bền vững.
