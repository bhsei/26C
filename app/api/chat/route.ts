import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runChatWithTools, type ChatMessage } from "@/lib/ollama";
import { chatTools, executeChatTool } from "@/lib/chat-tools";
import prisma from "@/lib/prisma";

const MAX_HISTORY = 12;
const MAX_CONTENT_LENGTH = 2000;

type IncomingMessage = { role?: unknown; content?: unknown };

function sanitizeMessages(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) return null;
  const raw = (body as { messages: IncomingMessage[] }).messages.slice(-MAX_HISTORY);
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    if (item.role !== "user" && item.role !== "assistant") return null;
    if (typeof item.content !== "string" || !item.content.trim() || item.content.length > MAX_CONTENT_LENGTH) return null;
    messages.push({ role: item.role, content: item.content.trim() });
  }
  return messages.length && messages[messages.length - 1].role === "user" ? messages : null;
}

function buildSystemPrompt(userName: string, role: string, hallName: string | null): string {
  const now = new Date();
  return [
    "You are the SecondHelping assistant, built into a campus surplus-food marketplace at Beihang University.",
    "Dining halls post discounted 'closing bags' of surplus food near closing time; students reserve them, pay, and pick them up with a pickup code.",
    `The current user is ${userName}, signed in as ${role}${hallName ? ` (assigned to ${hallName})` : ""}.`,
    `Current server time: ${now.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}.`,
    "",
    "Rules:",
    "- Use the provided tools for anything about available meals, dining halls, the user's orders, pickup codes, or the current time. Never invent meals, prices, times, or codes.",
    "- Report tool results faithfully: mention meal names and statuses. If a tool result contains no pickup code or no matching item, say so plainly instead of guessing.",
    "- When listing meals, include the dining hall, price, and pickup window. Keep lists short.",
    "- Answer general questions (food, nutrition, campus life) briefly and helpfully without tools.",
    "- Small talk (hi, thanks, ok, bye, you're welcome) needs NO tools and NO meal lists. Reply with one short friendly sentence, e.g. \"You're welcome!\".",
    "- NEVER call a tool or repeat previous information unless the user's latest message explicitly asks for it.",
    "- Be concise: short paragraphs or compact bullet lists, no headings.",
    "- You cannot place, pay for, cancel, or modify orders — tell users to use the Reserve/Pay buttons in the app instead.",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to use the assistant." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const messages = sanitizeMessages(body);
  if (!messages) {
    return NextResponse.json({ error: "Messages must be user/assistant turns ending with a user message." }, { status: 400 });
  }

  let hallName: string | null = null;
  if (user.role === "SUPERVISOR" && user.diningHallId) {
    const hall = await prisma.diningHall.findUnique({ where: { id: user.diningHallId }, select: { name: true } });
    hallName = hall?.name ?? null;
  }

  const system: ChatMessage = {
    role: "system",
    content: buildSystemPrompt(user.name ?? "a SecondHelping user", user.role === "SUPERVISOR" ? "staff member" : "student", hallName),
  };

  try {
    const reply = await runChatWithTools([system, ...messages], chatTools, (name, args) => executeChatTool(name, args, user));
    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const unavailable = message.includes("Cannot reach Ollama") || message.includes("Ollama returned");
    return NextResponse.json({ error: message }, { status: unavailable ? 503 : 500 });
  }
}
