# Project 2 — Concepts: Human-in-the-Loop & LangGraph as Main Character

How the approval workflow, graph interrupts, and checkpointing work under the hood.

---

## What Changed from Project 1

In Project 1, LangGraph was wired in but AI SDK's `streamText` still owned the tool-calling loop.
In Project 2, **LangGraph owns everything**. AI SDK is only used for the LLM call inside the agent node (`generateText`).

```
Project 1                         Project 2
─────────────────────             ──────────────────────────────────────
streamText() → implicit loop      graph.invoke() → explicit node sequence
AI SDK controls tool execution    LangGraph controls tool execution
No pause possible                 Graph pauses mid-run for human input
No memory across requests         MemorySaver checkpoints state per thread
```

---

## The New Graph

```
                     AgentState
                     { messages: BaseMessage[] }
                          │
                          ▼
               ┌──────[agent]──────┐
               │  generateText()   │
               │  decides action   │
               └────────┬──────────┘
                        │
            ┌───────────▼───────────┐
            │  tool_calls present?  │
            │  yes → approval       │
            │  no  → END            │
            └───────────────────────┘
                        │
               ┌────[approval]─────┐
               │  interrupt()      │  ← graph PAUSES here
               │  waits for user   │
               └────────┬──────────┘
                        │
            ┌───────────▼───────────┐
            │  decision == approve? │
            │  yes → tools          │
            │  no  → agent          │
            └───────────────────────┘
                        │
               ┌─────[tools]───────┐
               │  executes calls   │
               │  returns results  │
               └────────┬──────────┘
                        │
                      agent (loop)
```

---

## Key Concept: `interrupt()`

`interrupt(value)` is a LangGraph primitive that does three things atomically:

1. **Checkpoints** the current graph state to `MemorySaver`
2. **Throws** a `GraphInterrupt` error that surfaces to the caller of `graph.invoke()`
3. **Returns** (on resume) the value passed via `Command({ resume: value })`

```typescript
// Inside the approval node:
const decision: string = interrupt({
  pendingToolCalls: [...],  // surfaced to the UI
});

// decision === "approve" or "reject" — but only AFTER resume
if (decision === "reject") {
  // inject rejection message into state
}
```

The API route catches `GraphInterrupt` and returns `{ status: "awaiting_approval", interrupt: ... }` to the browser instead of a final reply.

---

## Key Concept: `MemorySaver`

`MemorySaver` is an in-memory checkpoint store. It stores the full graph state (messages, node position, channel values) keyed by `thread_id`.

```typescript
export const checkpointer = new MemorySaver(); // one instance, lives for the process

export const graph = workflow.compile({ checkpointer }); // graph uses it automatically
```

Every `graph.invoke()` call:
- Loads state from the checkpoint for `{ thread_id }`
- Runs nodes
- Saves state back after each node completes

This is why the graph can pause mid-run and resume later — the state is preserved between HTTP requests.

---

## Key Concept: Resuming with `Command`

When the user approves or rejects, the approve endpoint calls:

```typescript
await graph.invoke(
  new Command({ resume: "approve" | "reject" }),
  { configurable: { thread_id: threadId } }
);
```

`Command({ resume })` tells the graph: "load from the checkpoint for this thread and make `interrupt()` return this value." The graph picks up exactly where it left off — inside the approval node, after the `interrupt()` call.

---

## Request Lifecycle

### Turn 1: User sends message

```
Browser POST /api/p2 { messages, threadId }
         │
         ▼
graph.invoke({ messages: [HumanMessage] }, { thread_id })
         │
         ▼
agent node → generateText() → model decides: call saveNote
         │
         ▼
shouldApprove() → "approval"
         │
         ▼
approval node → interrupt({ pendingToolCalls }) → throws GraphInterrupt
         │
         ▼
route.ts catches GraphInterrupt
         │
         ▼
Response: { status: "awaiting_approval", interrupt: { pendingToolCalls } }
         │
         ▼
Browser shows Approve / Reject buttons
```

### Turn 2a: User approves

```
Browser POST /api/p2/approve { threadId, decision: "approve" }
         │
         ▼
graph.invoke(Command({ resume: "approve" }), { thread_id })
         │
         ▼
approval node resumes — interrupt() returns "approve"
         │  (no rejection message added)
         ▼
afterApproval() → "tools"
         │
         ▼
tools node → executes saveNote → ToolMessage added to state
         │
         ▼
agent node → generateText() → "Done! I saved the note..."
         │
         ▼
shouldApprove() → "__end__"
         │
         ▼
Response: { status: "done", reply: "Done! I saved the note..." }
```

### Turn 2b: User rejects

```
Browser POST /api/p2/approve { threadId, decision: "reject" }
         │
         ▼
approval node resumes — interrupt() returns "reject"
         │  injects ToolMessage: "user rejected this tool call..."
         ▼
afterApproval() → "agent" (rejection message detected)
         │
         ▼
agent node → generateText() → "Understood, I won't save that."
         │
         ▼
Response: { status: "done", reply: "Understood, I won't save that." }
```

---

## Thread IDs

Each browser session generates a UUID as its `threadId`. This is passed with every request and used as the `thread_id` config for `MemorySaver`. Different threads are fully isolated — their checkpoints don't interfere.

In production, you'd persist thread IDs to a database and use a `PostgresSaver` instead of `MemorySaver`.

---

## What We Learned in Project 2

| Concept | What you now know |
|---|---|
| **`interrupt()`** | How to pause a graph mid-execution and surface state to the caller |
| **`MemorySaver`** | How graph state is checkpointed and restored between HTTP requests |
| **`Command({ resume })`** | How to resume a paused graph with a user decision |
| **LangGraph as orchestrator** | LangGraph owns the full loop; AI SDK is just the LLM call |
| **Thread isolation** | Multiple users with different thread_ids get fully independent graph runs |
| **Human-in-the-Loop** | Why this pattern is impossible with AI SDK's implicit `streamText` loop |

---

## Why `streamText` Can't Do This

`streamText` runs the entire model → tool → model loop in one HTTP request. There is no hook to:

1. Pause execution mid-loop
2. Return a partial result to the browser
3. Wait for an out-of-band user input
4. Resume from exactly the same point

LangGraph's checkpoint + interrupt system is specifically designed for this pattern. The graph is a persistent state machine, not a single-request function.

---

## The Big Picture (Updated)

```
AI SDK        = streaming chat UI + basic tool calling            (Project 1)
LangGraph     = explicit control, human approval, persistence     (Project 2)
Both together = the modern production agentic stack
```
