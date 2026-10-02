import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKeywordFacts,
  createFactLookup,
  resolveProductAttributes,
} from '../../src/ai/agents/keywords/facts.ts';
import {
  isForbiddenKeyword,
} from '../../src/ai/agents/keywords/forbidden.ts';
import {
  normalizeKeyword,
  deduplicateKeywords,
} from '../../src/ai/agents/keywords/normalizer.ts';
import {
  validateKeywordOutput,
} from '../../src/ai/agents/keywords/validator.ts';
import {
  rankAndCapKeywords,
} from '../../src/ai/agents/keywords/ranker.ts';
import {
  generateKeywords,
import { ModelCallGateway } from '../../src/ai/model-call/index.ts';

test('Facts: Tái sử dụng facts từ content và phân giải thuộc tính từ snapshot', () => {
  const snapshot = {
    id: 'prod_100',
    version: 1,
    hash: 'hash_100',
    title: 'Cà phê Robusta Đắk Lắk 250g',
    description: 'Cà phê nguyên chất rang mộc',
    language: 'vi',
    attributes: {
      brand: 'Tech Startup Coffee',
      weight: '250g',
      category: 'Cà phê bột',
    },
  };

  const resolved = resolveProductAttributes(snapshot, {
    confirmedCategory: 'Đồ uống & Cà phê',
  });

  assert.equal(resolved.brand, 'Tech Startup Coffee');
  assert.equal(resolved.confirmedCategory, 'Đồ uống & Cà phê');

  const facts = buildKeywordFacts(snapshot);
  assert.ok(facts.length >= 3);
  assert.ok(facts.some((f) => f.id === 'fact-title' && f.value.includes('Robusta')));
  assert.ok(facts.some((f) => f.id === 'fact-brand' && f.value === 'Tech Startup Coffee'));
});

test('Facts: Không tự ý nâng danh mục AI phỏng đoán thành danh mục xác nhận', () => {
  const snapshot = {
    id: 'prod_101',
    version: 1,
    hash: 'hash_101',
    title: 'Áo thun cotton trơn',
    description: 'Áo phông nam nữ thoáng mát',
    language: 'vi',
    attributes: {},
  };

  const resolved = resolveProductAttributes(snapshot);
  assert.equal(resolved.brand, undefined);
  assert.equal(resolved.confirmedCategory, undefined);
});

test('Forbidden: Nhận diện chính xác từ cấm có phiên bản và không bắt nhầm chuỗi con', () => {
  const forbiddenList = {
    version: 'v1.0.0',
    terms: ['hàng nhái', 'fake', 'trị ung thư'],
  };

  const check1 = isForbiddenKeyword('giày fake loại 1', forbiddenList);
  assert.equal(check1.isForbidden, true);
  assert.equal(check1.matchedTerm, 'fake');
  assert.equal(check1.ruleVersion, 'v1.0.0');

  const check2 = isForbiddenKeyword('cà phê đậm đà', forbiddenList);
  assert.equal(check2.isForbidden, false);
});

test('K01: Chuẩn hóa khoảng trắng, Unicode NFC và khử trùng lặp bảo toàn dấu tiếng Việt', () => {
  const phrase1 = normalizeKeyword('cà phê');
  const phrase2 = normalizeKeyword('  cà   phê  ');

  assert.equal(phrase1.display, 'cà phê');
  assert.equal(phrase2.display, 'cà phê');
  assert.equal(phrase1.lookupKey, phrase2.lookupKey);

  const items = [
    { phrase: 'cà phê', reason: 'Loại hàng', sourceRefs: ['fact-title'], basis: 'product_fact', groundingStatus: 'verified' },
    { phrase: '  cà   phê  ', reason: 'Loại hàng lặp', sourceRefs: ['fact-title'], basis: 'product_fact', groundingStatus: 'verified' },
  ];

  const deduped = deduplicateKeywords(items, 'vi');
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].phrase, 'cà phê');
});

test('T01 & K02: Bắt lỗi sai lệch số liệu khối lượng (250g thành 500g) và không có fact nguồn', () => {
  const snapshot = {
    id: 'prod_100',
    version: 1,
    hash: 'hash_100',
    title: 'Cà phê Robusta Đắk Lắk 250g',
    description: 'Cà phê nguyên chất rang mộc',
    language: 'vi',
    attributes: {
      brand: 'Tech Startup Coffee',
      weight: '250g',
    },
  };
  const facts = buildKeywordFacts(snapshot);
  const factLookup = createFactLookup(facts);

  const rawOutput = {
    keywords: [
      {
        phrase: 'cà phê 500g', // Sai số lượng: fact là 250g
        reason: 'Khối lượng gói',
        sourceRefs: ['fact-attr-weight'],
        basis: 'product_fact',
      },
      {
        phrase: 'cà phê hữu cơ', // Không có fact nguồn chứng minh hữu cơ
        reason: 'Tiêu chuẩn',
        sourceRefs: ['non-existent-fact'],
        basis: 'product_fact',
      },
      {
        phrase: 'cà phê robusta 250g', // Hợp lệ và khớp fact
        reason: 'Đúng chuẩn',
        sourceRefs: ['fact-title', 'fact-attr-weight'],
        basis: 'product_fact',
      },
    ],
  };

  const validation = validateKeywordOutput(rawOutput, {
    snapshot,
    facts,
    factLookup,
    forbiddenList: { version: 'v1', terms: [] },
  });

  assert.equal(validation.valid, true);
  // Cụm 500g và hữu cơ bị loại bỏ hoặc đánh dấu unverified, cụm đúng được verified
  const validKeywords = validation.data.keywords.filter((k) => k.groundingStatus === 'verified');
  assert.equal(validKeywords.length, 1);
  assert.equal(validKeywords[0].phrase, 'cà phê robusta 250g');
  assert.ok(validation.warnings.length >= 2);
});

