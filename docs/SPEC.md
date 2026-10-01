# TÀI LIỆU MÔ TẢ YÊU CẦU XÂY DỰNG APP

**Tên tạm:** AI Native Commerce Copilot cho người bán đa sàn  
**Phiên bản tài liệu:** 1.1 — 28/09/2026  
**Đối tượng đọc:** Người đặt hàng không biết lập trình và công cụ Codex xây dựng app.

## Quy ước để xây dựng thống nhất

- App là phần mềm cho **người bán**, không phải nơi người mua đặt hàng. Người mua tiếp tục mua trên sàn thương mại điện tử.
- Phiên bản đầu hỗ trợ **một sàn thật: Shopee**. Chọn Shopee là quyết định triển khai của tài liệu này nhằm có một mục tiêu rõ ràng; đây không phải xác nhận rằng chủ dự án đã có quyền truy cập API Shopee. Chỉ ghi là “kết nối thật” khi có quyền, thông tin kết nối và đã kiểm thử với cửa hàng được cấp phép. Nếu chưa có, cung cấp **Chế độ dùng thử** có nhãn rõ và ghi chức năng kết nối thật là chưa hoàn tất. Không lấy dữ liệu giả trình bày như dữ liệu thật.
- Chuẩn bị cấu trúc để bổ sung TikTok Shop và Lazada về sau. Trên giao diện bản đầu, không hiển thị nút kết nối hai sàn này như thể đã hoạt động.
- Một **doanh nghiệp** là một không gian làm việc riêng. Một tài khoản có thể được mời vào nhiều doanh nghiệp; dữ liệu và quyền của từng doanh nghiệp tách biệt.
- **Sản phẩm gốc** là hồ sơ sản phẩm doanh nghiệp quản lý. **Bài đăng/listing** là phiên bản của sản phẩm gốc trên một cửa hàng thuộc một sàn. Một sản phẩm gốc có thể có nhiều bài đăng.
- **Biến thể/SKU** là phiên bản bán được riêng, ví dụ cà phê túi 250 g và 500 g. Giá và số lượng còn bán được phải gắn với đúng biến thể.
- Số lượng trong app là số lượng **có thể bán**, không phải hệ thống quản lý vị trí hàng hóa trong kho vật lý.
- App vận hành theo hướng **AI native**: khi có sản phẩm mới, đơn mới hoặc lỗi, app tự khởi động quy trình phù hợp, chuẩn bị phương án và giao việc cần quyết định cho người bán. AI có thể đề xuất và sắp xếp việc làm; chương trình kiểm soát các thao tác ghi dữ liệu và gọi sàn. Việc tự động đăng chỉ xảy ra nếu Chủ/Quản trị bật rõ quy tắc cho cửa hàng, sản phẩm và điều kiện cụ thể; mặc định chờ người duyệt.
- Toàn bộ frontend và backend dùng **TypeScript**, dùng chung kiểu dữ liệu và quy tắc kiểm tra đầu vào. Không dùng Spring Boot/Java hoặc thêm một backend Python cho phần AI. TypeScript giúp dùng chung một hệ sinh thái và hợp đồng dữ liệu; độ sâu tích hợp AI đến từ thiết kế quy trình, quyền và dữ liệu, không tự có chỉ vì chọn ngôn ngữ.
- Giao hàng do người bán xử lý ngoài app. App chỉ nhận trạng thái đơn mà sàn cung cấp; không tạo vận đơn, chọn hãng vận chuyển, theo dõi kiện hàng hay làm fulfillment nội bộ.
- Những chỗ ghi “nếu sàn cho phép/cung cấp” phải kiểm tra tài liệu và quyền API chính thức khi tích hợp. Không mô phỏng thành công trong chế độ thật.

## (1) Mục tiêu app

Giúp một doanh nghiệp quản lý sản phẩm gốc tại một nơi, trong đó AI **chủ động điều phối công việc cho người bán**: phát hiện sản phẩm mới, chuẩn bị nội dung, kiểm tra thiếu sót, đề xuất bước tiếp theo, theo dõi bài đăng, đơn và lỗi đồng bộ. Người bán dành thời gian cho quyết định quan trọng và các ngoại lệ. App tiếp nhận đơn, cập nhật số lượng có thể bán, đồng bộ giá/tồn kho và giải thích những gì đã làm.

**Kết quả của phiên bản đầu:** người dùng mới có thể tạo doanh nghiệp → kết nối một cửa hàng Shopee → tạo hoặc nhập sản phẩm → app tự lập công việc AI và bản nháp → kiểm tra quy tắc → đưa vào hộp việc cần duyệt hoặc tự đăng theo quy tắc đã bật → nhận đơn → tự đối chiếu SKU, trừ tồn, đồng bộ lại → app tự phát hiện và đề xuất xử lý lỗi. Có thể chạy toàn bộ hành trình trong Chế độ dùng thử khi chưa có quyền kết nối thật, nhưng phải phân biệt rõ.

Không xây chợ bán hàng cho người mua, không tự vận hành logistics. Tuy nhiên, hệ thống tích hợp sẵn các tính năng nâng cao (dựa trên ý tưởng “AI Market Entry Copilot for Vietnamese SMEs”): đánh giá và chấm điểm thị trường/quốc gia, kiểm tra lỗi quy định pháp lý (dựa trên bộ dữ liệu luật do người dùng tự xây dựng), lập kế hoạch thâm nhập thị trường, học từ đánh giá của khách hàng (Market Knowledge Base), và mô phỏng khách hàng để A/B test (tính năng nâng cao).

### Sơ đồ 1: Luồng hoạt động tổng quan (Người bán — Đội AI — Shopee)

![Sơ đồ tổng quan hệ thống](docs/images/01-tong-quan-he-thong.png)

