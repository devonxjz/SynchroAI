/**
 * Marketplace Integration and Synchronization Types
 * Provides unified data structures for marketplace connections,
 * products, carts, orders, and inventory sync operations.
 */

export type MarketplacePlatform = 'shopee' | 'tiktok' | 'lazada';

export interface ChannelConnection {
  id: string;
  platform: MarketplacePlatform;
  shopName: string;
  shopId: string;
  status: 'connected' | 'disconnected' | 'error';
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  lastSyncAt?: string;
  autoSyncStock: boolean;
  autoSyncOrders: boolean;
}

/**
 * Raw product structure returned by fakestoreapi.com/products
 */
export interface FakeStoreProduct {
  id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating?: {
    rate: number;
    count: number;
  };
}

/**
 * Raw cart structure returned by fakestoreapi.com/carts
 */
export interface FakeStoreCartItem {
  productId: number;
  quantity: number;
}

export interface FakeStoreCart {
  id: number;
  userId: number;
  date: string;
  products: FakeStoreCartItem[];
  __v?: number;
}

/**
 * Raw user address structure returned by fakestoreapi.com/users/:id
 */
export interface FakeStoreUser {
  id: number;
  email: string;
  username: string;
  name: {
    firstname: string;
    lastname: string;
  };
  address: {
    city: string;
    street: string;
    number: number;
    zipcode: string;
  };
  phone: string;
}

/**
 * Order line item mapped from external marketplace cart
 */
export interface OrderItem {
  productId: number;
  name: string;
  quantity: number;
  unitPriceVnd: number;
  totalVnd: number;
}

/**
 * Unified marketplace order entity
 */
export interface MarketplaceOrder {
  id: string;
  externalOrderId: string;
  platform: MarketplacePlatform;
  date: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  totalVnd: number;
  status: 'new' | 'processing' | 'completed' | 'cancelled';
  items: OrderItem[];
  notes?: string;
  processedAt?: string;
}

/**
 * Inventory product entity tracking stock and multi-platform sync
 */
export interface InventoryItem {
  id: string;
  productId: number;
  name: string;
  sku: string;
  category: string;
  priceVnd: number;
  stock: number;
  status: 'good' | 'warning' | 'danger';
  platforms: MarketplacePlatform[];
  lastUpdated: string;
  location: string;
}

/**
 * Execution result for an order/inventory sync run
 */
export interface SyncResult {
  success: boolean;
  message: string;
  syncedOrdersCount: number;
  deduplicatedOrdersCount: number;
  updatedInventoryCount: number;
  orders: MarketplaceOrder[];
  inventory: InventoryItem[];
  errors: string[];
  timestamp: string;
}
