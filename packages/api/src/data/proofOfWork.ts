import type { TypedSupabaseClient } from '../client/types';
import type { Task } from './tasks';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

const PROOF_BUCKET = 'proof';

export type ProofOfWorkType =
  | 'confirmation_attachment'
  | 'practice_question_count'
  | 'git_commit'
  | 'summary_text'
  | 'whoop_workout';

export interface SubmitProofOfWorkInput {
  taskId: number;
  /** Must match the task's own proof_of_work_type -- a task that asked for a summary
   *  cannot be satisfied by uploading an unrelated attachment. */
  type: ProofOfWorkType;
  /** Required when type is 'confirmation_attachment'; ignored otherwise. */
  file?: Blob | ArrayBuffer | Uint8Array;
  fileName?: string;
  contentType?: string;
  /** Required for every other type -- a count (as text), a commit SHA/URL, a summary
   *  paragraph, or a workout identifier. */
  content?: string;
}

/**
 * Submits evidence for a high-stakes task (tasks.requires_proof_of_work). Attachments go
 * to the private `proof` bucket (migration 0011) at a user-id-prefixed path -- same
 * pattern as uploadSyllabus.ts, including defaulting a real content type so the bucket's
 * mime-type allowlist doesn't reject a raw byte upload the way it did there.
 *
 * This alone doesn't complete the task -- see updateTaskStatus in tasks.ts, which
 * refuses to mark a proof-requiring task 'completed' until proof_of_work_content is set.
 * Evidence and completion are separate actions on purpose: submitting proof doesn't
 * silently finish the task, and finishing the task requires the proof to already exist.
 */
export async function submitProofOfWork(
  client: TypedSupabaseClient,
  userId: string,
  input: SubmitProofOfWorkInput,
): Promise<DataResult<Task>> {
  const { data: task, error: taskError } = await client
    .from('tasks')
    .select('id, requires_proof_of_work, proof_of_work_type')
    .eq('id', input.taskId)
    .eq('user_id', userId)
    .single();
  if (taskError) return dataErr(mapDataError(taskError));
  if (!task.requires_proof_of_work) {
    return dataErr({ code: 'validation', message: 'This task does not require proof of work.' });
  }
  if (task.proof_of_work_type !== input.type) {
    return dataErr({
      code: 'validation',
      message: `This task requires "${task.proof_of_work_type}" proof, not "${input.type}".`,
    });
  }

  let content: string;
  if (input.type === 'confirmation_attachment') {
    if (input.file == null || input.fileName == null) {
      return dataErr({ code: 'validation', message: 'An attachment file is required for this proof type.' });
    }
    const storagePath = `${userId}/${input.taskId}-${Date.now()}-${input.fileName}`;
    const { error: uploadError } = await client.storage
      .from(PROOF_BUCKET)
      .upload(storagePath, input.file, { contentType: input.contentType ?? 'application/pdf' });
    if (uploadError) return dataErr({ code: 'unknown', message: uploadError.message });
    content = storagePath;
  } else {
    if (!input.content) {
      return dataErr({ code: 'validation', message: 'Proof content is required for this proof type.' });
    }
    content = input.content;
  }

  const { data, error } = await client
    .from('tasks')
    .update({ proof_of_work_content: content })
    .eq('id', input.taskId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
