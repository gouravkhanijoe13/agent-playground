import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, tool, UIMessage, CoreMessage } from "ai";
import { z } from "zod";
import { StateGraph, END } from "@langchain/langgraph";
// LangGraph imports for state management

const NOTES: string[] = [];

// LangGraph state definition
type AgentState = {
  messages: CoreMessage[];
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; result?: Record<string, unknown> }>;
  shouldContinue: boolean;
};

function tokenize(expression: string): string[] {
  const tokens: string[] = [];
  const regex = /\s*([0-9]*\.?[0-9]+|[()+\-*/])\s*/g;
  let cursor = 0;

  while (cursor < expression.length) {
    regex.lastIndex = cursor;
    const match = regex.exec(expression);
    if (!match || match.index !== cursor) {
      throw new Error("Expression contains invalid characters.");
    }
    tokens.push(match[1]);
    cursor = regex.lastIndex;
  }

  return tokens;
}

function evaluateArithmeticExpression(expression: string): number {
  const tokens = tokenize(expression);
  let index = 0;

  function currentToken(): string | undefined {
    return tokens[index];
  }

  function consume(expected?: string): string {
    const token = currentToken();
    if (!token) {
      throw new Error("Unexpected end of expression.");
    }
    if (expected && token !== expected) {
      throw new Error(`Expected "${expected}" but got "${token}".`);
    }
    index += 1;
    return token;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (currentToken() === "+" || currentToken() === "-") {
      const operator = consume();
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (currentToken() === "*" || currentToken() === "/") {
      const operator = consume();
      const right = parseFactor();
      if (operator === "/" && right === 0) {
        throw new Error("Division by zero is not allowed.");
      }
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseFactor(): number {
    const token = currentToken();
    if (!token) {
      throw new Error("Unexpected end while parsing factor.");
    }

    if (token === "-") {
      consume("-");
      return -parseFactor();
    }

    if (token === "(") {
      consume("(");
      const value = parseExpression();
      consume(")");
      return value;
    }

    const parsed = Number(token);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid numeric token "${token}".`);
    }
    consume();
    return parsed;
  }

  const value = parseExpression();
  if (index !== tokens.length) {
    throw new Error("Invalid trailing tokens in expression.");
  }
  return value;
}

// Tool definitions (same logic, but for LangGraph)
const tools = {
  saveNote: {
    name: "saveNote",
    description: "Save a note to memory.",
    inputSchema: z.object({
      note: z.string().min(1).max(500),
    }),
    execute: async ({ note }: { note: string }) => {
      NOTES.push(note);
      return { saved: note, totalNotes: NOTES.length };
    },
  },
  listNotes: {
    name: "listNotes",
    description: "List all saved notes.",
    inputSchema: z.object({}),
    execute: async () => {
      return { notes: NOTES };
    },
  },
  calc: {
    name: "calc",
    description: "Evaluate a basic arithmetic expression using +, -, *, / and parentheses.",
    inputSchema: z.object({
      expression: z.string().min(1).max(120),
    }),
    execute: async ({ expression }: { expression: string }) => {
      try {
        const resultValue = evaluateArithmeticExpression(expression);
        return { expression, result: resultValue };
      } catch (error) {
        return {
          expression,
          error: error instanceof Error ? error.message : "Invalid expression.",
        };
      }
    },
  },
};

// LangGraph nodes
async function agentNode(state: AgentState): Promise<Partial<AgentState>> {
  // Use AI SDK to get model response with tool calling
  const result = await streamText({
    model: openai("gpt-4o-mini"),
    system: "You are a concise assistant. Use tools when useful. Use saveNote to store notes, listNotes to read notes, and calc for arithmetic.",
    messages: state.messages,
    tools: {
      saveNote: tool({
        description: tools.saveNote.description,
        inputSchema: tools.saveNote.inputSchema,
        execute: tools.saveNote.execute,
      }),
      listNotes: tool({
        description: tools.listNotes.description,
        inputSchema: tools.listNotes.inputSchema,
        execute: tools.listNotes.execute,
      }),
      calc: tool({
        description: tools.calc.description,
        inputSchema: tools.calc.inputSchema,
        execute: tools.calc.execute,
      }),
    },
  });

  // For now, we extract the response (simplified for Project 1)
  // In Projects 2-3, we'll use full LangGraph orchestration

  return {
    shouldContinue: false, // Simplified: assume we're done after one response
  };
}

async function toolsNode(state: AgentState): Promise<Partial<AgentState>> {
  // Execute any pending tool calls
  const updatedToolCalls = [...state.toolCalls];

  for (const toolCall of state.toolCalls) {
    if (!toolCall.result) {
      const tool = tools[toolCall.name as keyof typeof tools];
      if (tool) {
        try {
          const result = await tool.execute(toolCall.args);
          toolCall.result = result;
        } catch (error) {
          toolCall.result = { error: error instanceof Error ? error.message : "Tool execution failed" };
        }
      }
    }
  }

  return {
    toolCalls: updatedToolCalls,
    shouldContinue: false, // Simplified: done after executing tools
  };
}

// Build the LangGraph
function createGraph() {
  const graph = new StateGraph<AgentState>({
    channels: {
      messages: {
        value: (x: CoreMessage[], y?: CoreMessage[]) => y ?? x,
        default: () => [],
      },
      toolCalls: {
        value: (x: Array<{ id: string; name: string; args: Record<string, unknown>; result?: Record<string, unknown> }>, y?: Array<{ id: string; name: string; args: Record<string, unknown>; result?: Record<string, unknown> }>) => y ?? x,
        default: () => [],
      },
      shouldContinue: {
        value: (x: boolean, y?: boolean) => y ?? x,
        default: () => true,
      },
    },
  });

  graph.addNode("agent", agentNode);
  graph.addNode("tools", toolsNode);

  graph.setEntryPoint("agent");
  graph.addEdge("agent", "tools");
  graph.addConditionalEdges(
    "tools",
    (state) => state.shouldContinue ? "agent" : END,
    {
      agent: "agent",
      [END]: END,
    }
  );

  return graph.compile();
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  // For now, we'll still use the AI SDK streaming for UI compatibility
  // The LangGraph integration will be expanded in Projects 2-3
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system:
      "You are a concise assistant for an agent engineering tutorial. Use tools when useful. " +
      "Use saveNote to store notes, listNotes to read notes, and calc for arithmetic.",
    messages: modelMessages,
    tools: {
      saveNote: tool({
        description: "Save a note to memory.",
        inputSchema: z.object({
          note: z.string().min(1).max(500),
        }),
        execute: async ({ note }) => {
          NOTES.push(note);
          return { saved: note, totalNotes: NOTES.length };
        },
      }),
      listNotes: tool({
        description: "List all saved notes.",
        inputSchema: z.object({}),
        execute: async () => {
          return { notes: NOTES };
        },
      }),
      calc: tool({
        description:
          "Evaluate a basic arithmetic expression using +, -, *, / and parentheses.",
        inputSchema: z.object({
          expression: z.string().min(1).max(120),
        }),
        execute: async ({ expression }) => {
          try {
            const resultValue = evaluateArithmeticExpression(expression);
            return { expression, result: resultValue };
          } catch (error) {
            return {
              expression,
              error: error instanceof Error ? error.message : "Invalid expression.",
            };
          }
        },
      }),
    },
  });

  // Graph is initialized and ready for Projects 2-3 expansion
  // const graph = createGraph();

  // For Project 1, we keep AI SDK streaming but have LangGraph structure ready
  return result.toUIMessageStreamResponse();
}
