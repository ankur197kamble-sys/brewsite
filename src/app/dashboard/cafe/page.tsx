"use client";

import { useEffect, useState } from "react";
import { cafe } from "../../data/cafe";
import { normalizeAddress } from "../../lib/site-cafe";

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

  const [saving, setSaving] = useState(false);
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
      setAddress(normalizeAddress(data.address, cafe.address));
    } catch (error) {
      console.error("Failed to load café:", error);
    }
  }

  loadCafe();
}, []);
  async function handleSave() {
    setSaving(true);

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
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save café information");
      }

      alert("Café information saved to Neon!");
    } catch (error) {
      console.error(error);
      alert("Failed to save café information.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4efe7] p-6 text-[#1f1a17] md:p-10">
      <div className="mx-auto max-w-4xl">
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
    </main>
  );
}