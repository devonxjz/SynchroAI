# Hợp đồng tích hợp các agent hiện có

Tài liệu này là điều kiện nghiệm thu bắt buộc của chặng 4–5. Tạo được `WorkflowInput` chưa chứng minh intake đã nối đúng agent. Chỉ đánh dấu hoàn thành khi các test tích hợp bên dưới chạy qua đường gọi thật. Đây là kế hoạch triển khai, chưa phải xác nhận RAG đã hoạt động.

## Điểm nối và khoảng trống hiện tại

| Thành phần | Entry point hiện có | Công việc tích hợp bắt buộc |
|---|---|---|
| Assistant 14 | `runAssistant`, `ServerContext`, `ConversationManager` | Dùng chung phiên và ngữ cảnh quyền. Câu hỏi nghiệp vụ đi công cụ đọc; tài liệu/soạn nội dung đi intake. Không tạo hai lịch sử chat độc lập. |
| Content 05 | `generateContent(input, context, gateway, providerOverride?)` | Nối handler Content tới hàm thật. Node Content mặc định hiện chỉ nối chuỗi mẫu, không được dùng để nghiệm thu tích hợp. |
| Keywords 07 | `generateKeywords(input, context, gateway, providerOverride?)` | Giữ chạy song song Content; truyền cùng snapshot/version, locale đích, brand/category đã xác nhận và danh sách cấm có version. Không dùng danh sách cấm rỗng mặc định để nghiệm thu live. |
| Localization 06 | `localizeContent(input, context, gateway)` | Nhận output Content cùng highlights, claims, hash nội dung và locale nguồn thực tế; dùng cùng ID fact với Content. Không dựng lại ID `fact_0`, `fact_1` từ thứ tự attributes. |
| Orchestrator 04 | `PrepareListingOrchestrator.start`, `retryStep` | Dispatcher gọi orchestrator, không gọi trực tiếp `StepPipelineEngine` và tự dựng state/checkpoint. |
| Exception 13 | `handleException(input)` | Chỉ truyền lỗi đã chuẩn hóa đúng hợp đồng và đúng loại operation; giữ run/step/correlation ID. Không coi lỗi embedding/LLM là kết quả dispatch sàn; không gọi lại workflow chỉ vì có khuyến nghị retry. |
| Review/Policy/Proposal 08–10 | Các node trong `step-engine.ts` | Review hiện còn kết quả mặc định và policy chuyển `waiting_approval`; chưa tương đương dịch vụ kiểm định/phê duyệt live. Thiếu ruleset hoặc cổng kiểm tra thật thì chỉ nghiệm thu draft/demo, không báo đã đủ điều kiện gửi sàn. |

## 1. Phân tuyến trước khi ghi tri thức

Phân biệt câu hỏi, tài liệu nhập, đính chính, sở thích và yêu cầu thao tác. Câu hỏi không tự trở thành tài liệu RAG. Dữ liệu truy xuất chỉ là bằng chứng, không có quyền yêu cầu gọi tool hay cấp phép workflow. Câu hỏi về đơn hàng/tồn kho/trạng thái dùng công cụ Assistant đọc dữ liệu hiện hành, không trả lời bằng tài liệu vector đã cũ.

Tái sử dụng hợp đồng Assistant nhưng phải khắc phục các giới hạn trước khi mở live: API hiện nhận tenant/role từ header và mặc định admin; `getConversation` mới kiểm tra tenant/mode, chưa kiểm tra user sở hữu. Server phải lấy danh tính/quyền từ phiên xác thực, kiểm tra user hoặc quyền chia sẻ rõ ràng, và kiểm tra lại quyền nguồn khi đọc lịch sử/citation. Không sao chép các mặc định demo sang intake API.

## 2. Chuẩn hóa dữ liệu một lần trước khi dispatch

Server tạo snapshot ID/version/hash từ bản dữ liệu đã xác nhận. Store và locale đích phải được chọn rõ ràng, kiểm tra quyền store; không suy ra thành quyền thực thi từ memory. Thiếu dữ liệu hoặc nguồn mâu thuẫn trả `needs_clarification` và chưa gọi agent sinh nội dung.

