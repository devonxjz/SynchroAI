import { randomUUID } from 'node:crypto';
import { InMemoryCheckpointer } from './checkpointer.ts';
import { ModelCallGateway } from '../../model-call/index.ts';
import { StepPipelineEngine, type NodeHandlers } from './step-engine.ts';
import type {
  ApprovalEvent,
  ICheckpointer,
  ProductSnapshot,
  WorkflowInput,
  WorkflowState,
} from './types.ts';

export type { NodeHandlers };

export class PrepareListingOrchestrator {
  private checkpointer: ICheckpointer;
  private engine: StepPipelineEngine;

  constructor(options?: {
    checkpointer?: ICheckpointer;
    handlers?: NodeHandlers;
    gateway?: ModelCallGateway;
  }) {
    this.checkpointer = options?.checkpointer ?? new InMemoryCheckpointer();
    const gateway = options?.gateway ?? new ModelCallGateway();
    const handlers = options?.handlers ?? {};

    this.engine = new StepPipelineEngine({
      checkpointer: this.checkpointer,
      gateway,
      handlers,
    });
  }

  public get nodeCallCounts(): Record<string, number> {
    return this.engine.nodeCallCounts;
  }

  public getCheckpointer(): ICheckpointer {
    return this.checkpointer;
  }

  public resetCounts(): void {
    this.engine.resetCounts();
  }

  private computeSelectedNodes(input: WorkflowInput): string[] {
    const nodes: string[] = ['load_snapshot', 'content'];

    if (input.intent !== 'retry_step') {
      nodes.push('keywords');
    }

    // Localization only runs if target locale differs from snapshot language AND intent is not rewrite_content
    const isDifferentLanguage = input.targetLocale.toLowerCase() !== input.productSnapshot.language.toLowerCase();
    if (isDifferentLanguage && input.intent !== 'rewrite_content') {
      nodes.push('localization');
    }

    nodes.push('assemble', 'review', 'create_proposal', 'policy');
    return nodes;
  }

  public async start(input: WorkflowInput): Promise<WorkflowState> {
    const selectedNodes = this.computeSelectedNodes(input);
    const runId = `run_${randomUUID()}`;

    const initialState: WorkflowState = {
      runId,
      eventId: input.eventId,
      workflowVersion: '1.0.0',
      tenantId: input.tenantId,
      mode: input.mode,
      intent: input.intent,
      store: input.store,
      targetLocale: input.targetLocale,
      status: 'running',
      snapshotRef: {
        id: input.productSnapshot.id,
        version: input.productSnapshot.version,
        hash: input.productSnapshot.hash,
      },
      selectedNodes,
      completedNodes: ['load_snapshot'],
      artifacts: {},
      warnings: [],
      attemptCounters: {},
      checkpointVersion: 0,
      cancelRequested: false,
    };

    await this.checkpointer.save(initialState);
    return this.engine.executePipeline(initialState, input.productSnapshot);
  }

  public async resume(runId: string, approval: ApprovalEvent): Promise<WorkflowState> {
    const state = await this.checkpointer.load(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    // Idempotency check: if already completed, do nothing and return
    if (state.status === 'completed') {
      return state;
    }

    if (state.status !== 'waiting_approval') {
      throw new Error(`Cannot resume workflow in status ${state.status}`);
    }

    if (state.artifacts.proposalId !== approval.proposalId) {
      throw new Error(
        `Proposal ID mismatch: expected ${state.artifacts.proposalId}, got ${approval.proposalId}`
      );
    }

    state.approvedBy = approval.approvedBy;
    state.approvedAt = approval.approvedAt;
    state.status = 'completed';
    state.completedNodes.push('policy_approved');

    await this.checkpointer.save(state);
    return state;
  }

  public async cancel(runId: string): Promise<WorkflowState> {
    const state = await this.checkpointer.load(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    state.cancelRequested = true;
    if (state.status === 'running' || state.status === 'queued' || state.status === 'waiting_approval') {
      state.status = 'cancelled';
    }

    await this.checkpointer.save(state);
    return state;
  }

  public async supersedeIfSnapshotChanged(
    runId: string,
    currentSnapshotVersion: number
  ): Promise<{ superseded: boolean; state: WorkflowState }> {
    const state = await this.checkpointer.load(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    if (state.snapshotRef.version !== currentSnapshotVersion) {
      state.status = 'superseded';
      state.error = `Snapshot changed from v${state.snapshotRef.version} to v${currentSnapshotVersion}`;
      await this.checkpointer.save(state);
      return { superseded: true, state };
    }

    return { superseded: false, state };
  }

  public async retryStep(
    runId: string,
    stepName: string,
    snapshot: ProductSnapshot
  ): Promise<WorkflowState> {
    const state = await this.checkpointer.load(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    this.engine.invalidateDownstream(state, stepName);
    await this.checkpointer.save(state);
    return this.engine.executePipeline(state, snapshot);
  }
}
