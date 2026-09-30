# Kế hoạch triển khai Tác nhân Ngoại lệ (Exception Handling Agent)

## Bối cảnh

Hệ thống kết nối sàn thương mại điện tử thường xuyên gặp sự cố mạng, lỗi xác thực, từ chối quy tắc và phản hồi không rõ trạng thái.
Nếu để mô hình ngôn ngữ tự ý quyết định retry, hệ thống có nguy cơ tạo đơn trùng hoặc spam yêu cầu lên sàn.
Tác nhân ngoại lệ kết hợp bằng chứng dispatch từ adapter sàn với khả năng giải thích của mô hình.
Mọi đề xuất can thiệp phải có bằng chứng, bảo vệ ngân sách retry nguyên tử và không bao giờ sửa trực tiếp bài đăng đang hoạt động.
Kế hoạch phân định rõ ràng giữa nghiệm thu demo với bộ adapter giả lập và nghiệm thu tích hợp thật khi có tài liệu sàn chính thức.

## Phạm vi

### Bao gồm

1. Định nghĩa kiểu dữ liệu chặt chẽ cho lớp lỗi, bằng chứng dispatch từ Khối 11, ranh giới bản vá và ngân sách thử lại tại `src/ai/agents/exception/types.ts`.
2. Bảng ánh xạ mã lỗi sàn có gắn nhãn demo fixture và bộ lọc dữ liệu an toàn dựa trên danh sách trường cho phép tại `src/ai/agents/exception/matrix.ts` và `src/ai/agents/exception/sanitizer.ts`.
3. Hàm phân loại lỗi thuần túy `classifyFailure` tiếp nhận kết quả dispatch từ adapter gồm `confirmed`, `rejected`, `retryable_not_sent` và `unknown`. Mã nguồn xác định quyền retry và gán cứng lớp lỗi cuối cùng.
4. Quản lý ngân sách retry gắn với từng action nghiệp vụ và attempt ID. Nhận lượt thử bằng thao tác nguyên tử trước khi dispatch. Phân biệt tổng số lượt thử với số lần retry.
5. Sinh tóm tắt tiếng Việt bằng mẫu cố định cho lỗi rõ ràng. Chỉ gọi mô hình khi cần giải thích nhiều trường hoặc đề xuất bản vá nội dung tại `src/ai/agents/exception/generator.ts`.
6. Bộ thẩm định bản vá nghiêm ngặt theo đường dẫn trường cụ thể và kiểu dữ liệu. Kiểm tra sự tồn tại của fact nguồn và phiên bản kỳ vọng tại `src/ai/agents/exception/patch-validator.ts`.
7. Khử trùng lặp thẻ công việc theo loại đối tượng và điểm kết nối tại `src/ai/agents/exception/dedup.ts`. Tách biệt hoàn toàn cơ chế gom thẻ với cơ chế ngăn đề xuất lại bản vá bị từ chối theo Khối 10.
8. Bộ kiểm thử tự động toàn diện bao phủ toàn bộ các ca từ EX01 đến EX12 tại `tests/ai/exception-agent.test.mjs`.

### Loại trừ

1. Không cho phép mô hình ngôn ngữ tự ý quyết định retry hoặc ghi đè lớp lỗi và hướng xử lý do mã nguồn ấn định.
2. Không cho phép retry tự động đối với các phản hồi thuộc nhóm `unknown` trên thao tác ghi. Mọi trường hợp này đều chuyển sang đối soát kỹ thuật.
3. Không tự ý đoán giá trị thuộc tính còn thiếu khi hồ sơ sự thật sản phẩm không chứa thông tin đó. Trường hợp này chuyển thành yêu cầu người bán bổ sung.
4. Không thực thi bản vá trực tiếp lên bài đăng đang hoạt động. Bản vá hợp lệ chỉ tạo đề xuất bản nháp mới để đi qua Review 08 và Policy 09.
5. Không đưa toàn bộ body hoặc header phản hồi thô của sàn vào prompt hoặc bản lưu vết.

## Ràng buộc và ranh giới an toàn

1. Quyết định xử lý dựa trên bằng chứng dispatch của adapter. Adapter sàn xác định rõ trạng thái gửi gồm `confirmed`, `rejected`, `retryable_not_sent` hoặc `unknown`. Hàm phân loại quyết định dựa trên bằng chứng đó và khả năng chống trùng của sàn. Lỗi `unknown` khi tạo bài hoặc tạo đơn luôn đi vào quy trình đối soát kỹ thuật. Mã nguồn gắn cứng `failureClass` và `nextAction` sau cùng. Mô hình không được cung cấp hoặc thay đổi các trường này.
2. Ngân sách retry nguyên tử chống race và chống restart. Ngân sách gắn với từng action nghiệp vụ và attempt ID. Worker phải nhận token lượt thử bằng thao tác nguyên tử trước khi dispatch. Hệ thống phân định rõ 1 lần chạy đầu và số lần retry cho phép. Lịch retry ghi nhận thời điểm cụ thể được phép chạy tiếp. Khi tiến trình restart hoặc hết ngân sách, hệ thống không cấp lại lượt thử.
3. Phân định khử trùng lặp thẻ và cơ chế chặn đề xuất lại. Khóa gom thẻ công việc phân biệt loại đối tượng như sản phẩm, đơn hàng, hoặc kết nối tài khoản. Năm sản phẩm cùng lỗi token chỉ tạo một thẻ kết nối lại cho tài khoản đó. Việc không lặp lại bản vá bị từ chối được quản lý bằng cơ chế suppression của Khối 10 dựa trên mã băm bản vá và phiên bản dữ liệu nguồn.
4. Danh sách trường cho phép của bản vá. Bản vá chỉ được phép tác động lên các đường dẫn cụ thể gồm `title`, `description` và các thuộc tính chi tiết `attributes.<id>`. Tuyệt đối cấm các trường giá bán, số lượng tồn kho, cấu trúc SKU hoặc phân quyền. Giá trị trước phải lấy từ dữ liệu máy chủ. Nếu fact nguồn không có giá trị thì phải yêu cầu người bán bổ sung thay vì để mô hình tự bịa.
5. Lọc an toàn dựa trên danh sách trường giữ lại. Hệ thống tạo dữ liệu lỗi an toàn bằng cách chỉ sao chép các trường được cho phép lưu trữ. Toàn bộ chuỗi bí mật, token và thông tin cá nhân bị che chắn trước khi ghi log, lưu trạng thái hoặc gửi cho mô hình.

