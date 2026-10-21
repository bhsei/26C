// Minimal client for a locally running Ollama server, using its native
// /api/chat endpoint with tool calling. No external dependencies.

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
};

export type ToolCall = {
  function: { name: string; arguments: Record<string, unknown> };
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2:7b";
const MAX_TOOL_ROUNDS = 5;

async function callOllama(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatMessage> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, tools, stream: false }),
    });
  } catch {
    throw new Error(`Cannot reach Ollama at ${BASE_URL}. Is it running? Start it with "ollama serve".`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama returned ${response.status}: ${detail.slice(0, 200)}. Is the model "${MODEL}" pulled?`);
  }
  const data = (await response.json()) as { message?: ChatMessage };
  if (!data.message) throw new Error("Ollama returned an empty response.");
  return data.message;
}

// Runs the conversation, executing tool calls against local handlers until the
// model produces a final text answer (or the round limit is hit).
export async function runChatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<string> {
  const history = [...messages];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await callOllama(history, tools);
    const calls = reply.tool_calls ?? [];
    if (calls.length === 0) {
      return reply.content.trim() || "I don't have an answer for that right now.";
    }
    history.push({ role: "assistant", content: reply.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const name = call.function?.name ?? "";
      let result: string;
      try {
        result = await executeTool(name, call.function?.arguments ?? {});
      } catch (error) {
        result = `Tool "${name}" failed: ${error instanceof Error ? error.message : "unknown error"}`;
      }
      history.push({ role: "tool", name, content: result });
    }
  }
  return "I wasn't able to finish looking that up. Please try rephrasing your question.";
}
