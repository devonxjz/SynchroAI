import type { ServerContext, Citation } from '../types.ts';

export interface ReadToolResult<T> {
  data: T;
  citations: Citation[];
}

// In-memory demo store
export const demoStore = {
  products: [
    {
      id: 'prod_tea_01',
      tenantId: 'tenant_vietnam',
      title: 'Trà Ô Long Cao Cấp 500g',
      sku: 'TEA-OL-01',
      version: 1,
      attributes: { origin: 'Lâm Đồng', weight: '500g' },
      status: 'ready',
    },
    {
      id: 'prod_coffee_01',
      tenantId: 'tenant_vietnam',
      title: 'Cà phê Rang Xay Robusta 250g',
      sku: 'CF-ROB-01',
      version: 1,
      attributes: { origin: 'Đắk Lắk', weight: '250g', brand: 'Startup Coffee' },
      status: 'published',
    },
  ],
  listings: [
    {
      id: 'list_tea_shopee',
      tenantId: 'tenant_vietnam',
      productId: 'prod_tea_01',
      store: 'Shopee VN',
      status: 'queued', // Still queued!
      version: 1,
      title: 'Trà Ô Long Cao Cấp 500g',
    },
    {
      id: 'list_coffee_shopee',
      tenantId: 'tenant_vietnam',
      productId: 'prod_coffee_01',
      store: 'Shopee VN',
      status: 'confirmed',
      version: 1,
      title: 'Cà phê Rang Xay Robusta 250g',
    },
  ],
  orders: [
    {
      id: 'ord_1001',
      tenantId: 'tenant_vietnam',
      customerName: 'Nguyễn Văn A',
      customerPhone: '0901234567',
      shippingAddress: '123 Lê Lợi, Quận 1, TP.HCM',
      status: 'confirmed' as const,
      amount: 250000,
      currency: 'VND',
      hasIssue: true,
      issueDescription: 'Khách hàng yêu cầu giao trước 17h.',
      createdAt: '2026-09-30T08:00:00.000Z',
    },
    {
      id: 'ord_1002',
      tenantId: 'tenant_vietnam',
      customerName: 'Trần Thị B',
      customerPhone: '0987654321',
      shippingAddress: '456 Nguyễn Huệ, Quận 1, TP.HCM',
      status: 'completed' as const,
      amount: 150000,
      currency: 'VND',
      hasIssue: false,
      createdAt: '2026-09-30T09:00:00.000Z',
    },
    {
      id: 'ord_bkk_01',
      tenantId: 'tenant_vietnam',
      customerName: 'Somchai Prasert',
      customerPhone: '0812345678',
      shippingAddress: 'Sukhumvit Soi 11, Bangkok',
      status: 'confirmed' as const,
      amount: 450,
      currency: 'THB',
      hasIssue: false,
      createdAt: '2026-09-30T10:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task_tea_brand',
      tenantId: 'tenant_vietnam',
      title: 'Shopee từ chối bài đăng: Trà Ô Long Cao Cấp 500g',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 3600000).toISOString(),
    },
    {
      id: 'task_sync_stock',
      tenantId: 'tenant_vietnam',
      title: 'Đồng bộ tồn kho Cà phê Rang Xay',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    },
  ],
  inventory: [
    {
      variantId: 'TEA-OL-01-V1',
      tenantId: 'tenant_vietnam',
      available: 150,
      reserved: 20,
      desired: 130,
    },
    {
      variantId: 'CF-ROB-01-V1',
      tenantId: 'tenant_vietnam',
      available: 50,
      reserved: 10,
      desired: 40,
    },
  ],
};

