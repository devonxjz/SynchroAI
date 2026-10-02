"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import type { InventoryItem } from "@/services/marketplace/types.ts";

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [editStock, setEditStock] = useState<number>(0);
  const [editLocation, setEditLocation] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  /**
   * Load real-time inventory from backend API
   */
  const loadInventory = async () => {
    try {
      const res = await fetch("/api/marketplace/inventory");
      const data = await res.json();
      if (data.success && Array.isArray(data.inventory)) {
        setInventory(data.inventory);
      }
    } catch (err) {
      console.warn("Failed to load inventory:", err);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetch("/api/marketplace/inventory")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore && data.success && Array.isArray(data.inventory)) {
          setInventory(data.inventory);
        }
      })
      .catch((err) => {
        console.warn("Failed to load inventory:", err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  /**
   * Select a product to view or modify
   */
  const handleSelectProduct = (product: InventoryItem) => {
    setSelectedProduct(product);
    setEditStock(product.stock);
    setEditLocation(product.location || "");
    setFeedback(null);
  };

  /**
   * Push updated stock to local state and remote marketplace via RESTful API
   */
  const handleSaveAndPushStock = async () => {
    if (!selectedProduct) return;
    setIsUpdating(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/marketplace/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryId: selectedProduct.id,
          stock: Math.max(0, Number(editStock)),
          location: editLocation,
        }),
      });

      const data = await res.json();
      if (data.success && data.item) {
        setFeedback("Đã lưu và đồng bộ thành công lên các sàn liên kết!");
        setSelectedProduct(data.item);
        setInventory((prev) =>
          prev.map((i) => (i.id === data.item.id ? data.item : i))
        );
      } else {
        setFeedback(`Lỗi: ${data.error || "Không thể cập nhật tồn kho"}`);
      }
    } catch (err) {
      setFeedback(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStockBadge = (status: string, stock: number) => {
    switch (status) {
      case "good":
        return <span className={`${styles.stockBadge} ${styles["stock-good"]}`}>{stock} - Tốt</span>;
      case "warning":
        return <span className={`${styles.stockBadge} ${styles["stock-warning"]}`}>{stock} - Sắp hết</span>;
      case "danger":
        return <span className={`${styles.stockBadge} ${styles["stock-danger"]}`}>{stock} - Hết hàng</span>;
      default:
        return <span className={styles.stockBadge}>{stock}</span>;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Kho Tồn (Inventory)</h1>
          <p className={styles.subtitle}>Quản lý và đồng bộ tồn kho đa nền tảng thời gian thực</p>
        </div>
        <button className="btn btn-secondary" onClick={loadInventory}>
          🔄 Làm mới dữ liệu
        </button>
      </div>

      {feedback && (
        <div
          style={{
            background: feedback.startsWith("Lỗi") ? "#450a0a" : "#064e3b",
            color: feedback.startsWith("Lỗi") ? "#fca5a5" : "#6ee7b7",
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedback.startsWith("Lỗi") ? "⚠" : "✓"} {feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Sản phẩm</th>
              <th className={styles.th}>Danh mục</th>
              <th className={styles.th}>Giá bán (VND)</th>
              <th className={styles.th}>Tồn kho thực tế</th>
              <th className={styles.th}>Kênh đồng bộ</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((product) => (
              <tr key={product.id} className={styles.tr} onClick={() => handleSelectProduct(product)}>
                <td className={styles.td}>
                  <div className={styles.productName}>{product.name}</div>
                  <div className={styles.productSku}>SKU: {product.sku}</div>
                </td>
                <td className={styles.td}>{product.category}</td>
                <td className={styles.td}>{product.priceVnd.toLocaleString("vi-VN")} đ</td>
                <td className={styles.td}>{getStockBadge(product.status, product.stock)}</td>
                <td className={styles.td}>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {product.platforms.map((p) => (
                      <span
                        key={p}
                        style={{
                          fontSize: "12px",
                          background: "var(--bg-tertiary)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "capitalize",
                        }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Side Panel Drawer */}
      {selectedProduct && (
        <div className={styles.drawerOverlay} onClick={() => setSelectedProduct(null)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>Chi tiết & Đồng bộ Tồn kho</div>
              <button className={styles.closeBtn} onClick={() => setSelectedProduct(null)}>✕</button>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Tên sản phẩm</div>
              <div className={styles.detailValue} style={{ fontSize: "16px", fontWeight: 600 }}>
                {selectedProduct.name}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                Mã SKU: <strong>{selectedProduct.sku}</strong> | Danh mục: {selectedProduct.category}
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Chỉnh sửa số lượng tồn & Vị trí kho</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Số lượng tồn kho (Khóa chống tồn âm):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editStock}
                    onChange={(e) => setEditStock(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Vị trí kệ kho:
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Trạng thái đồng bộ tự động lên Sàn</div>
              <div style={{ background: "var(--bg-secondary)", borderRadius: "8px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
                {selectedProduct.platforms.map((platform, idx) => (
                  <div
                    key={platform}
                    className={styles.itemRow}
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      justifyContent: "space-between",
                      borderBottom: idx === selectedProduct.platforms.length - 1 ? "none" : "1px solid var(--border-color)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }}></span>
                      <strong style={{ textTransform: "capitalize" }}>{platform}</strong>
                    </div>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Đồng bộ thời gian thực</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px", textAlign: "right" }}>
                Cập nhật lần cuối: {new Date(selectedProduct.lastUpdated).toLocaleTimeString("vi-VN")}
              </div>
            </div>

            <div style={{ marginTop: "auto", display: "flex", gap: "12px" }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedProduct(null)}>
                Đóng
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleSaveAndPushStock}
                disabled={isUpdating}
              >
                {isUpdating ? "Đang đẩy lên sàn..." : "Lưu & Đẩy lên Sàn"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
