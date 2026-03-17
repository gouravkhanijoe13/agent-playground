import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const LESSON_SYSTEM_PROMPT = `You are DocLearn AI — an expert technical educator who transforms official documentation into engaging, hands-on learning experiences.

Your task: Fetch the given documentation section URL and produce a structured lesson.

Format your response in Markdown with exactly these sections:

# [Original Section Title]

## 📖 What Is This?
Clear, accessible explanation. Start with the simplest mental model ("Think of it like..."), then add technical depth. Avoid unnecessary jargon.

## 🎯 Why This Matters
Concrete real-world motivation. What problem does this solve? When would a developer actually need this?

## 💡 Core Concepts
3–7 essential bullet points. These are the ideas the reader must internalize before writing any code.

## 🔨 Hands-On Implementation
A complete, working code example. Requirements:
- Include all necessary imports
- Add detailed inline comments explaining each step
- Show expected output as a comment at the bottom
- Make it something a developer would actually write (not toy examples)

## 🧪 Practice Challenge
A concrete exercise to reinforce learning. Include:
- Clear requirements (what to build)
- 2–3 hints (no full solution)
- What a successful result looks like

## ⚡ Quick Reference
Key syntax, commands, or patterns in compact form (code snippets, tables, or bullet list).

---

Rules:
- ALWAYS fetch the section URL to get actual content — do not make up information
- Code must be complete and runnable, never truncated
- Be encouraging; assume the reader is a developer new to this specific technology
- If the section content is thin, look for related content nearby to enrich the lesson`;

export async function POST(req: Request) {
  const { sectionUrl, sectionTitle } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messages: Anthropic.MessageParam[] = [
          {
            role: "user",
            content: `Create a hands-on learning lesson for this documentation section.

Title: ${sectionTitle}
URL: ${sectionUrl}

Fetch the URL and generate a complete lesson following the format in your instructions.`,
          },
        ];

        let iterations = 0;
        const MAX_ITERATIONS = 5;

        while (iterations < MAX_ITERATIONS) {
          const apiStream = client.messages.stream({
            model: "claude-opus-4-6",
            max_tokens: 8000,
            thinking: { type: "adaptive" },
            system: LESSON_SYSTEM_PROMPT,
            tools: [{ type: "web_fetch_20260209", name: "web_fetch" }],
            messages,
          });

          // Stream only text deltas (skip thinking blocks)
          for await (const event of apiStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }

          const finalMsg = await apiStream.finalMessage();

          // pause_turn means the server-side tool loop hit its limit — resume
          if (finalMsg.stop_reason !== "pause_turn") break;

          messages.push({
            role: "assistant",
            content: finalMsg.content as unknown as Anthropic.MessageParam["content"],
          });
          messages.push({
            role: "user",
            content: "Continue.",
          });
          iterations++;
        }

        controller.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Stream error";
        controller.enqueue(encoder.encode(`\n\n**Error generating lesson:** ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