Định nghĩa chuyển đổi tường minh giữa `ProductSnapshot` của workflow và `ContentSnapshot` của Content. Bảo toàn brand, SKU, variants, đơn vị và attributes; description nguồn có thể đưa qua manualDraft theo hợp đồng Content. Không ép kiểu để che trường bị mất. Nếu workflow chưa biểu diễn đủ dữ liệu thì mở rộng type tại ranh giới đó và cập nhật các caller liên quan.

Dùng lại `ProductFact` và bộ dựng facts hiện có khi phù hợp. Lưu chuỗi truy nguyên: document ID/version + chunk ID + offset → fact ID → claim Content → mapping Localization. `chunkId` không thay thế `factId`. Thêm nơi lưu provenance có kiểu trong draft/snapshot liên quan vì `ProductSnapshot` hiện chưa có `sourceRefs`. Citation tài liệu phải mở đúng revision và kiểm tra quyền; mở rộng Citation của Assistant thay vì tạo loại citation cạnh tranh.

Snapshot, tập facts và cấu hình được chốt cho mỗi run. Content sinh ở locale nguồn, Keywords dùng locale đích, Localization chuyển output Content sang locale đích. Không cho Content dịch trước rồi Localization dịch lần nữa. Cùng locale không gọi LLM dịch khi không đổi tone. Hash Content phải tính từ artifact thực tế, không dùng snapshot hash thay thế khi nội dung đã thay đổi.

## 3. Tách preview và kích hoạt

`POST /api/chatbot/intake` chỉ tạo/đọc draft, không tự start workflow. Draft lưu chủ sở hữu, tenant/mode, nguồn/version, snapshot, intent, store, locale, version/hash và trạng thái. API kích hoạt riêng `POST /api/chatbot/intake/[draftId]/activate` nhận expected draft version/hash và idempotency key; server kiểm tra lại quyền, nguồn và dữ liệu trước khi nhận lượt kích hoạt.

Với `prepare_listing`/`rewrite_content`, gọi `orchestrator.start(input)`. Với `retry_step`, bắt buộc có run ID và step đã xác định, tải run theo tenant/mode/quyền, kiểm tra snapshot/version rồi gọi `orchestrator.retryStep(runId, stepName, snapshot)`. Không gọi `start` với intent retry để giả lập phục hồi.

Lưu liên kết draft → run và trạng thái kích hoạt bền vững. Hai request đồng thời hoặc retry sau mất response phải nhận cùng run; cùng key khác payload trả conflict. Claim draft, ghi ý định khởi chạy và phục hồi sau crash phải có cơ chế nhất quán với storage/job queue; Map trong process chỉ đủ demo. Hash request bao gồm draft/version, conversation, intent và mục tiêu, không chỉ message như idempotency Assistant hiện tại.

Xác nhận kích hoạt soạn nội dung không phải phê duyệt gửi sàn. Kết quả dừng ở draft/proposal chờ kiểm tra và duyệt; intake không gọi adapter sàn, không tự chọn keywords đưa vào hashtags, không bỏ qua cảnh báo Localization/Review.

## 4. Gateway, lỗi và vòng đời run

Các agent dùng gateway và RuntimeContext nhất quán với tenant/mode/run/step/attempt; không tạo gateway riêng cho từng node làm phân mảnh budget/cache. Embedding cần hợp đồng provider riêng vì `callStructuredModel` hiện xử lý JSON model output, không phải vector response. Dùng chung cách hạch toán, không reserve/release hai lần cho cùng cuộc gọi.

Áp dụng deadline còn lại và AbortSignal cho toàn lượt. Không reset deadline cho mỗi công đoạn. Keyword fallback không làm mất Content; Localization thất bại phải giữ Content/Keywords để retry. Exception chỉ giải thích/hướng dẫn trong phạm vi hợp đồng hiện có; lỗi không ánh xạ được thì giữ trạng thái failed và hướng dẫn xử lý, không bịa mã lỗi sàn.

