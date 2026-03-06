"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useState } from "react";

export default function ProjectOnePage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/p1",
    }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Project 1: Streaming Chat</h1>
      <p className="text-sm text-zinc-600">
        This page sends messages to <code>/api/p1</code> and streams the response.
      </p>
      <p className="text-sm text-zinc-500">Status: {status}</p>
      {error ? <p className="text-sm text-red-600">Error: {error.message}</p> : null}

      <section className="min-h-[360px] space-y-3 rounded-xl border p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">Try typing a message and press Send.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{message.role}</p>
              <div className="whitespace-pre-wrap">
                {message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return <p key={`${message.id}-${index}`}>{part.text}</p>;
                  }
                  return null;
                })}
              </div>
            </article>
          ))
        )}
      </section>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type your message"
          className="flex-1 rounded-xl border px-3 py-2"
        />
        <button type="submit" className="rounded-xl border px-4 py-2">
          Send
        </button>
      </form>
    </main>
  );
}
