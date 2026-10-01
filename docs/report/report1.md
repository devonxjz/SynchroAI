 Chatbot Subsystem Review — Multi-Agent Readiness

  Verdict: the chatbot is NOT a multi-agent system today, and cannot become one without a routing fix. The agent layer
  (content/keywords/localization) is well built and correctly gated behind activation. But the three pieces that would make it a multi-agent
  chatbot — short-term memory, long-term memory, and RAG context — are all built, unit-tested, and then never wired into anything. The chatbot
  returns hardcoded template strings instead of model answers, so RAG retrieval, chunk citations, and memory are dead code in production. Your
  plan to embed a multi-agent system inside the chatbot is directionally right, but the foundation is disconnected; wiring it is a real task, not
  a config change.

  Current flow (verified by reading routes and running them)

  Two independent endpoints, chosen by the UI on one condition — whether the user pasted a document (page.tsx:91):

  documentText present → POST /api/chatbot/intake → RAG → ContextManager → IntakeTaskDispatcher.createDraft → static string             →
  POST /api/chatbot/intake/[id]/activate → PrepareListingOrchestrator (real multi-agent)
  no document         → POST /api/assistant/messages → runAssistant → rule-based intent → OpenAI

  The agent orchestration you want is reachable, but only through the intake+activate path. The chat path never touches it.

  Blocking findings

  1. The intake endpoint never calls a model. intake/route.ts:96-99 builds the answer with a template literal. The spec (Block 23) requires a
  Vietnamese natural-language answer with applied long-term-memory badges. So the RAG retrieval that runs at line 64 — chunking, embedding,
  cosine search — produces formattedContext and ragCitations, and then the answer is discarded. formattedContext is never read outside rag.ts
  (verified by grep). The user gets "Đã tiếp nhận và phân tích..." regardless of what their document said.

  2. Short-term memory is write-only. globalContextManager.recordTurn() is called at intake/route.ts:72,101, but getSessionBundle() is never
  called anywhere in src/ — only in the test file that defines it. I ran a two-turn conversation: after the assistant turn,
  getSessionBundle().shortTermTurns.length === 0 for the assistant conversation, because the assistant path uses a different store
  (globalConversationManager) that the context manager knows nothing about. The6-turn / 2000-token sliding window (WindowBufferHistory) is
  implemented and passes CB07, but pruning history that is never read is a no-op.

  3. Long-term memory is never written. saveMemory() appears in exactly two places in src/: its own definition, and tests/. No production code
  path ever creates a LongTermMemoryEntry. So longTermMemories in every API response is always [], and the UI's opening message hardcodes two
  fake memories (page.tsx:57-60) — default_store: "Shopee VN" and packaging_pref — that are presentational, not real data. Spec phase-3 requires
  extraction and reload of seller preferences across sessions; none of it happens.

  4. The assistant has no conversation memory and feeds none to the model. runAssistant appends the user message (agent.ts:133) but never appends
  its own reply — one appendMessage call in the whole file. And the model payload is userPayload: { userMessage, intent, toolData, userRole }
  (line 69): no history, no short-term turns, no RAG context. I confirmed the visible symptom: "Doanh thu hôm nay bao nhiêu?" → correct answer;
  "Còn bao nhiêu nữa?" in the same conversation → falls through to the generic open_qa fallback, because the model has never seenthe prior turn.
  ConversationManager.getSanitizedHistory() exists and PII-redacts for viewers, but only a test calls it.

  5. Idempotency is declared but not enforced on the intake route. IntakeApiRequest declares idempotencyKey, and the UI sends one(page.tsx:99),
  but intake/route.ts:14-23 never destructures or uses it. Two identical requests with the same key created two distinct drafts (draft_ce57… and
  draft_a0a3…) — confirmed by running the handler twice. This lets a double-tap or a retry produce duplicate drafts. /api/assistant/messages does
  this correctly (409 conflict, 429 in-flight, replayed response), so the pattern exists — it just wasn't copied.

  Retrieval and correctness issues

  6. The 0.65 similarity threshold silently drops almost all retrieval. intake/route.ts:68 overrides the spec's 0.70 with 0.65. With the
  deterministic (non-OpenAI) embedding, real product queries score below that. Running the exact intake flow: query "tạo bài đăngcho trà ô long"
  against an ingested Trà Ô Long spec → 0 results, formattedContext length 0, at both 0.65 and 0.50. Query "trà ô long" (just theproduct words)
  → 1 hit. The verb-laden phrasing the UI actually sends reliably misses. Even with a working answer generator, this produces empty context.

  7. Deterministic embeddings are not semantic. generateDeterministicVector hashes each word into1536 dims, so cosine similarity reflects only
  shared vocabulary, not meaning. CB05 passes because the test queries nearly identical words. Any paraphrase retrieves nothing. This is
  acceptable in demo mode and documented as such, but it is why #6 is invisible until you switch to real embeddings.

  8. Stale document chunks survive re-ingestion. Chunk IDs are chk_${docId}_${index+1}, so ingesting v2 overwrites v1 only at matching indices. I
  ingested v1 (3 chunks) then a1-line v2: record count stayed at 3, and retrieval returned both versions — versions: [1, 2], withstale v1 text
  still retrievable. deleteDocument() exists but is never called. Answering from superseded product specs is a data-correctness bug for sellers.

  9. RAG citations point at a 404. vector-store.ts:85 builds internalUrl: /dashboard/catalog/${documentId}#chunk-${chunkId}, but no catalog route
  exists under src/app/dashboard/ (only ai, integrations, inventory, market, orders, products, settings, tasks). Every RAG citation is a dead
  link. Also recordType: 'product' is used for what is really a document chunk.

  10. Embeddings bypass the budget gateway. Spec principle 2 requires embedding calls to be tracked through BudgetLedger. OpenAIEmbeddingProvider
  accepts a budgetLedger option, but neither rag.ts nor dispatcher.ts constructs it — so it is undefined and the reserve/commit at
  embeddings.ts:101-105 never run. Live embedding spend is untracked, which contradicts the gateway invariant everything else follows.

  11. Live embedding failure is swallowed. embeddings.ts:84-89 catches any API error and silently substitutes the deterministic hash vector. In
  live mode this means a network or auth failure produces plausible-looking but meaningless retrieval — presented as real, which violates the
  project's "no faking real data" rule.

  What is solid

  Worth saying clearly, because the foundation is good: TenantIsolatedVectorStore partitions by ${tenantId}:${mode} and filters inside the loop
  before scoring, so cross-tenant leakage is structurally prevented (CB06 verifies). IntakeTaskDispatcher gets the safety story right — role
  check, optimistic version+hash locking, idempotency-key conflict detection, already_activated replay, tenant/mode isolation (CBI08/CBI11), and
  createDraft provably makes zero model calls until activation (CBI01). The orchestrator's parallel content∥keywords phase, keyword-failure
  degradation, and waiting_approval parking all behave as designed. enforceServerTruth strips model answers that contradict server assertions.
  PII redaction for viewers is present in both memory layers.

  Suite status: npm test → 111 pass, 4 skipped (live-e2e, no OPENAI_API_KEY). typecheck clean. lint 0 errors, 9 pre-existing warnings.

  To make this a real multi-agent chatbot

  In dependency order:

  1. Decide the router. One endpoint that classifies intent server-side, rather than the UI deciding on documentText. This is theroot cause —
     every other gap follows from the split. Server-side classification also lets the assistant path reach the agent system instead of bypassing
     it.
  2. Make the answer a model call. Route formattedContext + retrieved chunks + memories into ModelCallGateway in the intake route,

  What is solid

  Worth saying clearly, because the foundation is good: TenantIsolatedVectorStore partitions by ${tenantId}:${mode} and filters
  inside the loop before scoring, so cross-tenant leakage is structurally prevented (CB06 verifies). IntakeTaskDispatcher gets the
  safety story right — role check, optimistic version+hash locking, idempotency-key conflict detection, already_activated replay,
  tenant/mode isolation (CBI08/CBI11), and createDraft provably makes zero model calls until activation (CBI01). The
  orchestrator's parallel content∥keywords phase, keyword-failure degradation, and waiting_approval parking all behave as
  designed. enforceServerTruth strips model answers that contradict server assertions. PII redaction for viewers is present in
  both memory layers.

  Suite status: npm test → 111 pass, 4 skipped (live-e2e, no OPENAI_API_KEY). typecheck clean. lint 0 errors, 9 pre-existing
  warnings.

  To make this a real multi-agent chatbot

  In dependency order:

  1. Decide the router. One endpoint that classifies intent server-side, rather than the UI deciding on documentText. This is the
     root cause — every other gap follows from the split. Server-side classification also lets the assistant path reach the agent
     system instead of bypassing it.
  2. Make the answer a model call. Route formattedContext + retrieved chunks + memories into ModelCallGateway in the intake route,
     replacing the template literal. This activates findings #1, #3, and #10 at once.
  3. Feed memory into prompts. Add assistant turns to the conversation store, and pass getSessionBundle() output into userPayload.
     Have runAssistant call getSanitizedHistory so viewer redaction applies. Closes #2 and #4.
  4. Write long-term memories on intake. Extract preferences from confirmed sessions and call saveMemory. Then delete the
     hardcoded fake memories from the UI's opening message.
  5. Enforce idempotency on the intake route — copy the pattern from the assistant route.
  6. Fix retrieval: call deleteDocument before re-ingesting a new version, drop the threshold to something the demo embeddings can
     actually clear (or default to 0.70 per spec and accept that demo retrieval is sparse), and either surface or stop swallowing
     live embedding errors.
  7. Point citations at /dashboard/products until a catalog route exists.

  Want me to start with #1 and #2 — the router plus the answer-generating model call — since they unlock the rest?