UI lưu draft ID/run ID và đọc trạng thái từ server/checkpointer có kiểm tra quyền, không suy ra thành công từ HTTP 200. Có đường đọc run theo ID để mở lại sau refresh và thao tác retry/cancel được phân quyền. Run hoàn thành chuẩn bị nội dung không được hiển thị là sàn đã đăng. Đổi tenant phải bỏ phản hồi đang về của tenant cũ.

## 5. Test tích hợp bắt buộc

Tạo `tests/ai/chatbot-agent-integration.test.mjs` khi triển khai. Chạy agent/gateway/orchestrator thật; chỉ thay provider bên ngoài bằng fixture xác định. Không thay toàn bộ handler bằng output dựng sẵn để tuyên bố nối agent thành công. Fixture phải trả đúng schema cho từng agentName và ghi lại request để kiểm tra đường gọi.

| Mã | Bằng chứng cần đạt |
|---|---|
| CBI01 | Intake tạo draft nhưng số lần gọi Content/Keywords/Localization bằng 0 trước kích hoạt. |
| CBI02 | Kích hoạt draft tiếng Việt sang tiếng Thái gọi `generateContent` và `generateKeywords` thật song song, sau đó Localization nhận đúng output Content; proposal giữ snapshot/version và nguồn. Không dùng Content stub. |
| CBI03 | Cùng locale không phát sinh model call Localization; Content claims/highlights và provenance vẫn được lưu. |
| CBI04 | Fact 500g qua Content và Localization vẫn có cùng fact ID, source document version, đơn vị và biến thể; memory 250g không ghi đè. |
| CBI05 | Keyword lỗi trước khi Content hoàn thành: Content được lưu, fallback/cảnh báo được giữ; Review quyết định có tiếp tục, hashtags không tự nhận mọi gợi ý. |
| CBI06 | Localization lỗi rồi retry qua intake: giữ Content/Keywords, không gọi lại Content; artifact downstream cũ được vô hiệu hóa. |
| CBI07 | Hai activation đồng thời và retry sau mất response tạo đúng một run; cùng key khác draft/version bị từ chối. Kiểm tra crash/restart riêng khi nghiệm thu lưu trữ live. |
| CBI08 | Nguồn/snapshot đổi sau preview hoặc quyền bị thu hồi: activation bị từ chối trước mọi model/workflow call. |
| CBI09 | Lỗi phù hợp hợp đồng Exception được giải thích, giữ correlation; external unknown không tạo lệnh gửi mới. Lỗi model không giả thành lỗi sàn. |
| CBI10 | Câu hỏi trạng thái qua Assistant đọc đúng run/proposal; không tuyên bố đã đăng khi mới waiting_approval. |
| CBI11 | User khác cùng tenant, tenant khác và mode khác không đọc/kích hoạt draft, run, history hoặc nguồn không có quyền; giả header role không tăng quyền. |
| CBI12 | Cancel/deadline không tạo artifact muộn hoặc chạy node tiếp; refresh UI đọc lại đúng draft/run, không kích hoạt lại. |

## Phạm vi nghiệm thu

Chạy `npm run typecheck`, `npm run lint`, `npm test` và test tích hợp mới. Test provider fixture chứng minh wiring và hành vi, không chứng minh chất lượng dịch hay retrieval live. Eval ngôn ngữ/RAG có bộ nhãn riêng. Không thêm LangChain hoặc dependency mới trước khi được duyệt; không cần thư viện đó để kiểm chứng đường nối agent.

Chỉ hoàn thành Khối 23 khi CB01–CB12 và CBI01–CBI12 đạt trong phạm vi công bố. Auth/header demo, in-memory storage, Content stub hoặc Review mặc định còn trên đường live là blocker, không được đổi nhãn thành triển khai thật chỉ vì test đơn vị các agent đã qua.
