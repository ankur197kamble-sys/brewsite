"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { QrCode } from "@/app/components/qr-code";
import type { TableView } from "@/app/lib/orders";
import { ConfirmDialog } from "../confirm-dialog";

const primaryButton =
  "min-h-11 rounded-full bg-[#1f1a17] px-5 text-sm font-semibold text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40";
const ghostButton =
  "min-h-10 rounded-full border border-black/15 px-4 text-sm transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40";

function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

/** "Table 3" when tables 1 and 2 exist; "Table 1" for the first. */
function suggestLabel(tables: TableView[]): string {
  const numbers = tables.map((t) => /^Table (\d+)$/i.exec(t.label)?.[1]).filter(Boolean).map(Number);
  return `Table ${numbers.length ? Math.max(...numbers) + 1 : tables.length + 1}`;
}

type Pending = { kind: "delete" | "renew"; table: TableView } | null;

export function TablesManager({ tables, origin }: { tables: TableView[]; origin: string }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; value: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const working = busy || isRefreshing;
  const labelValue = label ?? suggestLabel(tables);

  async function request(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(errorMessage(payload) ?? "Something went wrong");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request("/api/tables", "POST", { label: labelValue })) {
      setNotice(`${labelValue} added.`);
      setLabel(null);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    const { kind, table } = pending;
    const ok =
      kind === "delete"
        ? await request(`/api/tables/${table.id}`, "DELETE")
        : await request(`/api/tables/${table.id}`, "PATCH", { newToken: true });
    setPending(null);
    if (ok) setNotice(kind === "delete" ? `${table.label} deleted.` : `${table.label} has a new QR code. Print it again.`);
  }

  const activeCount = tables.filter((table) => table.isActive).length;

  return (
    <>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm tracking-[0.25em] text-black/55 uppercase">Ordering</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Tables &amp; QR codes</h1>
          <p className="mt-3 max-w-xl text-black/60">
            Each table gets its own QR code. Customers scan it to order from their phone, and the order arrives on the{" "}
            <Link href="/dashboard/orders" className="font-semibold underline underline-offset-4">
              Orders
            </Link>{" "}
            screen with the table name.
          </p>
        </div>
        {activeCount > 0 && (
          <Link href="/dashboard/tables/print" className={`${primaryButton} inline-flex shrink-0 items-center whitespace-nowrap`}>
            Print QR codes
          </Link>
        )}
      </div>

      <form onSubmit={addTable} className="mt-8 flex flex-col gap-3 rounded-2xl border border-black/10 bg-white/60 p-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="table-label" className="text-sm font-medium">
            New table
          </label>
          <input
            id="table-label"
            value={labelValue}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={40}
            placeholder="Table 1, Counter, Window seat…"
            className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-base outline-none focus:border-black/40"
          />
        </div>
        <button type="submit" disabled={working || !labelValue.trim()} className={primaryButton}>
          Add table
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="mt-6 rounded-xl border border-green-900/20 bg-green-50 px-4 py-3 text-sm text-green-900">
          {notice}
        </p>
      )}

      {tables.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-black/15 bg-white/40 p-10 text-center">
          <h2 className="text-xl font-medium">No tables yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-black/60">
            Add one for each table, plus one called &ldquo;Counter&rdquo; for takeaway orders. Then print the QR codes.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => {
            const url = `${origin}/t/${table.token}`;
            return (
              <li
                key={table.id}
                className={`flex gap-4 rounded-2xl border p-4 ${table.isActive ? "border-black/10 bg-white/70" : "border-dashed border-black/15 bg-white/30"}`}
              >
                <div className={table.isActive ? "" : "opacity-40"}>
                  <QrCode value={url} size={104} label={`QR code for ${table.label}`} className="rounded-lg" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  {renaming?.id === table.id ? (
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (await request(`/api/tables/${table.id}`, "PATCH", { label: renaming.value })) setRenaming(null);
                      }}
                      className="flex gap-2"
                    >
                      <label htmlFor={`rename-${table.id}`} className="sr-only">
                        Table name
                      </label>
                      <input
                        id={`rename-${table.id}`}
                        autoFocus
                        maxLength={40}
                        value={renaming.value}
                        onChange={(event) => setRenaming({ id: table.id, value: event.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-black/20 px-3 py-1.5"
                      />
                      <button type="submit" disabled={working} className="text-sm font-semibold">
                        Save
                      </button>
                    </form>
                  ) : (
                    <p className="text-lg font-semibold">{table.label}</p>
                  )}
                  <p className={`mt-0.5 text-xs font-medium ${table.isActive ? "text-green-800" : "text-black/50"}`}>
                    {table.isActive ? "Taking orders" : "Switched off: QR code does nothing"}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    <button type="button" disabled={working} onClick={() => setRenaming({ id: table.id, value: table.label })} className={ghostButton}>
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => request(`/api/tables/${table.id}`, "PATCH", { isActive: !table.isActive })}
                      className={ghostButton}
                    >
                      {table.isActive ? "Switch off" : "Switch on"}
                    </button>
                    <a href={url} target="_blank" rel="noreferrer" className={`${ghostButton} inline-flex items-center`}>
                      Test
                    </a>
                    <button type="button" disabled={working} onClick={() => setPending({ kind: "renew", table })} className={ghostButton}>
                      New QR
                    </button>
                    <button type="button" disabled={working} onClick={() => setPending({ kind: "delete", table })} className={ghostButton}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "delete" ? "Delete this table?" : "Replace this QR code?"}
        message={
          pending?.kind === "delete"
            ? `${pending.table.label} and its QR code will be removed. Past orders keep the table name.`
            : `The printed QR code for ${pending?.table.label ?? "this table"} will stop working. Print and place the new one.`
        }
        confirmLabel={pending?.kind === "delete" ? "Delete" : "Replace QR code"}
        busy={working}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
