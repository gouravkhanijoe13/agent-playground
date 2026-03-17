import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: Request) {
  const { sectionUrl, sectionTitle, messages: chatMessages } = await req.json();

  const systemPrompt = `You are a helpful technical assistant answering questions about the "${sectionTitle}" documentation section.

Reference URL: ${sectionUrl}

You can use web_fetch to look up additional details if needed. Keep answers focused and practical. Use code examples when helpful. Be concise.`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messages: Anthropic.MessageParam[] = chatMessages;
        let iterations = 0;

        while (iterations < 10) {
          const apiStream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            system: systemPrompt,
            tools: [{ type: "web_fetch_20260209", name: "web_fetch" }],
            messages,
          });

          for await (const event of apiStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }

          const finalMsg = await apiStream.finalMessage();
          if (finalMsg.stop_reason !== "pause_turn") break;

          messages.push({
            role: "assistant",
            content: finalMsg.content as unknown as Anthropic.MessageParam["content"],
          });
          messages.push({ role: "user", content: "Continue." });
          iterations++;
        }

        controller.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Error";
        controller.enqueue(encoder.encode(`**Error:** ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
