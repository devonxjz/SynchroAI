# 08. Kiểm tra nội dung và quy tắc sàn

## 1. Hai phần kiểm tra cùng phục vụ một kết quả

Quy trình kiểm tra nội dung và quy tắc sàn kết hợp giữa hai cơ chế bổ trợ lẫn nhau:
1. `validateListing`: Hàm mã nguồn thuần túy kiểm tra cấu trúc dữ liệu, định dạng ảnh, danh mục hợp lệ, thuộc tính bắt buộc, số liệu, nguồn tham chiếu và quy tắc sàn đã xác minh.
2. `reviewContent`: Tác nhân sử dụng mô hình ngôn ngữ để phát hiện sai lệch ý nghĩa, bổ sung công dụng không căn cứ, mâu thuẫn thông tin hoặc lỗi dịch thuật ngữ cảnh.

Mã nguồn được đặt tại `src/ai/agents/review/` cho tác nhân đánh giá và `src/ai/validation/` cho bộ quy tắc sàn.
Module phụ thuộc vào Khối 01, 03, 05, 06 và 07.
Kết nối với Khối kiểm tra pháp lý 15 khi kích hoạt phạm vi thị trường tương ứng.

## 2. Các tầng kiểm tra đầu ra và đánh giá chất lượng từng tác nhân

Hệ thống thiết lập 4 tầng kiểm tra liên hoàn, bảo đảm không có lỗi lọt qua các ranh giới:

### Tầng 1. Kiểm tra đầu ra độc lập của từng tác nhân

- Tác nhân nội dung (Content Agent 05): Bắt buộc mọi khẳng định (claims) phải liên kết trực tiếp với mã tham chiếu `sourceRefs` có trong bản chụp sự thật sản phẩm (Product Snapshot). Kiểm tra độ dài tiêu đề và cấu trúc mô tả theo giới hạn kỹ thuật của sàn.
- Tác nhân bản địa hóa (Localization Agent 06): Kiểm tra tính toàn vẹn của mã biến thể SKU, bảo tồn nguyên vẹn các token được bảo vệ (giá trị số, đơn vị đo lường, mã thương hiệu) và đối soát việc dịch thuật ngữ theo phiên bản từ điển chỉ định.
- Tác nhân từ khóa (Keyword Agent 07): Kiểm tra danh sách từ cấm có phiên bản, chuẩn hóa ký tự Unicode NFC, loại bỏ hoàn toàn các tuyên bố số đo ngầm không có căn cứ đo kiểm và xác minh liên kết fact cho từng cụm từ gợi ý.

### Tầng 2. Kiểm tra tính nhất quán giữa các tác nhân và ranh giới đề xuất

- Đối soát chéo giữa bản dịch bản địa hóa và bản nội dung gốc: Tuyệt đối không phát sinh thuộc tính mới hoặc thay đổi thông số định lượng trong quá trình chuyển ngữ.
- Ranh giới đề xuất (Proposal Boundary): Toàn bộ cụm từ do Tác nhân từ khóa sinh ra chỉ lưu trữ dưới dạng gợi ý tại `keywordsOutput`. Chỉ các từ khóa do người bán hoặc mẫu thiết lập chủ động chọn trong `selectedKeywords` mới được đưa vào trường `hashtags` của đề xuất bài đăng.
- Khi người dùng áp dụng từ khóa vào tiêu đề hoặc mô tả, toàn bộ quy trình kiểm tra bắt buộc phải chạy lại trên văn bản hoàn chỉnh cuối cùng.

### Tầng 3. Thẩm định quy tắc sàn bằng mã nguồn thuần túy

- Kiểm tra tính đầy đủ của các thuộc tính bắt buộc theo từng danh mục của sàn Shopee hoặc sàn demo.
- Kiểm tra số lượng ảnh tối thiểu, tỷ lệ khung hình, dung lượng tối đa và bóc tách metadata.
- Kiểm tra tính hợp lệ của liên kết URL hình ảnh: Chặn triệt để các địa chỉ mạng nội bộ hoặc nguy cơ tấn công SSRF.
- Kiểm tra tính duy nhất của các biến thể phân loại: Không cho phép hai biến thể SKU có cùng tập hợp giá trị thuộc tính.
- Kiểm tra giá bán và tồn kho: Bắt buộc giá bán phải là số dương và số lượng tồn kho hợp lệ.