## Phương án thiết kế

### Phương án A. Giao toàn bộ phản hồi lỗi cho mô hình tự quyết định

Chuyển thẳng phản hồi thô của sàn cho mô hình để đề xuất hành động.
Ưu điểm là mã nguồn ban đầu ngắn gọn.
Nhược điểm là mô hình có thể phỏng đoán sai trạng thái dispatch, dẫn đến nguy cơ gửi lặp đơn hàng hoặc vi phạm quy định sàn.

### Phương án B. Xử lý cứng toàn bộ bằng quy tắc mã nguồn

Sử dụng bảng quy tắc cố định cho toàn bộ tình huống lỗi.
Ưu điểm là an toàn và dễ kiểm soát.
Nhược điểm là thông báo lỗi cứng nhắc, khó hiểu đối với người bán và không đề xuất được bản vá khi phát sinh lỗi nhiều trường.

### Phương án C được chọn. Phân tầng kiểm soát bằng mã nguồn kết hợp giải thích bằng mô hình

Mã nguồn tiếp nhận kết quả dispatch từ adapter để ấn định hướng xử lý và kiểm soát ngân sách nguyên tử.
Mẫu câu cố định phục vụ các lỗi đơn giản như hết hạn phiên đăng nhập để tiết kiệm chi phí.
Mô hình chỉ được gọi khi cần phân tích lỗi phức tạp hoặc đề xuất bản vá nội dung trong phạm vi cho phép.
Bản vá do mô hình đề xuất phải có căn cứ fact và tạo đề xuất bản nháp mới qua Khối 10.

## Kỹ năng áp dụng

1. `principle-foundational-thinking`. Thiết lập cấu trúc kiểu dữ liệu lớp lỗi, bằng chứng dispatch và ngân sách thử lại nguyên tử trước khi viết logic mô hình.
2. `principle-type-system-discipline`. Sử dụng discriminated union cho kết quả phân loại lỗi để ngăn chặn các trạng thái không an toàn.
3. `principle-boundary-discipline`. Lọc dữ liệu an toàn dựa trên danh sách trường cho phép trước khi ghi log hoặc gửi cho mô hình.
4. `principle-make-operations-idempotent`. Đảm bảo các thao tác nhận lượt thử và ghi nhận thẻ công việc có tính bất biến và không tạo trùng lặp thẻ.
5. `principle-laziness-protocol`. Sử dụng mẫu có sẵn cho lỗi xác thực thông thường để loại bỏ việc gọi mô hình không cần thiết.
6. `principle-sequence-verifiable-units`. Chia nhỏ kế hoạch thành 4 chặng độc lập có kiểm thử tự động riêng biệt.
7. `principle-prove-it-works`. Xây dựng các ca kiểm thử tranh chấp worker, restart tiến trình, timeout tạo bài và bóc tách dữ liệu an toàn.

## Bốn chặng triển khai

1. [Chặng 1. Hợp đồng dữ liệu, bằng chứng dispatch và bộ lọc an toàn](phase-1-contracts-and-error-matrix.md)
2. [Chặng 2. Phân loại lỗi bằng mã nguồn, kiểm tra dispatch và ngân sách nguyên tử](phase-2-deterministic-classifier-and-budget.md)
3. [Chặng 3. Bộ giải thích bằng mô hình, danh sách trường bản vá và căn cứ fact](phase-3-llm-explainer-and-patch-validator.md)
4. [Chặng 4. Khử trùng lặp theo đối tượng, cơ chế suppression và kiểm thử tích hợp](phase-4-dedup-task-and-pipeline-integration.md)
5. [Chiến lược và ma trận kiểm thử](testing.md)

## Lệnh xác minh dự án

Kiểm tra kiểu dữ liệu toàn dự án:
`npm run typecheck`

Chạy toàn bộ kiểm thử đơn vị và tích hợp:
`npm test`

Chạy riêng bộ kiểm thử tác nhân ngoại lệ:
`node --experimental-strip-types --test tests/ai/exception-agent.test.mjs`

## Hướng dẫn thực thi

Người triển khai cần bảo đảm mã nguồn luôn là đơn vị duy nhất ấn định `failureClass` và `nextAction`.
Sử dụng `/deslop` trên từng bản diff trước khi commit.
Tuân thủ nghiêm ngặt kỹ năng `unslop` cho toàn bộ tài liệu và mã nguồn.
Ghi lại nhật ký kỹ thuật bằng `show-me-your-work` trong suốt quá trình xây dựng.
