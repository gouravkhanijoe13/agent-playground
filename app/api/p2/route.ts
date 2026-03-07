import { openai } from "@ai-sdk/openai";
import { generateText, tool, UIMessage, ModelMessage } from "ai";
import { z } from "zod";
import {
  StateGraph,
  Annotation,
  MemorySaver,
  interrupt,
  messagesStateReducer,
  isGraphInterrupt,
} from "@langchain/langgraph";
import {
  BaseMessage,
  AIMessage,
  ToolMessage,
  HumanMessage,
} from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// Shared in-memory store
// ---------------------------------------------------------------------------

const NOTES: string[] = [];

// One MemorySaver per process — persists graph checkpoints across HTTP calls.
export const checkpointer = new MemorySaver();

// ---------------------------------------------------------------------------
// Tools (execute functions)
// ---------------------------------------------------------------------------

const toolExecutors: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  saveNote: async ({ note }) => {
    NOTES.push(note as string);
    return { saved: note, totalNotes: NOTES.length };
  },
  listNotes: async () => ({ notes: NOTES }),
};

// Tool definitions for the LLM (describe what's available)
const llmTools = {
  saveNote: tool({
    description: "Save a note to memory.",
    inputSchema: z.object({ note: z.string().min(1).max(500) }),
    execute: async ({ note }) => {
      NOTES.push(note);
      return { saved: note, totalNotes: NOTES.length };
    },
  }),
  listNotes: tool({
    description: "List all saved notes.",
    inputSchema: z.object({}),
    execute: async () => ({ notes: NOTES }),
  }),
};

// ---------------------------------------------------------------------------
// LangGraph state
// ---------------------------------------------------------------------------

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

async function agentNode(state: typeof AgentState.State) {
  // Convert LangChain BaseMessages → AI SDK ModelMessages
  const modelMessages: ModelMessage[] = [];
  for (const m of state.messages) {
    const role = m._getType();
    if (role === "human") {
      modelMessages.push({ role: "user", content: m.content as string });
    } else if (role === "ai") {
      const ai = m as AIMessage;
      if ((ai.tool_calls ?? []).length > 0) {
        // Assistant message with tool calls
        modelMessages.push({
          role: "assistant",
          content: [
            ...(ai.content ? [{ type: "text" as const, text: ai.content as string }] : []),
            ...(ai.tool_calls ?? []).map((tc) => ({
              type: "tool-call" as const,
              toolCallId: tc.id ?? "",
              toolName: tc.name,
              input: tc.args,
            })),
          ],
        });
      } else {
        modelMessages.push({ role: "assistant", content: m.content as string });
      }
    } else if (role === "tool") {
      const tm = m as ToolMessage;
      // Find the matching AIMessage to get the tool name
      const prevAI = [...state.messages]
        .reverse()
        .find((msg): msg is AIMessage => msg._getType() === "ai") as AIMessage | undefined;
      const toolCall = prevAI?.tool_calls?.find((tc) => tc.id === tm.tool_call_id);
      modelMessages.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: tm.tool_call_id ?? "",
            toolName: toolCall?.name ?? "unknown",
            output: { type: "text" as const, value: tm.content as string },
          },
        ],
      });
    }
  }

  const { text, toolCalls } = await generateText({
    model: openai("gpt-4o-mini"),
    system:
      "You are a concise assistant. Use saveNote to store notes, listNotes to read them. " +
      "When you use a tool, the user will approve before it runs.",
    messages: modelMessages,
    tools: llmTools,
  });

  return {
    messages: [
      new AIMessage({
        content: text ?? "",
        tool_calls: toolCalls.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          args: (tc.input ?? {}) as Record<string, unknown>,
          type: "tool_call" as const,
        })),
      }),
    ],
  };
}

// Approval node — pauses the graph and waits for the user.
// interrupt() checkpoints state and throws GraphInterrupt.
// On resume, interrupt() returns the value passed via Command({ resume }).
async function approvalNode(state: typeof AgentState.State) {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const pendingCalls = lastMsg.tool_calls ?? [];

  if (pendingCalls.length === 0) return {};

  // Pause graph; surface pending tool calls to the user.
  const decision: string = interrupt({
    pendingToolCalls: pendingCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args,
    })),
  });

  // If rejected, inject a ToolMessage telling the agent the call was declined.
  if (decision === "reject") {
    return {
      messages: [
        new ToolMessage({
          content: "The user rejected this tool call. Do not retry it; acknowledge and move on.",
          tool_call_id: pendingCalls[0].id ?? "rejected",
        }),
      ],
    };
  }

  return {};
}

async function toolsNode(state: typeof AgentState.State) {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;
  const toolCallList = lastMsg.tool_calls ?? [];

  const results: ToolMessage[] = [];
  for (const tc of toolCallList) {
    const executor = toolExecutors[tc.name];
    if (!executor) {
      results.push(
        new ToolMessage({ content: "Tool not found.", tool_call_id: tc.id ?? "" })
      );
      continue;
    }
    const result = await executor(tc.args as Record<string, unknown>);
    results.push(
      new ToolMessage({ content: JSON.stringify(result), tool_call_id: tc.id ?? "" })
    );
  }

  return { messages: results };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function shouldApprove(state: typeof AgentState.State) {
  const last = state.messages[state.messages.length - 1] as AIMessage;
  return (last.tool_calls?.length ?? 0) > 0 ? "approval" : "__end__";
}

function afterApproval(state: typeof AgentState.State) {
  const last = state.messages[state.messages.length - 1];
  // If approval node injected a rejection ToolMessage, route back to agent.
  if (
    last instanceof ToolMessage &&
    (last.content as string).includes("rejected")
  ) {
    return "agent";
  }
  return "tools";
}

// ---------------------------------------------------------------------------
// Compile graph
// ---------------------------------------------------------------------------

const workflow = new StateGraph(AgentState)
  .addNode("agent", agentNode)
  .addNode("approval", approvalNode)
  .addNode("tools", toolsNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldApprove, {
    approval: "approval",
    __end__: "__end__",
  })
  .addConditionalEdges("approval", afterApproval, {
    tools: "tools",
    agent: "agent",
  })
  .addEdge("tools", "agent");

export const graph = workflow.compile({ checkpointer });

// ---------------------------------------------------------------------------
// POST /api/p2 — start a new turn for the given threadId
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const { messages, threadId }: { messages: UIMessage[]; threadId: string } =
    await req.json();

  if (!threadId) {
    return Response.json({ error: "threadId is required" }, { status: 400 });
  }

  const lastUser = messages.findLast((m) => m.role === "user");
  if (!lastUser) {
    return Response.json({ error: "No user message" }, { status: 400 });
  }

  const userText =
    lastUser.parts.find((p): p is { type: "text"; text: string } => p.type === "text")
      ?.text ?? "";

  try {
    const result = await graph.invoke(
      { messages: [new HumanMessage(userText)] },
      { configurable: { thread_id: threadId } }
    );

    const last = result.messages[result.messages.length - 1];
    return Response.json({
      status: "done",
      reply: typeof last?.content === "string" ? last.content : "",
    });
  } catch (err) {
    if (isGraphInterrupt(err)) {
      const typedErr = err as { interrupts?: { value: unknown }[] };
      return Response.json({
        status: "awaiting_approval",
        interrupt: typedErr.interrupts?.[0]?.value ?? null,
      });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
