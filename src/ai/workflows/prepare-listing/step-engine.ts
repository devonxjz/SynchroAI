import { generateContent } from '../../agents/content/index.ts';
import type { ContentSnapshot } from '../../agents/content/types.ts';
import { generateKeywords, type KeywordOutput } from '../../agents/keywords/index.ts';
import { localizeContent } from '../../agents/localization/index.ts';
import { ModelCallGateway } from '../../model-call/index.ts';
import type {
  AssembledArtifact,
  ContentArtifact,
  ICheckpointer,
  LocalizationArtifact,
  ProductSnapshot,
  ProposalArtifact,
  ReviewArtifact,
  WorkflowState,
} from './types.ts';

export interface NodeHandlers {
  content?: (snapshot: ProductSnapshot, state: WorkflowState) => Promise<ContentArtifact>;
  keywords?: (snapshot: ProductSnapshot, state: WorkflowState) => Promise<KeywordOutput | string[]>;
  localization?: (
    content: ContentArtifact,
    targetLocale: string,
    state: WorkflowState
  ) => Promise<LocalizationArtifact>;
  review?: (assembled: AssembledArtifact, state: WorkflowState) => Promise<ReviewArtifact>;
}

export interface StepExecutionContext {
  state: WorkflowState;
  snapshot: ProductSnapshot;
  gateway: ModelCallGateway;
  handlers: NodeHandlers;
}

export interface WorkflowStepDefinition<TResult = unknown> {
  name: string;
  isCounted?: boolean;
  execute: (ctx: StepExecutionContext) => Promise<TResult>;
  onSuccess: (state: WorkflowState, result: TResult) => void;
  cleanup?: (state: WorkflowState) => void;
}

export class StepPipelineEngine {
  private checkpointer: ICheckpointer;
  private gateway: ModelCallGateway;
  private handlers: NodeHandlers;
  public nodeCallCounts: Record<string, number> = {
    content: 0,
    keywords: 0,
    localization: 0,
    review: 0,
  };

  private readonly pipelineOrder: string[] = [
    'content',
    'keywords',
    'localization',
    'assemble',
    'review',
    'create_proposal',
    'policy',
  ];

  private readonly stepDefinitions: Map<string, WorkflowStepDefinition<unknown>> = new Map();

  constructor(options: {
    checkpointer: ICheckpointer;
    gateway: ModelCallGateway;
    handlers: NodeHandlers;
  }) {
    this.checkpointer = options.checkpointer;
    this.gateway = options.gateway;
    this.handlers = options.handlers;

    this.registerStandardSteps();
  }

  public resetCounts(): void {
    this.nodeCallCounts = {
      content: 0,
      keywords: 0,
      localization: 0,
      review: 0,
    };
  }

  public getPipelineOrder(): string[] {
    return [...this.pipelineOrder];
  }

  public async isCancelled(state: WorkflowState): Promise<boolean> {
    if (state.cancelRequested) return true;
    const persisted = await this.checkpointer.load(state.runId);
    if (persisted?.cancelRequested) {
      state.cancelRequested = true;
      state.status = 'cancelled';
      return true;
    }
    return false;
  }

  public invalidateDownstream(state: WorkflowState, stepName: string): void {
    const stepIndex = this.pipelineOrder.indexOf(stepName);
    if (stepIndex === -1) {
      throw new Error(`Unknown step ${stepName}`);
    }

    const nodesToClear = this.pipelineOrder.slice(stepIndex);
    state.completedNodes = state.completedNodes.filter((node) => !nodesToClear.includes(node));
    state.status = 'running';
    delete state.error;

    for (const nodeName of nodesToClear) {
      const def = this.stepDefinitions.get(nodeName);
      if (def?.cleanup) {
        def.cleanup(state);
      }
    }
  }

