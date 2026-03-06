import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, tool, UIMessage } from "ai";
import { z } from "zod";

const NOTES: string[] = [];

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
    if (!token) throw new Error("Unexpected end of expression.");
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
    if (!token) throw new Error("Unexpected end while parsing factor.");

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

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

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

  return result.toUIMessageStreamResponse();
}
