# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Synchro — AI-native multi-marketplace commerce copilot for Vietnamese sellers (Shopee first). The README.md is the product requirements spec (Vietnamese); docs/plan/ contains per-block implementation specs. All UI copy and test names are Vietnamese. This is a frontend-only repo: Next.js App Router with in-memory demo state — no PostgreSQL/Redis/NestJS backend exists yet, despite `.env.example` listing them.

## Commands

```bash
npm run dev          # Next dev server
npm run build        # next build (output: standalone)
npm run lint         # eslint (flat config, next/core-web-vitals + TS)
npm run typecheck    # tsc --noEmit
npm test             # node --experimental-strip-types --test tests/**/*.mjs
```

Run a single test file:

```bash
node --experimental-strip-types --test tests/ai/content-agent.test.mjs
```

- Tests use `node:test` + `node:assert/strict` — no Jest/Vitest. Test files import TypeScript sources directly (`.ts` extensions) via `--experimental-strip-types`.
- `tests/ai/live-e2e.test.mjs` skips its cases unless `OPENAI_API_KEY` is set; all other tests run against fixtures (demo mode).
- CI (`.github/workflows/pipeline.yml`): lint → tsc → tests → Docker build → deploy.

## Architecture

### ModelCallGateway — the single choke point for all LLM calls

`src/ai/model-call/` is the most important module; every agent goes through it:

- **Mode selection**: `RuntimeContext.mode` is `'live'` (OpenAI) or `'demo'` (FixtureModelProvider). API routes default to `live` when `OPENAI_API_KEY` is set, overridable via the `x-mode` header. Tests pass `mode: 'demo'`.
- **Invariants enforced per call**: per-tenant budget reservation (`BudgetLedger`, default $10/tenant), cache lookup (keyed by tenant + input hash), timeout with `AbortController`, bounded retry (default 2 attempts), and `request.validateOutput()` schema validation before anything is returned. Output that fails validation is retried, then thrown as `SchemaValidationError`.
- **Never bypass the gateway** for model calls — budget, cache, validation, and demo/live routing live there. To add a provider, implement `IModelProvider` (`src/ai/model-call/types.ts`).
- The gateway returns `generatedBy: 'live_provider' | 'demo_fixture' | 'fake_provider'` — demo data must never be presented as real (product requirement).

### Agents (`src/ai/agents/`)

Domain agents: `content`, `keywords`, `localization` (generate listing copy), `exception` (classify/propose fixes for sync errors), `assistant` (chat). Pattern: pure functions taking a `ModelCallGateway` as a parameter, with their own output validators and Vietnamese system prompts. The `assistant` agent additionally does rule-based intent routing (greeting, approvals, revenue/tasks lookups) before calling the model, and `enforceServerTruth()` strips model answers that contradict citations/structured assertions.

### Prepare-listing workflow (`src/ai/workflows/prepare-listing/`)

A checkpointed, resumable step pipeline (hand-rolled LangGraph-style, no LangGraph dependency):

- `orchestrator.ts` computes selected nodes: `content` and `keywords` run **in parallel**, then `localization` (only if target locale ≠ snapshot language) → `assemble` → `review` → `create_proposal` → `policy`.
- State is saved after every step via `ICheckpointer` (in-memory by default). Supports `resume(approval)`, `cancel`, `retryStep` (invalidates downstream steps), and `supersedeIfSnapshotChanged`.
- The `policy` step parks the run in `waiting_approval` — publishing requires human approval unless automation rules say otherwise (product requirement: default is manual review).
- Keywords branch failure degrades to a fallback artifact + warning instead of killing the run.

### Chatbot intake (`src/ai/chatbot/`)

RAG pipeline: `chunker` → `embeddings` (OpenAI embeddings with its own cache) → `TenantIsolatedVectorStore` (in-memory, partitioned by `${tenantId}:${mode}`) → `rag` → `dispatcher`. The dispatcher creates intake drafts and activates them into the PrepareListingOrchestrator.

### API routes (`src/app/api/`)

Only four, all thin wrappers over the AI layer:
- `POST /api/assistant/messages` — chat; requires `idempotencyKey` (409/429 on conflict/replay via `globalIdempotencyManager`); server context (tenant, user, role, mode) comes from `x-tenant-id` / `x-user-id` / `x-user-role` / `x-mode` headers with demo defaults.
- `POST /api/chatbot/intake` — spec text → draft; `POST /api/chatbot/intake/[draftId]/activate` — draft → workflow run (optimistic locking via expected version/hash).
- `POST /api/ai/content` — content generation.

### Frontend (`src/app/dashboard/`)

Client components (`"use client"`) with CSS Modules; Vietnamese UI. Nav: Tổng quan, Việc cần duyệt, Trợ lý AI, Sản phẩm, Đơn hàng, Tồn kho, Kết nối sàn, Thị trường, Cài đặt. All data is currently in-page demo state (`demoStore`) — there is no persistence layer or auth yet.

## Key invariants (from the requirements spec)

- Multi-tenant: every read/write must respect `ServerContext.tenantId` and `role` (admin/editor/…/viewer); the AI may only propose — the server verifies permissions, rules, versions, and budget before any write or marketplace call.
- Marketplace structure: a product (sản phẩm gốc) has many listings (bài đăng) and variants (SKU); stock numbers mean "sellable quantity".
- No auto-publish without an explicit per-store automation rule; no bulk publish.
- Shopee is the only target marketplace; TikTok Shop/Lazada are future — do not surface their connect buttons as working.
- Never fake success or present fixture/demo data as live data.

## Conventions

- TypeScript strict; shared types between layers; relative imports with explicit `.ts` extensions (required by `--experimental-strip-types`).
- `@/*` path alias → `src/*`.
- Add dependencies only with user approval (per docs/plan/README): lock versions, update the lockfile.