  public async executePipeline(
    state: WorkflowState,
    snapshot: ProductSnapshot
  ): Promise<WorkflowState> {
    if (await this.isCancelled(state)) {
      state.status = 'cancelled';
      await this.checkpointer.save(state);
      return state;
    }

    const ctx: StepExecutionContext = {
      state,
      snapshot,
      gateway: this.gateway,
      handlers: this.handlers,
    };

    try {
      // 1. Pha thực thi song song: Content và Keywords
      const parallelStepNames = ['content', 'keywords'];
      const parallelTasks: Promise<void>[] = [];

      for (const stepName of parallelStepNames) {
        if (state.selectedNodes.includes(stepName) && !state.completedNodes.includes(stepName)) {
          parallelTasks.push(
            this.executeStep(stepName, ctx).catch((err) => {
              if (stepName === 'keywords') {
                const errMsg = err instanceof Error ? err.message : String(err);
                state.warnings.push(`Nhánh từ khóa gặp lỗi: ${errMsg}`);
                state.artifacts.keywordsOutput = {
                  status: 'fallback',
                  errorCode: 'PROVIDER_ERROR',
                  keywords: [],
                  warnings: [`Nhánh từ khóa gặp lỗi: ${errMsg}`],
                  snapshotVersion: snapshot.version,
                  forbiddenListVersion: 'v1.0.0',
                };
                state.completedNodes.push('keywords');
                return;
              }
              throw err;
            })
          );
        }
      }

      if (parallelTasks.length > 0) {
        await Promise.all(parallelTasks);
        if (await this.isCancelled(state)) {
          state.status = 'cancelled';
          await this.checkpointer.save(state);
          return state;
        }
        await this.checkpointer.save(state);
      }

      // 2. Pha thực thi tuần tự: localization -> assemble -> review -> create_proposal -> policy
      const sequentialStepNames = [
        'localization',
        'assemble',
        'review',
        'create_proposal',
        'policy',
      ];

      for (const stepName of sequentialStepNames) {
        if (state.selectedNodes.includes(stepName) && !state.completedNodes.includes(stepName)) {
          if (await this.isCancelled(state)) {
            state.status = 'cancelled';
            await this.checkpointer.save(state);
            return state;
          }

          await this.executeStep(stepName, ctx);

          if (await this.isCancelled(state)) {
            state.status = 'cancelled';
            await this.checkpointer.save(state);
            return state;
          }

          await this.checkpointer.save(state);
        }
      }

      return state;
    } catch (err: unknown) {
      state.status = 'failed';
      state.error = err instanceof Error ? err.message : String(err);
      await this.checkpointer.save(state);
      throw err;
    }
  }

  private async executeStep(stepName: string, ctx: StepExecutionContext): Promise<void> {
    const def = this.stepDefinitions.get(stepName);
    if (!def) {
      throw new Error(`Step definition not found for: ${stepName}`);
    }

    if (def.isCounted && this.nodeCallCounts[stepName] !== undefined) {
      this.nodeCallCounts[stepName]++;
    }
    ctx.state.attemptCounters[stepName] = (ctx.state.attemptCounters[stepName] || 0) + 1;

    const result = await def.execute(ctx);

    if (await this.isCancelled(ctx.state)) {
      return;
    }

    def.onSuccess(ctx.state, result);
    ctx.state.completedNodes.push(stepName);
  }

