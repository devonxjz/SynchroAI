# Chiến lược và ma trận kiểm thử Tác nhân Ngoại lệ

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng chiến lược kiểm thử tự động toàn diện tập trung vào việc ngăn chặn lỗi nghiệp vụ nghiêm trọng.
Đảm bảo hệ thống không bao giờ retry bừa bãi khi chưa rõ trạng thái giao dịch trên sàn.
Bảo vệ vùng dữ liệu cấm không bị xâm phạm bởi các bản vá do mô hình tự ý đề xuất.
Kiểm tra khả năng chịu lỗi bền bỉ trước các tình huống race condition, restart và sự cố mạng.

## Ma trận kiểm thử từ EX01 đến EX12

| Mã ca | Mục tiêu kiểm thử | Dữ liệu đầu vào thực tế | Kỳ vọng bắt buộc chứng minh | Tệp kiểm thử |
|---|---|---|---|---|
| EX01 | Xử lý token hết hạn trên nhiều sản phẩm | Năm sản phẩm cùng báo lỗi hết hạn token từ một cửa hàng | Chỉ tạo đúng 1 thẻ công việc kết nối lại cho cửa hàng đó, không tạo 5 thẻ | `tests/ai/exception-agent.test.mjs` |
| EX02 | Lỗi sàn không rõ trạng thái kết quả | Lệnh tạo mới bài đăng nhận phản hồi timeout 504 với dispatch `unknown` | Trả về hành động đối soát kỹ thuật, tuyệt đối cấm gọi retry tạo mới bài đăng | `tests/ai/exception-agent.test.mjs` |
| EX03 | Thiếu fact thuộc tính Brand | Sàn từ chối do thiếu Brand và hồ sơ fact chưa có Brand | Yêu cầu người bán bổ sung thông tin `needs_input`, mô hình không tự đoán | `tests/ai/exception-agent.test.mjs` |
| EX04 | Bản vá xâm phạm vùng dữ liệu cấm | Mô hình đề xuất bản vá can thiệp vào giá bán hoặc phân quyền | Bộ thẩm định từ chối bản vá, ghi nhận cảnh báo và chuyển thành việc xử lý tay | `tests/ai/exception-agent.test.mjs` |
| EX05 | Suppression bản vá bị từ chối qua restart | Người bán bấm từ chối bản vá và tiến trình restart | Suppression vẫn có hiệu lực, không tự động dựng lại bản vá cũ để ép duyệt | `tests/ai/exception-agent.test.mjs` |
| EX06 | Mô hình đề xuất retry lỗi unknown | Mô hình khuyên "retry ngay" trong văn bản phân tích lỗi | Quyết định mã nguồn không đổi, vẫn giữ nguyên hành động đối soát kỹ thuật | `tests/ai/exception-agent.test.mjs` |
| EX07 | Khử dữ liệu an toàn toàn diện | Phản hồi lỗi sàn chứa header Authorization và body nhạy cảm | Cấu trúc payload gửi tới provider, thẻ task lưu trữ và log lỗi đều hoàn toàn sạch | `tests/ai/exception-agent.test.mjs` |
| EX08 | Tranh chấp lượt retry cuối giữa 2 worker | Hai worker cùng đồng thời xin cấp lượt retry cuối cùng của action | Chỉ một worker nhận được token dispatch, worker còn lại bị từ chối | `tests/ai/exception-agent.test.mjs` |
| EX09 | Restart sau khi đã dùng hết ngân sách | Tiến trình khởi động lại sau khi ngân sách thử lại đã cạn kiệt | Không được cấp lại ngân sách mới cho cùng action nghiệp vụ đó | `tests/ai/exception-agent.test.mjs` |
| EX10 | Queue phân phối lại cùng một event | Hàng đợi tin nhắn gửi lại cùng một message lỗi | Không tạo thêm thẻ công việc mới và không tăng số lần attempt thử lại | `tests/ai/exception-agent.test.mjs` |
| EX11 | Bản vá tạo từ phiên bản dữ liệu cũ | Bản vá được tạo cho phiên bản 1 nhưng dữ liệu hiện tại là phiên bản 2 | Hệ thống từ chối áp dụng bản vá do dữ liệu đã cũ | `tests/ai/exception-agent.test.mjs` |
| EX12 | Mô hình ngôn ngữ không khả dụng | Cổng gọi mô hình bị timeout hoặc ngắt kết nối mạng | Hệ thống trả về tóm tắt lỗi từ mẫu cố định kèm mã tham chiếu kỹ thuật | `tests/ai/exception-agent.test.mjs` |

## Tiêu chí nghiệm thu phân tầng

### Nghiệm thu Demo

1. Chạy thành công toàn bộ 12 ca kiểm thử trên adapter giả lập demo trong bộ nhớ.
2. Kiểm tra tính toàn vẹn của logic phân loại bằng mã nguồn, ngân sách nguyên tử và cơ chế suppression.

### Nghiệm thu Tích hợp Thật

1. Bảng ánh xạ mã lỗi được đối chiếu với tài liệu API chính thức của sàn đối tác.
2. Kiểm thử tương thích trên môi trường sandbox của sàn với tài khoản ủy quyền thật.
3. Xác minh hành vi đối soát kỹ thuật khi ngắt kết nối mạng thực tế trong lúc đang gửi yêu cầu tạo bài đăng.

## Lệnh thực thi kiểm thử

Chạy toàn bộ kiểm thử đơn vị và tích hợp tác nhân ngoại lệ:
`node --experimental-strip-types --test tests/ai/exception-agent.test.mjs`

Chạy kiểm tra kiểu tĩnh và toàn bộ suite kiểm thử của dự án:
`npm run typecheck && npm test`
