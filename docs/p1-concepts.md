# Project 1 — Concepts & Stack Breakdown

How the dependencies, code paths, and tools work together under the hood.

---

## The Stack Layers

```
┌─────────────────────────────────────┐
│   Browser (React UI)                │  ← app/p1/page.tsx
│   @ai-sdk/react                     │
├─────────────────────────────────────┤
│   Next.js API Route                 │  ← app/api/p1/route.ts
│   ai (Vercel AI SDK core)           │
│   @ai-sdk/openai                    │
│   zod                               │
├─────────────────────────────────────┤
│   LangGraph (introduced in P2)      │  ← @langchain/langgraph
│   @langchain/core                   │
├─────────────────────────────────────┤
│   OpenAI API (GPT-4o-mini)          │  ← external
└─────────────────────────────────────┘
```

---

## Each Dependency — What It Is and What It Provides

### `@ai-sdk/react` — Frontend chat state manager

```typescript
import { useChat } from "@ai-sdk/react";

const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({ api: "/api/p1" }),
});
```

**What it does:**
- Holds `messages[]` in React state
- Sends POST requests when you call `sendMessage()`
- Receives streaming tokens and appends them to messages
- Tracks loading and error state for you

**Under the hood:**
Opens an HTTP connection to your API route, reads chunks of text as they stream in (Server-Sent Events format), and updates React state with each chunk. You never write a `fetch()` call manually.

---

### `ai` — Vercel AI SDK core (the backbone of the API route)

```typescript
import { streamText, tool, convertToModelMessages, UIMessage, CoreMessage } from "ai";
```

Each function has a specific job:

**`convertToModelMessages()`**
- Transforms `UIMessage` (what the browser sends) → `CoreMessage` (what LLMs understand)
- Handles tool call/result pairs in conversation history correctly

```typescript
const modelMessages = await convertToModelMessages(messages);
```

**`streamText()`**
- Sends messages + tools to the model
- Handles the tool-call loop automatically (model calls tool → result back → model continues)
- Returns a streaming result object

```typescript
const result = streamText({ model, messages, tools });
```

**`tool()`**
- Registers a callable function the model can invoke
- Validates input with your zod schema before calling `execute()`

```typescript
const myTool = tool({ description, inputSchema, execute });
```

**`toUIMessageStreamResponse()`**
- Wraps the stream into an HTTP Response the browser can consume

```typescript
return result.toUIMessageStreamResponse();
```

---

### `@ai-sdk/openai` — Model provider adapter

```typescript
import { openai } from "@ai-sdk/openai";

const model = openai("gpt-4o-mini");
```

**What it does:**
- Reads `OPENAI_API_KEY` from environment automatically
- Translates AI SDK's internal format → OpenAI API wire format
- Handles auth headers, endpoint URLs, response parsing

**Key insight:** Because of this adapter pattern, your application code doesn't know or care which model provider you're using. Swap this one line to use Claude, Gemini, or a local model — nothing else changes.

---

### `zod` — Runtime input validation

```typescript
import { z } from "zod";

inputSchema: z.object({
  note: z.string().min(1).max(500),
  expression: z.string().min(1).max(120),
})
```

**What it does:**
- Defines the shape and constraints of tool inputs
- Validates at runtime (not just at TypeScript compile time)
- Rejects bad arguments before your `execute()` runs

**Why this matters:** The model is an LLM — it can hallucinate bad arguments. Zod catches them before they reach your business logic.

---

### `@langchain/langgraph` + `@langchain/core` — Installed, introduced in Project 2

Both packages are installed but not used in Project 1. They become the main character in Project 2.

- `@langchain/core` — shared message primitives (HumanMessage, AIMessage, ToolMessage) used across the LangChain ecosystem
- `@langchain/langgraph` — graph-based workflow runtime: State, Nodes, Edges, conditional branching, checkpointing

---

## Code Paths

### Code Path 1: Simple chat (no tool call)

