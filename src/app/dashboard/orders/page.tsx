"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import type { MarketplaceOrder } from "@/services/marketplace/types.ts";

export default function OrdersPage() {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  /**
   * Load existing orders on component mount
   */
  const loadOrders = async () => {
    try {
      const res = await fetch("/api/marketplace/orders");
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.warn("Failed to fetch initial orders:", err);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  /**
   * Trigger real-time order sync from FakeStore RESTful API (simulating Shopee/TikTok)
   */
  const handleSyncOrders = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch("/api/marketplace/orders", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncFeedback(data.message || "Đồng bộ đơn hàng thành công!");
        if (data.data?.orders) {
          setOrders(data.data.orders);
        } else {
          await loadOrders();
        }
      } else {
        setSyncFeedback(`Lỗi: ${data.error || "Không thể đồng bộ đơn hàng"}`);
      }
    } catch (err) {
      setSyncFeedback(`Lỗi kết nối: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <span className={`${styles.statusBadge} ${styles["status-new"]}`}>Chờ xác nhận</span>;
      case "processing":
        return <span className={`${styles.statusBadge} ${styles["status-processing"]}`}>Đang xử lý</span>;
      case "completed":
        return <span className={`${styles.statusBadge} ${styles["status-completed"]}`}>Đã hoàn thành</span>;
      default:
        return <span className={styles.statusBadge}>{status}</span>;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Quản lý Đơn hàng</h1>
          <p className={styles.subtitle}>Danh sách đơn hàng đồng bộ theo thời gian thực từ sàn Shopee & TikTok</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="btn btn-secondary"
            onClick={handleSyncOrders}
            disabled={isSyncing}
          >
            {isSyncing ? "Đang đồng bộ..." : "🔄 Đồng bộ từ Sàn (FakeStore API)"}
          </button>
          <button className="btn btn-primary">Xuất danh sách</button>
        </div>
      </div>

      {syncFeedback && (
        <div style={{
          background: syncFeedback.startsWith("Lỗi") ? "#450a0a" : "#064e3b",
          color: syncFeedback.startsWith("Lỗi") ? "#fca5a5" : "#6ee7b7",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{syncFeedback.startsWith("Lỗi") ? "⚠" : "✓"} {syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Mã Đơn / Sàn</th>
              <th className={styles.th}>Ngày tạo</th>
              <th className={styles.th}>Khách hàng</th>
              <th className={styles.th}>Tổng tiền</th>
              <th className={styles.th}>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
                  Chưa có đơn hàng nào được ghi nhận. Bấm <strong>"Đồng bộ từ Sàn (FakeStore API)"</strong> để lấy đơn hàng mới nhất!
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className={styles.tr} onClick={() => setSelectedOrder(order)}>
                  <td className={styles.td}>
                    <div className={styles.orderId}>{order.id}</div>
                    <div className={styles.orderPlatform}>
                      {order.platform === "shopee" ? "🛒 Shopee" : "🎵 TikTok Shop"}
                    </div>
                  </td>
                  <td className={styles.td}>
                    {new Date(order.date).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </td>
                  <td className={styles.td}>
                    <div style={{ fontWeight: 500 }}>{order.customerName}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{order.customerEmail}</div>
                  </td>
                  <td className={styles.td}>
                    <strong style={{ color: "var(--accent-primary)" }}>
                      {order.totalVnd.toLocaleString("vi-VN")} đ
                    </strong>
                  </td>
                  <td className={styles.td}>{getStatusBadge(order.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Side Panel Drawer */}
      {selectedOrder && (
        <div className={styles.drawerOverlay} onClick={() => setSelectedOrder(null)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>Chi tiết đơn {selectedOrder.id}</div>
              <button className={styles.closeBtn} onClick={() => setSelectedOrder(null)}>✕</button>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Nguồn sàn thương mại</div>
              <div className={styles.detailValue}>
                {selectedOrder.platform === "shopee" ? "🛒 Shopee Mall (Official)" : "🎵 TikTok Shop"}
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Thông tin người nhận & Giao hàng</div>
              <div style={{ lineHeight: "1.6", fontSize: "14px" }}>
                <strong>{selectedOrder.customerName}</strong> ({selectedOrder.customerEmail})<br />
                📍 {selectedOrder.shippingAddress}<br />
                {selectedOrder.notes && <em style={{ color: "var(--warning)" }}>Lưu ý: {selectedOrder.notes}</em>}
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Sản phẩm & Khấu trừ kho ({selectedOrder.items.length})</div>
              <div style={{ background: "var(--bg-secondary)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className={styles.itemRow} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span>{item.quantity}x {item.name}</span>
                    <strong>{item.totalVnd.toLocaleString("vi-VN")} đ</strong>
                  </div>
                ))}
                <div className={styles.itemRow} style={{ border: "none", paddingTop: "12px", marginTop: "8px", borderTop: "2px solid var(--border-color)", display: "flex", justifyContent: "space-between" }}>
                  <span>Tổng thanh toán</span>
                  <strong style={{ fontSize: "18px", color: "var(--accent-primary)" }}>
                    {selectedOrder.totalVnd.toLocaleString("vi-VN")} đ
                  </strong>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "auto", display: "flex", gap: "12px" }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedOrder(null)}>Đóng</button>
              <button className="btn btn-primary" style={{ flex: 1 }}>In vận đơn</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