export function searchCatalogOrTasks(
  context: ServerContext,
  params: { query: string; limit?: number }
): ReadToolResult<Array<{ id: string; type: string; title: string; internalUrl: string }>> {
  const q = params.query.toLowerCase().trim();
  const limit = Math.min(params.limit || 5, 5);
  const results: Array<{ id: string; type: string; title: string; internalUrl: string }> = [];
  const citations: Citation[] = [];

  // Search products
  for (const prod of demoStore.products) {
    if (prod.tenantId === context.tenantId && prod.title.toLowerCase().includes(q)) {
      results.push({
        id: prod.id,
        type: 'product',
        title: prod.title,
        internalUrl: `/dashboard/products/${prod.id}`,
      });
      citations.push({
        recordType: 'product',
        recordId: prod.id,
        version: prod.version,
        internalUrl: `/dashboard/products/${prod.id}`,
        title: prod.title,
      });
    }
  }

  // Search listings
  for (const list of demoStore.listings) {
    if (list.tenantId === context.tenantId && list.title.toLowerCase().includes(q)) {
      results.push({
        id: list.id,
        type: 'listing',
        title: `${list.title} (${list.store})`,
        internalUrl: `/dashboard/listings/${list.id}`,
      });
      citations.push({
        recordType: 'listing',
        recordId: list.id,
        version: list.version,
        internalUrl: `/dashboard/listings/${list.id}`,
        title: list.title,
      });
    }
  }

  return {
    data: results.slice(0, limit),
    citations: citations.slice(0, limit),
  };
}

export function listPendingTasks(
  context: ServerContext,
  params?: { limit?: number }
): ReadToolResult<{ total: number; tasks: typeof demoStore.tasks }> {
  const limit = Math.min(params?.limit || 20, 50);
  const filtered = demoStore.tasks.filter((t) => t.tenantId === context.tenantId && t.status === 'pending');

  const citations: Citation[] = filtered.slice(0, limit).map((t) => ({
    recordType: 'task',
    recordId: t.id,
    version: 1,
    internalUrl: `/dashboard/tasks#${t.id}`,
    title: t.title,
  }));

  return {
    data: {
      total: filtered.length,
      tasks: filtered.slice(0, limit),
    },
    citations,
  };
}

export function getProductStatus(
  context: ServerContext,
  params: { productId: string }
): ReadToolResult<typeof demoStore.products[0] | null> {
  const prod = demoStore.products.find((p) => p.id === params.productId && p.tenantId === context.tenantId);
  if (!prod) {
    return { data: null, citations: [] };
  }

  return {
    data: prod,
    citations: [
      {
        recordType: 'product',
        recordId: prod.id,
        version: prod.version,
        internalUrl: `/dashboard/products/${prod.id}`,
        title: prod.title,
      },
    ],
  };
}

export function getListingStatus(
  context: ServerContext,
  params: { listingId: string }
): ReadToolResult<typeof demoStore.listings[0] | null> {
  const list = demoStore.listings.find((l) => l.id === params.listingId && l.tenantId === context.tenantId);
  if (!list) {
    return { data: null, citations: [] };
  }

  return {
    data: list,
    citations: [
      {
        recordType: 'listing',
        recordId: list.id,
        version: list.version,
        internalUrl: `/dashboard/listings/${list.id}`,
        title: list.title,
      },
    ],
  };
}

export function getOrderIssue(
  context: ServerContext,
  params: { orderId: string }
): ReadToolResult<Record<string, unknown> | null> {
  const order = demoStore.orders.find((o) => o.id === params.orderId && o.tenantId === context.tenantId);
  if (!order) {
    return { data: null, citations: [] };
  }

  const isViewer = context.role === 'viewer';
  const projected: Record<string, unknown> = {
    id: order.id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    hasIssue: order.hasIssue,
    issueDescription: order.issueDescription,
  };

  // Only Admin or Editor can see PII
  if (!isViewer) {
    projected.customerName = order.customerName;
    projected.customerPhone = order.customerPhone;
    projected.shippingAddress = order.shippingAddress;
  }

  return {
    data: projected,
    citations: [
      {
        recordType: 'order',
        recordId: order.id,
        version: 1,
        internalUrl: `/dashboard/orders/${order.id}`,
        title: `Đơn hàng #${order.id}`,
      },
    ],
  };
}

export function getInventoryStatus(
  context: ServerContext,
  params: { variantId: string }
): ReadToolResult<typeof demoStore.inventory[0] | null> {
  const inv = demoStore.inventory.find((i) => i.variantId === params.variantId && i.tenantId === context.tenantId);
  if (!inv) {
    return { data: null, citations: [] };
  }

  return {
    data: inv,
    citations: [
      {
        recordType: 'inventory',
        recordId: inv.variantId,
        version: 1,
        internalUrl: `/dashboard/inventory#${inv.variantId}`,
        title: `Tồn kho ${inv.variantId}`,
      },
    ],
  };
}
