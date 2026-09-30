"use client";

import styles from "./page.module.css";
import { useState } from "react";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ recordType: string; recordId: string; title?: string; internalUrl: string }>;
  actionPreviewId?: string;
  status?: string;
}

export default function AICopilotPage() {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg_init_1",
      role: "assistant",
      content:
        "Xin chào! Tôi là Trợ lý AI điều phối bán hàng. Tôi có thể hỗ trợ bạn kiểm tra tình trạng bài đăng, thống kê đơn hàng, tồn kho và công việc cần xử lý theo đúng quy định sàn.",
      citations: [
        {
          recordType: "task",
          recordId: "task_tea_brand",
          title: "Việc cần duyệt & Xử lý",
          internalUrl: "/dashboard/tasks",
        },
      ],
    },
  ]);

  const handleSendMessage = async (textToSend?: string, targetProposalId?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isLoading) return;

    const userMsgId = `u_${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: "user", content: text },
    ];
    setMessages(newMessages);
    setInputText("");
    setIsLoading(true);

    const idempotencyKey = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await fetch("/api/assistant/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          idempotencyKey,
          conversationId,
          targetProposalId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }

      const data = await res.json();
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages([
        ...newMessages,
        {
          id: `ai_${Date.now()}`,
          role: "assistant",
          content: data.answer || "Đã nhận phản hồi từ hệ thống.",
          citations: data.citations,
          actionPreviewId: data.actionPreviewId,
          status: data.status,
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

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          <span className="gradient-text-accent">AI Copilot</span>
        </h1>
        <p className={styles.subtitle}>Trợ lý thông minh điều phối và quản lý bán hàng đa sàn.</p>
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

                {/* Proposal action preview badge */}
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
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Thao tác cần bạn duyệt qua quy trình kiểm soát Khối 10 trước khi gửi sàn.
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

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div
                    style={{
                      marginTop: "10px",
                      paddingTop: "8px",
                      borderTop: "1px dashed rgba(255, 255, 255, 0.15)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>Nguồn dẫn chứng:</strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                      {msg.citations.map((c, i) => (
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
              <div className={styles.bubble}>Đang truy vấn dữ liệu và kiểm tra quy tắc...</div>
            </div>
          )}
        </div>

        <div className={styles.suggestions}>
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
          <div
            className={styles.suggestionBadge}
            onClick={() => handleSuggestionClick("Trà Ô Long")}
          >
            Trà Ô Long
          </div>
        </div>

        <div className={styles.inputArea}>
          <textarea
            className={styles.input}
            placeholder="Hỏi AI hoặc yêu cầu công việc mới..."
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
