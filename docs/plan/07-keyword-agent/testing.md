# Chiến lược và ma trận kiểm thử Tác nhân Từ khóa

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Xác lập ma trận kiểm thử tự động toàn diện tập trung vào việc bắt lỗi thực tế.
Tránh các ca kiểm thử hình thức chỉ kiểm tra sự tồn tại của chuỗi hoặc kiểm tra tĩnh.
Tất cả các ca kiểm thử từ K01 đến K06 và các kịch bản bắt lỗi ranh giới đều được tự động hóa hoàn toàn.

## Ma trận 10 ca kiểm thử thực chất

| Mã ca | Mục tiêu bắt lỗi | Dữ liệu đầu vào giả định | Kết quả bắt buộc chứng minh | Tệp kiểm thử |
|---|---|---|---|---|
| T01 | Phát hiện sai lệch số liệu và đơn vị | Fact có khối lượng 250g nhưng từ khóa ghi 500g | Mục từ khóa bị loại bỏ hoặc đánh dấu unverified semantic | `tests/ai/keywords-agent.test.mjs` |
| T02 | Phát hiện tuyên bố số đo ngầm trong text | Không có dataset nhưng trường reason ghi 10.000 lượt tìm kiếm | Bộ kiểm tra từ chối hoặc bóc tách bỏ tuyên bố không căn cứ | `tests/ai/keywords-agent.test.mjs` |
| T03 | Đối soát ngữ cảnh của metric | Có dataset đo nhưng metric thuộc từ khóa hoặc locale khác | Bộ kiểm tra từ chối liên kết metricRef với từ khóa hiện tại | `tests/ai/keywords-agent.test.mjs` |
| T04 | Vô hiệu hóa cache khi đổi luật | Giữ nguyên snapshot nhưng nâng version danh sách cấm từ v1 lên v2 | Gateway kích hoạt gọi mới, không dùng lại kết quả trong cache | `tests/ai/keywords-agent.test.mjs` |
| T05 | Thứ tự khử trùng lặp sau kiểm tra | Hai từ khóa trùng nhau, mục đứng trước vi phạm còn mục sau đúng | Giữ lại mục hợp lệ đứng sau, loại bỏ mục vi phạm | `tests/ai/keywords-agent.test.mjs` |
| T06 | Lọc và khử trùng trước khi cắt tỉa | Đầu vào 50 mục gồm cả trùng lặp và vi phạm quy tắc | Lọc sạch trước khi cắt tỉa, không cố bù số lượng để đủ 10 mục | `tests/ai/keywords-agent.test.mjs` |
| T07 | Bảo vệ Content khi lỗi song song | Nhánh từ khóa ném ngoại lệ trước khi Content hoàn thành | Nháp Content vẫn được lưu trữ nguyên vẹn trong state | `tests/ai/prepare-listing.test.mjs` |
| T08 | Quyền quyết định của Review | Từ khóa rơi vào fallback trên sàn bắt buộc phải có từ khóa | Review chặn quy trình và yêu cầu can thiệp thủ công | `tests/ai/prepare-listing.test.mjs` |
| T09 | Cô lập khi kích hoạt retry | Kích hoạt retry bước keywords sau khi đã có bản nháp Content | Nhánh Content không bị chạy lại, dọn dẹp artifact cũ sạch sẽ | `tests/ai/prepare-listing.test.mjs` |
| T10 | Tích hợp Fixture cho demo | Chế độ demo gọi qua cổng ModelCallGateway thật | Nhận về schema KeywordOutput hợp lệ, không rơi vào fallback | `tests/ai/keywords-agent.test.mjs` |

## Bộ đánh giá nghiệm thu 20 sản phẩm mẫu

Đánh giá chất lượng thực tế trên tập hợp 20 sản phẩm thuộc 4 ngành hàng cốt lõi.
Bao gồm: Cà phê đặc sản, Đồ may mặc thời trang, Gia dụng nhà bếp và Sản phẩm chăm sóc cá nhân.
Các điều kiện đánh giá được phân định rành mạch:
1. Nguồn gốc tham chiếu hợp lệ: Đây là điều kiện kỹ thuật tiên quyết bắt buộc. Tỷ lệ cụm từ có tham chiếu fact đúng phải đạt tối thiểu 95 phần trăm.
2. Mức độ liên quan: Do người bán có chuyên môn ngành hàng trực tiếp đánh giá trên thang điểm.
3. Không tính đầu ra rỗng: Một kết quả trả về mảng rỗng không được tính là đạt chất lượng chỉ vì nó không chứa lỗi vi phạm.
4. Thẩm định bản địa hóa tiếng Thái: Toàn bộ kết quả cho locale tiếng Thái bắt buộc phải do người đọc hiểu tiếng Thái kiểm tra. Các bộ fixture giả lập không được coi là bằng chứng chất lượng ngôn ngữ.

## Lệnh thực thi kiểm thử

Chạy toàn bộ kiểm thử đơn vị tác nhân từ khóa:
`node --experimental-strip-types --test tests/ai/keywords-agent.test.mjs`

Chạy toàn bộ kiểm thử tích hợp quy trình điều phối:
`node --experimental-strip-types --test tests/ai/prepare-listing.test.mjs`

Chạy kiểm tra kiểu tĩnh và toàn bộ suite kiểm thử:
`npm run typecheck && npm test`
