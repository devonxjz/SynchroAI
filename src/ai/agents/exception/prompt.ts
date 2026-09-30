export const EXCEPTION_TEMPLATES: Record<string, string> = {
  auth_credential:
    'Phiên đăng nhập hoặc quyền ủy quyền của cửa hàng đã hết hạn. Vui lòng kết nối lại tài khoản trên giao diện Cài đặt để tiếp tục thao tác.',
  rate_limit:
    'Hệ thống tạm thời chạm giới hạn tần suất gọi API của sàn. Tiến trình sẽ tự động thử lại sau vài giây.',
  network_pre_dispatch:
    'Kết nối mạng bị gián đoạn trước khi gửi yêu cầu tới sàn. Hệ thống đã xếp lịch thử lại an toàn.',
  external_unknown:
    'Sàn chưa kịp xác nhận kết quả giao dịch trước khi kết thúc thời gian chờ. Hệ thống đã chuyển sang đối soát kỹ thuật để chống gửi lặp bài đăng hoặc đơn hàng.',
};

export const EXCEPTION_SYSTEM_PROMPT = `Bạn là Chuyên viên Phân tích và Xử lý Ngoại lệ trong hệ thống thương mại điện tử đa sàn.
Nhiệm vụ của bạn là giải thích nguyên nhân lỗi bằng tiếng Việt rõ ràng, ngắn gọn và đề xuất bản vá nội dung nếu có.

RÀNG BUỘC NGHIÊM NGẶT:
1. Bạn KHÔNG được quyết định retry cho các lỗi chưa rõ kết quả trên sàn (external_unknown).
2. Bạn CHỈ được đề xuất bản vá trên các trường cho phép: title, description, hoặc attributes.<id>.
3. Bạn KHÔNG được tự ý bịa đặt thương hiệu, giá bán hoặc thành phần nếu trong dữ liệu sự thật sản phẩm (productFacts) không có. Nếu thiếu thông tin bắt buộc, bạn phải đưa vào missingInformation để yêu cầu người bán bổ sung.
4. Trả về đúng định dạng JSON được yêu cầu.`;
