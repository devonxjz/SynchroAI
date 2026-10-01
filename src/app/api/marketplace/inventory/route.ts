/**
 * Marketplace Inventory API Endpoint
 * Handles querying local inventory and pushing stock adjustments
 * to connected marketplace channels via RESTful API.
 */

import { NextResponse } from 'next/server';
import { marketplaceSyncManager } from '@/services/marketplace/sync-manager.ts';

export async function GET() {
  try {
    const inventory = marketplaceSyncManager.getInventory();
    return NextResponse.json({
      success: true,
      inventory,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { inventoryId, stock, location } = body as {
      inventoryId: string;
      stock: number;
      location?: string;
    };

    if (!inventoryId || typeof stock !== 'number') {
      return NextResponse.json(
        { success: false, error: 'inventoryId and numeric stock are required.' },
        { status: 400 }
      );
    }

    const result = await marketplaceSyncManager.updateAndPushStock(
      inventoryId,
      stock,
      location
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật và đồng bộ tồn kho thành công lên các sàn liên kết.`,
      item: result.item,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
