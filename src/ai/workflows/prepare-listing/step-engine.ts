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
  keywords?: (snapshot: ProductSnapshot, state: WorkflowState) => Promise<string[]>;
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
          parallelTasks.push(this.executeStep(stepName, ctx));
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
        return {
          title: `${ctx.snapshot.title} - Tối ưu Shopee`,
          description: `${ctx.snapshot.description} - Chuẩn SEO`,
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
        return ['#shopee', '#sale', '#chinhhang'];
      },
      onSuccess: (state, result: unknown) => {
        const keywords = result as string[];
        state.artifacts.keywordsId = `art_keywords_${Date.now()}`;
        state.artifacts.keywordsData = keywords;
      },
      cleanup: (state) => {
        delete state.artifacts.keywordsId;
        delete state.artifacts.keywordsData;
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

        return {
          title: baseContent.title,
          description: baseContent.description,
          hashtags: ctx.state.artifacts.keywordsData || [],
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
          ctx.state.artifacts.localizationData?.experimental
        );
        const blockingReasons: string[] = [];
        if (ctx.state.artifacts.localizationData?.needsReview) {
          blockingReasons.push('Bản dịch chứa cảnh báo hoặc thông số cần người bán duyệt lại');
        }
        if (ctx.state.artifacts.localizationData?.experimental) {
          blockingReasons.push('Ngôn ngữ mục tiêu đang ở trạng thái thử nghiệm (experimental)');
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
