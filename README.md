# Agent Playground Learning Log

This repository is being built as a guided, step-by-step engineering lab.

Process for every step:
1. Explain what we are doing and why.
2. Ask a quick understanding check.
3. You confirm with `proceed`.
4. I document the step in this README.
5. Then I implement the next step.

## Goal
Build agentic apps while learning the engineering fundamentals, not just using abstractions.

Planned stack:
- Next.js + TypeScript (app/UI and API surface)
- Vercel AI SDK (chat streaming + tool-calling primitives)
- LangGraph + LangChain Core (explicit agent orchestration)
- Zod (tool input/output validation)

## Progress Log

### Step 1: Environment Check
Status: Completed

What we did:
- Checked versions and workspace state:
  - `node -v` -> `v24.9.0`
  - `npm -v` -> `11.6.0`
  - `git --version` -> `2.50.1`
  - confirmed working directory and initial folder contents

Why:
- Catch compatibility issues early before writing code.

Knowledge check:
- Q: Why run environment checks first?
- Your answer: `1` (correct)
- Core takeaway: Prevent setup bugs early and save debugging time.

---

### Step 2: Scaffold Project
Status: Completed

What we did:
- Created project at `/Users/gouravkhanijoe/workspace/agent-playground`
- Command intent: Next.js app with TypeScript, App Router, ESLint, Tailwind

Why:
- Start from a standard, production-ready baseline.
- Reduce config drift and avoid hand-rolled setup mistakes.

Knowledge check:
- Q: Why use scaffold flags instead of creating files manually?
- Your answer: `1` (correct)
- Core takeaway: Standardized baseline, faster and safer start.

---

### Step 3: Install Agent Dependencies
Status: Completed

What we did:
- Installed:
  - `ai`
  - `@ai-sdk/openai`
  - `zod`
  - `@langchain/langgraph`
  - `@langchain/core`

Why:
- `ai`: streaming + tool-calling primitives for product UI/API.
- `@ai-sdk/openai`: model provider adapter.
- `zod`: strict schema validation for tool inputs.
- `@langchain/core`: common building blocks/messages.
- `@langchain/langgraph`: explicit state-machine orchestration.

Knowledge check:
- Q: What do we lose without LangGraph?
- Your answer: `1` (correct)
- Core takeaway: Lose explicit graph/state orchestration.

---

### Step 4: Environment Files + Health Check
Status: Completed

What we did:
- Created `.env.local` with `OPENAI_API_KEY=` placeholder.
- Created `.env.example` with `OPENAI_API_KEY=your_api_key_here`.
- Ran `npm run dev` to verify startup, then stopped server.

Why:
- Ensure configuration path is in place before backend/model work.
- Validate baseline app health before adding complexity.

Important concept:
- `.env.local`: real local values/secrets used by runtime.
- `.env.example`: template/documentation of required environment variables.

---

### Step 5: First Frontend Chat Loop (Local Only)
Status: Completed

What we did:
- Added a new page:
  - `app/p1/page.tsx`
- Implemented local chat state loop:
  - input -> user message -> assistant echo -> render
- Ran `npm run lint` (passed).

Why:
- Frontend sanity check first.
- Learn UI message flow in isolation before backend/API/LLM complexity.

Knowledge check:
- Q: Why local echo before real model/API?
- Your answer: To sanity-check frontend behavior before adding backend and extra complexity (correct).

---

### Step 6: Minimal Streaming Endpoint (Kickoff)
Status: Completed

What we did:
- Added `app/api/p1/route.ts` with a minimal AI SDK streaming response.
- Implemented:
  - `POST` request handler
  - `streamText(...)` with `openai("gpt-4o-mini")`
  - `convertToModelMessages(messages)` for message conversion
  - `toUIMessageStreamResponse()` for streaming output
- Ran `npm run lint` (passed).

Why:
- Isolate backend chat streaming behavior first.
- Verify request/response shape before adding orchestration complexity.

Knowledge check:
- Q: What does streaming improve most in chat UX?
- Your answer: `1` (correct) -> faster perceived responsiveness.

