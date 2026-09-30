import { createHash } from 'node:crypto';
import type { ChunkerConfig, DocumentChunk, ChatbotMode } from './types.ts';

const NEGATION_PATTERNS = [
  /\bkhông\s+[\p{L}\d_\s]{1,40}/iu,
  /\bchưa\s+[\p{L}\d_\s]{1,40}/iu,
  /\bchẳng\s+[\p{L}\d_\s]{1,40}/iu,
];

export class RecursiveTextChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(config: ChunkerConfig = {}) {
    this.chunkSize = config.chunkSize ?? 500;
    this.chunkOverlap = config.chunkOverlap ?? 50;
  }

  public chunkText(
    text: string,
    options: {
      documentId: string;
      documentVersion?: number;
      tenantId: string;
      mode?: ChatbotMode;
      metadata?: Record<string, unknown>;
    }
  ): DocumentChunk[] {
    const docId = options.documentId;
    const docVersion = options.documentVersion ?? 1;
    const tenantId = options.tenantId;
    const mode = options.mode ?? 'demo';

    if (!text || text.trim().length === 0) {
      return [];
    }

    const segments = this.splitIntoSemanticSegments(text);
    const rawChunks: Array<{ text: string; startOffset: number; endOffset: number }> = [];

    let currentBuffer = '';
    let currentStart = 0;

    for (const seg of segments) {
      if (!currentBuffer) {
        currentBuffer = seg.text;
        currentStart = seg.startOffset;
        continue;
      }

      const candidate = text.slice(currentStart, seg.endOffset);
      if (candidate.length <= this.chunkSize) {
        currentBuffer = candidate;
      } else {
        // Current buffer is full. Check negation protection on boundary before closing chunk.
        const adjustedEnd = this.adjustBoundaryForNegation(text, currentStart, currentStart + currentBuffer.length);
        const chunkText = text.slice(currentStart, adjustedEnd).trimEnd();
        rawChunks.push({
          text: chunkText,
          startOffset: currentStart,
          endOffset: currentStart + chunkText.length,
        });

        // Compute next start offset with overlap
        let nextStart = adjustedEnd - this.chunkOverlap;
        if (nextStart <= currentStart) {
          nextStart = adjustedEnd;
        }

        // Align nextStart to word boundary
        while (nextStart < text.length && text[nextStart] !== ' ' && text[nextStart] !== '\n') {
          nextStart++;
        }
        if (nextStart < text.length && (text[nextStart] === ' ' || text[nextStart] === '\n')) {
          nextStart++;
        }

        if (nextStart >= text.length) {
          currentBuffer = '';
          break;
        }

        currentStart = nextStart;
        currentBuffer = text.slice(currentStart, seg.endOffset);
      }
    }

    if (currentBuffer.trim().length > 0) {
      const finalEnd = currentStart + currentBuffer.length;
      const chunkText = text.slice(currentStart, finalEnd).trimEnd();
      rawChunks.push({
        text: chunkText,
        startOffset: currentStart,
        endOffset: currentStart + chunkText.length,
      });
    }

    return rawChunks.map((chunk, index) => {
      const hash = createHash('sha256').update(chunk.text).digest('hex');
      return {
        id: `chk_${docId}_${index + 1}`,
        documentId: docId,
        documentVersion: docVersion,
        tenantId,
        mode,
        content: chunk.text,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        hash,
        metadata: options.metadata,
      };
    });
  }

  private splitIntoSemanticSegments(
    text: string
  ): Array<{ text: string; startOffset: number; endOffset: number }> {
    const segments: Array<{ text: string; startOffset: number; endOffset: number }> = [];
    const sentenceBoundaryRegex = /(\n\n+|\n+|[.!?؛;]+\s+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = sentenceBoundaryRegex.exec(text)) !== null) {
      const segEnd = match.index + match[0].length;
      const segText = text.slice(lastIndex, segEnd);
      if (segText.trim().length > 0) {
        segments.push({
          text: segText,
          startOffset: lastIndex,
          endOffset: segEnd,
        });
      }
      lastIndex = segEnd;
    }

    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex);
      if (remaining.trim().length > 0) {
        segments.push({
          text: remaining,
          startOffset: lastIndex,
          endOffset: text.length,
        });
      }
    }

    return segments;
  }

  private adjustBoundaryForNegation(text: string, start: number, proposedEnd: number): number {
    const windowSlice = text.slice(Math.max(start, proposedEnd - 60), Math.min(text.length, proposedEnd + 60));
    for (const pattern of NEGATION_PATTERNS) {
      const match = pattern.exec(windowSlice);
      if (match) {
        const matchAbsoluteStart = Math.max(start, proposedEnd - 60) + match.index;
        const matchAbsoluteEnd = matchAbsoluteStart + match[0].length;
        if (matchAbsoluteStart < proposedEnd && matchAbsoluteEnd > proposedEnd) {
          // Boundary cuts through negation phrase. Extend boundary to end of phrase.
          return Math.min(text.length, matchAbsoluteEnd);
        }
      }
    }
    return proposedEnd;
  }
}
