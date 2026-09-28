"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatOfferDate,
  offerStatus,
  type OfferStatus,
  type OfferView,
} from "@/app/lib/offers";
import { ConfirmDialog } from "../confirm-dialog";
import { ImagePreview } from "../image-preview";
import { OfferDialog, type OfferDraft } from "./offer-dialog";

const primaryButton =
  "rounded-full bg-[#1f1a17] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40";
const ghostButton =
  "rounded-full border border-black/15 px-4 py-2 text-sm transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40";
const iconButton =
  "rounded-full border border-black/15 px-3 py-2 text-sm leading-none transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30";

type RequestResult = { ok: true } | { ok: false; message: string };

const STATUS_LABEL: Record<OfferStatus, string> = {
  live: "Live",
  draft: "Unpublished",
  scheduled: "Scheduled",
  ended: "Ended",
};

const STATUS_CLASS: Record<OfferStatus, string> = {
  live: "bg-green-900/10 text-green-900",
  draft: "bg-black/5 text-black/50",
  scheduled: "bg-amber-900/10 text-amber-900",
  ended: "bg-black/5 text-black/50",
};

function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

function blankDraft(): OfferDraft {
  return {
    id: null,
    title: "",
    description: "",
    imageUrl: "",
    value: "",
    startDate: "",
    endDate: "",
    isPublished: true,
  };
}

/** A readable range from whichever bounds the offer actually has. */
function formatDateRange(offer: OfferView): string | null {
  if (offer.startDate && offer.endDate) {
    return `${formatOfferDate(offer.startDate)} – ${formatOfferDate(offer.endDate)}`;
  }
  if (offer.startDate) return `From ${formatOfferDate(offer.startDate)}`;
  if (offer.endDate) return `Until ${formatOfferDate(offer.endDate)}`;
  return null;
}

export function OffersManager({ offers }: { offers: OfferView[] }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [draft, setDraft] = useState<OfferDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OfferView | null>(null);

  const working = busy || isRefreshing;
  const liveCount = offers.filter(
    (offer) => offerStatus(offer) === "live",
  ).length;

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

  async function handleSave(offer: OfferDraft) {
    setDialogError(null);

    const body = {
      title: offer.title,
      description: offer.description,
      imageUrl: offer.imageUrl,
      value: offer.value,
      startDate: offer.startDate,
      endDate: offer.endDate,
      isPublished: offer.isPublished,
    };

    const result =
      offer.id === null
        ? await request("/api/offers", "POST", body)
        : await request(`/api/offers/${offer.id}`, "PATCH", body);

    if (result.ok) {
      setDraft(null);
      setError(null);
      setNotice(offer.id === null ? "Offer added." : "Offer updated.");
    } else {
      // Keep the dialog open with values intact so nothing typed is lost.
      setDialogError(result.message);
    }
  }

  async function move(id: number, direction: "up" | "down") {
    setNotice(null);
    const result = await request(`/api/offers/${id}`, "PATCH", {
      move: direction,
    });
    if (!result.ok) setError(result.message);
  }

  async function togglePublished(offer: OfferView) {
    setNotice(null);
    const result = await request(`/api/offers/${offer.id}`, "PATCH", {
      isPublished: !offer.isPublished,
    });
    if (result.ok) {
      setNotice(offer.isPublished ? "Offer unpublished." : "Offer published.");
    } else {
      setError(result.message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    const result = await request(`/api/offers/${pendingDelete.id}`, "DELETE");
    setPendingDelete(null);

    if (result.ok) setNotice("Offer deleted.");
    else setError(result.message);
  }

  function openNew() {
    setDialogError(null);
    setNotice(null);
    setDraft(blankDraft());
  }

  return (
    <>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm tracking-[0.25em] text-black/50 uppercase">
            Offers
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Offers &amp; Promotions
          </h1>
          <p className="mt-3 max-w-xl text-black/60">
            Published offers appear on your website in this order. An offer with
            an end date hides itself once that date passes.
          </p>
        </div>

        {offers.length > 0 && (
          <button
            type="button"
            onClick={openNew}
            disabled={working}
            className={primaryButton}
          >
            Add offer
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

      {notice && !error && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-green-900/20 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          {notice}
        </p>
      )}

      {offers.length > 0 && liveCount === 0 && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-amber-900/25 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Nothing is live right now, so the offers section is hidden on your
          website.
        </p>
      )}

      {offers.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-black/15 bg-white/40 p-10 text-center">
          <h2 className="text-xl font-medium">No offers yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-black/55">
            Add a promotion such as a weekend special or a seasonal drink. The
            offers section only appears on your website once one is live.
          </p>

          <button
            type="button"
            onClick={openNew}
            className={`${primaryButton} mt-6`}
          >
            Add your first offer
          </button>
        </div>
      ) : (
        <ul className="mt-10 space-y-4">
          {offers.map((offer, index) => {
            const status = offerStatus(offer);
            const dates = formatDateRange(offer);

            return (
              <li
                key={offer.id}
                className="flex flex-col gap-5 rounded-2xl border border-black/10 bg-white/60 p-4 sm:flex-row sm:items-start"
              >
                <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-black/5 sm:h-24 sm:w-36">
                  <ImagePreview
                    key={offer.imageUrl ?? "none"}
                    src={offer.imageUrl}
                    alt=""
                    sizes="(max-width: 640px) 100vw, 9rem"
                    emptyLabel="No image"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium">
                      {index + 1}
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}
                    >
                      {STATUS_LABEL[status]}
                    </span>

                    {offer.value && (
                      <span className="rounded-full bg-[#b56e45]/12 px-2.5 py-1 text-xs font-medium text-[#8a5030]">
                        {offer.value}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-2 font-medium">{offer.title}</h2>

                  {offer.description && (
                    <p className="mt-1 text-sm leading-6 text-black/55">
                      {offer.description}
                    </p>
                  )}

                  {dates && (
                    <p className="mt-1 text-xs text-black/45">{dates}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    aria-label={`Move ${offer.title} up`}
                    onClick={() => move(offer.id, "up")}
                    disabled={working || index === 0}
                    className={iconButton}
                  >
                    ↑
                  </button>

                  <button
                    type="button"
                    aria-label={`Move ${offer.title} down`}
                    onClick={() => move(offer.id, "down")}
                    disabled={working || index === offers.length - 1}
                    className={iconButton}
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    onClick={() => togglePublished(offer)}
                    disabled={working}
                    className={ghostButton}
                  >
                    {offer.isPublished ? "Unpublish" : "Publish"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDialogError(null);
                      setNotice(null);
                      setDraft({
                        id: offer.id,
                        title: offer.title,
                        description: offer.description ?? "",
                        imageUrl: offer.imageUrl ?? "",
                        value: offer.value ?? "",
                        startDate: offer.startDate ?? "",
                        endDate: offer.endDate ?? "",
                        isPublished: offer.isPublished,
                      });
                    }}
                    disabled={working}
                    className={ghostButton}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingDelete(offer)}
                    disabled={working}
                    className={ghostButton}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <OfferDialog
        draft={draft}
        busy={working}
        error={dialogError}
        onChange={setDraft}
        onSubmit={handleSave}
        onCancel={() => {
          setDraft(null);
          setDialogError(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete offer"
        message={
          pendingDelete
            ? `“${pendingDelete.title}” will be permanently removed. This cannot be undone.`
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
