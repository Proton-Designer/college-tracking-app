// Per-item-type payload schemas for syllabus_extractions.extracted_payload. These are
// the model's OWN structured guess (docs/LLM_LAYER_SPEC.md §8) -- validated at write
// time by the gateway's Zod gate, and re-validated again at confirmation time in
// confirm.ts, since staging rows can be edited by the user between extraction and
// confirmation and must not be trusted blindly a second time either.

import { z } from "zod";

export const SyllabusItemType = z.enum([
  "course_info",
  "assignment",
  "exam",
  "grade_category",
  "policy",
  "office_hours",
]);
export type SyllabusItemType = z.infer<typeof SyllabusItemType>;

export const DeliverableTypeSchema = z.enum(["paper", "report", "problem_set", "exam", "project", "reading"]);

export const CourseInfoPayload = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  professorName: z.string().optional(),
  professorContact: z.string().optional(),
  term: z.string().min(1),
});

export const AssignmentPayload = z.object({
  title: z.string().min(1),
  type: DeliverableTypeSchema,
  dueDate: z.string().min(1), // ISO date, or a relative phrase requiring resolution
  isDateApproximate: z.boolean().default(false),
  estimatedMinutes: z.number().int().positive().optional(),
  gradeCategoryName: z.string().optional(),
});

export const ExamPayload = z.object({
  title: z.string().min(1),
  date: z.string().min(1),
  isDateApproximate: z.boolean().default(false),
  location: z.string().optional(),
  gradeCategoryName: z.string().optional(),
});

export const GradeCategoryPayload = z.object({
  name: z.string().min(1),
  weightPct: z.number().min(0).max(100),
  dropLowestN: z.number().int().min(0).default(0),
  expectedItemCount: z.number().int().min(0).default(0),
});

export const PolicyPayload = z.object({
  kind: z.enum(["late", "attendance", "grading", "other"]),
  text: z.string().min(1),
});

export const OfficeHoursPayload = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().optional(),
});

export const PAYLOAD_SCHEMA_BY_ITEM_TYPE: Record<SyllabusItemType, z.ZodTypeAny> = {
  course_info: CourseInfoPayload,
  assignment: AssignmentPayload,
  exam: ExamPayload,
  grade_category: GradeCategoryPayload,
  policy: PolicyPayload,
  office_hours: OfficeHoursPayload,
};

/** The whole-extraction shape the LLM gateway validates on receipt for one syllabus_extract call. */
export const ExtractedItemSchema = z.object({
  itemType: SyllabusItemType,
  payload: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  sourceSnippet: z.string().min(1),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const SyllabusExtractionResultSchema = z.object({
  items: z.array(ExtractedItemSchema),
  /** Set true by the extraction prompt when the source text looked too sparse/garbled
   *  to extract from reliably (e.g. a scanned, non-OCR'd PDF) -- surfaced to the user
   *  as "we couldn't read this file well" rather than silently returning few/no items. */
  lowQualitySourceText: z.boolean(),
});
export type SyllabusExtractionResult = z.infer<typeof SyllabusExtractionResultSchema>;