> 💡 **Tài nguyên trực quan:** [Bản vector SVG độ nét cao](docs/images/01-tong-quan-he-thong.svg) · [Mở file sơ đồ HTML tương tác](docs/so-do-he-thong.html#system-title)  
> *Diễn giải:* Người bán thao tác qua App → Bộ điều phối phân công 6 trợ lý AI → Kết quả qua cổng kiểm tra (Policy Gate) → Người bán duyệt (hoặc tự động nếu bật) → Worker gửi Shopee → Sàn trả đơn/kết quả → Cập nhật tồn kho theo quy tắc cố định & lưu dữ liệu bền vững.

## (2) Đối tượng sử dụng

1. **Chủ doanh nghiệp:** thiết lập doanh nghiệp, kết nối cửa hàng, mời người làm, theo dõi hoạt động.
2. **Quản trị viên:** quản lý thành viên và cấu hình vận hành theo quyền được chủ doanh nghiệp cấp.
3. **Người quản lý sản phẩm:** nhập/sửa sản phẩm, kiểm tra nội dung AI, duyệt và đăng bài.
4. **Người quản lý đơn hàng:** xem và xử lý vấn đề liên quan đến đơn đã nhập, xem tình trạng cập nhật tồn kho; công việc giao hàng nằm ngoài app.
5. **Nhân viên:** cập nhật dữ liệu và xem công việc được giao, không được tự phê duyệt hoặc kết nối sàn.
6. **Người chỉ xem:** xem dữ liệu được cho phép, không thay đổi dữ liệu.

Giao diện luôn cho biết **đang làm việc trong doanh nghiệp nào**. Khi đổi doanh nghiệp, chỉ hiển thị dữ liệu và quyền của doanh nghiệp vừa chọn.

## (3) Các chức năng chính

| Chức năng | Kết quả người dùng nhận được |
|---|---|
| Tạo tài khoản, đăng nhập, tạo doanh nghiệp | Có không gian làm việc riêng và có thể mời thành viên |
| Phân quyền | Mỗi người chỉ xem/sửa những phần được giao |
| Kết nối cửa hàng Shopee | App biết cửa hàng nào thuộc doanh nghiệp và có thể trao đổi dữ liệu khi được cấp quyền |
| Quản lý catalog | Một hồ sơ gốc cho mỗi sản phẩm, gồm các biến thể, ảnh, giá và số lượng |
| Nhập CSV | Thêm nhiều sản phẩm sau khi xem trước và sửa dòng lỗi |
| Soạn nội dung với AI | Có bản nháp tiêu đề, mô tả, từ khóa theo sản phẩm và sàn |
| Trợ lý điều phối chủ động | Tự nhận diện việc tiếp theo khi có sản phẩm/đơn/lỗi; giải thích tiến độ và kết quả |
| Hộp việc cần duyệt | Gom những đề xuất và trường hợp ngoại lệ cần người có quyền quyết định |
| Quy tắc tự động hóa | Chủ/Quản trị chọn bước nào tự chạy, bước nào phải chờ duyệt và giới hạn từng cửa hàng |
| Duyệt và đăng bài | Người có quyền kiểm tra, xác nhận, theo dõi trạng thái đăng và sửa lỗi |
| Gom đơn hàng | Xem đơn của cửa hàng đã kết nối trên một màn hình, tránh nhập trùng |
| Cập nhật tồn kho, giá | Thay đổi số lượng/giá trong app và thấy kết quả đồng bộ đến bài đăng |
| Dashboard và cảnh báo | Thấy đơn mới, hàng sắp hết, bài đăng lỗi, kết nối lỗi |
| Lịch sử thao tác | Biết ai đã sửa, duyệt, đăng hoặc xử lý một vấn đề |
| Tổng hợp nhóm đơn hàng | Hiển thị đơn hàng gom theo nền tảng, nhóm sản phẩm để tránh quá tải thông báo |
| Kiểm tra quy định và Pháp lý | Đối chiếu tự động sản phẩm với quy định xuất/nhập khẩu từ bộ dữ liệu luật người dùng tự tạo |
| Đánh giá và Chấm điểm thị trường | Gợi ý quốc gia bán tốt nhất qua biểu đồ, điểm số (ví dụ: Thái Lan 82/100) và phân tích lý do |
| Kế hoạch và Mô phỏng thị trường | AI lập kế hoạch thâm nhập, đọc review để học hỏi, và giả lập tập khách hàng để A/B test |

### Sơ đồ 2: Cấu trúc các module nền tảng bán hàng đa sàn

![Các module của nền tảng bán hàng đa sàn](docs/images/04-cac-module-nen-tang-da-san.png)

> 💡 **Tài nguyên trực quan:** [Bản vector SVG độ nét cao](docs/images/04-cac-module-nen-tang-da-san.svg) · [Mở file sơ đồ HTML](docs/so-do-he-thong.html#expanded-modules)  
> *Diễn giải:* Kiến trúc module gồm: Tenant Boundary (Account/Organization), Catalog (PIM dữ liệu gốc), AI Optimization (LangGraph + AI SDK), Marketplace Listing, External Adapters (Shopee, TikTok Shop, Lazada), Orders Aggregator, Customer Service, Analytics, và Xuất / Chuyển dữ liệu đơn.

## (4) Danh sách từng màn hình

**Điều hướng trên máy tính:** Tổng quan, Việc cần duyệt, Trợ lý AI, Sản phẩm, Bài đăng, Đơn hàng, Tồn kho, Tự động hóa, Kết nối sàn, Cài đặt. **Trên điện thoại:** menu thu gọn, cùng nội dung và quyền.

| Mã | Màn hình | Khi nào mở |
|---|---|---|
| M01 | Chào mừng / Đăng ký / Đăng nhập | Khi chưa đăng nhập |
| M02 | Tạo hoặc chọn doanh nghiệp | Sau đăng ký hoặc khi có nhiều doanh nghiệp |
| M03 | Tổng quan | Sau đăng nhập và chọn doanh nghiệp |
| M04 | Kết nối sàn | Khi thiết lập hoặc quản lý cửa hàng |
| M05 | Danh sách sản phẩm | Khi xem, tìm và thêm sản phẩm |
| M06 | Thêm/Sửa sản phẩm và biến thể | Khi tạo hoặc cập nhật hồ sơ gốc |
| M07 | Nhập sản phẩm bằng CSV | Khi nhập nhiều sản phẩm |
| M08 | AI Studio và màn hình duyệt nội dung | Khi tạo/sửa nội dung bài đăng |
| M09 | Danh sách bài đăng | Khi theo dõi các trạng thái đăng |
| M10 | Chi tiết bài đăng | Khi xem bản nội dung, lỗi, lịch sử và thao tác đăng |
| M11 | Danh sách/chi tiết đơn hàng | Khi xem đơn do sàn gửi về |
| M12 | Tồn kho và giá | Khi xem/sửa số lượng, giá và tình trạng đồng bộ |
| M13 | Thành viên và quyền | Khi mời, sửa quyền, thu hồi quyền |
| M14 | Cài đặt doanh nghiệp và tài khoản | Khi sửa thông tin cơ bản, đổi doanh nghiệp hoặc đăng xuất |
| M15 | Việc cần duyệt | Khi app cần người bán xác nhận đề xuất hoặc xử lý ngoại lệ |
| M16 | Trợ lý AI và dòng hoạt động | Khi hỏi tình trạng công việc, yêu cầu app chuẩn bị việc mới, xem đã làm gì |
| M17 | Quy tắc tự động hóa | Khi chủ doanh nghiệp chọn quyền tự động của app |
| M18 | Đánh giá và Chấm điểm thị trường | Khi xem gợi ý quốc gia phù hợp, kế hoạch thâm nhập thị trường và mô phỏng A/B test |

Không cần trang “Vận chuyển”, “Kho hàng” hoặc trang bán trực tiếp cho người mua trong bản đầu.

## (5) Thành phần trên từng màn hình

| Màn hình | Những gì bắt buộc phải có |
|---|---|
| **M01** | Tên app; hai thẻ Đăng ký/Đăng nhập; email; mật khẩu; nút hiện/ẩn mật khẩu; nút gửi; thông báo lỗi dễ hiểu. Không đặt yêu cầu xác minh email nếu chưa có dịch vụ gửi email hoạt động; nếu triển khai xác minh, phải hoàn thành cả gửi và xử lý liên kết. |
| **M02** | Ô tên doanh nghiệp; nút Tạo doanh nghiệp; danh sách doanh nghiệp đã tham gia; nút Chọn doanh nghiệp. |
| **M03** | Tên doanh nghiệp hiện tại; thẻ số đơn mới, sản phẩm sắp hết, bài đăng lỗi, kết nối lỗi; danh sách việc cần làm; thời gian cập nhật gần nhất; lối tắt Thêm sản phẩm và Xem đơn. Chỉ hiển thị số liệu thật hoặc có nhãn Dùng thử. |
| **M04** | Thẻ Shopee với trạng thái Chưa kết nối/Đã kết nối/Cần kết nối lại; tên/mã cửa hàng khi có; nút Kết nối, Kết nối lại, Ngắt kết nối; thời điểm đồng bộ; thông báo quyền truy cập và lỗi. TikTok Shop/Lazada chỉ có thể xuất hiện dưới nhãn Chưa hỗ trợ, không có nút giả. |
| **M05** | Bảng/thẻ sản phẩm: ảnh, tên, SKU, biến thể, giá, tổng số lượng, tình trạng, số bài đăng; tìm kiếm; lọc; nút Thêm sản phẩm, Nhập CSV; phân trang hoặc tải thêm; trạng thái danh sách trống. |
| **M06** | Tên, SKU, mô tả, danh mục nội bộ, ảnh; danh sách biến thể với SKU, thuộc tính, giá, số lượng; nút Thêm biến thể, Lưu nháp, Lưu sản phẩm, Tạo bài đăng. Hiện lỗi cạnh trường sai. Không ép người dùng nhập thông tin chưa cần cho hồ sơ gốc nhưng yêu cầu thông tin tối thiểu trước khi đăng. |
| **M07** | Nút tải file mẫu, chọn file CSV; bảng xem trước; ghép cột file với trường trong app; số dòng hợp lệ/lỗi; tải danh sách lỗi; nút Xác nhận nhập; hiển thị kết quả đã nhập. |
| **M08** | Tóm tắt sản phẩm gốc; chọn cửa hàng/ngôn ngữ; ô ghi chú cho AI (không bắt buộc); nút Tạo gợi ý; trạng thái Đang tạo; tiêu đề/mô tả/từ khóa do AI đề xuất; cột đối chiếu thông tin gốc; nút Sửa, Tạo lại, Lưu nháp, Phê duyệt. Hiển thị người duyệt và thời điểm duyệt. |
| **M09** | Danh sách bài đăng theo sản phẩm và cửa hàng; bộ lọc Bản nháp/Sẵn sàng/Đang đăng/Đã đăng/Lỗi/Bị từ chối; tìm kiếm; lý do lỗi ngắn; thời điểm cập nhật; nút mở chi tiết. |
| **M10** | Nội dung sẽ đăng; danh mục/thuộc tính/ảnh; danh sách lỗi kiểm tra; lịch sử phiên bản và thao tác; trạng thái; mã và đường dẫn bên sàn nếu có; nút Kiểm tra, Phê duyệt, Đăng, Sửa, Thử lại theo đúng quyền và trạng thái. |
| **M11** | Chế độ xem tổng hợp (gom theo nền tảng, nhóm sản phẩm) giúp tránh tràn ngập thông báo khi bán số lượng lớn; và Danh sách đơn chi tiết (mã, thời gian, tiền, trạng thái). Màn hình chi tiết chứa các mặt hàng, SKU, số lượng, tình trạng đồng bộ. |
| **M12** | Danh sách SKU/biến thể, số có thể bán, ngưỡng cảnh báo thấp, giá hiện tại, các bài đăng liên quan, trạng thái và thời gian đồng bộ; nút Điều chỉnh số lượng, Điều chỉnh giá, Xem lịch sử, Thử đồng bộ lại. |
| **M13** | Danh sách thành viên, email, vai trò, trạng thái; nút Mời, Đổi vai trò, Thu hồi quyền; thông báo kết quả. Lời mời qua email chỉ dùng khi chức năng gửi email thực sự hoạt động; nếu chưa có, cung cấp liên kết mời một lần có hạn dùng và hiển thị rõ cách chia sẻ an toàn. |
| **M14** | Tên doanh nghiệp; thông tin tài khoản; lựa chọn doanh nghiệp; nút Lưu thay đổi, Đăng xuất; phần lịch sử thao tác chỉ người có quyền xem. Không hiển thị mục Thanh toán/Billing hoạt động nếu chưa triển khai. |
| **M15** | Thẻ việc với lý do app đề xuất, sản phẩm/cửa hàng liên quan, nội dung trước/sau, rủi ro, thời điểm tạo; lọc theo Việc cần duyệt/Lỗi/Cần bổ sung; nút Duyệt và thực hiện, Chỉnh sửa, Từ chối, Để sau. Không gộp nhiều thao tác có tác động khác nhau vào một nút duyệt mơ hồ. |
| **M16** | Ô hỏi bằng tiếng Việt, các gợi ý như “Sản phẩm nào chưa đăng được?” và “Vì sao đơn này cần kiểm tra?”; câu trả lời trích từ dữ liệu của đúng doanh nghiệp, có liên kết mở bản ghi; dòng hoạt động gồm Ai/app đã làm gì, lúc nào, trạng thái, lý do, bước kế tiếp; nút Dừng/Thử lại cho công việc được phép. Lệnh bằng lời nói chưa cần. |
| **M17** | Chế độ tự động cho từng cửa hàng; công tắc Tự tạo bản nháp, Tự kiểm tra, Tự đồng bộ đơn/tồn/giá, Tự đăng theo điều kiện; phạm vi sản phẩm áp dụng; giới hạn số bài đăng mỗi ngày; điều kiện chặn khi thiếu dữ liệu/có cảnh báo; nút Lưu quy tắc, Tạm dừng mọi thao tác đăng tự động; lịch sử thay đổi quy tắc. Mặc định Tự đăng tắt. |
| **M18** | Hiển thị điểm số phù hợp của quốc gia (VD: Thái Lan 82/100) và nút phân tích mở ra biểu đồ cột; Kế hoạch vào thị trường do AI lập (Khách hàng mục tiêu, định vị, giá, thông điệp); Khu vực Mô phỏng giả lập nhóm khách hàng để A/B test; Góc hiển thị Market Knowledge Base từ học hỏi review. |

Mọi bảng trên điện thoại chuyển thành danh sách thẻ dễ đọc, không buộc cuộn ngang toàn trang. Mọi tác vụ nền cần có trạng thái và thời gian cập nhật.

## (6) Người dùng bấm gì và app phản hồi thế nào

### A. Lần đầu sử dụng

| Bước | Người dùng thấy và thao tác | App phản hồi |
|---|---|---|
| 1 | Mở app, bấm **Đăng ký**, nhập email/mật khẩu, bấm **Tạo tài khoản** | Báo lỗi ngay tại trường sai; nếu hợp lệ, tạo tài khoản và mở M02 |
| 2 | Nhập tên doanh nghiệp, bấm **Tạo doanh nghiệp** | Tạo không gian riêng, cho người tạo vai trò Chủ doanh nghiệp, mở Tổng quan |
| 3 | Bấm **Kết nối cửa hàng** → **Shopee** → **Kết nối** | Đưa tới quy trình cấp quyền chính thức nếu đã cấu hình; sau khi quay lại, kiểm tra kết quả và hiện trạng thái/ tên cửa hàng. Nếu chưa cấu hình thật, chỉ cho dùng thử với nhãn rõ |
| 4 | Bấm **Thêm sản phẩm** | Mở M06, không tự tạo bài đăng trên sàn |

Sau khi kết nối, app mở M17 để người có quyền chọn mức tự động: mặc định **tự chuẩn bị + tự kiểm tra + tự đồng bộ đơn/tồn**, còn đăng bài **chờ duyệt**. Người dùng có thể giữ mặc định bằng nút **Dùng thiết lập đề xuất**, không cần tự cấu hình mọi công tắc.

### B. Đăng một sản phẩm

| Bước | Người dùng thấy và thao tác | App phản hồi |
|---|---|---|
| 5 | Nhập tên, SKU, mô tả, ảnh, biến thể, giá và số lượng; bấm **Lưu sản phẩm** | Kiểm tra trường, lưu hồ sơ gốc; tự tạo công việc “Chuẩn bị đăng bán” cho cửa hàng đã chọn; SKU trùng trong cùng doanh nghiệp thì chỉ rõ lỗi |
| 6 | Thấy thẻ **AI đang chuẩn bị** trên sản phẩm/Tổng quan; vẫn có thể làm việc khác | App tạo bài đăng nháp, chạy các tác nhân phù hợp, chuẩn bị nội dung và gợi ý thuộc tính/danh mục; ghi các bước vào dòng hoạt động |
| 7 | Nhận thông báo **Cần duyệt** hoặc **Cần bổ sung**; bấm **Xem đề xuất** | App hiển thị bản nháp và lý do thay đổi, đánh dấu trường chưa chắc chắn/thiếu dữ liệu; không tự bịa rồi che cảnh báo |
| 8 | Đọc, sửa nội dung, bổ sung thông tin còn thiếu; bấm **Kiểm tra lại** hoặc **Duyệt và đăng** | App kiểm tra cấu trúc/quy tắc sàn. Với chế độ mặc định, chỉ người có quyền mới duyệt; nội dung sửa sau duyệt phải duyệt lại |
| 9 | Nếu đã bật Tự đăng đủ điều kiện, người dùng chỉ thấy nhật ký; nếu không, bấm **Duyệt và đăng** | App kiểm tra lại quy tắc tự động, quyền, phiên bản và kết nối tại đúng thời điểm gửi; đưa công việc vào nền, hiện **Đang đăng** |
| 10 | Xem kết quả trên Bài đăng hoặc dòng hoạt động | Chỉ chuyển **Đã đăng** khi sàn xác nhận; lỗi thì app tự phân loại, thử lại lỗi tạm thời có giới hạn hoặc tạo việc **Cần người xử lý** |

### C. Có đơn và cập nhật tồn kho

| Bước | Người dùng thấy và thao tác | App phản hồi |
|---|---|---|
| 11 | Đơn phát sinh trên Shopee; người dùng mở **Tổng quan** hoặc **Đơn hàng** | App nhận đơn qua cách sàn hỗ trợ; kiểm tra đơn đã tồn tại chưa; hiển thị đơn mới và thời điểm cập nhật |
| 12 | Bấm vào đơn | Hiện mặt hàng, SKU, số lượng, giá, trạng thái; nếu SKU chưa ghép được với sản phẩm gốc, cảnh báo và không âm thầm trừ nhầm tồn |
| 13 | Không cần bấm nút trừ kho khi đơn hợp lệ | App ghi nhận sự kiện đơn đúng một lần, trừ số lượng phù hợp, cập nhật màn hình Tồn kho |
| 14 | Bấm **Tồn kho**, xem trạng thái đồng bộ | App gửi số lượng mới đến những bài đăng liên quan; hiện Đang đồng bộ/Đã đồng bộ/Lỗi và thời gian; khi lỗi, cho người có quyền thử lại mà không trừ kho lần hai |
| 15 | Nếu muốn đổi giá hoặc sửa số lượng, nhập giá trị và lý do ngắn, bấm **Lưu** | Kiểm tra giá/số lượng hợp lệ, lưu lịch sử, gửi tác vụ đồng bộ; chỉ hiển thị thành công trên sàn sau khi có kết quả xác nhận |

### D. Luồng tự động chủ động và việc cần duyệt

1. Khi thêm sản phẩm/nhập CSV, app tự mở công việc chuẩn bị bài đăng nếu doanh nghiệp đã có cửa hàng và bật Tự tạo bản nháp. Nếu chưa kết nối, app tạo việc **Kết nối cửa hàng** thay vì chạy vô ích.
2. Khi AI hoàn tất, app tự kiểm tra. Thiếu thuộc tính hoặc không chắc thông tin, app tạo thẻ **Cần bổ sung** tại M15. Đủ điều kiện thì tạo thẻ **Cần duyệt**; chỉ tự đăng khi quy tắc Tự đăng đang bật và toàn bộ điều kiện đều đạt.
3. Khi có đơn, app tự ghi đơn, đối chiếu SKU, trừ tồn và đồng bộ theo quy tắc cố định; AI chỉ giải thích lỗi hoặc đề xuất ghép SKU khi thiếu, không quyết định số lượng.
4. Khi bài đăng bị từ chối/đồng bộ lỗi, app tự nhận diện lỗi tạm thời để thử lại có giới hạn. Với lỗi dữ liệu, AI chuẩn bị bản sửa **mới** và tạo việc duyệt; không sửa bài đã đăng hoặc đăng lại một cách âm thầm.
5. Khi seller bấm **Duyệt và thực hiện**, app hiện chính xác thay đổi và cửa hàng chịu tác động, kiểm tra quyền/quy tắc lại, rồi thực hiện. Khi bấm **Từ chối**, app lưu lý do (không bắt buộc) và không lặp lại cùng đề xuất nguyên trạng.
6. Người dùng có thể hỏi Trợ lý AI “Hôm nay còn việc gì?”; app tổng hợp những việc đang chờ và liên kết đến bản ghi. Câu trả lời không tự biến thành lệnh thực thi. Nếu người dùng yêu cầu thao tác, app tạo bản xem trước và dùng quy trình xác nhận như khi bấm nút.

### E. Nhập CSV và xử lý lỗi

Người dùng bấm **Nhập CSV**, tải file, ghép cột, xem trước dòng hợp lệ/lỗi, sau đó bấm **Xác nhận nhập**. App chỉ nhập các dòng được người dùng xác nhận, báo kết quả từng dòng và cho tải file lỗi. Xác nhận nhập không đồng nghĩa xác nhận đăng: sau khi lưu, từng sản phẩm đi qua quy trình AI, kiểm tra và quy tắc tự động của doanh nghiệp. Nếu file quá lớn, xử lý nền và hiển thị tiến độ/kết quả; bấm hai lần không tạo bản trùng.

## (7) Thông tin cần nhập/lưu

| Nhóm | Thông tin tối thiểu | Nguồn |
|---|---|---|
| Tài khoản | Email, mật khẩu đã được băm an toàn, trạng thái tài khoản | Người dùng nhập; app xử lý mật khẩu |
| Doanh nghiệp/thành viên | Tên doanh nghiệp, thành viên, vai trò, lời mời | Chủ/quản trị nhập |
| Cửa hàng kết nối | Doanh nghiệp, sàn, mã cửa hàng, trạng thái, quyền truy cập, thời hạn thông tin kết nối, lần đồng bộ cuối | Quy trình cấp quyền/sàn; thông tin bí mật phải mã hóa khi lưu |
| Sản phẩm gốc | Mã sản phẩm, tên, mô tả, danh mục nội bộ, trạng thái | Người dùng hoặc CSV |
| Biến thể | SKU riêng, thuộc tính như kích cỡ, giá, tiền tệ, số lượng có thể bán, ngưỡng tồn thấp | Người dùng hoặc CSV |
| Hình ảnh | File/đường dẫn lưu an toàn, thứ tự ảnh, liên kết đến sản phẩm | Người dùng tải lên |
| Bài đăng | Sản phẩm/biến thể liên quan, cửa hàng, mã listing bên sàn, danh mục, thuộc tính, nội dung, giá/tồn được gửi, trạng thái | Người dùng, AI và phản hồi từ sàn |
| Bản nội dung và AI | Nội dung gốc, bản AI, ngôn ngữ, hướng dẫn người dùng, phiên bản, người duyệt, trạng thái tạo, lỗi | Người dùng/AI/app |
| Đơn hàng | Doanh nghiệp, cửa hàng, mã đơn bên sàn, trạng thái, thời gian, tiền tệ, các dòng hàng, SKU, số lượng, số tiền; chỉ dữ liệu khách cần thiết | Sàn cung cấp |
| Thay đổi tồn/giá | Giá trị cũ/mới, nguyên nhân, đơn liên quan nếu có, người hoặc tiến trình thực hiện, thời gian | App/người dùng |
| Công việc đồng bộ | Loại công việc, đối tượng, trạng thái, số lần thử, kết quả và lỗi | App |
| Quy tắc tự động | Doanh nghiệp, cửa hàng, công tắc, phạm vi SKU/danh mục, giới hạn, người thay đổi, hiệu lực | Chủ/Quản trị |
| Công việc AI và việc cần duyệt | Sự kiện khởi đầu, các bước đã chạy, kết quả có cấu trúc, cảnh báo, phiên bản dữ liệu đầu vào, người duyệt/từ chối, hành động cuối | App/AI/người dùng |
| Trợ lý và nhật ký quyết định | Câu hỏi, câu trả lời có tham chiếu bản ghi, hành động được đề xuất, quyết định của người dùng, chi phí/lỗi AI ở mức vận hành | Người dùng/app; loại bỏ dữ liệu nhạy cảm không cần thiết |
| Lịch sử và cảnh báo | Ai làm gì, lúc nào, với bản ghi nào; lỗi cần xử lý | App |

Ràng buộc quan trọng: email tài khoản không trùng; tên SKU của biến thể không trùng **trong cùng doanh nghiệp**; cặp **doanh nghiệp + cửa hàng + mã đơn bên sàn** không được tạo hai đơn; số lượng không âm; giá không âm; một bài đăng tham chiếu đúng sản phẩm/cửa hàng cùng doanh nghiệp. Dữ liệu phải tách theo doanh nghiệp ở cả giao diện và máy chủ, không chỉ ẩn nút trên giao diện.

## (8) Quy tắc xử lý

1. **Sản phẩm gốc là nơi chỉnh thông tin chuẩn.** Bài đăng trên sàn giữ bản nội dung và thuộc tính riêng. Sửa sản phẩm gốc không tự ý ghi đè bài đăng đã được nhân viên chỉnh riêng; hiện việc cần đồng bộ và cho người có quyền xác nhận phạm vi thay đổi.
2. **Trạng thái bài đăng:** Bản nháp → Đang tạo nội dung (nếu dùng AI) → Cần hoàn thiện/Chờ duyệt → Sẵn sàng đăng → Đang đăng → Đã đăng. Các trạng thái lỗi: Tạo nội dung lỗi, Đăng lỗi, Bị sàn từ chối. Bài đăng đã sửa sau duyệt quay lại Chờ duyệt; không được đăng bản mới chưa duyệt.
3. **Đăng và đồng bộ chạy nền.** Người dùng nhận xác nhận rằng công việc đã được tiếp nhận; có thể rời màn hình và quay lại xem. Không đồng nhất “đã bấm” với “sàn đã nhận”. Mỗi lần thử lại phải tránh tạo bài đăng/đơn trùng.
4. **Chống trùng đơn:** cùng cửa hàng, cùng mã đơn sàn chỉ có một đơn. Thông báo gửi lại hoặc lần lấy đơn tiếp theo chỉ cập nhật trạng thái phù hợp; không trừ tồn lần hai.
5. **Trừ tồn an toàn:** với một dòng đơn hợp lệ, chỉ trừ khi số lượng hiện có đủ; cập nhật trong một giao dịch dữ liệu. Nếu không đủ hoặc không ghép được SKU, giữ đơn, gắn cờ Cần xử lý, không tự tạo số âm. Hai đơn đến đồng thời phải được xử lý đúng.
6. **Đơn hủy/hoàn:** trạng thái từ sàn có thể thay đổi. Bản đầu chỉ cộng trả tồn khi quy tắc trạng thái của sàn chứng minh hàng có thể bán lại và sự kiện đó chưa từng được xử lý. Nếu không chắc, hiển thị Cần kiểm tra và không tự cộng tồn. Ghi lịch sử mọi điều chỉnh.
7. **Tránh bán vượt tồn:** đồng bộ có độ trễ và sàn vẫn tự nhận đơn, nên không thể cam kết tuyệt đối. Cho phép đặt mức dự phòng không đăng bán; cảnh báo khi tồn thấp; hiển thị số lượng trong app và trạng thái cập nhật trên sàn riêng biệt.
8. **Giá:** lưu giá theo biến thể và đơn vị tiền; không tự đổi tiền tệ hoặc làm tròn giá nếu chưa có quy tắc được người dùng phê duyệt. Một lần đổi giá cần cho biết bài đăng nào đang chờ cập nhật và bài đăng nào đã cập nhật.
9. **Quy tắc sàn:** kiểm tra trường bắt buộc, danh mục, giới hạn tiêu đề/mô tả, ảnh và các ràng buộc lấy từ hướng dẫn chính thức và phản hồi API. Lưu phiên bản/thời điểm cập nhật bộ quy tắc. Kết quả kiểm tra nội bộ không thay thế kết quả chấp nhận của sàn.
10. **Quyền và tính riêng tư:** mọi hành động kiểm tra người dùng thuộc doanh nghiệp đang chọn và có đúng quyền. Mã truy cập cửa hàng mã hóa khi lưu, không hiển thị lại; nhật ký không ghi mật khẩu/mã truy cập/nội dung cá nhân không cần thiết. Dữ liệu khách hàng trong đơn chỉ hiện cho vai trò cần dùng. Phiên đăng nhập được bảo vệ; đăng xuất hủy phiên hiện tại.
11. **Chế độ dùng thử:** dùng cửa hàng và đơn mẫu riêng, nhãn “Dữ liệu dùng thử” trên mọi màn hình liên quan; không gửi request đến sàn thật. Không chuyển âm thầm dữ liệu mẫu thành đơn thật.
12. **Không có dữ liệu:** bảng và dashboard hiển thị trạng thái trống với nút thao tác tiếp theo, không hiển thị 0 như thể đồng bộ đã hoàn tất khi chưa từng kết nối.
13. **Mức tự động:** (a) Chỉ gợi ý: app chuẩn bị nhưng không gửi sàn; (b) Có duyệt: app tự chuẩn bị/kiểm tra, đợi người có quyền duyệt rồi gửi; (c) Tự chạy theo quy tắc: app có thể đăng trong phạm vi Chủ/Quản trị đã bật. Mặc định (b). Từng quy tắc có cửa hàng, phạm vi sản phẩm, giới hạn/ngày và điều kiện dừng; Tự đăng mặc định tắt. Tắt quy tắc chặn việc chưa gửi; không thu hồi được yêu cầu sàn đã xác nhận.
14. **Điều kiện chặn tự đăng:** thiếu dữ liệu bắt buộc, dữ liệu sản phẩm đổi sau lúc AI soạn/kiểm tra, AI nêu sự không chắc chắn về thông số/công dụng/chứng nhận, nội dung không đối chiếu được với dữ liệu gốc và mẫu/thuật ngữ đã được doanh nghiệp chấp thuận, thay đổi giá vượt ngưỡng do Chủ đặt, cửa hàng mất kết nối, chưa xác minh quy tắc sàn, đạt giới hạn/ngày. Chuyển sang Việc cần duyệt. Không lấy “độ tin cậy” do AI tự chấm làm lý do duy nhất để đăng.
15. **AI điều phối, máy chủ thi hành:** AI chỉ đọc dữ liệu trong phạm vi doanh nghiệp và trả đề xuất có cấu trúc. Máy chủ xác minh quyền, trạng thái, hạn mức, điều kiện và khóa chống trùng trước mọi thao tác ghi/gửi. Công việc có mã duy nhất; retry không tạo tác dụng lặp. Ghi người hoặc quy tắc nào đã cho phép hành động.
16. **Sự kiện và công việc:** khi sản phẩm/đơn/trạng thái sàn đổi, lưu sự kiện và công việc trong dữ liệu bền vững trước khi đưa vào hàng đợi. Sau lỗi máy hoặc khởi động lại, công việc còn dang dở phải tiếp tục hoặc hiện Cần xử lý; không mất im lặng.
17. **Không tự động hóa vòng lặp:** một thay đổi từ sàn không tự kích hoạt cập nhật ngược vô hạn. Gắn nguồn và phiên bản thay đổi; nếu nguồn dữ liệu mâu thuẫn, dừng và báo người dùng. App là nguồn tồn kho cho MVP, nhưng hiển thị số sàn xác nhận để thấy độ trễ.
18. **Nội dung ngoài là dữ liệu, không phải lệnh:** tên/mô tả sản phẩm nhập CSV, phản hồi sàn, đơn và nội dung người bán cung cấp có thể chứa câu ra lệnh cho AI. Các câu đó không được thay đổi quy tắc, quyền hoặc phạm vi truy cập. Tác nhân chỉ nhận những công cụ đọc đã cho phép; các thay đổi quan trọng phải qua kiểm tra của máy chủ.

## (9) AI được dùng ở đâu và làm gì?

AI phục vụ **điều phối công việc hằng ngày**, chuẩn bị bài đăng, phát hiện thiếu sót và giải thích lỗi/việc ưu tiên. Người bán có thể thao tác bằng giao diện thông thường nếu AI lỗi. Hệ thống nhiều tác nhân chuyên việc có phạm vi rõ:

| Thành phần | Việc được làm | Việc không được làm |
|---|---|---|
| **Bộ điều phối** | Nhận sự kiện sản phẩm/đơn/lỗi hoặc yêu cầu người dùng, chọn quy trình được bật, giao việc, gom kết quả, lưu trạng thái và tạo việc cần duyệt | Bỏ qua quy tắc của doanh nghiệp, tự cấp quyền, đọc doanh nghiệp khác |
| **Tác nhân nội dung** | Gợi ý tiêu đề, mô tả, điểm nổi bật từ thông tin sản phẩm | Tự bịa công dụng, thành phần, chứng nhận, số liệu |
| **Tác nhân bản địa hóa** | Đổi cách diễn đạt theo ngôn ngữ/thị trường do người dùng chọn, giữ đúng sự thật | Tự xác nhận tuân thủ pháp luật từng nước |
| **Tác nhân từ khóa** | Gợi ý cụm từ liên quan để nhân viên tham khảo | Tuyên bố chắc chắn đây là từ khóa phổ biến nếu không có dữ liệu đo lường |
| **Tác nhân kiểm tra nội dung** | So bản AI với dữ liệu gốc, chỉ ra thông tin không có nguồn, gợi ý danh mục/thuộc tính cần người xác nhận | Tự chứng nhận đúng quy định sàn hay xuất khẩu |
| **Tác nhân xử lý ngoại lệ** | Đọc lỗi sàn và lịch sử liên quan, tóm tắt nguyên nhân, đề xuất bản sửa hoặc bước tiếp theo cho seller | Tự sửa và đăng lại khi cần phê duyệt |
| **Tác nhân trợ lý công việc** | Trả lời câu hỏi về dữ liệu của đúng doanh nghiệp, ưu tiên việc tồn đọng và mở đúng màn hình | Nhận câu chat là sự cho phép vĩnh viễn để thực hiện thao tác |
| **Bộ kiểm tra theo quy tắc bằng chương trình** | Kiểm tra kiểu dữ liệu, trường bắt buộc, độ dài, từ bị cấm đã biết, thiếu ảnh/thuộc tính | Thay thế kiểm duyệt của người và kết quả của sàn |
| **Tác nhân Thị trường & Pháp lý** | Kiểm tra lỗi quy định/pháp lý dựa trên DB luật tự xây; đọc review lập Market Knowledge Base; mô phỏng nhóm khách hàng A/B test | Bịa ra luật xuất nhập khẩu hoặc quy định khi DB chưa có |

**Luồng AI native:** sự kiện hoặc người dùng kích hoạt → app lưu công việc → bộ điều phối chọn tác nhân cần thiết → chạy song song phần độc lập → gom kết quả có cấu trúc → kiểm tra bằng chương trình → dựa trên quy tắc của doanh nghiệp để (1) mở việc cần bổ sung/duyệt hoặc (2) cho máy chủ thực hiện thao tác đã được ủy quyền trước → lưu lịch sử và theo dõi kết quả sàn. AI không có công cụ trực tiếp gửi yêu cầu đăng, đổi giá, trừ tồn hay thay đổi quyền; chỉ máy chủ nghiệp vụ thực hiện sau khi kiểm tra.

**Giảm thời gian chờ:** không chạy đủ ba tác nhân nếu không cần; nếu người dùng chỉ muốn viết lại tiếng Việt thì bỏ tác nhân bản địa hóa. Chạy các tác vụ độc lập cùng lúc, có giới hạn thời gian và số lần thử; lưu kết quả theo sản phẩm/phiên bản/ngôn ngữ để không tạo lại vô ích; cho phép người dùng tiếp tục việc khác khi AI chạy. Không khởi động một vòng các tác nhân tranh luận không giới hạn. Hiển thị thời gian và trạng thái thay vì để trang đứng im. Khi một tác nhân lỗi, giữ phần kết quả hợp lệ và cho tạo lại phần lỗi.

**Cách triển khai đề nghị:** dùng TypeScript trong cả web và máy chủ. **LangGraph JS** tổ chức quy trình AI nhiều bước có thể lưu trạng thái/tạm dừng chờ người duyệt; **AI SDK** thực hiện lời gọi mô hình và đầu ra có cấu trúc, bên trong những bước phù hợp. **BullMQ** xử lý việc nền và thử lại; trạng thái nghiệp vụ quan trọng vẫn lưu PostgreSQL để khôi phục và tránh mất việc. Đây là ba vai trò khác nhau, không tạo hai hệ thống điều phối cạnh tranh. Kiểm tra tài liệu và phiên bản khi bắt đầu xây: https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph, https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data và https://docs.bullmq.io/patterns/idempotent-jobs.

Nếu chưa có khóa AI, giao diện vẫn cho tự viết và dùng một kết quả mẫu **chỉ trong Chế độ dùng thử**. Không tạo nội dung mẫu rồi gắn nhãn AI thật. Không gửi thông tin khách trong đơn sang mô hình AI cho tính năng nội dung.

### Sơ đồ 3: Luồng bên trong bộ điều phối Multi-Agent (LangGraph)

![Luồng bên trong bộ điều phối agent](docs/images/03-luong-dieu-phoi-multi-agent.png)

> 💡 **Tài nguyên trực quan:** [Bản vector SVG độ nét cao](docs/images/03-luong-dieu-phoi-multi-agent.svg)  
> *Diễn giải:* Router chọn các nhánh độc lập (Content + Keyword) chạy song song; nhánh phụ thuộc (Localization) nhận kết quả Content trước khi chuyển ngữ. Review Agent đối chiếu bản cuối với dữ liệu gốc trước khi vào Policy Gate. Nhánh Exception Agent kích hoạt độc lập khi có lỗi sàn hoặc lỗi dữ liệu.

### Sơ đồ 4: Điều phối tối ưu hóa đa phương thức (Văn bản, Hình ảnh và Giá)

![Điều phối tối ưu văn bản hình ảnh và giá](docs/images/05-dieu-phoi-toi-uu-van-ban-hinh-anh-gia.png)

> 💡 **Tài nguyên trực quan:** [Bản vector SVG độ nét cao](docs/images/05-dieu-phoi-toi-uu-van-ban-hinh-anh-gia.svg)  
> *Diễn giải:* Pipeline 3 nhánh song song: Nhánh văn bản (Text Agents via AI SDK), Nhánh hình ảnh (Image Adaptation Agent + Photoroom/SD API + Canvas/Render worker), và Nhánh định giá (Pricing Suggestion Agent + Deterministic validation bằng code). Toàn bộ được gom thành Versioned Proposal trước khi chuyển qua Policy Gate và Worker thực thi.

## (10) Nếu có dữ liệu riêng thì dữ liệu lấy từ đâu?

| Loại dữ liệu | Nguồn và giới hạn |
|---|---|
| Thông tin sản phẩm, ảnh, giá, số lượng | Người bán nhập hoặc tải CSV. Người bán chịu trách nhiệm xác nhận tính đúng đắn. |
| Đơn, mã bài đăng, trạng thái, dữ liệu cửa hàng | Chỉ lấy từ cửa hàng đã cấp quyền và những trường sàn thực sự cho phép. Ghi thời điểm đồng bộ. |
| Nội dung AI | Tạo từ dữ liệu sản phẩm trong đúng doanh nghiệp và hướng dẫn của người dùng. Lưu phiên bản để truy lại, không dùng dữ liệu doanh nghiệp khác. |
| Quy tắc bài đăng của sàn | Tài liệu chính thức và thông báo lỗi chính thức; ghi nguồn, ngày cập nhật; không để AI tự nghĩ ra giới hạn hoặc quy định. |
| Báo cáo | Tính từ đơn/bài đăng trong app và chỉ số được sàn cung cấp. Thiếu lượt xem/click thì ghi “Chưa có dữ liệu”, không bịa. |
| Dữ liệu thị trường, luật xuất nhập khẩu, xếp hạng quốc gia | **Chưa thu thập trong bản đầu.** Nếu làm sau, phải có nguồn chính thức, ngày hiệu lực và quy trình chuyên gia kiểm tra. |

Không bán, chia sẻ hoặc dùng dữ liệu riêng của doanh nghiệp này để hiển thị cho doanh nghiệp khác. Không đưa thông tin bí mật kết nối sàn vào lời nhắc AI.

## (11) Quyền của từng loại người dùng

Ký hiệu: **Xem** = chỉ đọc; **Sửa** = được cập nhật; **Duyệt/Đăng** = được xác nhận nội dung và gửi lên sàn; **—** = không có quyền.

| Hoạt động | Chủ (OWNER) | Quản trị (ADMIN) | Quản lý SP (PRODUCT_MANAGER) | Quản lý đơn (ORDER_MANAGER) | Nhân viên (STAFF) | Chỉ xem (VIEWER) |
|---|---|---|---|---|---|---|
| Xem dashboard/sản phẩm/bài đăng | Xem | Xem | Xem | Xem | Xem | Xem |
| Thêm/sửa/nhập sản phẩm | Sửa | Sửa | Sửa | — | Sửa bản nháp | — |
| Tạo/sửa nội dung AI | Sửa | Sửa | Sửa | — | Sửa bản nháp | — |
| Duyệt và đăng bài | Duyệt/Đăng | Duyệt/Đăng | Duyệt/Đăng | — | — | — |
| Xem đơn và thông tin khách cần thiết | Xem | Xem | Xem giới hạn | Xem | Xem giới hạn | Xem đã ẩn thông tin khách |
| Xử lý lỗi ghép SKU của đơn | Sửa | Sửa | Sửa | Sửa | — | — |
| Điều chỉnh tồn và giá | Sửa | Sửa | Sửa | Sửa tồn, không sửa giá | — | — |
| Kết nối/ngắt cửa hàng | Sửa | Sửa | — | — | — | — |
| Bật/tắt quy tắc tự động và Tự đăng | Sửa | Sửa trong phạm vi được Chủ cấp; không tự nâng giới hạn của Chủ | — | — | — | — |
| Duyệt việc AI đề xuất | Duyệt theo quyền thao tác gốc | Duyệt theo quyền thao tác gốc | Duyệt nội dung/đăng | Duyệt việc đơn/tồn | Chỉ sửa bản nháp | — |
| Xem dòng hoạt động và hỏi trợ lý | Xem | Xem | Xem phần được phép | Xem phần được phép | Xem phần được phép | Xem dữ liệu đã giới hạn |
| Mời thành viên, đổi vai trò | Sửa | Sửa, không nâng ai thành Chủ | — | — | — | — |
| Chuyển quyền Chủ/xóa doanh nghiệp | Chủ duy nhất; cần xác nhận riêng | — | — | — | — | — |

Không cho xóa hoặc hạ quyền của Chủ cuối cùng. Một người giữ nhiều vai trò trong nhiều doanh nghiệp chỉ nhận quyền của doanh nghiệp đang chọn. Máy chủ kiểm tra quyền cho **mọi** yêu cầu, kể cả khi người dùng sửa trực tiếp địa chỉ trang hoặc mã đối tượng.

## (12) Các trường hợp lỗi cần xử lý

| Trường hợp | App phải phản hồi |
|---|---|
| Email sai định dạng, thiếu trường, mật khẩu không hợp lệ | Chỉ rõ trường và cách sửa; không xóa những gì người dùng đã nhập hợp lệ |
| Sai mật khẩu, phiên hết hạn, không có quyền | Thông báo phù hợp; yêu cầu đăng nhập lại hoặc từ chối thao tác; không tiết lộ dữ liệu tài khoản khác |
| SKU trùng, dòng CSV lỗi, ảnh sai định dạng/quá lớn | Nêu dòng/trường lỗi; cho sửa và gửi lại; không nhập dữ liệu hỏng âm thầm |
| Cửa hàng không cấp quyền, hết hạn kết nối, người dùng ngắt kết nối | Báo Cần kết nối lại; giữ dữ liệu đã lưu; tạm ngưng công việc cần kết nối |
| AI chậm/hết hạn mức/đầu ra sai cấu trúc | Hiện lỗi và nút Thử lại/Tự viết; không làm mất bản nháp cũ |
| AI suy đoán thông số, chứng nhận, công dụng không có trong sản phẩm gốc | Đánh dấu không có nguồn, chặn Tự đăng và tạo việc người dùng xác nhận/sửa |
| Quy tắc tự động vừa bị tắt nhưng còn việc trong hàng đợi | Kiểm tra lại ngay trước khi gửi; việc chưa gửi bị dừng và ghi lý do, không tiếp tục theo quyền cũ |
| Người bán thay đổi sản phẩm/giá sau lúc AI chuẩn bị hoặc duyệt | Nhận diện phiên bản cũ; hủy hiệu lực bản duyệt, tạo bản mới và kiểm tra lại |
| Tác nhân hoặc worker lỗi giữa quy trình, chạy lại sau khi máy chủ khởi động | Phục hồi trạng thái, thử lại có giới hạn; không gọi sàn hai lần vì một quyết định |
| Người dùng chat câu mơ hồ như “đăng hết đi” | Hiện phạm vi và bản xem trước; chỉ thực hiện theo quyền/quy tắc đã bật hoặc sau xác nhận cụ thể |
| Thiếu thuộc tính, ảnh không đạt, danh mục sai, sàn từ chối | Giữ bài đăng ở trạng thái lỗi; hiển thị lỗi cụ thể, trường cần sửa và hành động tiếp theo |
| Sản phẩm vi phạm quy định pháp lý hoặc luật xuất/nhập khẩu | Phát hiện thông qua đối chiếu DB luật; báo lỗi "Quy định & Pháp lý", chặn tự động đăng, yêu cầu người bán sửa |
| Sàn giới hạn số lần gọi hoặc tạm ngừng | Tự chờ/thử lại có giới hạn; hiển thị Đang chờ; không gửi dồn dập hoặc báo thành công giả |
| Người dùng bấm Đăng/Thử lại nhiều lần | Chỉ có một công việc hiệu lực cho cùng yêu cầu; không tạo nhiều bài đăng ngoài ý muốn |
| Sàn gửi một đơn nhiều lần hoặc đồng thời | Chỉ lưu một đơn, không trừ tồn nhiều lần |
| Đơn đến nhưng không tìm thấy SKU hoặc tồn không đủ | Vẫn lưu đơn, cảnh báo Cần xử lý; không ghép nhầm, không cho tồn âm |
| Đơn hủy/hoàn không rõ có được cộng lại tồn không | Hiển thị Cần kiểm tra; không tự cộng hai lần |
| Đồng bộ tồn/giá lỗi hoặc cửa hàng báo số khác | Hiển thị cả giá trị nội bộ và trạng thái bên sàn; cho kiểm tra và thử lại |
| Mất mạng, đóng tab giữa lúc công việc chạy | Khi mở lại, đọc trạng thái đã lưu; không bắt đầu lại mù quáng |
| Truy cập dữ liệu doanh nghiệp khác | Từ chối ở máy chủ, ghi sự kiện bảo mật; tuyệt đối không trả dữ liệu |

Thông báo lỗi cho người dùng dùng tiếng Việt dễ hiểu. Nhật ký kỹ thuật riêng có mã lỗi để người xây app điều tra, không lộ mã bí mật.

## (13) Yêu cầu giao diện

- Toàn bộ nhãn, nút, mô tả, thông báo và hướng dẫn **bằng tiếng Việt**; tên thương hiệu sàn và SKU giữ nguyên.
- Thiết kế gọn, dễ hiểu, ưu tiên hành động chính trên từng trang; tránh đưa thuật ngữ kỹ thuật như webhook, queue, token ra giao diện người bán.
- Hoạt động tốt trên máy tính và điện thoại; biểu mẫu và nút có kích thước dễ thao tác bằng tay. Bảng dữ liệu trên điện thoại chuyển thành thẻ hoặc có cách xem chi tiết rõ ràng.
- Mỗi màn hình có trạng thái: đang tải, trống, thành công, cần xử lý, lỗi. Tác vụ lâu hiển thị tiến độ/trạng thái; không để người dùng đoán app có đang làm việc hay không.
- Nút nguy hiểm như Ngắt kết nối, Thu hồi quyền, Xóa dữ liệu phải có xác nhận và giải thích tác động.
- Màu không là tín hiệu duy nhất: trạng thái phải có chữ. Biểu mẫu có nhãn, lỗi gắn vào trường, điều hướng dùng được bằng bàn phím và tương phản chữ đủ rõ.
- Hiển thị thời gian theo múi giờ của người dùng, lưu thời gian nhất quán; hiển thị đơn vị tiền của từng giá/đơn, không cộng các tiền tệ khác nhau thành một tổng vô nghĩa.
- Các màn hình của Chế độ dùng thử có nhãn rõ. Không đặt số liệu minh họa cạnh số liệu thật mà thiếu phân biệt.
- Ưu tiên giao diện **Việc cần duyệt** và **Dòng hoạt động** để người dùng thấy app đang chủ động làm gì, vì sao dừng và cần họ quyết định gì; không buộc họ mở từng mục để tìm lỗi.
- Câu trả lời của trợ lý có liên kết đến sản phẩm/đơn/bài đăng được nhắc tới và phân biệt “đã thực hiện”, “đang xử lý”, “đề xuất”, “chờ phê duyệt”. Không dùng hiệu ứng chat để che một công việc đang chạy lâu.

## (14) Tiêu chí để biết app đã làm đúng

Người xây app phải trình diễn và kiểm thử các tình huống sau; một nút chỉ đổi màu mà không có dữ liệu và xử lý thật **không đạt**.

1. Người mới tạo tài khoản, doanh nghiệp, đăng nhập lại vẫn thấy đúng dữ liệu của mình.
2. Hai doanh nghiệp có thể dùng cùng mã SKU mà không lẫn sản phẩm; thành viên của doanh nghiệp A không xem/sửa được dữ liệu B kể cả khi thay mã trên đường dẫn.
3. Người quản lý tạo sản phẩm với hai biến thể; mỗi biến thể giữ giá và số lượng riêng; tải lại trang dữ liệu vẫn còn.
4. Nhập CSV có dòng đúng và dòng sai: app hiển thị đúng dòng lỗi, chỉ lưu dữ liệu đã xác nhận, không tạo trùng khi bấm lại.
5. AI tạo bản nháp có trạng thái, nội dung lưu được; người dùng tự sửa. Nếu AI bị tắt/lỗi, vẫn tự viết và hoàn thành bài đăng.
6. Nhân viên không có quyền không thể duyệt/đăng dù gọi thẳng yêu cầu. Bài đăng sửa sau khi duyệt buộc duyệt lại.
7. Bài đăng được kiểm tra trước khi gửi; trạng thái Đang đăng khác Đã đăng; lỗi sàn hiện rõ; thử lại không tạo bản trùng.
8. Ở chế độ kết nối thật, có thể trình diễn cấp quyền, đăng một sản phẩm được phép, nhận mã/kết quả từ Shopee và đọc lại trạng thái. Nếu thiếu quyền/khóa, ghi tiêu chí này **chưa đạt**, không thay bằng demo để đánh dấu hoàn tất.
9. Một đơn gửi lại hai lần chỉ có một đơn và một lần trừ tồn. Hai đơn đến đồng thời không làm tồn âm. Đơn không ghép được SKU xuất hiện trong danh sách Cần xử lý.
10. Sửa tồn/giá ghi lịch sử và cho biết từng bài đăng đã đồng bộ hay còn lỗi. Ngắt kết nối không xóa đơn/sản phẩm cũ.
11. Màn hình mobile dùng được ở độ rộng khoảng 360 px; không có nút chính bị che hoặc biểu mẫu phải cuộn ngang toàn trang.
12. Các đường dẫn/tác vụ yêu cầu đăng nhập và quyền đều được bảo vệ; mã truy cập sàn và mật khẩu không xuất hiện ở giao diện, log hoặc mã nguồn lưu trong repo.
13. Có hướng dẫn chạy dự án tại máy, cấu hình mẫu không chứa bí mật, dữ liệu dùng thử, quy trình kiểm thử và danh sách phần cần điền khóa thật. App khởi chạy được từ hướng dẫn đó.
14. Có kiểm thử tự động cho các quy tắc quan trọng: tách doanh nghiệp, quyền, trạng thái đăng, chống trùng đơn, trừ tồn đồng thời, xử lý thử lại. Có thử nghiệm thực tế bằng giao diện cho luồng chính.
15. Khi thêm sản phẩm và bật tự tạo bản nháp, app tự mở công việc AI mà không cần bấm Tạo gợi ý. Tác nhân cần thiết chạy và kết quả tới Việc cần duyệt; người bán xem được lý do, nguồn dữ liệu, trạng thái và lịch sử.
16. Chế độ mặc định không tự đăng. Sau khi Chủ bật Tự đăng cho một phạm vi nhỏ, bài đủ điều kiện có thể đăng tự động; bài thiếu trường/thông số không chắc chắn phải dừng. Tắt công tắc trước khi worker gửi phải chặn việc chưa gửi. Mọi hành động ghi được theo quy tắc nào cho phép.
17. Trợ lý trả lời đúng dữ liệu trong doanh nghiệp, liên kết đến bản ghi thật; câu chat đề nghị hành động gây tác động phải đi qua xem trước/quyền/quy tắc, không phải đường vòng bỏ duyệt.
18. AI/worker lỗi hoặc máy chủ khởi động lại không làm mất công việc, không sinh đơn hay bài đăng trùng; hiển thị lỗi và cho khôi phục. Có kiểm thử thời gian: tạo bản nháp chạy nền, trang phản hồi ngay; chỉ gọi tác nhân cần thiết, phần độc lập chạy song song, lời gọi có timeout và hạn mức.
19. Frontend và backend, kể cả worker/AI orchestration, đều viết bằng TypeScript; không có Spring Boot/Java/Python backend. Có kiểu dữ liệu/kiểm tra đầu vào dùng chung giữa những phần cần thiết và lệnh kiểm tra TypeScript chạy được.

**Định nghĩa hoàn thành:** Chế độ dùng thử có thể trình diễn toàn bộ hành trình. Chức năng tích hợp thật chỉ được tuyên bố hoàn thành khi đã xác minh bằng tài khoản và quyền chính thức, có bằng chứng kết quả và ghi các giới hạn còn tồn tại. Không có thông tin đăng nhập sàn hoặc khóa AI trong tài liệu này; người xây app phải dùng cấu hình an toàn và chỉ yêu cầu các bí mật đó khi đến bước kiểm thử thật.

## (15) Các chức năng chưa làm ở phiên bản đầu tiên

- Kết nối TikTok Shop, Lazada, Amazon, eBay thật; đăng hàng loạt và chỉnh sửa hàng loạt.
- Chợ cho người mua đặt và thanh toán trực tiếp trong app.
- Quản lý kho vật lý, nhiều vị trí kho, đóng gói, hãng vận chuyển, vận đơn, theo dõi giao hàng, fulfillment.
- Tự động xuất hàng, nộp hồ sơ hải quan, xác nhận sản phẩm hợp pháp ở nước ngoài.
- AI tự đổi giá, tự thay đổi tồn kho theo suy đoán, tự trả lời khách hoặc tự quyết định hoàn tiền. **Tự đăng trong giới hạn quy tắc do Chủ/Quản trị bật là tính năng bản đầu**; máy chủ kiểm tra và thi hành, AI không trực tiếp gọi sàn.
- Nghiên cứu đối thủ chuyên sâu qua tự động cào dữ liệu thời gian thực, đề xuất và tự động đổi giá liên tục theo đối thủ.
- Tạo ảnh/video bằng AI, xóa nền ảnh, dự báo nhu cầu, AI chăm sóc khách hàng tự động trả lời, ERP/PIM ngoài, tự động đăng blog/Google.
- Báo cáo nâng cao về lượt xem, click, chuyển đổi khi chưa có nguồn dữ liệu thực; gói thuê bao và thanh toán tự động nếu chưa tích hợp cổng thanh toán.

## Đề xuất tổ chức kỹ thuật cho người xây app

Phần này dành cho Codex; người dùng app không cần hiểu các tên kỹ thuật.

### Sơ đồ 5: Kiến trúc điều phối và thực thi kỹ thuật (Event-Driven & Outbox)

![Kiến trúc điều phối và thực thi](docs/images/02-kien-truc-dieu-phoi-va-thuc-thi.png)

> 💡 **Tài nguyên trực quan:** [Bản vector SVG độ nét cao](docs/images/02-kien-truc-dieu-phoi-va-thuc-thi.svg) · [Mở file sơ đồ HTML](docs/so-do-he-thong.html#technical)  
> *Diễn giải:* Luồng sự kiện từ API intake → Giao dịch PostgreSQL với Transactional Outbox Pattern → Redis/BullMQ phân phối job → LangGraph JS điều phối workflow AI với state checkpoint → Policy Gate & Human Approval → Execution Worker kiểm tra lại và gọi Marketplace Adapters → State & Audit log ghi nhận kết quả.

- Một kho mã TypeScript: **Next.js** cho frontend; **NestJS** cho API và nghiệp vụ; một hoặc nhiều **worker TypeScript** cho AI, đăng bài, nhập đơn và đồng bộ. Chia module tài khoản, doanh nghiệp, sản phẩm, bài đăng, AI, tự động hóa, kết nối sàn, đơn, tồn kho; chưa cần microservices.
- **PostgreSQL** lưu dữ liệu và trạng thái nghiệp vụ; **Redis + BullMQ** giữ hàng đợi và worker. Tạo bản ghi sự kiện/công việc cùng thay đổi nghiệp vụ trong giao dịch, sau đó chuyển sang hàng đợi theo cách có thể khôi phục; không để một lần mất kết nối Redis làm mất việc vĩnh viễn. Chia sẻ schema/kiểu dữ liệu/kiểm tra đầu vào trong monorepo TypeScript.
- Mỗi yêu cầu và bản ghi nghiệp vụ gắn doanh nghiệp; kiểm tra quyền ở máy chủ. Dùng giao dịch dữ liệu và cập nhật tồn có điều kiện, lưu lịch sử thay đổi và dấu hiệu nhận diện yêu cầu để chống lặp.
- Xác thực chữ ký/thông báo của sàn theo tài liệu chính thức, bảo vệ luồng cấp quyền khi trở về app, mã hóa thông tin kết nối và chỉ cho worker thật dùng thông tin của đúng doanh nghiệp/cửa hàng. Không đưa văn bản lấy từ CSV/sàn vào vai trò chỉ thị hệ thống cho AI.
- Tích hợp Shopee qua một lớp riêng; các chức năng chỉ triển khai theo tài liệu và quyền API chính thức đang có. Tách lớp dùng thử khỏi kết nối thật. Thông tin Shopee Open Platform tham khảo: https://open.shopee.com/developer-guide/4 và https://open.shopee.com/developer-guide/20.
- **LangGraph JS** điều phối các bước AI có trạng thái và điểm chờ duyệt; **AI SDK** gọi mô hình/nhận dữ liệu có cấu trúc; **BullMQ** quản lý công việc nền và retry. Không dùng mô hình để thay thế quy tắc quyền, trừ tồn hay thực thi API sàn. Thiết lập hạn mức chi phí và lời gọi theo doanh nghiệp; log đủ để biết tác nhân nào, phiên bản dữ liệu nào và quy tắc nào dẫn tới đề xuất/hành động.
- Môi trường chạy mẫu bằng Docker Compose hoặc hướng dẫn tương đương; tệp cấu hình ví dụ không chứa mật khẩu thật. Cung cấp dữ liệu mẫu phục vụ kiểm thử, không đồng nhất với dữ liệu production.

---

# CÂU LỆNH XÂY DỰNG APP

Sao chép toàn bộ đoạn dưới đây sang Codex **cùng với file yêu cầu này**:

> Hãy đọc toàn bộ file `Yeu-cau-xay-dung-app-SaaS-da-san.md` và xây dựng **app AI native chạy được**, không chỉ một web có nút gọi AI hoặc giao diện mô phỏng. Dùng **TypeScript cho toàn bộ frontend, backend và worker**: Next.js + NestJS + PostgreSQL + Redis/BullMQ; dùng LangGraph JS điều phối quy trình AI có trạng thái và AI SDK để gọi mô hình với đầu ra có cấu trúc. Hành trình: đăng ký → tạo doanh nghiệp → kết nối Shopee hoặc Chế độ dùng thử gắn nhãn → tạo/nhập sản phẩm → app tự kích hoạt tác nhân soạn nội dung/bản địa hóa/từ khóa và kiểm tra → đưa ngoại lệ vào Việc cần duyệt hoặc tự đăng **chỉ** khi Chủ đã bật quy tắc trong phạm vi xác định → nhận đơn → tự đối chiếu SKU, trừ tồn an toàn, đồng bộ giá/tồn → chủ động phát hiện lỗi và tạo việc cần xử lý. Xây Trợ lý AI hỏi đáp bằng dữ liệu của đúng doanh nghiệp, Dòng hoạt động giải thích việc app đã làm, và màn hình cấu hình mức tự động. Tác nhân chỉ đề xuất; máy chủ xác minh quyền, quy tắc, phiên bản dữ liệu, hạn mức và chống trùng trước mọi thao tác ghi hoặc gọi sàn. Mặc định đăng bài cần duyệt. Giảm độ trễ bằng tác vụ nền, chỉ chạy tác nhân cần thiết, chạy song song phần độc lập, cache, timeout và retry có giới hạn; lưu trạng thái bền vững để khôi phục sau lỗi. Tách dữ liệu theo doanh nghiệp; chống trùng đơn, tồn âm và vòng lặp đồng bộ; không báo thành công trước khi sàn xác nhận. Giao diện tiếng Việt, responsive, có trạng thái tải/trống/lỗi. Nếu chưa có quyền API Shopee hoặc khóa AI, hoàn thành Chế độ dùng thử có nhãn và ghi rõ chức năng thật chưa xác minh, không nhúng bí mật hoặc ngụy trang dữ liệu mẫu. Tạo schema, mã nguồn, dữ liệu demo, hướng dẫn chạy, kiểm thử mục (14); tự chạy app, kiểm tra hành trình qua giao diện và sửa lỗi. Báo riêng việc chưa thể xác minh do thiếu tài khoản/quyền/khóa bên ngoài.