test('T02 & K03: An toàn số đo, chặn metricRef khi chưa có dataset và phát hiện số đo ngầm trong reason', () => {
  const snapshot = {
    id: 'prod_100',
    version: 1,
    hash: 'hash_100',
    title: 'Cà phê Robusta Đắk Lắk 250g',
    description: 'Cà phê nguyên chất',
    language: 'vi',
    attributes: {},
  };
  const facts = buildKeywordFacts(snapshot);
  const factLookup = createFactLookup(facts);

  const rawOutput = {
    keywords: [
      {
        phrase: 'cà phê nguyên chất',
        reason: 'Có 10.000 lượt tìm kiếm mỗi tháng trên sàn', // Tuyên bố số đo ngầm
        sourceRefs: ['fact-title'],
        basis: 'product_fact',
      },
      {
        phrase: 'cà phê robusta',
        reason: 'Đúng giống cà phê',
        sourceRefs: ['fact-title'],
        basis: 'measured_dataset', // Bị từ chối vì không có dataset thật
        metricRef: 'metric_search_volume_1000',
      },
    ],
  };

  const validation = validateKeywordOutput(rawOutput, {
    snapshot,
    facts,
    factLookup,
    forbiddenList: { version: 'v1', terms: [] },
  });

  assert.equal(validation.valid, true);
  assert.ok(validation.warnings.length >= 1);
  // Không có từ khóa nào giữ metricRef giả
  for (const kw of validation.data.keywords) {
    assert.equal(kw.basis, 'product_fact');
    assert.equal(kw.metricRef, undefined);
  }
});

test('T05: Khử trùng lặp sau kiểm tra: Mục đầu sai mục sau đúng thì giữ lại mục đúng', () => {
  const items = [
    {
      phrase: 'cà phê đắk lắk',
      reason: 'Nguồn gốc',
      sourceRefs: ['invalid-fact-id'], // Mục đầu không có fact hợp lệ
      basis: 'product_fact',
      groundingStatus: 'unverified_semantic',
    },
    {
      phrase: '  cà  phê   đắk  lắk  ',
      reason: 'Nguồn gốc chuẩn',
      sourceRefs: ['fact-title'], // Mục sau có fact hợp lệ
      basis: 'product_fact',
      groundingStatus: 'verified',
    },
  ];

  // deduplicateKeywords phải ưu tiên giữ mục verified khi có trùng lặp
  const deduped = deduplicateKeywords(items, 'vi');
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].groundingStatus, 'verified');
  assert.equal(deduped[0].sourceRefs[0], 'fact-title');
});

test('T06 & K04: Lọc và khử trùng trước khi cắt tỉa tối đa 10 mục, không bù thêm số lượng', () => {
  const items = [];
  // Tạo 30 items verified và 20 items unverified
  for (let i = 1; i <= 30; i++) {
    items.push({
      phrase: `từ khóa hợp lệ số ${i}`,
      reason: `Lý do ${i}`,
      sourceRefs: ['fact-title'],
      basis: 'product_fact',
      groundingStatus: 'verified',
    });
  }

  const capped = rankAndCapKeywords(items, { maxItems: 10 });
  assert.equal(capped.length, 10);
  assert.equal(capped[0].phrase, 'từ khóa hợp lệ số 1');
  assert.equal(capped[9].phrase, 'từ khóa hợp lệ số 10');

  // Trường hợp chỉ có 4 mục hợp lệ, không tự bù thêm
  const smallList = items.slice(0, 4);
  const smallCapped = rankAndCapKeywords(smallList, { maxItems: 10 });
  assert.equal(smallCapped.length, 4);
});

