"use client";

import { useEffect, useRef, useState } from "react";

type Fields = {
  foodId: string | null;
  quantityTotal: number | null;
  originalPriceCents: number | null;
  discountRate: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
};

type VoiceResult = { transcript?: string; fields?: Fields; foodName?: string | null; error?: string };
const MAX_RECORDING_MS = 60_000;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
}

async function toWav(recording: Blob): Promise<Blob> {
  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
  } finally {
    await decoder.close();
  }

  const sampleRate = 16_000;
  const frameCount = Math.ceil(decoded.duration * sampleRate);
  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, wav.byteLength - 8, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([wav], { type: "audio/wav" });
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function applyValue(id: string, value: string | number | null) {
  if (value === null) return false;
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return false;
  element.value = String(value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export default function VoiceListingAssistant() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function processRecording(recordingBlob: Blob) {
    if (!recordingBlob.size) {
      setMessage("No audio was captured. Try recording again.");
      return;
    }
    setBusy(true);
    setMessage("Transcribing locally and extracting the spoken fields…");
    try {
      const wav = await toWav(recordingBlob);
      const body = new FormData();
      body.append("audio", wav, "listing.wav");
      const response = await fetch("/api/voice-listing-assistant", { method: "POST", body });
      const result = await response.json() as VoiceResult;
      if (!response.ok) throw new Error(result.error || "Could not process the recording.");
      setTranscript(result.transcript ?? "");
      const fields = result.fields;
      if (!fields) throw new Error("No listing details were returned.");

      const populated: string[] = [];
      if (fields.foodId) {
        const select = document.getElementById("foodId");
        if (select instanceof HTMLSelectElement && Array.from(select.options).some((option) => option.value === fields.foodId)) {
          if (applyValue("foodId", fields.foodId)) populated.push("food");
        }
      }
      const mappings: Array<[string, string, string | number | null]> = [
        ["quantity", "quantityTotal", fields.quantityTotal],
        ["regular price", "originalPriceCents", fields.originalPriceCents],
        ["discount", "discountRate", fields.discountRate],
        ["pickup start", "pickupWindowStart", fields.pickupWindowStart ? toDatetimeLocal(fields.pickupWindowStart) : null],
        ["pickup end", "pickupWindowEnd", fields.pickupWindowEnd ? toDatetimeLocal(fields.pickupWindowEnd) : null],
      ];
      for (const [label, id, value] of mappings) if (value !== null && applyValue(id, value)) populated.push(label);
      setMessage(populated.length
        ? `Filled ${populated.join(", ")}. Review the transcript and form, then correct anything that needs changing before publishing.`
        : "No listing fields were clear enough to fill. Review the transcript and enter the missing details manually.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process the recording.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setMessage("");
    setTranscript("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("This browser does not support microphone recording. Use the manual form or image matcher.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const recordingBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        setRecording(false);
        void processRecording(recordingBlob);
      };
      recorder.start();
      setRecording(true);
      setMessage("Listening. Say the dish, portion count, regular price, discount, and pickup start/end times you want to include.");
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
        setMessage("The 60-second recording limit was reached; processing the captured speech.");
      }, MAX_RECORDING_MS);
    } catch (error) {
      setMessage(error instanceof Error && error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access or use the manual form."
        : "Could not start microphone recording. Check the microphone and try again.");
    }
  }

  function stopRecording() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  return (
    <section className="space-y-3 rounded-xl border border-blue-200 bg-white p-5 shadow-sm" aria-labelledby="voice-listing-title">
      <div>
        <h2 id="voice-listing-title" className="font-semibold text-blue-900">Describe a listing by voice</h2>
        <p className="text-sm text-blue-700">Speak the dish and any details you know. Audio is transcribed by your local Ollama service.</p>
      </div>
      <button type="button" disabled={busy} onClick={recording ? stopRecording : startRecording} className={`w-full rounded-lg px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60 ${recording ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}`}>
        {busy ? "Processing locally…" : recording ? "Stop and fill the form" : "Start voice input"}
      </button>
      {transcript && <label className="grid gap-1 text-sm text-blue-900">Recognized transcript<textarea readOnly value={transcript} rows={3} className="rounded-lg border border-blue-200 p-2 text-sm" /></label>}
      <p aria-live="polite" className="min-h-5 text-sm text-blue-700">{message}</p>
      <p className="text-xs text-slate-500">Only clearly spoken values are filled. Unmentioned or uncertain fields stay unchanged; review everything before publishing. Recordings and transcripts are not stored by the app.</p>
    </section>
  );
}
