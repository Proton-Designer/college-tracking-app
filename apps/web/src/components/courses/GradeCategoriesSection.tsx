"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { GradeCategoryRow } from "@collegeos/api";
import { Button, Input, Modal, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import {
  createGradeCategoryAction,
  deleteGradeCategoryAction,
  updateGradeCategoryAction,
} from "@/app/(app)/courses/[id]/actions";

interface CategoryFormState {
  name: string;
  weightPct: string;
  dropLowestN: string;
  expectedItemCount: string;
}

const EMPTY_FORM: CategoryFormState = { name: "", weightPct: "", dropLowestN: "0", expectedItemCount: "0" };

function fromCategory(category: GradeCategoryRow): CategoryFormState {
  return {
    name: category.name,
    weightPct: String(category.weight_pct),
    dropLowestN: String(category.drop_lowest_n),
    expectedItemCount: String(category.expected_item_count),
  };
}

export function GradeCategoriesSection({ courseId, categories }: { courseId: number; categories: GradeCategoryRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<GradeCategoryRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const weightSum = categories.reduce((sum, c) => sum + Number(c.weight_pct), 0);

  function openAdd() {
    setForm(EMPTY_FORM);
    setError(undefined);
    setAdding(true);
  }

  function openEdit(category: GradeCategoryRow) {
    setForm(fromCategory(category));
    setError(undefined);
    setEditing(category);
  }

  function close() {
    if (isPending) return;
    setAdding(false);
    setEditing(null);
  }

  function handleSubmit() {
    const weightPct = Number(form.weightPct);
    if (!form.name.trim() || form.weightPct.trim() === "" || Number.isNaN(weightPct) || weightPct < 0) {
      setError("Name and a non-negative weight are required.");
      return;
    }
    const dropLowestN = Number(form.dropLowestN) || 0;
    const expectedItemCount = Number(form.expectedItemCount) || 0;
    setError(undefined);

    startTransition(async () => {
      const result = editing
        ? await updateGradeCategoryAction(courseId, editing.id, {
            name: form.name.trim(),
            weightPct,
            dropLowestN,
            expectedItemCount,
          })
        : await createGradeCategoryAction({ courseId, name: form.name.trim(), weightPct, dropLowestN, expectedItemCount });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show(editing ? "Category updated." : "Category added.", "success");
      setAdding(false);
      setEditing(null);
      router.refresh();
    });
  }

  function handleDelete(categoryId: number) {
    setDeletingId(categoryId);
    startTransition(async () => {
      const result = await deleteGradeCategoryAction(courseId, categoryId);
      setDeletingId(null);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't delete this category.", "error");
        return;
      }
      toast.show("Category deleted.", "success");
      router.refresh();
    });
  }

  const modalOpen = adding || editing != null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Weight categories</h2>
        <span className="font-mono text-caption tabular-nums text-ink-faint">{Math.round(weightSum * 100) / 100}% of 100%</span>
      </div>
      <Panel className="flex flex-col gap-3">
        {categories.length === 0 ? (
          <p className="text-body-s text-ink-muted">No weight categories yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 border-b border-hairline pb-2 last:border-b-0 last:pb-0">
                <div className="flex flex-col">
                  <span className="text-body-s text-ink">{category.name}</span>
                  <span className="font-mono text-caption tabular-nums text-ink-faint">
                    {category.weight_pct}%
                    {category.drop_lowest_n > 0 ? ` · drop lowest ${category.drop_lowest_n}` : ""}
                    {category.expected_item_count > 0 ? ` · ${category.expected_item_count} expected` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(category)}
                    className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category.id)}
                    disabled={deletingId === category.id}
                    className="font-mono text-caption uppercase tracking-[0.08em] text-risk-critical hover:underline disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" onClick={openAdd} className="self-start">
          Add category
        </Button>
      </Panel>

      <Modal
        open={modalOpen}
        onClose={close}
        title={editing ? "Edit category" : "Add category"}
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            required
            placeholder="e.g. Homework"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Weight (%)"
            required
            type="number"
            min={0}
            value={form.weightPct}
            onChange={(e) => setForm((f) => ({ ...f, weightPct: e.target.value }))}
          />
          <Input
            label="Drop lowest N"
            type="number"
            min={0}
            value={form.dropLowestN}
            onChange={(e) => setForm((f) => ({ ...f, dropLowestN: e.target.value }))}
          />
          <Input
            label="Expected item count"
            type="number"
            min={0}
            value={form.expectedItemCount}
            onChange={(e) => setForm((f) => ({ ...f, expectedItemCount: e.target.value }))}
          />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
