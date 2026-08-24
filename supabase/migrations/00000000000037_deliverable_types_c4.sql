-- Tier 2 / ruling C4: the blueprint's assessment taxonomy is absorbed into `deliverables`
-- rather than a new `assessments` table -- two due-date tables would be the "two sources of
-- truth" failure this repo guards against elsewhere. The existing enum covers paper,
-- report, problem_set, exam, project, reading; the blueprint's taxonomy (5.3) adds three.
--
-- Enum extension is the easy direction (migration 0002's stated policy: "enums are easy to
-- extend but painful to shrink or reorder"), and these are appended, never reordered.
--
-- Deliberately NOT added: any type for summarizing/highlighting/"review notes". The
-- blueprint (Part X) makes low-utility study activities unrepresentable in the schema on
-- purpose, and an enum value is representation.

alter type public.deliverable_type add value 'quiz';
alter type public.deliverable_type add value 'post';
alter type public.deliverable_type add value 'admin';

comment on type public.deliverable_type is
  'Assessment taxonomy (BLUEPRINT 5.3, ruling C4). quiz plans like a small exam; post is a '
  'recurring discussion post; admin is batched chores (forms, petitions) -- the Anti-Worry '
  'Hour''s natural cargo. Low-utility activity types (rereading, summarizing) are '
  'deliberately unrepresentable.';