### Tầng 4. Đánh giá ngữ nghĩa bằng mô hình ngôn ngữ và bảng điểm chất lượng

- Phát hiện các tuyên bố phóng đại, cam kết sai sự thật hoặc thuật ngữ cấm trong quảng cáo y tế, dược phẩm, thực phẩm chức năng.
- Bảng điểm chất lượng đầu ra (Quality Scorecard) được tính toán trên thang điểm 100 với các tiêu chí định lượng:
  1. Điểm bám sát sự thật sản phẩm (Fact Grounding Score): Tỷ lệ các câu có căn cứ tham chiếu đúng.
  2. Điểm tuân thủ quy tắc sàn (Marketplace Compliance Score): Mức độ phù hợp với hướng dẫn người bán của sàn.
  3. Điểm bảo toàn định lượng (Token Preservation Score): Mức độ nguyên vẹn của số liệu, đơn vị và SKU.
  4. Điểm bản địa hóa tự nhiên (Fluency & Relevance Score): Đánh giá độ trôi chảy ngôn ngữ và văn hóa tiêu dùng bản địa.
  5. Điểm an toàn từ khóa (Keyword Safety Score): Tỷ lệ từ khóa không vi phạm chính sách và không nhồi nhét spam.

### Nguyên tắc Zero-Mock Data trong đánh giá chất lượng

Đánh giá chất lượng của từng tác nhân bắt buộc phải chạy trực tiếp trên kết quả tự sinh của tác nhân đó.
Tuyệt đối không sử dụng dữ liệu giả lập (mock data fixtures) để thay thế cho đầu ra thực tế của `generateContent`, `localizeContent` hoặc `generateKeywords`.
Bộ kiểm thử chất lượng phải kích hoạt tác nhân thật qua `ModelCallGateway` ở chế độ có kiểm soát để đo lường năng lực tạo nội dung thực tế.

## 3. Đầu vào, đầu ra và cấu trúc báo cáo kiểm tra

Đầu vào kiểm tra luôn là bản dữ liệu hoàn chỉnh cuối cùng sau khi đã ghép các phần nội dung hoặc sau khi người bán chỉnh sửa thủ công, kèm theo bản chụp sự thật sản phẩm, bộ quy tắc sàn có phiên bản và chế độ chạy (demo hoặc live).

Cấu trúc báo cáo kiểm tra:

```json
{
  "status": "needs_input",
  "score": 85,
  "findings": [
    {
      "code": "MISSING_MANDATORY_ATTRIBUTE",
      "path": "attributes.origin",
      "severity": "block",
      "messageVi": "Thuộc tính nguồn gốc xuất xứ là bắt buộc theo quy định ngành hàng Shopee.",
      "sourceRefs": [],
      "suggestedFix": "Bổ sung xuất xứ của sản phẩm để hoàn tất kiểm tra."
    }
  ],
  "agentQualityMetrics": {
    "contentAgent": { "groundedClaimsCount": 5, "unverifiedClaimsCount": 0 },
    "localizationAgent": { "tokensPreserved": true, "glossaryTermsMatched": 2 },
    "keywordsAgent": { "validKeywordsCount": 8, "violationsCount": 0 }
  },
  "rulesetVersion": "shopee-vn-v2.1",
  "reviewedPayloadHash": "hash-of-final-payload"
}
```

Trạng thái `status` thuộc một trong các giá trị:
- `pass`: Đạt toàn bộ các lớp kiểm tra và bảng điểm đạt ngưỡng, đủ điều kiện chuyển sang bước duyệt tự động hoặc bán tự động.
- `needs_input`: Phát hiện thiếu thông tin bắt buộc hoặc cần người bán xác nhận bổ sung.
- `blocked`: Vi phạm chính sách nghiêm trọng hoặc có mâu thuẫn thông tin không thể bỏ qua.
- `unverified`: Thiếu bộ quy tắc sàn đã xác minh hoặc thiếu dữ liệu đo kiểm cần thiết.

