# 13. Tác nhân xử lý ngoại lệ

[Xem Kế hoạch chi tiết 4 chặng triển khai](13-exception-agent/overview.md)

## Mục tiêu

Phân loại lỗi, đưa hướng xử lý có bằng chứng và tạo bản sửa mới khi cần thiết.
Không cho phép mô hình ngôn ngữ tự ý quyết định retry đối với giao dịch không rõ đã thành công hay chưa.
Module phụ thuộc vào Khối 03, 10, 11 và 12.
Mã nguồn nằm tại `src/ai/agents/exception/` và hàm thuần túy `classifyFailure` trong máy chủ.

## Đầu vào và đầu ra

Đầu vào gồm kết quả dispatch từ adapter Khối 11 (`confirmed`, `rejected`, `retryable_not_sent`, `unknown`), thông tin năng lực chống trùng của sàn, thao tác thực thi, dữ liệu lỗi an toàn trích xuất theo danh sách trường cho phép, mã định danh hành động, phiên bản nội dung, token lượt thử nguyên tử và sự thật sản phẩm cần thiết.
Đầu ra có cấu trúc gồm tóm tắt tiếng Việt, căn cứ bằng chứng, hướng xử lý kế tiếp, danh sách bản vá trường dữ liệu cụ thể, thông tin còn thiếu và cảnh báo an toàn.
Bản vá chỉ cho phép sửa `title`, `description` và `attributes.<id>` đã xác thực qua fact nguồn.
Tuyệt đối không chứa câu lệnh HTTP thô, lệnh SQL hoặc lệnh shell.

| Tình huống dispatch và lớp lỗi do mã nguồn xác định | Hướng xử lý |
|---|---|
| Mạng trước khi gửi, `retryable_not_sent` | Retry có giới hạn ngân sách nguyên tử nếu thao tác an toàn |
| Thông tin xác thực và phạm vi quyền tài khoản | Tạo một việc kết nối lại cho connection đó và dừng retry tự động |
| Thiếu thuộc tính, sai danh mục, lỗi ảnh | Đề xuất tạo bản nháp mới để kiểm tra và duyệt lại theo Khối 10 |
| Thiếu fact nguồn (như Brand) | Chuyển thành `needs_input` yêu cầu người bán bổ sung, cấm đoán mò |
| Phản hồi `unknown` trên thao tác ghi (tạo bài/đơn) | Kích hoạt quy trình đối soát kỹ thuật, tuyệt đối không tạo bản mới |
| SKU không khớp hoặc thiếu tồn kho | Chuyển việc quản lý đơn và tồn kho theo Khối 12, mô hình không tự chọn số lượng |
| Lỗi không nhận diện | Yêu cầu can thiệp thủ công, bảo lưu mã lỗi và mã tương quan kỹ thuật |

## Các nguyên tắc triển khai

1. Adapter xác định bằng chứng dispatch và khả năng chống trùng của sàn. Mã nguồn ấn định `failureClass` và `nextAction` cuối cùng, mô hình không được cung cấp hoặc thay đổi các trường này.
2. Ngân sách retry gắn với từng action nghiệp vụ và attempt ID. Worker phải nhận token lượt thử bằng thao tác nguyên tử trước dispatch. Phân định rõ 1 lần đầu và số lần retry. Lịch retry có thời điểm cụ thể `nextAllowedAt`. Restart không được cấp lại ngân sách.
3. Sinh tóm tắt tiếng Việt bằng mẫu cố định cho các lỗi rõ ràng như token hết hạn hoặc chạm trần tần suất. Chỉ gọi mô hình khi cần diễn giải lỗi nhiều trường hoặc đề xuất bản vá nội dung.
4. Lọc an toàn dựa trên danh sách trường giữ lại thay vì quét chuỗi thô. Toàn bộ bí mật, token và thông tin cá nhân bị lọc sạch trước khi ghi log, lưu trạng thái hoặc gửi cho mô hình.
5. Bản vá chỉ tạo đề xuất mới theo hợp đồng Khối 10, chạy lại Review 08 và Policy 09, không sửa trực tiếp bài đăng đang hoạt động.
6. Khử trùng lặp thẻ công việc phân biệt loại đối tượng và điểm kết nối. Năm sản phẩm cùng lỗi token chỉ tạo một việc kết nối lại. Event do hàng đợi phân phối lại không tính thêm attempt.
7. Cơ chế suppression của Khối 10 lưu vết mã băm bản vá bị từ chối và phiên bản dữ liệu nguồn bền vững qua restart, không tạo lại đề xuất cũ để ép duyệt.

## Ma trận kiểm thử

| Mã ca | Kỳ vọng kiểm thử |
|---|---|
| EX01 | Token hết hạn trên nhiều sản phẩm gom thành 1 thẻ kết nối lại cho cửa hàng đó |
| EX02 | Lỗi timeout khi tạo bài đăng với dispatch unknown chuyển sang đối soát, cấm gọi tạo mới |
| EX03 | Thiếu fact Brand chuyển thành needs_input yêu cầu bổ sung, mô hình không tự đoán |
| EX04 | Bản vá can thiệp vào giá bán hoặc phân quyền lập tức bị từ chối và ghi nhận cảnh báo |
| EX05 | Bản vá bị từ chối được lưu suppression bền vững, restart không dựng lại đề xuất cũ |
| EX06 | Mô hình khuyên retry lỗi unknown thì mã nguồn vẫn giữ nguyên quyết định đối soát |
| EX07 | Dữ liệu nhạy cảm bị lọc theo danh sách trường an toàn trước khi vào provider, task và log |
| EX08 | Hai worker tranh chấp lượt retry cuối chỉ có một worker nhận được token dispatch |
| EX09 | Tiến trình restart sau khi cạn ngân sách không được cấp lại lượt thử |
| EX10 | Queue phân phối lại cùng một event không làm tăng số lần lỗi hoặc attempt |
| EX11 | Bản vá tạo từ phiên bản dữ liệu cũ bị từ chối áp dụng |
| EX12 | Mô hình ngôn ngữ gặp sự cố thì tóm tắt từ mẫu cố định và thao tác thủ công vẫn hoạt động |

Điều kiện hoàn thành khi nghiệm thu demo trên adapter giả lập vượt qua toàn bộ 12 ca kiểm thử và đáp ứng đầy đủ điều kiện kết nối với adapter sàn thật.
