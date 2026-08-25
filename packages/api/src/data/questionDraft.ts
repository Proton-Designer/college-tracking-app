import type { TypedSupabaseClient } from '../client/types';
import type { DataResult } from './types';
import { invokeEdgeFunction } from './invoke';

export interface DraftedQuestion {
  prompt: string;
  answer: string;
  topic: string;
  sourceHint: string | null;
}

export type DraftOutcome =
  | { kind: 'drafted'; questions: DraftedQuestion[] }
  | { kind: 'tooThin' };

/** Drafts questions from pasted notes. Returns PROPOSALS -- nothing is stored server-side;
 *  each accepted card goes through createQuestion after the user edits it (Part X). */
export async function draftQuestionsFromNotes(
  client: TypedSupabaseClient,
  notesText: string,
): Promise<DataResult<DraftOutcome>> {
  return invokeEdgeFunction<DraftOutcome>(client, 'question-draft', { notesText });
}
