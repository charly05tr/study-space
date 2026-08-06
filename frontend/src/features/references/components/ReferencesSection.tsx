import { useState } from 'react';
import { Button } from '../../../components/ui';
import { DetailSection } from '../../studyspaces/components/DetailSection';
import type { Reference } from '../../studyspaces/types';
import { ReferenceForm } from './ReferenceForm';
import { ReferenceRow } from './ReferenceRow';

interface ReferencesSectionProps {
  studyspaceId: number;
  /** Comes with the studyspace detail; this section never fetches it again. */
  references: Reference[];
}

/**
 * The bibliography of a studyspace.
 *
 * These are the sources you cite but do not read here — the book that is not a
 * PDF, the paper behind a paywall. A Source is a file that gets uploaded,
 * converted and annotated; a Reference is a pointer, and that is the whole
 * difference between the two lists.
 */
export const ReferencesSection = ({ studyspaceId, references }: ReferencesSectionProps) => {
  const [adding, setAdding] = useState(false);

  return (
    <DetailSection
      title="References"
      count={references.length}
      emptyMessage="No references saved yet."
      action={
        <Button variant="quiet" size="sm" onClick={() => setAdding((open) => !open)}>
          {adding ? 'Close' : 'Add reference'}
        </Button>
      }
      banner={
        adding && <ReferenceForm studyspaceId={studyspaceId} onDone={() => setAdding(false)} />
      }
    >
      <ul>
        {references.map((reference) => (
          <ReferenceRow key={reference.id} reference={reference} studyspaceId={studyspaceId} />
        ))}
      </ul>
    </DetailSection>
  );
};
