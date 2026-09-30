# Chặng 3. Cổng mô hình, cache đa yếu tố và fallback có cấu trúc

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xây dựng system prompt có phiên bản và schema JSON nghiêm ngặt cho tác nhân từ khóa.
Thiết lập cơ chế tính mã băm cache đa yếu tố gắn liền với phiên bản danh sách từ cấm.
Cập nhật nhánh `keyword_agent` trong `FixtureModelProvider` để chế độ demo hoạt động chuẩn xác qua gateway thật.
Xử lý đa ngôn ngữ bảo toàn thương hiệu và mã SKU theo ca kiểm thử K05.
Xây dựng cơ chế fallback có cấu trúc khi nhà cung cấp gặp sự cố, phân biệt rõ lỗi mạng với lỗi logic.

## Thay đổi dự kiến

Tạo file mới `src/ai/agents/keywords/prompt.ts`.
File này chứa hằng số phiên bản prompt `1.0.0` và system prompt People-First SEO cho từ khóa.
Prompt chứa các chỉ dẫn bắt buộc: chỉ gợi ý dựa trên fact đã cung cấp, không bịa đặt số liệu đo lường, không tự gán thương hiệu đối thủ và trả về JSON chuẩn xác.

Cập nhật file `src/ai/model-call/providers/fixture-provider.ts`.
Bổ sung nhánh xử lý khi `request.agentName` có giá trị `keyword_agent`.
Nhánh này trả về đối tượng JSON giả lập hợp lệ tuân thủ đúng schema đầu ra của tác nhân từ khóa.
Đảm bảo chế độ demo gọi qua cổng gateway thật trả về dữ liệu mẫu thành công thay vì rơi vào fallback do sai lệch schema.

Tạo file mới `src/ai/agents/keywords/generator.ts`.
File này thực hiện hàm điều phối chính `generateKeywords`.
Tính toán mã băm `inputHash` bao gồm: mã bản chụp, phiên bản bản chụp, mã băm bản chụp, locale đích, danh mục xác nhận, thương hiệu, phiên bản danh sách từ cấm và phiên bản cấu hình xếp hạng.
Khi danh sách từ cấm thay đổi phiên bản, mã băm thay đổi buộc gateway phải gọi mô hình mới thay vì trả cache cũ.
Xử lý ngôn ngữ đích: Nếu locale đích là tiếng Thái ('th') hoặc tiếng Anh ('en'), kết quả dịch cụm từ đúng ngôn ngữ nhưng bảo toàn nguyên vẹn tên thương hiệu và mã biến thể SKU.
Xử lý lỗi phân tầng: Nếu cổng mô hình gặp lỗi mạng, timeout hoặc lỗi từ chối dịch vụ, hàm trả về kết quả có cấu trúc với `status` giá trị `fallback`, `errorCode` xác định và thông điệp cảnh báo rõ ràng.
Nếu xảy ra lỗi lập trình hoặc tham số đầu vào sai lệch nghiêm trọng, hàm không nuốt lỗi mà để lỗi hiển thị rõ ràng.
Phân biệt rành mạch giữa trường hợp mô hình không tìm thấy từ khóa phù hợp (`status: 'completed'`, mảng rỗng) và trường hợp sự cố kết nối (`status: 'fallback'`).

Tạo file mới `src/ai/agents/keywords/index.ts`.
Xuất khẩu hàm `generateKeywords` và toàn bộ các kiểu dữ liệu công khai.

Cập nhật `tests/ai/keywords-agent.test.mjs` với các ca kiểm thử Chặng 3.

## Cấu trúc dữ liệu

`KeywordGeneratorOptions`: kiểu đối tượng tùy chọn gồm gateway đối tượng ModelCallGateway, providerOverride đối tượng IModelProvider và rankingConfig đối tượng RankingConfig.
`KeywordPromptVersion`: hằng số chuỗi định danh phiên bản prompt.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy kiểm thử đơn vị và kiểm thử cổng mô hình:
`node --experimental-strip-types --test tests/ai/keywords-agent.test.mjs`

Xác minh ca vô hiệu hóa cache: Khi đổi phiên bản danh sách từ cấm từ v1 sang v2, gateway ghi nhận cache miss và không trả lại kết quả cũ.
Xác minh ca K05: Yêu cầu từ khóa với locale 'th' trả về cụm từ tiếng Thái nhưng giữ nguyên tên thương hiệu và mã SKU.
Xác minh ca fallback: Khi mô phỏng cổng mô hình timeout, hàm trả về đối tượng có status fallback, mảng từ khóa rỗng và cảnh báo có cấu trúc.
Xác minh ca demo gateway: Gọi qua gateway với chế độ demo sử dụng FixtureModelProvider trả về kết quả hợp lệ khớp schema.
