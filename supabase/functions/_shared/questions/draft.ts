// Question drafting from pasted notes -- BLUEPRINT 5.4's second source, and the Part X
// exception ("AI answering your coursework" is banned; question DRAFTING is the one
// carve-out, and you edit every card). Accordingly this module returns PROPOSALS and
// stores nothing: every accepted card goes through the ordinary createQuestion path,
// individually, after the user has touched it. There is no staging table because there
// is no bypass to guard -- an unaccepted draft simply evaporates.

import { z } from "zod";
import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";

const DRAFT_MODEL = "claude-haiku-4-5" as const;
const DRAFT_MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You draft retrieval-practice questions from a student's pasted
course notes. Write questions that demand recall of the material's substance -- concepts,
definitions, relationships, worked-problem steps -- never trivia about the notes
themselves. Prefer "why" and "how" over "what is". For each question: a clear prompt, a
complete answer grounded in the notes, a short topic tag, and sourceHint -- the section
heading, page, or slide reference IF the notes contain one (null otherwise; never invent
a location). 5 to 15 questions depending on how much material there is. If the text is
too thin to draft from, return an empty list with tooThin true.`;

export const DraftedQuestionSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1),
  topic: z.string().min(1),
  sourceHint: z.string().nullable(),
});

export const DraftResultSchema = z.object({
  questions: z.array(DraftedQuestionSchema),
  tooThin: z.boolean(),
});

export type DraftResult = z.infer<typeof DraftResultSchema>;

// The wire schema states the full shape -- the extraction key-name lesson (commit
// 60e3703) applied from the start: the contract lives here, not in the prompt's vibes.
const DRAFT_TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string", minLength: 1 },
          answer: { type: "string", minLength: 1 },
          topic: { type: "string", minLength: 1 },
          sourceHint: { type: ["string", "null"] },
        },
        required: ["prompt", "answer", "topic", "sourceHint"],
        additionalProperties: false,
      },
    },
    tooThin: { type: "boolean" },
  },
  required: ["questions", "tooThin"],
  additionalProperties: false,
};

export type DraftQuestionsResult =
  | { kind: "drafted"; questions: DraftResult["questions"] }
  | { kind: "tooThin" }
  | { kind: "budgetExceeded" }
  | { kind: "draftFailed"; reason: string };

export async function draftQuestions(
  gatewayDeps: GatewayDeps,
  input: { userId: string; budgetCeilingUsd: number; notesText: string },
): Promise<DraftQuestionsResult> {
  const result = await callLlm(gatewayDeps, {
    userId: input.userId,
    callType: "question_drafting",
    model: DRAFT_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    userContent: input.notesText,
    toolName: "emit_drafted_questions",
    toolInputSchema: DRAFT_TOOL_SCHEMA,
    maxTokens: DRAFT_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: DraftResultSchema,
    estimatedInputTokens: Math.ceil(input.notesText.length / 4),
  });

  if (result.kind === "budgetExceeded") return { kind: "budgetExceeded" };
  if (result.kind === "deterministicFallback") return { kind: "draftFailed", reason: result.reason };
  if (result.data.tooThin || result.data.questions.length === 0) return { kind: "tooThin" };
  return { kind: "drafted", questions: result.data.questions };
}
