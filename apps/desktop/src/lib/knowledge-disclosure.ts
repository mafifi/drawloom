import type { HistoryEntry } from '@drawloom/conversation-history';
import type { RecordRef } from '@drawloom/knowledge';

export interface KnowledgeDisclosurePresentation {
  readonly label: string;
  readonly notice: string;
  readonly references: readonly { ref: RecordRef; label: string; detail: string }[];
}

export function presentKnowledgeDisclosure(summary: HistoryEntry['preparation']): KnowledgeDisclosurePresentation {
  if (summary?.kind === 'ready' && summary.receipt) {
    return {
      label: `Knowledge used · ${summary.references.length}`,
      notice: 'These references accompanied this message. Open evidence to inspect the recorded revision.',
      references: summary.references.map((reference, index) => ({
        ref: reference.ref,
        label: `Evidence ${index + 1}`,
        detail: [reference.status === 'withdrawn' ? 'Withdrawn' : reference.freshness, reference.inclusion === 'reference_only' ? 'Reference only · full text was not sent' : 'Text included'].filter(Boolean).join(' · '),
      })),
    };
  }
  const notice = summary && ['unavailable', 'timeout', 'cancelled'].includes(summary.kind)
    ? 'Automatic knowledge was unavailable for this message.' : '';
  return { label: '', notice, references: [] };
}
