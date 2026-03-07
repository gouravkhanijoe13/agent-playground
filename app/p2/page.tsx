"use client";

import { FormEvent, useState, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

type MessageRole = "user" | "assistant" | "system";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectTwoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "awaiting_approval">("idle");
  const [pendingCalls, setPendingCalls] = useState<PendingToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Stable thread ID for this browser session
  const threadId = useRef(
    typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  ).current;

  const addMessage = useCallback((role: MessageRole, text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), role, text },
    ]);
  }, []);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || status === "loading") return;

    setInput("");
    setError(null);
    addMessage("user", text);
    setStatus("loading");

    try {
      const res = await fetch("/api/p2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          messages: [{ id: "u1", role: "user", content: text, parts: [{ type: "text", text }] }],
        }),
      });
      const data = await res.json();
      handleApiResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setStatus("idle");
    }
  }

  function handleApiResponse(data: {
    status: string;
    reply?: string;
    interrupt?: { pendingToolCalls: PendingToolCall[] };
    error?: string;
  }) {
    if (data.status === "done") {
      if (data.reply) addMessage("assistant", data.reply);
      setStatus("idle");
      setPendingCalls([]);
    } else if (data.status === "awaiting_approval") {
      setPendingCalls(data.interrupt?.pendingToolCalls ?? []);
      setStatus("awaiting_approval");
    } else if (data.error) {
      setError(data.error);
      setStatus("idle");
    }
  }

  async function decide(decision: "approve" | "reject") {
    setError(null);
    const label = decision === "approve" ? "✓ Approved tool call" : "✗ Rejected tool call";
    addMessage("system", label);
    setStatus("loading");
    setPendingCalls([]);

    try {
      const res = await fetch("/api/p2/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, decision }),
      });
      const data = await res.json();
      handleApiResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setStatus("idle");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Project 2: Human-in-the-Loop Approval</h1>
      <p className="text-sm text-zinc-600">
        The agent pauses before running any tool and waits for your approval. Uses{" "}
        <code>MemorySaver</code> to checkpoint state between requests.
      </p>
      <p className="text-xs text-zinc-400">Thread ID: {threadId}</p>

      {/* Status */}
      <p className="text-sm text-zinc-500">
        Status:{" "}
        <span
          className={
            status === "awaiting_approval"
              ? "font-semibold text-amber-600"
              : status === "loading"
                ? "text-blue-600"
                : "text-zinc-500"
          }
        >
          {status}
        </span>
      </p>

      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

      {/* Approval panel */}
      {status === "awaiting_approval" && pendingCalls.length > 0 ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">
            The agent wants to call {pendingCalls.length} tool
            {pendingCalls.length > 1 ? "s" : ""}:
          </p>
          {pendingCalls.map((tc) => (
            <div key={tc.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
              <p className="font-mono font-semibold">{tc.name}</p>
              <pre className="mt-1 text-xs text-zinc-600 whitespace-pre-wrap">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => decide("approve")}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Approve
            </button>
            <button
              onClick={() => decide("reject")}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Reject
            </button>
          </div>
        </section>
      ) : null}

      {/* Messages */}
      <section className="min-h-[360px] space-y-3 rounded-xl border p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Try: &quot;Save a note: the capital of France is Paris.&quot;
          </p>
        ) : (
          messages.map((msg) => (
            <article
              key={msg.id}
              className={`rounded-lg border p-3 ${
                msg.role === "system"
                  ? "border-zinc-200 bg-zinc-50 text-xs text-zinc-500"
                  : ""
              }`}
            >
              {msg.role !== "system" ? (
                <p className="text-xs uppercase tracking-wide text-zinc-500">{msg.role}</p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
            </article>
          ))
        )}
        {status === "loading" ? (
          <p className="text-sm text-zinc-400 animate-pulse">Thinking…</p>
        ) : null}
      </section>

      {/* Input form */}
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message"
          disabled={status !== "idle"}
          className="flex-1 rounded-xl border px-3 py-2 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status !== "idle"}
          className="rounded-xl border px-4 py-2 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
