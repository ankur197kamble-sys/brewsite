"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCY_SYMBOL,
  formatPrice,
  type MenuCategoryView,
  type MenuItemView,
} from "@/app/lib/menu";
import { ItemDialog, type ItemDraft } from "./item-dialog";
import { ConfirmDialog } from "../confirm-dialog";

const primaryButton =
  "rounded-full bg-[#1f1a17] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40";
const ghostButton =
  "rounded-full border border-black/15 px-4 py-2 text-sm transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40";
const iconButton =
  "rounded-full border border-black/15 px-3 py-2 text-sm leading-none transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30";
const inputClass =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/40";

type PendingDelete =
  | { kind: "category"; id: number; name: string }
  | { kind: "item"; id: number; name: string };

type RequestResult = { ok: true } | { ok: false; message: string };

function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

/** "220.00" -> "220", "220.50" -> "220.50" — what belongs in a price input. */
function toPriceInput(price: string): string {
  return formatPrice(price).replace(CURRENCY_SYMBOL, "");
}

function blankDraft(categoryId: number): ItemDraft {
  return {
    id: null,
    categoryId,
    name: "",
    description: "",
    price: "",
    imageUrl: "",
    isPublished: true,
  };
}

export function MenuManager({
  categories,
}: {
  categories: MenuCategoryView[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const working = busy || isRefreshing;

  async function request(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<RequestResult> {
    setBusy(true);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          ok: false,
          message: errorMessage(payload) ?? "Something went wrong",
        };
      }

      startTransition(() => router.refresh());
      return { ok: true };
    } catch {
      return { ok: false, message: "Network error. Please try again." };
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCategory(event: FormEvent) {
    event.preventDefault();

    const name = newCategoryName.trim();
    if (!name) return;

    const result = await request("/api/menu/categories", "POST", { name });

    if (result.ok) {
      setNewCategoryName("");
      setAddingCategory(false);
      setError(null);
    } else {
      setError(result.message);
    }
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!renaming) return;

    const name = renaming.name.trim();
    if (!name) return;

    const result = await request(
      `/api/menu/categories/${renaming.id}`,
      "PATCH",
      { name },
    );

    if (result.ok) {
      setRenaming(null);
      setError(null);
    } else {
      setError(result.message);
    }
  }

  async function moveCategory(id: number, move: "up" | "down") {
    const result = await request(`/api/menu/categories/${id}`, "PATCH", {
      move,
    });
    if (!result.ok) setError(result.message);
  }

  async function moveItem(id: number, move: "up" | "down") {
    const result = await request(`/api/menu/items/${id}`, "PATCH", { move });
    if (!result.ok) setError(result.message);
  }

  async function togglePublished(item: MenuItemView) {
    const result = await request(`/api/menu/items/${item.id}`, "PATCH", {
      isPublished: !item.isPublished,
    });
    if (!result.ok) setError(result.message);
  }

  async function handleSaveItem(item: ItemDraft) {
    setDialogError(null);

    const body = {
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      isPublished: item.isPublished,
    };

    const result =
      item.id === null
        ? await request("/api/menu/items", "POST", body)
        : await request(`/api/menu/items/${item.id}`, "PATCH", body);

    if (result.ok) {
      setDraft(null);
      setError(null);
    } else {
      setDialogError(result.message);
    }
  }

  function requestDeleteCategory(category: MenuCategoryView) {
    if (category.items.length > 0) {
      setError(
        `“${category.name}” still has ${category.items.length} item${
          category.items.length === 1 ? "" : "s"
        }. Move or delete them before deleting the category.`,
      );
      return;
    }

    setError(null);
    setPendingDelete({
      kind: "category",
      id: category.id,
      name: category.name,
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    const url =
      pendingDelete.kind === "category"
        ? `/api/menu/categories/${pendingDelete.id}`
        : `/api/menu/items/${pendingDelete.id}`;

    const result = await request(url, "DELETE");

    setPendingDelete(null);
    if (!result.ok) setError(result.message);
  }

  const hasCategories = categories.length > 0;

  return (
    <>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm tracking-[0.25em] text-black/50 uppercase">
            Menu
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Menu Management
          </h1>
          <p className="mt-3 max-w-xl text-black/60">
            Changes appear on your public website as soon as you save them.
          </p>
        </div>

        {hasCategories && (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            disabled={working}
            className={primaryButton}
          >
            Add category
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      {addingCategory && (
        <form
          onSubmit={handleAddCategory}
          className="mt-8 rounded-2xl border border-black/10 bg-white/60 p-5"
        >
          <label htmlFor="new-category" className="text-sm font-medium">
            Category name
          </label>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="new-category"
              autoFocus
              maxLength={80}
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Coffee"
              className={inputClass}
            />

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={working || newCategoryName.trim().length === 0}
                className={primaryButton}
              >
                Add
              </button>

              <button
                type="button"
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategoryName("");
                }}
                className={ghostButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {!hasCategories && !addingCategory && (
        <div className="mt-10 rounded-2xl border border-dashed border-black/15 bg-white/40 p-10 text-center">
          <h2 className="text-xl font-medium">No menu items yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-black/55">
            Create a category such as “Coffee” or “Pastries”, then add your
            first item. Until then your website shows the demo menu.
          </p>

          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className={`${primaryButton} mt-6`}
          >
            Add your first category
          </button>
        </div>
      )}

      <div className="mt-10 space-y-6">
        {categories.map((category, categoryIndex) => (
          <section
            key={category.id}
            className="rounded-2xl border border-black/10 bg-white/60"
          >
            <header className="flex flex-col gap-4 border-b border-black/10 p-5 md:flex-row md:items-center md:justify-between">
              {renaming?.id === category.id ? (
                <form
                  onSubmit={handleRename}
                  className="flex flex-1 flex-col gap-3 sm:flex-row"
                >
                  <input
                    autoFocus
                    aria-label="Category name"
                    maxLength={80}
                    value={renaming.name}
                    onChange={(event) =>
                      setRenaming({ id: category.id, name: event.target.value })
                    }
                    className={inputClass}
                  />

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={working || renaming.name.trim().length === 0}
                      className={primaryButton}
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className={ghostButton}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <h2 className="text-xl font-medium">{category.name}</h2>
                    <p className="mt-1 text-sm text-black/50">
                      {category.items.length}{" "}
                      {category.items.length === 1 ? "item" : "items"}
                      {category.items.length > 0 && (
                        <>
                          {" · "}
                          {
                            category.items.filter((item) => item.isPublished)
                              .length
                          }{" "}
                          visible
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Move ${category.name} up`}
                      onClick={() => moveCategory(category.id, "up")}
                      disabled={working || categoryIndex === 0}
                      className={iconButton}
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      aria-label={`Move ${category.name} down`}
                      onClick={() => moveCategory(category.id, "down")}
                      disabled={
                        working || categoryIndex === categories.length - 1
                      }
                      className={iconButton}
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setRenaming({ id: category.id, name: category.name })
                      }
                      disabled={working}
                      className={ghostButton}
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={() => requestDeleteCategory(category)}
                      disabled={working}
                      className={ghostButton}
                    >
                      Delete
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDialogError(null);
                        setDraft(blankDraft(category.id));
                      }}
                      disabled={working}
                      className={primaryButton}
                    >
                      Add item
                    </button>
                  </div>
                </>
              )}
            </header>

            {category.items.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-black/55">
                  No items in this category yet.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setDialogError(null);
                    setDraft(blankDraft(category.id));
                  }}
                  disabled={working}
                  className={`${ghostButton} mt-4`}
                >
                  Add your first item
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-black/10">
                {category.items.map((item, itemIndex) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-medium">{item.name}</h3>

                        {!item.isPublished && (
                          <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-black/50">
                            Hidden
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="mt-1 text-sm leading-6 text-black/55">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <span className="mr-2 font-medium">
                        {formatPrice(item.price)}
                      </span>

                      <button
                        type="button"
                        aria-label={`Move ${item.name} up`}
                        onClick={() => moveItem(item.id, "up")}
                        disabled={working || itemIndex === 0}
                        className={iconButton}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        aria-label={`Move ${item.name} down`}
                        onClick={() => moveItem(item.id, "down")}
                        disabled={
                          working || itemIndex === category.items.length - 1
                        }
                        className={iconButton}
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePublished(item)}
                        disabled={working}
                        className={ghostButton}
                      >
                        {item.isPublished ? "Hide" : "Show"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDialogError(null);
                          setDraft({
                            id: item.id,
                            categoryId: item.categoryId,
                            name: item.name,
                            description: item.description ?? "",
                            price: toPriceInput(item.price),
                            imageUrl: item.imageUrl ?? "",
                            isPublished: item.isPublished,
                          });
                        }}
                        disabled={working}
                        className={ghostButton}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            kind: "item",
                            id: item.id,
                            name: item.name,
                          })
                        }
                        disabled={working}
                        className={ghostButton}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <ItemDialog
        draft={draft}
        categories={categories}
        busy={working}
        error={dialogError}
        onChange={setDraft}
        onSubmit={handleSaveItem}
        onCancel={() => {
          setDraft(null);
          setDialogError(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.kind === "category"
            ? "Delete category"
            : "Delete menu item"
        }
        message={
          pendingDelete
            ? `“${pendingDelete.name}” will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        busy={working}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
