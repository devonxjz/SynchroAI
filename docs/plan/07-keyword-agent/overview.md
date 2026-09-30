# Kế hoạch triển khai Tác nhân Từ khóa (Keyword Agent)

## Bối cảnh

Tác nhân từ khóa hỗ trợ người bán tìm kiếm và lựa chọn các cụm từ tìm kiếm phù hợp cho sản phẩm.
Tác nhân chạy song song với Tác nhân nội dung trong quy trình chuẩn bị sản phẩm.
Mọi gợi ý từ khóa phải dựa trên sự thật sản phẩm đã xác minh và bộ quy tắc từ cấm có phiên bản.
Hệ thống không tự ý đưa số liệu đo lường hoặc thương hiệu đối thủ vào nội dung.

## Phạm vi

### Bao gồm

1. Định nghĩa kiểu dữ liệu chặt chẽ tại `src/ai/agents/keywords/types.ts` với discriminated union và ranh giới rõ ràng.
2. Tái sử dụng logic trích xuất sự thật sản phẩm từ `src/ai/agents/content/facts.ts`.
3. Quản lý danh sách từ khóa cấm có phiên bản tại `src/ai/agents/keywords/forbidden.ts`.
4. Quy trình xử lý tuần tự gồm parse thô, chuẩn hóa Unicode NFC, kiểm tra ranh giới, loại bỏ lỗi, khử trùng lặp và cắt tỉa tại `src/ai/agents/keywords/normalizer.ts` và `src/ai/agents/keywords/validator.ts`.
5. Thiết lập system prompt và schema JSON nghiêm ngặt tại `src/ai/agents/keywords/prompt.ts`.
6. Xếp hạng ổn định dựa trên mức độ xác minh nguồn gốc và cắt tỉa tối đa 10 mục tại `src/ai/agents/keywords/ranker.ts`.
7. Điều phối gọi mô hình qua `ModelCallGateway` với mã băm cache đa yếu tố và cập nhật nhánh keyword trong `FixtureModelProvider` tại `src/ai/agents/keywords/generator.ts`.
8. Tích hợp an toàn vào `src/ai/workflows/prepare-listing/step-engine.ts`, tách biệt gợi ý từ khóa với hashtags của proposal và bảo vệ Content draft khi nhánh từ khóa gặp sự cố.
9. Bộ kiểm thử tự động gồm 10 ca kiểm thử thực chất tại `tests/ai/keywords-agent.test.mjs` và kiểm thử tích hợp tại `tests/ai/prepare-listing.test.mjs`.

### Loại trừ

1. Không tự động sao chép toàn bộ cụm từ khóa gợi ý vào trường hashtags của proposal khi người bán chưa chọn.
2. Không hỗ trợ số đo lưu lượng tìm kiếm trong bản đầu do hệ thống chưa có bộ dữ liệu đo kiểm thực tế.
3. Không tự ý nâng danh mục do mô hình phỏng đoán thành danh mục đã xác nhận.
4. Không tự động duyệt hoặc cấp quyền tiếp tục nếu bước Review 08 đánh giá lỗi từ khóa là chặn.

## Ràng buộc và ranh giới an toàn

1. Phân biệt gợi ý và payload: Kết quả của tác nhân từ khóa chỉ lưu dưới dạng gợi ý tại artifact `keywordsOutput`. Chỉ các mục được người dùng hoặc template chọn mới được đưa vào payload của sàn. Khi từ khóa được gộp vào nội dung, quy trình Review 08 bắt buộc phải chạy lại trên văn bản cuối.
2. Ranh giới kiểm tra tính đúng: Code xác minh chặt chẽ mã tham chiếu, số lượng, đơn vị đo, mã biến thể SKU, thương hiệu và từ cấm. Các diễn đạt tự do chưa chứng minh được ngữ nghĩa phải được đánh dấu rõ là unverified semantic thay vì gán nhãn đã xác thực. Kế hoạch không đưa ra cam kết triệt tiêu hoàn toàn ảo giác.
3. Chính sách lỗi có phân cấp: Lỗi nhà cung cấp dự kiến trả về danh sách rỗng kèm mã lỗi và cảnh báo có cấu trúc. Lỗi lập trình hoặc đầu vào sai phải được quan sát như lỗi hệ thống. Bước Review 08 giữ quyền quyết định cho phép tiếp tục hay dừng quy trình.
4. Tính toàn vẹn của bộ nhớ đệm: Mã băm cache đầu vào phải chứa mã bản chụp, phiên bản bản chụp, mã băm bản chụp, ngôn ngữ đích, danh mục xác nhận, thương hiệu và phiên bản danh sách từ cấm. Việc nâng phiên bản danh sách từ cấm bắt buộc phải làm mất hiệu lực cache cũ.
5. Kiểm soát số đo: Bản đầu chỉ hỗ trợ căn cứ `product_fact` và từ chối mọi trường số đo hoặc metricRef.

