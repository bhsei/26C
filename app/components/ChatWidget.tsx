"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What meals are available right now?",
  "Anything without peanuts today?",
  "When does my pickup window close?",
  "What time is it?",
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (response.ok && data.reply) {
        setMessages([...next, { role: "assistant", content: data.reply }]);
      } else {
        const note = response.status === 503
          ? `${data.error ?? "The AI service is unavailable."} Make sure Ollama is running locally.`
          : (data.error ?? "Something went wrong. Please try again.");
        setMessages([...next, { role: "assistant", content: note }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Network error — please check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="SecondHelping assistant">
          <div className="chat-header">
            <span className="chat-header-icon">✳</span>
            <div>
              <b>SecondHelping Assistant</b>
              <small>Ask about meals, pickup times, allergens…</small>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>
          <div className="chat-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="chat-suggestions">
                <p>Hi! I can check live listings, your orders, pickup windows, and answer general questions.</p>
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} onClick={() => send(suggestion)} disabled={busy}>{suggestion}</button>
                ))}
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`chat-bubble ${message.role}`}>{message.content}</div>
            ))}
            {busy && <div className="chat-bubble assistant chat-typing"><span /><span /><span /></div>}
          </div>
          <form
            className="chat-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about food, times, orders…"
              maxLength={2000}
              aria-label="Message the assistant"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send">➤</button>
          </form>
        </div>
      )}
      <button className="chat-fab" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close assistant" : "Open assistant"}>
        {open ? "✕" : "✳"}
      </button>
    </>
  );
}
