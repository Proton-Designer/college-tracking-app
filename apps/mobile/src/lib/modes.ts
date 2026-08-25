/**
 * The Method Modes -- BLUEPRINT 5.3's execution templates in Part VIII's vocabulary.
 * Plain words on screen; the research terms (retrieval practice, interleaving, the
 * generation effect) stay in the docs, per Part VIII's "the mechanics carry the theory".
 */
export type HourMode = "retrieval" | "interleave" | "draft" | "recite" | "compose" | "cards";

export const MODES: { value: HourMode; label: string; card: string }[] = [
  {
    value: "retrieval",
    label: "Retrieval",
    card: "Blank-page recall of the topic first. Check, fill the gaps, then answer today's due questions.",
  },
  {
    value: "interleave",
    label: "Interleave",
    card: "Worked example first if it's new, then self-solve with problem types shuffled. Say why each step works.",
  },
  {
    value: "draft",
    label: "Draft",
    card: "The milestone is the deliverable. No research during drafting.",
  },
  {
    value: "recite",
    label: "Recite",
    card: "Survey and read. Close the book, blank-page recall, then write 5–10 questions into the Bank.",
  },
  {
    value: "compose",
    label: "Compose",
    card: "Rubric on screen. One Hour or less.",
  },
  {
    value: "cards",
    label: "Cards",
    card: "Clear the due queue.",
  },
];
