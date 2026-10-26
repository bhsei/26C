"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function FoodImageMatcher() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const card = cardRef.current;
    const listingCard = card?.parentElement?.firstElementChild;
    if (!card || !(listingCard instanceof HTMLElement)) return;

    const syncMaximumHeight = () => {
      const height = listingCard.getBoundingClientRect().height;
      if (height > 0) {
        card.style.maxHeight = `${height}px`;
        card.style.overflowY = "auto";
      }
    };

    syncMaximumHeight();
    const observer = new ResizeObserver(syncMaximumHeight);
    observer.observe(listingCard);
    window.addEventListener("resize", syncMaximumHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncMaximumHeight);
    };
  }, []);
  function chooseImage(file: File | undefined) {
    setMessage("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setImage(null);
      setPreviewUrl(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setImage(null);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Choose a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImage(null);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("The image must be 10 MB or smaller.");
      return;
    }
    setImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function processImage() {
    if (!image || busy) return;
    setBusy(true);
    setMessage("Identifying the food…");
    try {
      const body = new FormData();
      body.append("image", image);
      const response = await fetch("/api/food-image-match", { method: "POST", body });
      const result = await response.json() as { foodId?: string; foodName?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not identify this food.");

      const foodSelect = document.getElementById("foodId") as HTMLSelectElement | null;
      if (!foodSelect || !result.foodId || !Array.from(foodSelect.options).some((option) => option.value === result.foodId)) {
        throw new Error("The suggested food is not available in the listing selector.");
      }
      foodSelect.value = result.foodId;
      foodSelect.dispatchEvent(new Event("change", { bubbles: true }));
      setMessage(`Selected ${result.foodName}. Confirm the selection before publishing.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not identify this food.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={cardRef} className="space-y-3 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-blue-900">Identify food from an image</h2>
        <p className="text-sm text-blue-700">Upload a meal photo to select a matching dish.</p>
      </div>
      <label className="block cursor-pointer rounded-lg border border-dashed border-blue-300 bg-white p-4 text-center text-sm text-blue-800 hover:bg-blue-50">
        <span>{image ? "Choose a different image" : "Choose an image"}</span>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => chooseImage(event.currentTarget.files?.[0])} />
      </label>
      {previewUrl && <Image src={previewUrl} alt="Selected meal preview" width={640} height={480} unoptimized className="max-h-64 w-full rounded-lg border border-blue-100 object-contain" />}
      {image && <button type="button" disabled={busy} onClick={processImage} className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{busy ? "Processing…" : "Process"}</button>}
      <p aria-live="polite" className="min-h-5 text-sm text-blue-700">{message}</p>
      <p className="text-xs text-slate-500">Review the selected dish before posting. Price and discount are entered separately.</p>
    </div>
  );
}
