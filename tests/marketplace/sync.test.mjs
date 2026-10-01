/**
 * Marketplace Sync Test Suite
 * Validates FakeStore RESTful API integration, order synchronization,
 * idempotency deduplication lock, and safe non-negative inventory deductions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FakeStoreApiClient } from '../../src/services/marketplace/fakestore-client.ts';
import { MarketplaceSyncManager } from '../../src/services/marketplace/sync-manager.ts';

describe('Marketplace Sync & FakeStore RESTful API Integration', () => {
  it('FakeStore Client: fetches products and fallback data reliably', async () => {
    const client = new FakeStoreApiClient();
    const products = await client.fetchProducts(3);

    assert.ok(Array.isArray(products), 'Products must be an array');
    assert.ok(products.length > 0, 'Products array must not be empty');
    assert.ok(typeof products[0].id === 'number', 'Product must contain numeric id');
    assert.ok(typeof products[0].title === 'string', 'Product must contain title');
    assert.ok(typeof products[0].price === 'number', 'Product must contain price');
  });

  it('FakeStore Client: fetches carts and users properly', async () => {
    const client = new FakeStoreApiClient();
    const carts = await client.fetchCarts(2);

    assert.ok(Array.isArray(carts), 'Carts must be an array');
    assert.ok(carts.length > 0, 'Carts array must not be empty');
    assert.ok(Array.isArray(carts[0].products), 'Cart must contain products array');

    const user = await client.fetchUser(1);
    assert.ok(user !== null, 'User object must be returned');
    assert.ok(user.name && user.name.firstname, 'User must have name details');
  });

  it('Sync Manager: connects marketplace channel and stores credentials', () => {
    const manager = new MarketplaceSyncManager();
    const channel = manager.connectChannel(
      'shopee',
      'Test Shopee Store VN',
      'shp_test_123',
      { accessToken: 'shp_oauth_tok_abc', refreshToken: 'shp_refresh_tok_xyz' }
    );

    assert.equal(channel.platform, 'shopee');
    assert.equal(channel.shopName, 'Test Shopee Store VN');
    assert.equal(channel.status, 'connected');
    assert.equal(channel.accessToken, 'shp_oauth_tok_abc');
    assert.ok(channel.tokenExpiresAt > Date.now(), 'Token expiry must be in the future');
  });

  it('Sync Manager: safely deducts inventory without allowing negative stock', () => {
    const manager = new MarketplaceSyncManager();
    const initialItem = manager.getInventory().find((i) => i.productId === 1);
    assert.ok(initialItem, 'Product 1 must exist in initial inventory');
    const startStock = initialItem.stock;

    // Deduct standard quantity
    const orderId1 = 'TEST-ORD-SAFE-01';
    const success1 = manager.deductInventorySafely(orderId1, [{ productId: 1, quantity: 5 }]);
    assert.equal(success1, true, 'First deduction should succeed');
    assert.equal(initialItem.stock, startStock - 5, 'Stock should decrease by 5');

    // Attempt to deduct massive quantity exceeding current stock
    const orderId2 = 'TEST-ORD-EXCESS-02';
    const success2 = manager.deductInventorySafely(orderId2, [{ productId: 1, quantity: 999999 }]);
    assert.equal(success2, true, 'Deduction with excess quantity succeeds with clamp');
    assert.equal(initialItem.stock, 0, 'Stock must never fall below zero');
    assert.equal(initialItem.status, 'danger', 'Zero stock must receive danger status badge');
  });

  it('Sync Manager: idempotency lock prevents duplicate order processing and double-deduction', () => {
    const manager = new MarketplaceSyncManager();
    const initialItem = manager.getInventory().find((i) => i.productId === 2);
    assert.ok(initialItem, 'Product 2 must exist in initial inventory');
    const startStock = initialItem.stock;

    const duplicateOrderId = 'WEBHOOK-DUPLICATE-ORDER-999';

    // First arrival of order event
    const firstResult = manager.deductInventorySafely(duplicateOrderId, [{ productId: 2, quantity: 4 }]);
    assert.equal(firstResult, true, 'First processing must succeed');
    assert.equal(initialItem.stock, startStock - 4, 'Stock should be deducted once');

    // Duplicate webhook event with identical order ID
    const duplicateResult = manager.deductInventorySafely(duplicateOrderId, [{ productId: 2, quantity: 4 }]);
    assert.equal(duplicateResult, false, 'Duplicate processing must be rejected by idempotency lock');
    assert.equal(initialItem.stock, startStock - 4, 'Stock must NOT be deducted again');
  });

  it('Sync Manager: syncs orders from FakeStore RESTful API and deducts stock', async () => {
    const manager = new MarketplaceSyncManager();
    const syncResult = await manager.syncOrdersFromMarketplace();

    assert.equal(syncResult.success, true, 'Sync result must succeed');
    assert.ok(syncResult.orders.length > 0, 'Synced orders list should not be empty');
    assert.ok(syncResult.syncedOrdersCount >= 1, 'At least 1 order must be synced');

    // Re-running sync immediately should trigger deduplication lock
    const repeatResult = await manager.syncOrdersFromMarketplace();
    assert.equal(repeatResult.success, true);
    assert.ok(repeatResult.deduplicatedOrdersCount >= 1, 'Subsequent sync should mark orders as deduplicated');
  });

  it('Sync Manager: updates local stock and pushes to remote marketplace', async () => {
    const manager = new MarketplaceSyncManager();
    const item = manager.getInventory()[0];

    const updateResult = await manager.updateAndPushStock(item.id, 75, 'Warehouse C - Shelf 9');
    assert.equal(updateResult.success, true);
    assert.equal(updateResult.item?.stock, 75);
    assert.equal(updateResult.item?.location, 'Warehouse C - Shelf 9');
    assert.equal(updateResult.item?.status, 'good');
  });
});
