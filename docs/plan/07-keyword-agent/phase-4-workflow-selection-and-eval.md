# Chặng 4. Tích hợp quy trình, ranh giới proposal và kiểm thử tích hợp

[Quay lại Tổng quan](overview.md)

## Mục tiêu

Tích hợp tác nhân từ khóa vào `StepPipelineEngine` trong quy trình chuẩn bị sản phẩm.
Tách biệt hoàn toàn danh sách từ khóa gợi ý với trường hashtags của proposal sàn.
Bảo đảm an toàn thực thi song song theo ca kiểm thử K06: Lỗi nhánh từ khóa trước khi Content hoàn tất không làm mất nháp Content.
Tôn trọng quyền quyết định của bước Review 08: Fallback từ khóa không mặc nhiên được phép chuyển tới duyệt.
Hỗ trợ cơ chế retry độc lập và hoàn thiện bộ đánh giá nghiệm thu 20 sản phẩm mẫu.

## Thay đổi dự kiến

Cập nhật file `src/ai/workflows/prepare-listing/types.ts`.
Mở rộng `WorkflowArtifacts` với trường `keywordsOutput` kiểu `KeywordOutput` và trường `selectedKeywords` kiểu mảng chuỗi tùy chọn.

Cập nhật file `src/ai/workflows/prepare-listing/step-engine.ts`.
Thay thế bước giả lập `keywords` bằng lời gọi hàm `generateKeywords`.
Lưu toàn bộ kết quả có cấu trúc vào `state.artifacts.keywordsOutput`.
Quy định ranh giới proposal: Bước `assemble` chỉ lấy các từ khóa nằm trong `state.artifacts.selectedKeywords` do người dùng hoặc mẫu chọn để đưa vào `hashtags`.
Nếu chưa có thao tác chọn, trường `hashtags` trong proposal không tự động bị nhồi nhét toàn bộ các cụm từ tìm kiếm.
Khi người dùng áp dụng từ khóa vào tiêu đề hoặc mô tả, bước Review bắt buộc phải chạy lại trên văn bản hoàn chỉnh cuối cùng.
Bảo đảm cô lập lỗi khi chạy song song: Sử dụng cơ chế bao bọc tác vụ để sự cố hoặc ngoại lệ tại nhánh từ khóa không làm ngắt sớm nhánh tạo Content.
Bản nháp Content luôn được ghi nhận vào `state.artifacts.contentData`.
Liên kết với bước Review 08: Nếu tác nhân từ khóa rơi vào trạng thái fallback, bước Review kiểm tra yêu cầu của sàn đích.
Nếu sàn bắt buộc có từ khóa, Review đánh dấu chặn với `requiresHumanReview: true` và ghi rõ lý do.
Nếu sàn không bắt buộc từ khóa, Review ghi nhận cảnh báo và cho phép quy trình chuyển tiếp.
Quy tắc retry: Khi retry bước `keywords`, Content không chạy lại và các artifact cũ của từ khóa được dọn dẹp sạch sẽ.

Cập nhật file `tests/ai/prepare-listing.test.mjs`.
Bổ sung các ca kiểm thử tích hợp quy trình thực tế.

## Cấu trúc dữ liệu

`StepPipelineEngineConfig`: cấu hình các bước thực thi gồm handler cho keywords và cờ kiểm soát ranh giới review.

## Xác minh

### Tĩnh

Chạy lệnh kiểm tra kiểu dữ liệu:
`npm run typecheck`

### Chạy thực tế

Chạy toàn bộ kiểm thử quy trình chuẩn bị sản phẩm:
`node --experimental-strip-types --test tests/ai/prepare-listing.test.mjs`

Xác minh ca K06: Nhánh từ khóa ném lỗi hoặc timeout trước khi nhánh Content hoàn thành.
Bản nháp Content vẫn được lưu trữ nguyên vẹn trong state và không bị hủy.
Xác minh ca Review chặn: Khi từ khóa bị lỗi trên sàn bắt buộc từ khóa, quy trình dừng lại yêu cầu duyệt tay thay vì tự động thông qua.
Xác minh ca Review cho phép: Khi từ khóa bị lỗi trên sàn không bắt buộc từ khóa, quy trình ghi nhận cảnh báo và tiếp tục bình thường.
Xác minh ca ranh giới proposal: Danh sách gợi ý gồm 10 cụm từ nhưng proposal chỉ chứa đúng các từ được người bán chọn trong selectedKeywords.
Xác minh ca retry: Kích hoạt retry bước keywords không làm tăng số lần gọi nhánh Content.
