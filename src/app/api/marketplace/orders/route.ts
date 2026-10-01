/**
 * Marketplace Orders API Endpoint
 * Handles fetching synced orders and triggering real-time synchronization
 * from fakestoreapi.com carts into local marketplace order records.
 */

import { NextResponse } from 'next/server';
import { marketplaceSyncManager } from '@/services/marketplace/sync-manager.ts';

export async function GET() {
  try {
    const orders = marketplaceSyncManager.getOrders();
    return NextResponse.json({
      success: true,
      orders,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}

export async function POST() {
  try {
    // Triggers RESTful API calls to fakestoreapi.com/carts & products
    const syncResult = await marketplaceSyncManager.syncOrdersFromMarketplace();

    return NextResponse.json({
      success: syncResult.success,
      message: syncResult.message,
      data: syncResult,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
