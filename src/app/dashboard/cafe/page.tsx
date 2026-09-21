"use client";

import { useEffect, useState } from "react";
import { cafe } from "../../data/cafe";
import { normalizeStringList } from "../../lib/site-cafe";
import { ALLOWED_IMAGE_HOSTS } from "../../lib/image-hosts";

const GALLERY_SLOTS = 3;

const inputClass =
  "mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30";

/** The gallery is a fixed three-slot layout on the public site. */
function toGallerySlots(images: string[]): string[] {
  return Array.from(
    { length: GALLERY_SLOTS },
    (_, index) => images[index] ?? "",
  );
}

function messageFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

export default function CafeInformation() {
  const [name, setName] = useState(cafe.name);
  const [foundedYear, setFoundedYear] = useState(cafe.foundedYear);
  const [tagline, setTagline] = useState(cafe.tagline);
  const [story, setStory] = useState(cafe.story);
  const [storySecondary, setStorySecondary] = useState(cafe.storySecondary);
  const [whatsapp, setWhatsapp] = useState(cafe.whatsapp);
  const [phone, setPhone] = useState(cafe.phone);
  const [instagram, setInstagram] = useState(cafe.instagram);
  const [mapsUrl, setMapsUrl] = useState(cafe.mapsUrl);
  const [address, setAddress] = useState(cafe.address);
  const [heroImage, setHeroImage] = useState(cafe.heroImage);
  const [galleryImages, setGalleryImages] = useState(
    toGallerySlots(cafe.galleryImages),
  );
  const [hoursText, setHoursText] = useState(cafe.hours.join("\n"));

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  useEffect(() => {
    async function loadCafe() {
      try {
        const response = await fetch("/api/cafe");

        if (!response.ok) {
          throw new Error("Failed to load café information");
        }

        const result = await response.json();
        const data = result.data;

        setName(data.name ?? "");
        setFoundedYear(data.foundedYear ?? 0);
        setTagline(data.tagline ?? "");
        setStory(data.story ?? "");
        setStorySecondary(data.storySecondary ?? "");
        setWhatsapp(data.whatsapp ?? "");
        setPhone(data.phone ?? "");
        setInstagram(data.instagram ?? "");
        setMapsUrl(data.mapsUrl ?? "");
        setAddress(normalizeStringList(data.address, cafe.address));
        // Show what the public site currently renders, which is the static
        // fallback until the café saves its own value.
        setHeroImage(data.heroImage ?? cafe.heroImage);
        setGalleryImages(
          toGallerySlots(
            normalizeStringList(data.galleryImages, cafe.galleryImages),
          ),
        );
        setHoursText(normalizeStringList(data.hours, cafe.hours).join("\n"));
      } catch (error) {
        console.error("Failed to load café:", error);
      }
    }

    loadCafe();
  }, []);
  async function handleSave() {
    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/cafe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          foundedYear,
          tagline,
          story,
          storySecondary,
          whatsapp,
          phone,
          instagram,
          mapsUrl,
          address,
          heroImage: heroImage.trim(),
          galleryImages: galleryImages
            .map((image) => image.trim())
            .filter((image) => image.length > 0),
          hours: hoursText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus({
          kind: "error",
          message: messageFrom(payload) ?? "Failed to save café information",
        });
        return;
      }

      setStatus({
        kind: "success",
        message: "Saved. Your public website has been updated.",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        kind: "error",
        message: "Network error. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <p className="text-sm uppercase tracking-[0.25em] text-black/50">
        Café Settings
      </p>

      <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
        Café Information
      </h1>

      <p className="mt-3 text-black/60">
        Manage the information that appears on your public website.
      </p>

      <div className="mt-10 grid gap-6">
        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Café Name</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Founded Year</label>
          <input
            type="number"
            value={foundedYear}
            onChange={(event) => setFoundedYear(Number(event.target.value))}
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Tagline</label>
          <input
            type="text"
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Story</label>
          <textarea
            value={story}
            onChange={(event) => setStory(event.target.value)}
            rows={3}
            className="mt-3 w-full resize-none rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Story Secondary</label>
          <textarea
            value={storySecondary}
            onChange={(event) => setStorySecondary(event.target.value)}
            rows={4}
            className="mt-3 w-full resize-none rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium" htmlFor="hero-image">
            Hero Image URL
          </label>
          <p className="mt-1 text-sm text-black/50">
            The full-screen photo at the top of your website.
          </p>
          <input
            id="hero-image"
            type="url"
            value={heroImage}
            onChange={(event) => setHeroImage(event.target.value)}
            placeholder={`https://${ALLOWED_IMAGE_HOSTS[0]}/...`}
            className={inputClass}
          />
          <p className="mt-2 text-xs text-black/45">
            Images must be hosted on {ALLOWED_IMAGE_HOSTS.join(" or ")}. Leave
            blank to use the default photo.
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Gallery Images</label>
          <p className="mt-1 text-sm text-black/50">
            Three photos shown between your story and the menu. The first is
            displayed largest.
          </p>

          <div className="mt-3 space-y-3">
            {galleryImages.map((image, index) => (
              <div key={index}>
                <label
                  className="text-xs text-black/50"
                  htmlFor={`gallery-image-${index}`}
                >
                  Image {index + 1}
                  {index === 0 ? " (large)" : ""}
                </label>
                <input
                  id={`gallery-image-${index}`}
                  type="url"
                  value={image}
                  onChange={(event) => {
                    const updated = [...galleryImages];
                    updated[index] = event.target.value;
                    setGalleryImages(updated);
                  }}
                  placeholder={`https://${ALLOWED_IMAGE_HOSTS[0]}/...`}
                  className="mt-1 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
                />
              </div>
            ))}
          </div>

          <p className="mt-2 text-xs text-black/45">
            Leave all three blank to use the default gallery.
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium" htmlFor="opening-hours">
            Opening Hours
          </label>
          <p className="mt-1 text-sm text-black/50">
            One line per row, exactly as you want it to appear.
          </p>
          <textarea
            id="opening-hours"
            value={hoursText}
            onChange={(event) => setHoursText(event.target.value)}
            rows={4}
            placeholder={"Mon — Fri · 8am — 7pm\nSat — Sun · 9am — 8pm"}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Address</label>

          <div className="mt-3 space-y-3">
            {address.map((line, index) => (
              <input
                key={index}
                type="text"
                value={line}
                onChange={(event) => {
                  const updated = [...address];
                  updated[index] = event.target.value;
                  setAddress(updated);
                }}
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">WhatsApp</label>
          <input
            type="text"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Instagram</label>
          <input
            type="url"
            value={instagram}
            onChange={(event) => setInstagram(event.target.value)}
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
          <label className="text-sm font-medium">Google Maps URL</label>
          <input
            type="url"
            value={mapsUrl}
            onChange={(event) => setMapsUrl(event.target.value)}
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-black/30"
          />
        </div>

        {status && (
          <p
            role="alert"
            className={`rounded-xl border px-4 py-3 text-sm ${
              status.kind === "error"
                ? "border-red-900/20 bg-red-50 text-red-900"
                : "border-green-900/20 bg-green-50 text-green-900"
            }`}
          >
            {status.message}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-[#1f1a17] px-6 py-3 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
