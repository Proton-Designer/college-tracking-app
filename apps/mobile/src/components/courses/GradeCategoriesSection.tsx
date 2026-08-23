import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { GradeCategoryRow } from "@collegeos/api";
import { Button, FieldError, Input, Modal, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { textStyle } from "../../design/typography";
import {
  createGradeCategoryAction,
  deleteGradeCategoryAction,
  updateGradeCategoryAction,
} from "../../lib/courseActions";

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

/** Mirrors apps/web/src/components/courses/GradeCategoriesSection.tsx exactly -- same
 *  add/edit/delete flow, same weight-sum display. */
export function GradeCategoriesSection({
  userId,
  courseId,
  categories,
  onChanged,
}: {
  userId: string;
  courseId: number;
  categories: GradeCategoryRow[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<GradeCategoryRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
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

  async function handleSubmit() {
    const weightPct = Number(form.weightPct);
    if (!form.name.trim() || form.weightPct.trim() === "" || Number.isNaN(weightPct) || weightPct < 0) {
      setError("Name and a non-negative weight are required.");
      return;
    }
    const dropLowestN = Number(form.dropLowestN) || 0;
    const expectedItemCount = Number(form.expectedItemCount) || 0;
    setError(undefined);
    setIsPending(true);

    const result = editing
      ? await updateGradeCategoryAction(userId, editing.id, { name: form.name.trim(), weightPct, dropLowestN, expectedItemCount })
      : await createGradeCategoryAction(userId, { courseId, name: form.name.trim(), weightPct, dropLowestN, expectedItemCount });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(editing ? "Category updated." : "Category added.", "success");
    setAdding(false);
    setEditing(null);
    onChanged();
  }

  async function handleDelete(categoryId: number) {
    setDeletingId(categoryId);
    const result = await deleteGradeCategoryAction(userId, categoryId);
    setDeletingId(null);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't delete this category.", "error");
      return;
    }
    toast.show("Category deleted.", "success");
    onChanged();
  }

  const modalOpen = adding || editing != null;

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={textStyle("label", color.inkMuted)}>Weight categories</Text>
        <Text style={textStyle("caption", color.inkFaint)}>{Math.round(weightSum * 100) / 100}% of 100%</Text>
      </View>
      <Panel style={{ gap: space[3] }}>
        {categories.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>No weight categories yet.</Text>
        ) : (
          <View style={{ gap: space[2] }}>
            {categories.map((category, i) => (
              <View
                key={category.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: space[3],
                  paddingBottom: i === categories.length - 1 ? 0 : space[2],
                  borderBottomWidth: i === categories.length - 1 ? 0 : 1,
                  borderBottomColor: color.hairline,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={textStyle("bodyS", color.ink)}>{category.name}</Text>
                  <Text style={textStyle("caption", color.inkFaint)}>
                    {category.weight_pct}%
                    {category.drop_lowest_n > 0 ? ` · drop lowest ${category.drop_lowest_n}` : ""}
                    {category.expected_item_count > 0 ? ` · ${category.expected_item_count} expected` : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[4] }}>
                  <Pressable onPress={() => openEdit(category)} accessibilityRole="button">
                    <Text style={textStyle("caption", color.inkFaint)}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(category.id)}
                    disabled={deletingId === category.id}
                    accessibilityRole="button"
                    style={{ opacity: deletingId === category.id ? 0.4 : 1 }}
                  >
                    <Text style={textStyle("caption", color.riskCritical)}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
        <Button variant="secondary" onPress={openAdd}>
          Add category
        </Button>
      </Panel>

      <Modal
        visible={modalOpen}
        onClose={close}
        title={editing ? "Edit category" : "Add category"}
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onPress={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onPress={handleSubmit} loading={isPending}>
              Save
            </Button>
          </>
        }
      >
        <View style={{ gap: space[4] }}>
          <Input label="Name" required placeholder="e.g. Homework" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Input
            label="Weight (%)"
            required
            keyboardType="numeric"
            value={form.weightPct}
            onChangeText={(v) => setForm((f) => ({ ...f, weightPct: v }))}
          />
          <Input
            label="Drop lowest N"
            keyboardType="numeric"
            value={form.dropLowestN}
            onChangeText={(v) => setForm((f) => ({ ...f, dropLowestN: v }))}
          />
          <Input
            label="Expected item count"
            keyboardType="numeric"
            value={form.expectedItemCount}
            onChangeText={(v) => setForm((f) => ({ ...f, expectedItemCount: v }))}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </View>
      </Modal>
    </View>
  );
}