Mức độ nghiêm trọng `severity` của từng finding gồm:
- `info`: Thông tin gợi ý tối ưu.
- `warning`: Cảnh báo không làm dừng tiến trình nhưng cần lưu ý.
- `block`: Lỗi bắt buộc phải khắc phục trước khi đăng bán.

## 4. Xử lý lỗi phân tầng và tính bất biến của báo cáo

1. Quyền quyết định của Review đối với lỗi tác nhân: Khi Keyword Agent hoặc Localization Agent rơi vào chế độ fallback, Khối 08 kiểm tra yêu cầu của sàn đích. Nếu sàn bắt buộc phải có trường dữ liệu đó, Review đánh dấu trạng thái `needs_input` kèm lý do chặn cụ thể. Nếu sàn không bắt buộc, Review ghi nhận cảnh báo và cho phép quy trình tiếp tục.
2. Tính bất biến của báo cáo: Báo cáo kiểm tra được lưu kèm mã băm `reviewedPayloadHash` tính từ toàn bộ payload cuối, bản chụp fact, phiên bản ruleset và phiên bản prompt của Reviewer. Mọi thao tác sửa đổi nội dung của người bán đều làm mất hiệu lực của báo cáo cũ và kích hoạt quy trình kiểm tra lại toàn diện.

## 5. Ma trận kiểm thử thực tế không dùng Mock Data

Toàn bộ các ca kiểm thử bắt buộc phải thực thi qua các tác nhân thật để chứng minh năng lực tự sinh kết quả:

| Mã ca | Mục tiêu kiểm thử | Dữ liệu đầu vào thực tế | Kỳ vọng bắt buộc chứng minh |
|---|---|---|---|
| R01 | Thiếu thuộc tính bắt buộc của sàn | Sản phẩm thiếu trường xuất xứ theo ruleset Shopee | Finding chỉ rõ thuộc tính bắt buộc bị thiếu |
| R02 | Giới hạn độ dài tiêu đề sàn | Tác nhân nội dung sinh tiêu đề vượt 120 ký tự | Báo lỗi độ dài theo phép đếm ký tự thực tế của sàn |
| R03 | Xung đột giữa Code và LLM | LLM đánh giá pass nhưng code phát hiện giá bán âm | Trạng thái blocked, code xác định phủ quyết LLM |
| R04 | Lệch số liệu so với fact gốc | Content hoặc Localization làm lệch 250g thành 500g | Phát hiện sai lệch giá trị fact và chặn đăng |
| R05 | Không có ruleset sàn xác minh | Thực thi trên sàn chưa có bộ quy tắc chính thức | Trả về unverified, không tự động cho phép xuất bản |
| R06 | Phát hiện sửa đổi nội dung sau báo cáo | Người bán chỉnh sửa một từ trong mô tả sản phẩm | Mã băm bị lệch, báo cáo cũ bị hủy hiệu lực |
| R07 | Chặn URL ảnh nội bộ nguy hại | URL hình ảnh trỏ về localhost hoặc dải mạng 127.0.0.1 | Chặn kết nối tải ảnh trước khi thực hiện để chống SSRF |
| R08 | Biến thể trùng lặp phân loại | Hai biến thể cùng có thuộc tính Màu Đen và Size M | Báo lỗi phân loại biến thể trùng lặp |
| R09 | Đánh giá chất lượng toàn diện Zero-Mock | Chạy trọn vẹn cả 3 tác nhân với 20 sản phẩm mẫu | Đạt toàn bộ các lớp kiểm tra và điểm scorecard trên 90 |

Bộ tiêu chí hoàn thành khi giao diện Trợ lý và Việc cần duyệt hiển thị lỗi theo trường, nguồn gốc và hướng dẫn khắc phục.
Cùng một bộ validator được dùng chung cho cả màn hình xem trước lẫn worker thực thi gửi sàn.
