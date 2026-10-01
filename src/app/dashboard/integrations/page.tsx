"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import type { ChannelConnection } from "@/services/marketplace/types.ts";

interface PlatformDisplay {
  id: string;
  name: string;
  platform: 'shopee' | 'tiktok' | 'lazada';
  icon: string;
  status: 'connected' | 'disconnected' | 'error';
  shopName: string;
  shopId: string;
  lastSync: string;
}

const DEFAULT_PLATFORMS: PlatformDisplay[] = [
  {
    id: "shopee",
    name: "Shopee",
    platform: "shopee",
    icon: "🛒",
    status: "connected",
    shopName: "Official Shopee Mall VN",
    shopId: "shp_893452142",
    lastSync: "Vừa xong"
  },
  {
    id: "tiktok",
    name: "TikTok Shop",
    platform: "tiktok",
    icon: "🎵",
    status: "connected",
    shopName: "Synchro TikTok Shop",
    shopId: "tt_77192348",
    lastSync: "5 phút trước"
  },
  {
    id: "lazada",
    name: "Lazada",
    platform: "lazada",
    icon: "🛍️",
    status: "disconnected",
    shopName: "---",
    shopId: "---",
    lastSync: "Chưa kết nối"
  }
];

export default function IntegrationsPage() {
  const [platforms, setPlatforms] = useState<PlatformDisplay[]>(DEFAULT_PLATFORMS);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformDisplay | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

  /**
   * Fetch connected channels from backend API on mount
   */
  useEffect(() => {
    async function loadChannels() {
      try {
        const res = await fetch('/api/marketplace/channels');
        const json = await res.json();
        if (json.success && Array.isArray(json.channels)) {
          setPlatforms(prev => prev.map(p => {
            const matched = json.channels.find((c: ChannelConnection) => c.platform === p.platform);
            if (matched) {
              return {
                ...p,
                status: matched.status,
                shopName: matched.shopName,
                shopId: matched.shopId,
                lastSync: matched.lastSyncAt ? new Date(matched.lastSyncAt).toLocaleTimeString('vi-VN') : p.lastSync
              };
            }
            return p;
          }));
        }
      } catch (err) {
        console.warn('Could not load dynamic channel states:', err);
      }
    }
    loadChannels();
  }, []);

  /**
   * Connect or reconfigure channel via backend API
   */
  const handleConnectChannel = async (platform: PlatformDisplay) => {
    try {
      const res = await fetch('/api/marketplace/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platform.platform,
          shopName: platform.shopName === '---' ? `Shop ${platform.name} Mall` : platform.shopName,
          shopId: `shop_${Date.now()}`
        })
      });
      const data = await res.json();
      if (data.success) {
        setPlatforms(prev => prev.map(p => p.id === platform.id ? {
          ...p,
          status: 'connected',
          shopName: data.channel.shopName,
          shopId: data.channel.shopId,
          lastSync: 'Vừa xong'
        } : p));
        setSyncStatusMessage(`Đã kết nối thành công ${platform.name}!`);
        setSelectedPlatform(null);
      }
    } catch (err) {
      console.error('Channel connect failed:', err);
    }
  };

  /**
   * AI Auto-Connect handler simulation
   */
  const handleAutoConnect = async () => {
    if (!inputValue) return;
    setIsScanning(true);
    setScanLogs([]);

    const addLog = (msg: string) => {
      setScanLogs(prev => [...prev, msg]);
    };

    addLog("Đang đọc và phân tích thông tin xác thực...");
    await new Promise(r => setTimeout(r, 600));

    addLog("Kiểm tra định dạng OAuth Token / API Key...");
    await new Promise(r => setTimeout(r, 800));

    addLog("Gửi yêu cầu xác thực tới máy chủ đối tác (RESTful OAuth)...");
    await new Promise(r => setTimeout(r, 1000));

    const detected = inputValue.toLowerCase().includes("shopee") ? "shopee" : "tiktok";
    const detectedName = detected === "shopee" ? "Shopee" : "TikTok Shop";

    addLog(`Nhận diện thành công: ${detectedName}! Đang lưu chứng thực mã hóa an toàn.`);
    await new Promise(r => setTimeout(r, 600));

    const target = platforms.find(p => p.id === detected);
    if (target) {
      await handleConnectChannel(target);
    }

    setIsScanning(false);
    setInputValue("");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Kết nối Sàn (Integrations)</h1>
        <p className={styles.subtitle}>Quản lý kết nối các gian hàng thương mại điện tử bằng AI Copilot.</p>
      </div>

      {syncStatusMessage && (
        <div style={{ background: '#064e3b', color: '#6ee7b7', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ {syncStatusMessage}</span>
          <button onClick={() => setSyncStatusMessage(null)} style={{ background: 'transparent', border: 'none', color: '#6ee7b7', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div className={styles.aiSection}>
        <div>
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>✨ AI Auto-Connect</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Dán đường link gian hàng, mã Access Token, hoặc API Key của bất kỳ sàn nào. AI sẽ tự động phân tích và cấu hình kết nối cho bạn trong vài giây.
          </p>
        </div>

        <div className={styles.aiInputWrapper}>
          <input 
            type="text" 
            className={styles.aiInput}
            placeholder="Ví dụ: shp_12345_token... hoặc link cửa hàng..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isScanning}
          />
          <button 
            className={styles.aiButton}
            onClick={handleAutoConnect}
            disabled={!inputValue || isScanning}
          >
            {isScanning ? "Đang xử lý..." : "Cấu hình tự động"}
          </button>
        </div>

        {(isScanning || scanLogs.length > 0) && (
          <div className={styles.scannerBox}>
            {scanLogs.map((log, index) => (
              <div key={index} className={styles.scanLine}>
                <span style={{ color: '#10b981' }}>{'>'}</span> {log}
              </div>
            ))}
            {isScanning && (
              <div className={styles.scanLine}>
                <span style={{ color: '#10b981' }}>{'>'}</span> <span style={{ width: '8px', height: '14px', background: '#38bdf8', display: 'inline-block' }}></span>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '20px', marginTop: '16px' }}>Các sàn hỗ trợ</h2>
      <div className={styles.grid}>
        {platforms.map(platform => (
          <div key={platform.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>{platform.icon}</div>
              <div className={styles.cardInfo}>
                <div className={styles.platformName}>{platform.name}</div>
                <div className={`${styles.platformStatus} ${
                  platform.status === 'connected' ? styles.statusConnected : styles.statusDisconnected
                }`}>
                  <span style={{ 
                    width: '8px', height: '8px', borderRadius: '50%', 
                    background: platform.status === 'connected' ? '#10b981' : '#94a3b8' 
                  }}></span>
                  {platform.status === 'connected' ? 'Đã kết nối' : 'Chưa kết nối'}
                </div>
              </div>
            </div>

            <div className={styles.cardDetails}>
              <div className={styles.cardDetailRow}>
                <span>Tên gian hàng:</span>
                <span className={styles.cardDetailValue}>{platform.shopName}</span>
              </div>
              <div className={styles.cardDetailRow}>
                <span>Đồng bộ cuối:</span>
                <span className={styles.cardDetailValue}>{platform.lastSync}</span>
              </div>
            </div>

            <div className={styles.cardActions}>
              <button 
                className={styles.btnConfigure}
                onClick={() => setSelectedPlatform(platform)}
              >
                {platform.status === 'connected' ? 'Cấu hình gian hàng' : 'Chi tiết kết nối'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Side Panel Drawer */}
      {selectedPlatform && (
        <div className={styles.drawerOverlay} onClick={() => setSelectedPlatform(null)}>
          <div className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>
                {selectedPlatform.icon} Cấu hình {selectedPlatform.name}
              </div>
              <button className={styles.closeBtn} onClick={() => setSelectedPlatform(null)}>✕</button>
            </div>
            
            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Trạng thái hiện tại</div>
              <div className={styles.detailValue} style={{ 
                color: selectedPlatform.status === 'connected' ? '#10b981' : '#f59e0b',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <span style={{ 
                  width: '10px', height: '10px', borderRadius: '50%', 
                  background: selectedPlatform.status === 'connected' ? '#10b981' : '#f59e0b' 
                }}></span>
                {selectedPlatform.status === 'connected' ? 'Hoạt động bình thường' : 'Đang chờ kết nối'}
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Thông tin cửa hàng</div>
              <div className={styles.itemRow} style={{ borderBottom: 'none', padding: '4px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tên gian hàng:</span>
                <strong>{selectedPlatform.shopName}</strong>
              </div>
              <div className={styles.itemRow} style={{ borderBottom: 'none', padding: '4px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ID Cửa hàng:</span>
                <strong>{selectedPlatform.shopId}</strong>
              </div>
            </div>

            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Tùy chọn đồng bộ RESTful API</div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>Tự động đồng bộ Tồn kho (Auto-sync)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>Đồng bộ Đơn hàng theo thời gian thực (RESTful Hook)</span>
                </label>
              </div>
            </div>
            
            <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedPlatform(null)}>Đóng</button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={() => handleConnectChannel(selectedPlatform)}
              >
                {selectedPlatform.status === 'connected' ? 'Lưu cấu hình' : 'Bắt đầu kết nối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
