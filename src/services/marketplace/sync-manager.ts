/**
 * Marketplace Sync Manager
 * Manages marketplace channel connections, token lifecycles,
 * bi-directional order/inventory synchronization, atomic stock deduction,
 * and idempotency locks to prevent duplicate order processing.
 */

import { FakeStoreApiClient, fakeStoreClient } from './fakestore-client.ts';
import type {
  ChannelConnection,
  InventoryItem,
  MarketplaceOrder,
  MarketplacePlatform,
  OrderItem,
  SyncResult,
} from './types.ts';

export class MarketplaceSyncManager {
  private client: FakeStoreApiClient;

  // In-memory persistent state across requests for tenant
  private channels: Map<string, ChannelConnection> = new Map();
  private inventory: Map<string, InventoryItem> = new Map();
  private orders: Map<string, MarketplaceOrder> = new Map();

  // Deduplication set to enforce idempotency and avoid duplicate stock deductions
  private processedOrderIds: Set<string> = new Set();

  constructor(client: FakeStoreApiClient = fakeStoreClient) {
    this.client = client;
    this.initializeDefaultData();
  }

  /**
   * Populate default channels and initial inventory baseline
   */
  private initializeDefaultData(): void {
    // 1. Initial Marketplace Channels
    const defaultChannels: ChannelConnection[] = [
      {
        id: 'chan_shopee_01',
        platform: 'shopee',
        shopName: 'Official Shopee Mall VN',
        shopId: 'shp_893452142',
        status: 'connected',
        accessToken: 'shopee_live_access_tok_991823',
        refreshToken: 'shopee_live_refresh_tok_110294',
        tokenExpiresAt: Date.now() + 86400000 * 7,
        lastSyncAt: new Date().toISOString(),
        autoSyncStock: true,
        autoSyncOrders: true,
      },
      {
        id: 'chan_tiktok_01',
        platform: 'tiktok',
        shopName: 'Synchro TikTok Shop',
        shopId: 'tt_77192348',
        status: 'connected',
        accessToken: 'tiktok_live_access_tok_443912',
        refreshToken: 'tiktok_live_refresh_tok_223910',
        tokenExpiresAt: Date.now() + 86400000 * 14,
        lastSyncAt: new Date().toISOString(),
        autoSyncStock: true,
        autoSyncOrders: true,
      },
      {
        id: 'chan_lazada_01',
        platform: 'lazada',
        shopName: 'Lazada Flagship Store',
        shopId: 'lz_9921435',
        status: 'disconnected',
        autoSyncStock: false,
        autoSyncOrders: false,
      },
    ];

    for (const channel of defaultChannels) {
      this.channels.set(channel.id, channel);
    }

    // 2. Initial Inventory Items
    const initialInventory: InventoryItem[] = [
      {
        id: 'INV-001',
        productId: 1,
        name: 'Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops',
        sku: 'BAG-FS-01',
        category: "men's clothing",
        priceVnd: 2450000,
        stock: 50,
        status: 'good',
        platforms: ['shopee', 'tiktok'],
        lastUpdated: new Date().toISOString(),
        location: 'Warehouse A - Shelf 01',
      },
      {
        id: 'INV-002',
        productId: 2,
        name: 'Mens Casual Premium Slim Fit T-Shirts',
        sku: 'TSHIRT-SLIM-02',
        category: "men's clothing",
        priceVnd: 490000,
        stock: 120,
        status: 'good',
        platforms: ['shopee', 'tiktok'],
        lastUpdated: new Date().toISOString(),
        location: 'Warehouse A - Shelf 04',
      },
      {
        id: 'INV-003',
        productId: 3,
        name: 'Mens Cotton Jacket',
        sku: 'JACKET-COT-03',
        category: "men's clothing",
        priceVnd: 1250000,
        stock: 18,
        status: 'warning',
        platforms: ['shopee'],
        lastUpdated: new Date().toISOString(),
        location: 'Warehouse B - Shelf 02',
      },
      {
        id: 'INV-004',
        productId: 4,
        name: 'Mens Casual Slim Fit',
        sku: 'PANT-CAS-04',
        category: "men's clothing",
        priceVnd: 380000,
        stock: 0,
        status: 'danger',
        platforms: ['shopee', 'tiktok'],
        lastUpdated: new Date().toISOString(),
        location: 'Warehouse B - Shelf 05',
      },
    ];

    for (const item of initialInventory) {
      this.inventory.set(item.id, item);
    }
  }