test('T04: Vô hiệu hóa cache khi đổi version danh sách từ cấm từ v1 lên v2', async () => {
  const gateway = new ModelCallGateway();
  let modelCallCount = 0;

  const mockProvider = {
    call: async () => {
      modelCallCount++;
      return {
        rawJson: {
          keywords: [
            {
              phrase: 'cà phê đắk lắk',
              reason: 'Địa danh',
              sourceRefs: ['fact-title'],
              basis: 'product_fact',
            },
          ],
        },
        usage: { inputTokens: 50, outputTokens: 20, estimatedCostUsd: 0 },
        providerRequestId: `req_${modelCallCount}`,
      };
    },
  };

  const snapshot = {
    id: 'prod_cache_1',
    version: 1,
    hash: 'hash_c1',
    title: 'Cà phê Đắk Lắk',
    description: 'Nguyên chất',
    language: 'vi',
    attributes: {},
  };

  const context = {
    tenantId: 'tenant_test',
    runId: 'run_c1',
    mode: 'live',
  };

  // Lần 1: Gọi với forbiddenList v1.0.0
  const res1 = await generateKeywords(
    {
      snapshot,
      targetLocale: 'vi',
      forbiddenList: { version: 'v1.0.0', terms: [] },
    },
    context,
    gateway,
    mockProvider
  );
  assert.equal(res1.status, 'completed');
  assert.equal(modelCallCount, 1);

  // Lần 2: Cùng snapshot nhưng đổi version danh sách cấm lên v2.0.0 -> BẮT BUỘC cache miss
  const res2 = await generateKeywords(
    {
      snapshot,
      targetLocale: 'vi',
      forbiddenList: { version: 'v2.0.0', terms: ['cà phê đắk lắk'] },
    },
    context,
    gateway,
    mockProvider
  );
  assert.equal(res2.status, 'completed');
  assert.equal(modelCallCount, 2); // Chứng minh gọi mới, không dùng cache cũ
  assert.equal(res2.keywords.length, 0); // Từ khóa bị cấm bởi v2
});

test('K05: Hỗ trợ locale tiếng Thái (th) bảo toàn thương hiệu và SKU', async () => {
  const gateway = new ModelCallGateway();
  const mockProvider = {
    call: async () => {
      return {
        rawJson: {
          keywords: [
            {
              phrase: 'กาแฟ Tech Startup Coffee SKU-100',
              reason: 'กาแฟคุณภาพสูง',
              sourceRefs: ['fact-brand'],
              basis: 'product_fact',
            },
          ],
        },
        usage: { inputTokens: 50, outputTokens: 20, estimatedCostUsd: 0 },
        providerRequestId: 'req_th',
      };
    },
  };

  const snapshot = {
    id: 'prod_th_1',
    version: 1,
    hash: 'hash_th1',
    title: 'Cà phê',
    description: 'Cà phê thơm ngon',
    language: 'vi',
    attributes: {
      brand: 'Tech Startup Coffee',
      sku: 'SKU-100',
    },
  };

  const res = await generateKeywords(
    {
      snapshot,
      targetLocale: 'th',
      brand: 'Tech Startup Coffee',
      forbiddenList: { version: 'v1', terms: [] },
    },
    { tenantId: 'tenant_th', runId: 'run_th', mode: 'live' },
    gateway,
    mockProvider
  );

  assert.equal(res.status, 'completed');
  assert.ok(res.keywords.length > 0);
  assert.ok(res.keywords[0].phrase.includes('Tech Startup Coffee'));
  assert.ok(res.keywords[0].phrase.includes('SKU-100'));
});

test('Fallback: Lỗi timeout từ provider trả về kết quả có cấu trúc và warning', async () => {
  const gateway = new ModelCallGateway();
  const failingProvider = {
    call: async () => {
      const err = new Error('Gateway timeout after 5000ms');
      err.name = 'TimeoutError';
      throw err;
    },
  };

  const snapshot = {
    id: 'prod_fail_1',
    version: 1,
    hash: 'hash_f1',
    title: 'Sản phẩm lỗi',
    description: 'Mô tả',
    language: 'vi',
    attributes: {},
  };

  const res = await generateKeywords(
    {
      snapshot,
      targetLocale: 'vi',
      forbiddenList: { version: 'v1', terms: [] },
    },
    { tenantId: 'tenant_fail', runId: 'run_f', mode: 'live' },
    gateway,
    failingProvider
  );

  assert.equal(res.status, 'fallback');
  assert.equal(res.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(res.keywords.length, 0);
  assert.ok(res.warnings.some((w) => w.includes('người bán có thể nhập tay')));
});

test('T10: Chế độ demo gọi qua cổng gateway thật với FixtureModelProvider trả về schema hợp lệ', async () => {
  const gateway = new ModelCallGateway(); // Mặc định mode demo dùng FixtureModelProvider
  const snapshot = {
    id: 'prod_demo_1',
    version: 1,
    hash: 'hash_d1',
    title: 'Cà phê Demo Phin Đắk Lắk',
    description: 'Hương vị truyền thống',
    language: 'vi',
    attributes: {
      brand: 'Tech Startup Coffee',
    },
  };

  const res = await generateKeywords(
    {
      snapshot,
      targetLocale: 'vi',
      brand: 'Tech Startup Coffee',
      forbiddenList: { version: 'v1', terms: [] },
    },
    { tenantId: 'tenant_demo', runId: 'run_d', mode: 'demo' },
    gateway
  );

  assert.equal(res.status, 'completed');
  assert.ok(res.keywords.length > 0);
  assert.ok(res.keywords[0].sourceRefs.length > 0);
  assert.equal(res.keywords[0].basis, 'product_fact');
});
