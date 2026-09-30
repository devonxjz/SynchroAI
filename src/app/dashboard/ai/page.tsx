"use client";

import styles from "./page.module.css";
import { useState } from "react";

interface DraftCard {
  draftId: string;
  version: number;
  draftHash: string;
  title: string;
  store: string;
  targetLocale: string;
  status: string;
  attributes: Record<string, string>;
  activatedRunId?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ recordType: string; recordId: string; title?: string; internalUrl: string }>;
  ragCitations?: Array<{ recordType: string; recordId: string; title?: string; internalUrl: string }>;
  actionPreviewId?: string;
  status?: string;
  draft?: DraftCard;
  longTermMemories?: Array<{ key: string; value: unknown }>;
}

function generateClientKey(prefix = "req"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AICopilotPage() {
  const [inputText, setInputText] = useState("");
  const [documentInput, setDocumentInput] = useState("");
  const [showDocInput, setShowDocInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activationStatus, setActivationStatus] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg_init_1",
      role: "assistant",
      content:
        "Xin chào! Tôi là Chatbot AI tiếp nhận và điều phối bán hàng. Bạn có thể gửi câu hỏi nghiệp vụ hoặc dán quy cách, tài liệu sản phẩm để trích xuất RAG và khởi tạo bài đăng.",
      citations: [
        {
          recordType: "task",
          recordId: "task_tea_brand",
          title: "Việc cần duyệt & Xử lý",
          internalUrl: "/dashboard/tasks",
        },
      ],
      longTermMemories: [
        { key: "default_store", value: "Shopee VN" },
        { key: "packaging_pref", value: "Đóng gói 250g / 500g" },
      ],
    },
  ]);

  const handleSendMessage = async (textToSend?: string, targetProposalId?: string) => {
    const text = textToSend || inputText;
    const docText = documentInput.trim();

    if ((!text.trim() && !docText) || isLoading) return;

    const userMsgId = `u_${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMsgId,
        role: "user",
        content: docText ? `${text}\n[Đính kèm tài liệu quy cách: ${docText.slice(0, 100)}...]` : text,
      },
    ];
    setMessages(newMessages);
    setInputText("");
    setDocumentInput("");
    setShowDocInput(false);
    setIsLoading(true);

    const idempotencyKey = generateClientKey('req');

    try {
      // If document text or intake keywords, use the intake endpoint
      const isIntakeRequest = Boolean(docText) || /sản phẩm|quy cách|bài đăng|tạo mới|soạn bài|đóng gói/i.test(text);
      const endpoint = isIntakeRequest ? "/api/chatbot/intake" : "/api/assistant/messages";

      const payload = isIntakeRequest
        ? {
            message: text,
            documentText: docText,
            conversationId,
            idempotencyKey,
            store: "Shopee VN",
            targetLocale: "vi",
            intent: "prepare_listing",
          }
        : {
            message: text,
            idempotencyKey,
            conversationId,
            targetProposalId,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }

      const data = await res.json();
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      let returnedDraft: DraftCard | undefined;
      if (data.draft) {
        returnedDraft = {
          draftId: data.draft.draftId,
          version: data.draft.version,
          draftHash: data.draft.draftHash,
          title: data.draft.productSnapshot?.title || "Sản phẩm mới",
          store: data.draft.store,
          targetLocale: data.draft.targetLocale,
          status: data.draft.status,
          attributes: data.draft.productSnapshot?.attributes || {},
        };
      }

      setMessages([
        ...newMessages,
        {
          id: `ai_${Date.now()}`,
          role: "assistant",
          content: data.answer || "Đã nhận phản hồi từ hệ thống.",
          citations: data.citations,
          ragCitations: data.ragCitations,
          actionPreviewId: data.actionPreviewId,
          status: data.status,
          draft: returnedDraft,
          longTermMemories: data.longTermMemories,
        },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content:
            "Hệ thống tạm thời gặp sự cố khi kết nối với máy chủ. Bạn vẫn có thể truy cập trực tiếp các màn hình quản trị bằng các lối tắt bên dưới.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateWorkflow = async (draft: DraftCard) => {
    setIsLoading(true);
    setActivationStatus("Đang kích hoạt quy trình...");

    try {
      const idempotencyKey = generateClientKey('act');
      const res = await fetch(`/api/chatbot/intake/${draft.draftId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: draft.version,
          expectedHash: draft.draftHash,
          idempotencyKey,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Mã lỗi ${res.status}`);
      }

      const result = await res.json();
      setActivationStatus(`✅ Đã kích hoạt quy trình: Mã chạy ${result.runId} (${result.status})`);
      setMessages((prev) =>
        prev.map((m) =>
          m.draft?.draftId === draft.draftId
            ? { ...m, draft: { ...m.draft, activatedRunId: result.runId, status: 'activated' } }
            : m
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActivationStatus(`❌ Lỗi kích hoạt: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          <span className="gradient-text-accent">AI Copilot & Intake RAG</span>
        </h1>
        <p className={styles.subtitle}>
          Cửa ngõ tiếp nhận thông minh, bóc tách quy cách RAG và chuyển giao quy trình chuẩn bị bài đăng.
        </p>
      </div>

      {/* Long-term memory badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          marginBottom: "12px",
          borderRadius: "8px",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          fontSize: "0.85rem",
        }}
      >
        <span>🧠</span>
        <strong>Ký ức bán hàng:</strong>
        <span>Shopee VN • Đóng gói 250g / 500g • Phong cách thân thiện chuẩn SEO</span>
      </div>

      <div className={styles.chatArea}>
        <div className={styles.messages}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.message} ${msg.role === "assistant" ? styles.ai : styles.user}`}
            >
              <div className={`${styles.avatar} ${msg.role === "assistant" ? styles.ai : styles.user}`}>
                {msg.role === "assistant" ? "AI" : "N"}
              </div>
              <div className={styles.bubble}>
                <div style={{ whiteSpace: "pre-line" }}>{msg.content}</div>

                {/* Draft Card */}
                {msg.draft && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      backgroundColor: "rgba(99, 102, 241, 0.1)",
                      borderRadius: "8px",
                      border: "1px solid rgba(99, 102, 241, 0.3)",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--accent-primary)", marginBottom: "4px" }}>
                      🚀 Đề xuất nhiệm vụ: Soạn bài đăng {msg.draft.title}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "6px" }}>
                      Sàn mục tiêu: {msg.draft.store} • Thị trường: {msg.draft.targetLocale.toUpperCase()} • Trạng thái:{" "}
                      {msg.draft.status}
                    </div>
                    {Object.keys(msg.draft.attributes).length > 0 && (
                      <div style={{ fontSize: "0.8rem", marginBottom: "8px" }}>
                        <strong>Thông số bóc tách:</strong>{" "}
                        {Object.entries(msg.draft.attributes)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" • ")}
                      </div>
                    )}
                    {msg.draft.activatedRunId ? (
                      <div style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: 600 }}>
                        ✓ Quy trình đang chạy với ID: {msg.draft.activatedRunId}
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary"
                        style={{ marginTop: "6px", fontSize: "0.85rem", padding: "6px 14px" }}
                        onClick={() => handleActivateWorkflow(msg.draft!)}
                        disabled={isLoading}
                      >
                        Kích hoạt quy trình soạn bài
                      </button>
                    )}
                  </div>
                )}

                {/* Action Preview */}
                {msg.actionPreviewId && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px",
                      backgroundColor: "rgba(99, 102, 241, 0.1)",
                      borderRadius: "6px",
                      border: "1px solid rgba(99, 102, 241, 0.3)",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                      📋 Bản xem trước đề xuất #{msg.actionPreviewId}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: "8px", fontSize: "0.85rem" }}
                      onClick={() => handleSendMessage("Duyệt đề xuất", msg.actionPreviewId)}
                    >
                      Duyệt và Gửi sàn
                    </button>
                  </div>
                )}

                {/* RAG Citations */}
                {((msg.ragCitations && msg.ragCitations.length > 0) || (msg.citations && msg.citations.length > 0)) && (
                  <div
                    style={{
                      marginTop: "10px",
                      paddingTop: "8px",
                      borderTop: "1px dashed rgba(255, 255, 255, 0.15)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>📚 Tri thức tham chiếu RAG:</strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                      {[...(msg.ragCitations || []), ...(msg.citations || [])].map((c, i) => (
                        <a
                          key={i}
                          href={c.internalUrl}
                          style={{
                            color: "var(--accent-primary)",
                            textDecoration: "underline",
                            display: "inline-block",
                          }}
                        >
                          🔗 {c.title || `${c.recordType} #${c.recordId}`}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className={`${styles.message} ${styles.ai}`}>
              <div className={`${styles.avatar} ${styles.ai}`}>AI</div>
              <div className={styles.bubble}>Đang phân tích ngữ nghĩa, truy xuất RAG và kiểm tra quy tắc...</div>
            </div>
          )}
        </div>

        {activationStatus && (
          <div style={{ padding: "8px 12px", margin: "4px 12px", fontSize: "0.85rem", color: "#38bdf8" }}>
            {activationStatus}
          </div>
        )}

        {/* Document intake expander */}
        {showDocInput && (
          <div style={{ padding: "10px 14px", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: "8px", margin: "6px 12px" }}>
            <div style={{ fontSize: "0.85rem", marginBottom: "4px", fontWeight: 600 }}>
              📄 Dán tài liệu hoặc quy cách kỹ thuật sản phẩm:
            </div>
            <textarea
              style={{
                width: "100%",
                height: "80px",
                padding: "8px",
                borderRadius: "6px",
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: "0.85rem",
              }}
              placeholder="Ví dụ: Cà phê Phin Đắk Lắk 500g, 100% Robusta rang mộc, xuất xứ Việt Nam..."
              value={documentInput}
              onChange={(e) => setDocumentInput(e.target.value)}
            />
          </div>
        )}

        <div className={styles.suggestions}>
          <div
            className={styles.suggestionBadge}
            onClick={() => setShowDocInput(!showDocInput)}
            style={{ backgroundColor: showDocInput ? "var(--accent-primary)" : undefined }}
          >
            📄 {showDocInput ? "Đóng tài liệu đính kèm" : "Dán tài liệu quy cách RAG"}
          </div>
          <div
            className={styles.suggestionBadge}
            onClick={() => handleSuggestionClick("Tạo bài đăng Cà phê Robusta Đắk Lắk 500g")}
          >
            Tạo bài đăng Cà phê
          </div>
          <div
            className={styles.suggestionBadge}
            onClick={() => handleSuggestionClick("Hôm nay còn việc gì cần làm?")}
          >
            Hôm nay còn việc gì?
          </div>
          <div
            className={styles.suggestionBadge}
            onClick={() => handleSuggestionClick("Doanh thu hôm nay thế nào?")}
          >
            Doanh thu hôm nay
          </div>
        </div>

        <div className={styles.inputArea}>
          <textarea
            className={styles.input}
            placeholder="Hỏi AI hoặc cung cấp thông tin sản phẩm mới..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <button className={styles.sendBtn} onClick={() => handleSendMessage()} disabled={isLoading}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