  /**
   * Retrieve all configured channels
   */
  public getChannels(): ChannelConnection[] {
    return Array.from(this.channels.values());
  }

  /**
   * Connect or reconfigure a marketplace platform
   */
  public connectChannel(
    platform: MarketplacePlatform,
    shopName: string,
    shopId: string,
    credentials?: { accessToken?: string; refreshToken?: string }
  ): ChannelConnection {
    const existing = Array.from(this.channels.values()).find((c) => c.platform === platform);
    const id = existing?.id || `chan_${platform}_${Date.now()}`;

    const connection: ChannelConnection = {
      id,
      platform,
      shopName,
      shopId,
      status: 'connected',
      accessToken: credentials?.accessToken || `${platform}_tok_${Date.now()}`,
      refreshToken: credentials?.refreshToken || `${platform}_ref_${Date.now()}`,
      tokenExpiresAt: Date.now() + 86400000 * 30, // 30 days valid
      lastSyncAt: new Date().toISOString(),
      autoSyncStock: true,
      autoSyncOrders: true,
    };

    this.channels.set(id, connection);
    return connection;
  }

  /**
   * Retrieve all current inventory items
   */
  public getInventory(): InventoryItem[] {
    return Array.from(this.inventory.values());
  }

  /**
   * Retrieve all orders
   */
  public getOrders(): MarketplaceOrder[] {
    return Array.from(this.orders.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  /**
   * Safely deduct stock for a list of items within an order.
   * Business Logic Requirement:
   * - Enforce non-negative inventory (never allow stock < 0).
   * - Update inventory status dynamically (good | warning | danger).
   */
  public deductInventorySafely(orderId: string, items: Array<{ productId: number; quantity: number }>): boolean {
    // 1. Check idempotency: If this order was already processed, skip deduction
    if (this.processedOrderIds.has(orderId)) {
      console.info(`[SyncManager] Order ${orderId} already processed. Deduplication lock engaged.`);
      return false;
    }

    // 2. Perform atomic stock deduction with non-negative lower bound
    for (const lineItem of items) {
      // Find inventory matching productId
      const inventoryEntry = Array.from(this.inventory.values()).find(
        (inv) => inv.productId === lineItem.productId
      );

      if (inventoryEntry) {
        const previousStock = inventoryEntry.stock;
        // Non-negative lower bound
        const newStock = Math.max(0, previousStock - lineItem.quantity);
        inventoryEntry.stock = newStock;
        inventoryEntry.lastUpdated = new Date().toISOString();

        // Dynamically compute stock health status
        if (newStock > 20) {
          inventoryEntry.status = 'good';
        } else if (newStock > 0) {
          inventoryEntry.status = 'warning';
        } else {
          inventoryEntry.status = 'danger';
        }

        console.info(
          `[SyncManager] Stock deducted for SKU ${inventoryEntry.sku} (${inventoryEntry.name}): ${previousStock} -> ${newStock}`
        );
      }
    }

    // 3. Register orderId into deduplication lock
    this.processedOrderIds.add(orderId);
    return true;
  }

  /**
   * Synchronize orders by fetching carts from fakestoreapi.com RESTful API,
   * converting them into marketplace orders, and safely deducting inventory.
   */
  public async syncOrdersFromMarketplace(): Promise<SyncResult> {
    const errors: string[] = [];
    let syncedOrdersCount = 0;
    let deduplicatedOrdersCount = 0;
    const newOrdersList: MarketplaceOrder[] = [];

    try {
      // 1. Fetch real carts and products via RESTful API
      const [carts, products] = await Promise.all([
        this.client.fetchCarts(5),
        this.client.fetchProducts(10),
      ]);

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 2. Process each cart as an incoming marketplace order
      for (const cart of carts) {
        // Alternate platforms for simulation (Shopee, TikTok)
        const platform: MarketplacePlatform = cart.id % 2 === 1 ? 'shopee' : 'tiktok';
        const externalOrderId = `${platform.toUpperCase()}-CART-${cart.id}`;
        const orderKey = `ORD-${externalOrderId}`;

        // Check if already processed to satisfy Issue #4 deduplication lock requirement
        if (this.processedOrderIds.has(orderKey) || this.orders.has(orderKey)) {
          deduplicatedOrdersCount++;
          continue;
        }

        // Fetch customer profile via RESTful API
        const user = await this.client.fetchUser(cart.userId);

        // Build order line items
        let totalVnd = 0;
        const lineItems: OrderItem[] = [];

        for (const item of cart.products) {
          const prod = productMap.get(item.productId);
          const name = prod?.title || `Sản phẩm #${item.productId}`;
          // Convert USD price to VND approximation
          const unitPriceVnd = prod ? Math.round(prod.price * 25000) : 250000;
          const itemTotal = unitPriceVnd * item.quantity;
          totalVnd += itemTotal;

          lineItems.push({
            productId: item.productId,
            name,
            quantity: item.quantity,
            unitPriceVnd,
            totalVnd: itemTotal,
          });
        }

        const customerName = user ? `${user.name.firstname} ${user.name.lastname}` : `Khách hàng #${cart.userId}`;
        const shippingAddress = user
          ? `${user.address.number} ${user.address.street}, ${user.address.city}`
          : 'TP. Hồ Chí Minh, Việt Nam';

        const marketplaceOrder: MarketplaceOrder = {
          id: orderKey,
          externalOrderId,
          platform,
          date: cart.date || new Date().toISOString(),
          customerName,
          customerEmail: user?.email || `customer_${cart.userId}@synchro.vn`,
          shippingAddress,
          totalVnd,
          status: 'new',
          items: lineItems,
          processedAt: new Date().toISOString(),
        };

        // Execute atomic inventory deduction with non-negative guard
        this.deductInventorySafely(orderKey, cart.products);

        // Persist order in state
        this.orders.set(orderKey, marketplaceOrder);
        newOrdersList.push(marketplaceOrder);
        syncedOrdersCount++;
      }

      return {
        success: true,
        message: `Đồng bộ thành công ${syncedOrdersCount} đơn hàng mới (${deduplicatedOrdersCount} đơn trùng lặp đã bỏ qua)`,
        syncedOrdersCount,
        deduplicatedOrdersCount,
        updatedInventoryCount: syncedOrdersCount,
        orders: this.getOrders(),
        inventory: this.getInventory(),
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      return {
        success: false,
        message: `Lỗi đồng bộ đơn hàng: ${msg}`,
        syncedOrdersCount: 0,
        deduplicatedOrdersCount: 0,
        updatedInventoryCount: 0,
        orders: this.getOrders(),
        inventory: this.getInventory(),
        errors,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Update product stock in the local inventory and push changes to the marketplace.
   */
  public async updateAndPushStock(
    inventoryId: string,
    newStock: number,
    location?: string
  ): Promise<{ success: boolean; item?: InventoryItem; error?: string }> {
    const item = this.inventory.get(inventoryId);
    if (!item) {
      return { success: false, error: `Inventory item ${inventoryId} not found` };
    }

    // Safe non-negative constraint
    item.stock = Math.max(0, newStock);
    if (location) item.location = location;
    item.lastUpdated = new Date().toISOString();

    // Recalculate health badge
    if (item.stock > 20) {
      item.status = 'good';
    } else if (item.stock > 0) {
      item.status = 'warning';
    } else {
      item.status = 'danger';
    }

    // Push updated stock to external marketplace via RESTful API client
    try {
      await this.client.updateProductStock(item.productId, item.stock);
      console.info(`[SyncManager] Successfully pushed updated stock for ${item.sku} to marketplace`);
    } catch (err) {
      console.warn(`[SyncManager] Push stock failed for ${item.sku}:`, err);
    }

    return { success: true, item };
  }
}

// Global singleton instance to retain synchronized state across API route invocations
declare global {
  var __globalMarketplaceSyncManager: MarketplaceSyncManager | undefined;
}

export const marketplaceSyncManager =
  global.__globalMarketplaceSyncManager || (global.__globalMarketplaceSyncManager = new MarketplaceSyncManager());