## Current File Map (Relevant)
- `app/p1/page.tsx` -> `/api/p1` chat UI using `useChat` + streaming message parts
- `app/api/p1/route.ts` -> streaming backend endpoint with tools + validated inputs
- `.env.local` -> local runtime secret values
- `.env.example` -> env variable template
- `package.json` -> dependencies and scripts

## Next Step Queue
- [x] Step 6: Build `/api/p1` minimal streaming endpoint (AI SDK)
- [x] Step 7: Connect `/p1` UI to `/api/p1` using `useChat`
- [x] Step 8: Add first tools (`saveNote`, `listNotes`, `calc`) with safe validation
- [ ] Step 9: Move orchestration to true LangGraph loop (`agent -> tools -> decide -> end`)

## Learning Rules We Agreed
- Understanding is the main goal.
- I ask short check questions each step.
- You confirm before implementation.
- README is updated as durable learning notes.

---

### Step 7: Connect UI to API with `useChat` (Kickoff)
Status: Completed

What we did:
- Installed `@ai-sdk/react`.
- Replaced local echo state in `app/p1/page.tsx` with:
  - `useChat(...)` from `@ai-sdk/react`
  - `DefaultChatTransport({ api: "/api/p1" })` from `ai`
- Sent user input with `sendMessage({ text })`.
- Rendered assistant output via `message.parts` (text parts).
- Added basic `status` and `error` display in the UI.
- Ran `npm run lint` (passed).

Important version note:
- In AI SDK v6, React hooks are in `@ai-sdk/react`.
- `ChatInit` in `useChat` does not directly expose `api`; use `DefaultChatTransport`.

Why:
- Connect frontend state directly to streaming backend.
- Learn the standard request lifecycle without manual fetch boilerplate.

Knowledge check:
- Q: What is the key benefit of using `useChat` on the frontend?
- Your answer: `1` (correct) -> it manages chat state + request lifecycle.

---

### Step 8: Add First Tools with Runtime Validation (Kickoff)
Status: Completed

What we did:
- Added three tools in `app/api/p1/route.ts`:
  - `saveNote`
  - `listNotes`
  - `calc`
- Added `zod` runtime validation with `inputSchema` for all tools.
- Implemented safe arithmetic parsing (recursive descent parser), no `eval` or `Function`.
- Updated route to `await convertToModelMessages(messages)` before `streamText(...)`.
- Ran `npm run lint` (passed).

Why:
- Teach the core agent loop: model decides when to call tools.
- Enforce runtime guardrails so malformed tool arguments fail safely.

Knowledge check:
- Q: Why use `zod` for tools?
- Your answer: `1` (correct) -> validate tool inputs at runtime.

How to test in `/p1`:
- `Save a note: my kid likes parks.`
- `List my notes.`
- `Calculate (19 * 7) - 5 and explain briefly.`

---

### Step 9: Integrate LangGraph State Management (Complete Project 1)
Status: Completed

What we did:
- Refactored `/api/p1/route.ts` to use LangGraph explicit orchestration:
  - Created `StateGraph` with `AgentState` type for conversation tracking
  - Added two nodes: `agent` (decides tool calls) and `tools` (executes tools)
  - Implemented conditional edges: tools → agent (if more work) or END (if done)
  - Kept AI SDK streaming response for UI compatibility
- Moved from implicit AI SDK tool loop to explicit graph-based control flow.

Why this matters:
- **Before:** AI SDK handled tool calling automatically (hidden loop)
- **After:** We control exactly when tools are called and when to stop
- **Foundation:** This explicit control enables Projects 2-3 (approval workflows, persistence)

Key LangGraph concepts learned:
- **State:** Shared data structure that flows between nodes
- **Nodes:** Functions that process state and return updated state
- **Edges:** Control flow between nodes (simple or conditional)
- **Graph execution:** Explicit orchestration vs implicit loops

Knowledge check:
- Q: What is the key reason we moved to LangGraph?
- Your answer: `1` (correct) -> to make control flow explicit (nodes/edges/state) instead of opaque loop behavior.

Technical implementation:
- State tracks: `messages`, `toolCalls`, `shouldContinue`
- Agent node: calls LLM to decide next action
- Tools node: executes tool calls and updates state
- Conditional logic: determines whether to continue or end