```
User types: "What is a LangGraph node?"
         │
         ▼
useChat.sendMessage({ text })           [@ai-sdk/react]
         │  POST /api/p1 with messages[]
         ▼
POST handler receives UIMessage[]       [Next.js]
         │
         ▼
convertToModelMessages(messages)        [ai]
         │  transforms to CoreMessage[]
         ▼
streamText({ model, messages, tools })  [ai + @ai-sdk/openai]
         │  sends to OpenAI API
         ▼
OpenAI returns text (no tool needed)
         │
         ▼
toUIMessageStreamResponse()             [ai]
         │  streams tokens back as HTTP chunks
         ▼
useChat receives chunks                 [@ai-sdk/react]
         │  appends to messages[] in React state
         ▼
UI re-renders with new text             [React]
```

---

### Code Path 2: Tool call (e.g., "Save a note: parks")

```
User types: "Save a note: my kid likes parks"
         │
         ▼
useChat.sendMessage()                   [@ai-sdk/react]
         │
         ▼
streamText() sends to OpenAI            [ai + @ai-sdk/openai]
         │
         ▼
OpenAI decides: "I should call saveNote"
         │  returns tool_call: { name: "saveNote", args: { note: "..." } }
         ▼
AI SDK intercepts the tool call         [ai]
         │
         ▼
Zod validates args                      [zod]
         │  z.object({ note: z.string().min(1).max(500) }) ✓
         ▼
execute({ note }) runs                  [your code]
         │  NOTES.push(note)
         │  returns { saved: "my kid likes parks", totalNotes: 1 }
         ▼
AI SDK feeds result back to OpenAI     [ai]
         │  model sees: "tool returned: { saved: ... }"
         ▼
OpenAI generates final text response
         │  "Done! I saved the note..."
         ▼
Streams back to UI                      [@ai-sdk/react]
```

**Key insight:** The model never directly modifies data. It decides to call a tool, AI SDK validates and executes it, the result goes back to the model, and the model responds with text. The model is the *decider*. Your code is the *executor*.

---

### Code Path 3: Why LangGraph is needed (coming in Project 2)

The AI SDK implicit loop works like this:

```
model → tool → model → tool → model → done
```

You cannot:
- Pause in the middle and wait for a human to approve
- Branch: "if tool failed, go to retry node; otherwise go to summarize node"
- Persist state across multiple requests
- Run multiple agents in parallel with shared state

LangGraph solves this with an explicit graph:

```
                   AgentState
                   { messages, toolCalls, shouldContinue }
                        │
                        ▼
             ┌────[agent node]────┐
             │  LLM decides what  │
             │  to do next        │
             └─────────┬──────────┘
                       │
                       ▼
             ┌────[tools node]────┐
             │  executes tools    │
             │  updates state     │
             └─────────┬──────────┘
                       │
             ┌─────────▼──────────┐
             │  shouldContinue?   │
             │  yes → agent       │
             │  no  → END         │
             └────────────────────┘
```

Project 2 adds an `approval` node between `agent` and `tools` — the graph pauses, returns to the user, and only continues when they confirm. This is impossible with AI SDK's implicit loop.

---

## What We Learned in Project 1

| Concept | What you now know |
|---|---|
| **Streaming** | How tokens flow from model → API route → browser in real time |
| **Tool calling** | Model decides to call tools; your code executes them; result goes back to model |
| **Zod validation** | Why runtime validation matters when an LLM is generating arguments |
| **Provider abstraction** | One line swap to change model providers |
| **Message types** | UIMessage (browser shape) vs CoreMessage (model shape) — same data, two formats |
| **Why LangGraph** | Implicit loops can't pause, branch, or wait for humans — graphs can |

---

## The Big Picture

```
AI SDK   = great for streaming chat UI + basic tool calling  (Project 1)
LangGraph = essential when you need control over the flow    (Projects 2 & 3)
Both     = the modern production agentic stack
```
