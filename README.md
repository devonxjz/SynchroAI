# Synchro — AI Native Commerce Copilot

> Hệ thống trợ lý AI đa tác tử (Multi-Agent Copilot) hỗ trợ người bán thương mại điện tử đa sàn (Shopee-first), tự động hóa chuẩn bị bài đăng, kiểm duyệt chính sách, đối soát đơn hàng và giải đáp thắc mắc thông minh.

---

## 📌 Tổng quan dự án

**Synchro** là nền tảng quản trị bán hàng tập trung theo kiến trúc **AI-native**:
- **Tập trung vào người bán**: Quản lý sản phẩm gốc tại một nơi, đồng bộ bài đăng (listing) lên từng sàn (phiên bản đầu kết nối Shopee).
- **AI chủ động điều phối**: Tự động phân tích sản phẩm mới, trích xuất thuộc tính, tạo nội dung tối ưu SEO, kiểm tra vi phạm chính sách sàn và đưa vào hộp việc chờ người bán duyệt (**Human-in-the-loop**).
- **RAG & Bộ nhớ doanh nghiệp**: Lưu trữ tri thức sản phẩm, chính sách bán hàng và lịch sử tương tác, giúp trợ lý chatbot trả lời chính xác, kèm trích dẫn nguồn rõ ràng.
- **Hai chế độ vận hành (Dual-Mode)**:
  - `demo`: Dùng fixture data và in-memory store, chạy mượt mà không tốn chi phí API, an toàn khi thử nghiệm.
  - `live`: Kết nối trực tiếp mô hình AI (OpenAI / Gemini) và API sàn chính thức khi được cấp phép.

> 📖 **Tài liệu đặc tả chi tiết (PRD):** Tham khảo file [`docs/SPEC.md`](docs/SPEC.md)  
> 📊 **Sơ đồ kiến trúc tương tác:** Mở file [`docs/so-do-he-thong.html`](docs/so-do-he-thong.html)

---

## 🏗️ Kiến trúc hệ thống

```text
[ Người bán / Giao diện Dashboard ]
                │
                ▼
  [ API Routes & Intent Router ]
        │                  │
        ▼                  ▼
 [ RAG & Tri thức ]   [ Multi-Agent Pipeline ]
 (Vector Store /     (Intake, Listing Prep,
  Embeddings Budget)  Policy Check, Market Copilot)
        │                  │
        └─────────┬────────┘
                  ▼
         [ ModelCallGateway ] ─── (Kiểm soát token, timeout, retry & fixture fallback)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [ Fixture Provider ]  [ Live LLM (OpenAI) ]
 (Chế độ Demo)         (Chế độ Live)
```

- **Next.js 16 (App Router) + React 19 + TypeScript**: Toàn bộ frontend và backend dùng chung một hệ sinh thái type-safe, không phân mảnh ngôn ngữ.
- **ModelCallGateway**: Điểm chốt chặn trung tâm (chokepoint) quản lý mọi lượt gọi LLM, giám sát ngân sách token, ghi nhận telemetry và tự động fallback sang fixture khi ở chế độ demo.
- **Multi-Tenant Isolation**: Mọi tác vụ và lưu trữ dữ liệu đều phân lập theo `tenantId`.

---

## ⚙️ Cấu hình môi trường

Tạo file `.env` từ file mẫu `.env.example`:

```bash
cp .env.example .env
```

Các biến môi trường cơ bản cần lưu ý trong `.env`:

| Biến môi trường | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `DEFAULT_AI_MODE` | `demo` | Chế độ AI: `demo` (dùng fixture giả lập) hoặc `live` (gọi AI thật) |
| `OPENAI_API_KEY` | *(trống)* | API Key OpenAI (bắt buộc nếu chạy `DEFAULT_AI_MODE=live`) |
| `OPENAI_DEFAULT_MODEL`| `gpt-4o-mini`| Model LLM mặc định cho các tác tử |
| `MODEL_CALL_TIMEOUT_MS`| `30000` | Thời gian timeout cho mỗi bước gọi mô hình (ms) |
| `PORT` | `3000` | Cổng chạy ứng dụng |

---

## 🚀 Hướng dẫn cài đặt & khởi chạy

### Yêu cầu tiên quyết
- **Node.js**: Phiên bản 20.x trở lên (khuyến nghị Node 24 LTS).
- **npm** đi kèm với Node.js.

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Khởi chạy môi trường phát triển (Dev server)
```bash
npm run dev
```
Mở trình duyệt tại: **[http://localhost:3000](http://localhost:3000)** (tự động điều hướng đến Dashboard).

### 3. Kiểm tra mã nguồn (Typecheck & Lint)
```bash
# Kiểm tra TypeScript type safety
npm run typecheck

# Kiểm tra quy chuẩn mã nguồn ESLint
npm run lint
```

### 4. Chạy bộ kiểm thử tự động (Unit & Integration Tests)
```bash
npm test
```
*Bộ test tích hợp sẵn chạy trên Node test runner bản địa (`node:test`), kiểm thử toàn diện RAG, Gateway, Router và Multi-agent pipeline.*

### 5. Đóng gói triển khai (Production Build)
```bash
npm run build
npm start
```

---

## 📁 Cấu trúc thư mục

```text
├── docs/                      # Tài liệu dự án, PRD chi tiết (SPEC.md) & sơ đồ hệ thống
├── public/                    # Tài nguyên tĩnh (ảnh, icon)
├── src/
│   ├── ai/                    # Lõi AI Native
│   │   ├── agents/            # Các tác tử AI (Assistant, Market Entry, etc.)
│   │   ├── chatbot/           # Server-side Router, RAG, Embeddings & Vector Store
│   │   └── model-call/        # ModelCallGateway, Fixture/Live Providers, Telemetry
│   ├── app/                   # Next.js App Router (Dashboard, Chatbot UI, API Routes)
│   ├── core/                  # Nghiệp vụ lõi (Product, Listing, Order, Inventory)
│   └── shared/                # In-memory store, Auth context, tiện ích dùng chung
└── tests/                     # Bộ test kiểm thử tự động
```

---

## 🛡️ Quy ước & An toàn dữ liệu

1. **Không giả mạo dữ liệu thật**: Chế độ dùng thử (`demo`) luôn được gán nhãn rõ ràng; không báo kết nối thành công nếu chưa có quyền API sàn chính thức.
2. **Quyền quyết định thuộc về người bán**: AI chỉ đóng vai trò chuẩn bị và kiến nghị. Mọi hành động đăng sản phẩm hoặc thay đổi nhạy cảm đều cần xác nhận qua Hộp duyệt việc, trừ khi được chủ shop cấu hình tự động rõ ràng.
3. **Bảo mật bí mật API**: Tuyệt đối không commit file `.env` hoặc để lộ API key lên kho lưu trữ mã nguồn.
