/**
 * Marketplace Channels API Endpoint
 * Handles channel retrieval and OAuth connection setup for Shopee and TikTok platforms.
 */

import { NextResponse } from 'next/server';
import { marketplaceSyncManager } from '@/services/marketplace/sync-manager.ts';
import type { MarketplacePlatform } from '@/services/marketplace/types.ts';

export async function GET() {
  try {
    const channels = marketplaceSyncManager.getChannels();
    return NextResponse.json({
      success: true,
      channels,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { platform, shopName, shopId, credentials } = body as {
      platform: MarketplacePlatform;
      shopName: string;
      shopId: string;
      credentials?: { accessToken?: string; refreshToken?: string };
    };

    if (!platform || !shopName) {
      return NextResponse.json(
        { success: false, error: 'Platform and shopName are required.' },
        { status: 400 }
      );
    }

    const channel = marketplaceSyncManager.connectChannel(
      platform,
      shopName,
      shopId || `shop_${Date.now()}`,
      credentials
    );

    return NextResponse.json({
      success: true,
      message: `Đã kết nối thành công gian hàng ${shopName} trên ${platform.toUpperCase()}`,
      channel,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
