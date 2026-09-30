import { BudgetLedger } from './budget.ts';
import { ModelCallCache } from './cache.ts';
import { FixtureModelProvider } from './providers/fixture-provider.ts';
import { OpenAIModelProvider } from './providers/openai-provider.ts';
import type {
  IModelProvider,
  ModelCallRequest,
  ModelCallResult,
  RuntimeContext,
} from './types.ts';
import {
  ConfigurationError,
  SchemaValidationError,
  TimeoutError,
} from './types.ts';

export interface ModelGatewayConfig {
  defaultTimeoutMs?: number;
  maxAttemptsPerStep?: number;
  worstCaseReservationUsd?: number;
  liveProvider?: IModelProvider;
  fixtureProvider?: FixtureModelProvider;
  liveApiKeyConfigured?: boolean;
}

export class ModelCallGateway {
  private budgetLedger: BudgetLedger;
  private cache: ModelCallCache;
  private fixtureProvider: FixtureModelProvider;
  private liveProvider?: IModelProvider;
  private liveApiKeyConfigured: boolean;
  private maxAttemptsPerStep: number;
  private defaultTimeoutMs: number;
  private worstCaseReservationUsd: number;

  constructor(config: ModelGatewayConfig = {}) {
    this.budgetLedger = new BudgetLedger();
    this.cache = new ModelCallCache();
    this.fixtureProvider = config.fixtureProvider ?? new FixtureModelProvider();
    
    if (config.liveProvider) {
      this.liveProvider = config.liveProvider;
      this.liveApiKeyConfigured = config.liveApiKeyConfigured ?? true;
    } else {
      const openAiProvider = new OpenAIModelProvider();
      const hasKey = Boolean(openAiProvider.getApiKey());
      this.liveProvider = openAiProvider;
      this.liveApiKeyConfigured = config.liveApiKeyConfigured ?? hasKey;
    }

    this.maxAttemptsPerStep = config.maxAttemptsPerStep ?? 2;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30000;
    this.worstCaseReservationUsd = config.worstCaseReservationUsd ?? 0.002;
  }

  public getBudgetLedger(): BudgetLedger {
    return this.budgetLedger;
  }

  public getCache(): ModelCallCache {
    return this.cache;
  }

  public setLiveProvider(provider: IModelProvider, apiKeyConfigured = true): void {
    this.liveProvider = provider;
    this.liveApiKeyConfigured = apiKeyConfigured;
  }

  public async callStructuredModel<TOutput>(
    request: ModelCallRequest<TOutput>,
    context: RuntimeContext,
    providerOverride?: IModelProvider
  ): Promise<ModelCallResult<TOutput>> {
    const startTime = Date.now();

    // 1. Check live mode prerequisites
    if (context.mode === 'live' && !this.liveApiKeyConfigured && !providerOverride) {
      throw new ConfigurationError(
        'AI_UNAVAILABLE: Khóa API live chưa được cấu hình. Vui lòng thiết lập API key hoặc tự soạn nội dung.'
      );
    }

    // 2. Budget reservation
    const reservationUsd = this.worstCaseReservationUsd;
    this.budgetLedger.requireReservation(context.tenantId, reservationUsd);

    // 3. Cache lookup
    const cached = this.cache.get(context.tenantId, request);
    if (cached) {
      this.budgetLedger.release(context.tenantId, reservationUsd);
      return cached;
    }

    // 4. Resolve provider
    let provider: IModelProvider;
    let generatedBy: 'live_provider' | 'demo_fixture' | 'fake_provider' = 'live_provider';

    if (providerOverride) {
      provider = providerOverride;
      generatedBy = 'fake_provider';
    } else if (context.mode === 'demo') {
      provider = this.fixtureProvider;
      generatedBy = 'demo_fixture';
    } else if (this.liveProvider) {
      provider = this.liveProvider;
      generatedBy = 'live_provider';
    } else {
      this.budgetLedger.release(context.tenantId, reservationUsd);
      throw new ConfigurationError('AI_UNAVAILABLE: Không tìm thấy provider phù hợp.');
    }

    // 5. Deadline and abort controller
    const timeoutMs = context.timeoutMs ?? this.defaultTimeoutMs;
    const abortController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      abortController.abort(new TimeoutError(`Request exceeded deadline of ${timeoutMs}ms`));
    }, timeoutMs);

    const mergedSignal = context.signal
      ? AbortSignal.any([context.signal, abortController.signal])
      : abortController.signal;

    let lastError: Error | null = null;
    let attemptsCount = 0;

    try {
      while (attemptsCount < this.maxAttemptsPerStep) {
        attemptsCount++;

        if (mergedSignal.aborted) {
          throw new TimeoutError(`Request exceeded deadline of ${timeoutMs}ms`);
        }

        try {
          const providerCtx: RuntimeContext = {
            ...context,
            attemptId: attemptsCount,
            signal: mergedSignal,
          };

          const response = await provider.call(request, providerCtx);

          // Validate output structure and attributes
          const validation = request.validateOutput(response.rawJson);
          if (!validation.valid) {
            lastError = new SchemaValidationError(
              `Schema validation failed: ${validation.errors.join('; ')}`,
              validation.errors
            );
            if (attemptsCount < this.maxAttemptsPerStep) {
              continue; // Retry once on validation error if attempts remain
            }
            throw lastError;
          }

          // Successful call
          clearTimeout(timeoutTimer);
          const actualCostUsd = response.usage.estimatedCostUsd;
          this.budgetLedger.commit(context.tenantId, reservationUsd, actualCostUsd);

          const result: ModelCallResult<TOutput> = {
            artifact: validation.data,
            usage: response.usage,
            providerRequestId: response.providerRequestId,
            elapsedMs: Date.now() - startTime,
            cacheHit: false,
            generatedBy,
          };

          // Cache valid output
          this.cache.set(context.tenantId, request, result);

          return result;
        } catch (err: unknown) {
          if (err instanceof SchemaValidationError) {
            throw err;
          }
          if (
            (err instanceof Error && err.name === 'AbortError') ||
            mergedSignal.aborted
          ) {
            throw new TimeoutError(`Request exceeded deadline of ${timeoutMs}ms`);
          }

          lastError = err instanceof Error ? err : new Error(String(err));
          if (attemptsCount >= this.maxAttemptsPerStep) {
            throw lastError;
          }
        }
      }

      throw lastError || new Error('Max attempts exceeded');
    } catch (err) {
      clearTimeout(timeoutTimer);
      // In case of timeout or failure, preserve reserved budget until reconciliation window
      if (!(err instanceof TimeoutError)) {
        this.budgetLedger.release(context.tenantId, reservationUsd);
      }
      throw err;
    }
  }
}