## Phương án thiết kế

### Phương án A. Trích xuất từ khóa thuần túy từ văn bản có sẵn

Phương án chỉ bóc tách từ ngữ xuất hiện trong tiêu đề và mô tả.
Ưu điểm là tốc độ nhanh và không tốn chi phí mô hình.
Nhược điểm là thiếu các cụm từ tìm kiếm tự nhiên của người mua và không hỗ trợ dịch thuật ngữ.

### Phương án B. Gọi mô hình tự do và tự động chép vào proposal

Phương án để mô hình sinh từ khóa và tự động đưa toàn bộ vào payload sàn.
Ưu điểm là mã nguồn đơn giản.
Nhược điểm là rủi ro vi phạm chính sách sàn, nhồi nhét từ khóa và đưa số liệu ảo vào bài đăng.

### Phương án C được chọn. Mô hình gợi ý kèm bộ lọc ranh giới và xác nhận của người bán

Mô hình đưa ra các gợi ý có dẫn nguồn fact.
Hệ thống kiểm tra ranh giới hai mức trước khi lưu trữ dưới dạng gợi ý.
Chỉ các mục người bán lựa chọn mới được đưa vào nội dung và phải qua bước Review lại.
Phương án này bảo đảm an toàn chính sách và giữ đúng quyền quyết định của người bán.

## Kỹ năng áp dụng

1. `principle-foundational-thinking`. Thiết lập cấu trúc kiểu dữ liệu và tái sử dụng fact trước khi viết logic mô hình.
2. `principle-type-system-discipline`. Dùng discriminated union để loại bỏ các trạng thái mâu thuẫn ở cấp độ kiểu dữ liệu.
3. `principle-boundary-discipline`. Kiểm tra dữ liệu tại ranh giới đầu ra mô hình, tách biệt lỗi mạng và lỗi logic.
4. `principle-laziness-protocol`. Tái sử dụng logic facts hiện có, không viết lại các module trùng lặp.
5. `principle-sequence-verifiable-units`. Tổ chức thành 4 chặng có thể nghiệm thu độc lập.
6. `principle-prove-it-works`. Xây dựng các ca kiểm thử có khả năng bắt lỗi thực tế, không dùng kiểm thử hình thức.

## Bốn chặng triển khai

1. [Chặng 1. Hợp đồng dữ liệu, tái sử dụng facts và danh sách từ cấm](phase-1-contracts-and-facts.md)
2. [Chặng 2. Chuẩn hóa, bộ kiểm tra ranh giới và kiểm thử bắt lỗi](phase-2-normalizer-and-validator.md)
3. [Chặng 3. Cổng mô hình, cache đa yếu tố và fallback có cấu trúc](phase-3-gateway-cache-and-fallback.md)
4. [Chặng 4. Tích hợp quy trình, ranh giới proposal và kiểm thử tích hợp](phase-4-workflow-selection-and-eval.md)
5. [Chiến lược và ma trận kiểm thử](testing.md)

## Lệnh xác minh dự án

Kiểm tra kiểu dữ liệu toàn dự án:
`npm run typecheck`

Chạy toàn bộ kiểm thử đơn vị và tích hợp:
`npm test`

Chạy riêng bộ kiểm thử tác nhân từ khóa:
`node --experimental-strip-types --test tests/ai/keywords-agent.test.mjs`

## Hướng dẫn thực thi

Người thực hiện cần rà soát kỹ thứ tự thực thi song song trong `step-engine.ts`.
Chạy `/deslop` trên từng bản diff trước khi commit.
Tuân thủ kỹ năng `unslop` cho toàn bộ mã nguồn và tài liệu kỹ thuật.
Sử dụng `show-me-your-work` để lưu trữ nhật ký quyết định kỹ thuật.