  private registerStandardSteps(): void {
    // 1. Content step
    this.stepDefinitions.set('content', {
      name: 'content',
      isCounted: true,
      execute: async (ctx) => {
        if (ctx.handlers.content) {
          return ctx.handlers.content(ctx.snapshot, ctx.state);
        }
        const contentSnapshot: ContentSnapshot = {
          id: ctx.snapshot.id,
          version: ctx.snapshot.version,
          hash: ctx.snapshot.hash,
          title: ctx.snapshot.title,
          language: ctx.snapshot.language,
          attributes: ctx.snapshot.attributes,
        };
        const contentOutput = await generateContent(
          {
            snapshot: contentSnapshot,
            targetLocale: ctx.snapshot.language,
            manualDraft: {
              title: ctx.snapshot.title,
              description: ctx.snapshot.description,
            },
          },
          {
            tenantId: ctx.state.tenantId,
            mode: ctx.state.mode,
            runId: ctx.state.runId,
            stepId: 'content',
            attemptId: ctx.state.attemptCounters.content || 1,
            deadlineMs: Date.now() + 30000,
          },
          ctx.gateway
        );
        return {
          title: contentOutput.title,
          description: contentOutput.description,
          highlights: contentOutput.highlights,
          claims: contentOutput.claims,
          contentHash: ctx.snapshot.hash,
          sourceLocale: ctx.snapshot.language,
        };
      },
      onSuccess: (state, result: unknown) => {
        const content = result as ContentArtifact;
        state.artifacts.contentId = `art_content_${Date.now()}`;
        state.artifacts.contentData = content;
      },
      cleanup: (state) => {
        delete state.artifacts.contentId;
        delete state.artifacts.contentData;
      },
    });

    // 2. Keywords step
    this.stepDefinitions.set('keywords', {
      name: 'keywords',
      isCounted: true,
      execute: async (ctx) => {
        if (ctx.handlers.keywords) {
          return ctx.handlers.keywords(ctx.snapshot, ctx.state);
        }
        return generateKeywords(
          {
            snapshot: ctx.snapshot,
            targetLocale: ctx.state.targetLocale,
            brand: ctx.snapshot.attributes?.brand || ctx.snapshot.attributes?.Brand,
            confirmedCategory: ctx.snapshot.attributes?.category || ctx.snapshot.attributes?.Category,
            forbiddenList: { version: 'v1.0.0', terms: [] },
          },
          {
            tenantId: ctx.state.tenantId,
            mode: ctx.state.mode,
            runId: ctx.state.runId,
            stepId: 'keywords',
            attemptId: ctx.state.attemptCounters.keywords || 1,
            deadlineMs: Date.now() + 30000,
          },
          ctx.gateway
        );
      },
      onSuccess: (state, result: unknown) => {
        state.artifacts.keywordsId = `art_keywords_${Date.now()}`;
        if (result && typeof result === 'object' && 'keywords' in result) {
          const kwOutput = result as KeywordOutput;
          state.artifacts.keywordsOutput = kwOutput;
          state.artifacts.keywordsData = kwOutput.keywords.map((k) => k.phrase);
          if (kwOutput.status === 'fallback') {
            state.warnings.push(...kwOutput.warnings);
          }
        } else if (Array.isArray(result)) {
          state.artifacts.keywordsData = result as string[];
        }
      },
      cleanup: (state) => {
        delete state.artifacts.keywordsId;
        delete state.artifacts.keywordsData;
        delete state.artifacts.keywordsOutput;
      },
    });

    // 3. Localization step
    this.stepDefinitions.set('localization', {
      name: 'localization',
      isCounted: true,
      execute: async (ctx) => {
        if (!ctx.state.artifacts.contentData) {
          throw new Error('Content artifact missing for localization');
        }

        if (ctx.handlers.localization) {
          return ctx.handlers.localization(
            ctx.state.artifacts.contentData,
            ctx.state.targetLocale,
            ctx.state
          );
        }

        const facts = Object.entries(ctx.snapshot.attributes || {}).map(([k, v], idx) => ({
          id: `fact_${idx}`,
          fieldPath: k,
          value: v,
        }));

        const locOutput = await localizeContent(
          {
            sourceTitle: ctx.state.artifacts.contentData.title,
            sourceDescription: ctx.state.artifacts.contentData.description,
            sourceHighlights: ctx.state.artifacts.contentData.highlights,
            sourceClaims: ctx.state.artifacts.contentData.claims,
            sourceContentHash:
              ctx.state.artifacts.contentData.contentHash || ctx.state.snapshotRef.hash,
            sourceLocale: ctx.state.artifacts.contentData.sourceLocale || ctx.snapshot.language,
            targetLocale: ctx.state.targetLocale,
            tenantId: ctx.state.tenantId,
            productFacts: facts,
          },
          {
            tenantId: ctx.state.tenantId,
            mode: ctx.state.mode,
            runId: ctx.state.runId,
            stepId: 'localization',
            attemptId: ctx.state.attemptCounters.localization || 1,
            deadlineMs: Date.now() + 30000,
          },
          ctx.gateway
        );

        return {
          title: locOutput.title,
          description: locOutput.description,
          highlights: locOutput.highlights,
          locale: locOutput.locale,
          status: locOutput.status,
          claimMappings: locOutput.claimMappings,
          untranslatedTerms: locOutput.untranslatedTerms,
          warnings: locOutput.warnings,
          needsReview: locOutput.needsReview,
          experimental: locOutput.experimental,
          sourceContentHash: locOutput.sourceContentHash,
          glossaryVersion: locOutput.glossaryVersion,
        };
      },
      onSuccess: (state, result: unknown) => {
        const loc = result as LocalizationArtifact;
        state.artifacts.localizationId = `art_loc_${Date.now()}`;
        state.artifacts.localizationData = loc;
      },
      cleanup: (state) => {
        delete state.artifacts.localizationId;
        delete state.artifacts.localizationData;
      },
    });

    // 4. Assemble step
    this.stepDefinitions.set('assemble', {
      name: 'assemble',
      execute: async (ctx) => {
        const baseContent =
          ctx.state.artifacts.localizationData || ctx.state.artifacts.contentData;
        if (!baseContent) {
          throw new Error('No content available to assemble');
        }

        // Tách biệt ranh giới: Chỉ các từ khóa được người dùng hoặc template chủ động chọn mới vào hashtags proposal
        const selected = ctx.state.artifacts.selectedKeywords;
        const hashtags = Array.isArray(selected) && selected.length > 0 ? selected : [];

        return {
          title: baseContent.title,
          description: baseContent.description,
          hashtags,
        };
      },
      onSuccess: (state, result: unknown) => {
        const assembled = result as AssembledArtifact;
        state.artifacts.assembledId = `art_assemble_${Date.now()}`;
        state.artifacts.assembledData = assembled;
      },
      cleanup: (state) => {
        delete state.artifacts.assembledId;
        delete state.artifacts.assembledData;
      },
    });

    // 5. Review step
    this.stepDefinitions.set('review', {
      name: 'review',
      isCounted: true,
      execute: async (ctx) => {
        if (ctx.handlers.review) {
          return ctx.handlers.review(ctx.state.artifacts.assembledData!, ctx.state);
        }

        // Tôn trọng quyền quyết định của Review 08: Nếu sàn đích yêu cầu bắt buộc từ khóa mà gặp fallback
        if (
          ctx.state.store.toLowerCase().includes('strict_keywords') &&
          ctx.state.artifacts.keywordsOutput?.status === 'fallback'
        ) {
          return {
            approved: false,
            score: 50,
            issues: ['Sàn yêu cầu bắt buộc có từ khóa nhưng tác nhân từ khóa gặp sự cố'],
            blockingReasons: ['Từ khóa bắt buộc trên sàn này nhưng chưa tạo được, cần người bán nhập tay'],
          };
        }

        return { approved: true, score: 95, issues: [] };
      },
      onSuccess: (state, result: unknown) => {
        const review = result as ReviewArtifact;
        state.artifacts.reviewId = `art_review_${Date.now()}`;
        state.artifacts.reviewData = review;
      },
      cleanup: (state) => {
        delete state.artifacts.reviewId;
        delete state.artifacts.reviewData;
      },
    });

    // 6. Create proposal step
    this.stepDefinitions.set('create_proposal', {
      name: 'create_proposal',
      execute: async (ctx) => {
        const assembled = ctx.state.artifacts.assembledData!;
        const proposalId = `prop_${ctx.state.runId}_${Date.now()}`;

        const requiresHumanReview = Boolean(
          ctx.state.artifacts.localizationData?.needsReview ||
          ctx.state.artifacts.localizationData?.experimental ||
          ctx.state.artifacts.reviewData?.approved === false
        );
        const blockingReasons: string[] = [];
        if (ctx.state.artifacts.localizationData?.needsReview) {
          blockingReasons.push('Bản dịch chứa cảnh báo hoặc thông số cần người bán duyệt lại');
        }
        if (ctx.state.artifacts.localizationData?.experimental) {
          blockingReasons.push('Ngôn ngữ mục tiêu đang ở trạng thái thử nghiệm (experimental)');
        }
        if (ctx.state.artifacts.reviewData?.blockingReasons) {
          blockingReasons.push(...ctx.state.artifacts.reviewData.blockingReasons);
        }

        return {
          proposalId,
          targetStore: ctx.state.store,
          locale: ctx.state.targetLocale,
          title: assembled.title,
          description: assembled.description,
          hashtags: assembled.hashtags,
          createdAt: new Date().toISOString(),
          requiresHumanReview,
          blockingReasons: blockingReasons.length > 0 ? blockingReasons : undefined,
        };
      },
      onSuccess: (state, result: unknown) => {
        const proposal = result as ProposalArtifact;
        state.artifacts.proposalId = proposal.proposalId;
        state.artifacts.proposalData = proposal;
      },

      cleanup: (state) => {
        delete state.artifacts.proposalId;
        delete state.artifacts.proposalData;
        delete state.approvedBy;
        delete state.approvedAt;
      },
    });

    // 7. Policy step
    this.stepDefinitions.set('policy', {
      name: 'policy',
      execute: async (ctx) => {
        if (ctx.state.artifacts.proposalData?.blockingReasons) {
          ctx.state.warnings.push(...ctx.state.artifacts.proposalData.blockingReasons);
        }
        return true;
      },
      onSuccess: (state) => {
        state.status = 'waiting_approval';
      },
      cleanup: (state) => {
        delete state.approvedBy;
        delete state.approvedAt;
      },
    });
  }
}
