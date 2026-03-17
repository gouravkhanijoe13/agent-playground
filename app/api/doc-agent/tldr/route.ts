import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const { sectionUrl, sectionTitle } = await req.json();

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Fetch this documentation section and return a TLDR summary.

Title: ${sectionTitle}
URL: ${sectionUrl}

Return ONLY a raw JSON object (no markdown):
{
  "tldr": "2-3 sentence plain-English summary of what this section covers",
  "bullets": ["key takeaway 1", "key takeaway 2", "key takeaway 3"]
}`,
      },
    ];

    let response: Anthropic.Message | undefined;
    let iterations = 0;

    while (iterations < 10) {
      response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system:
          "You are a documentation summarizer. Fetch the given URL and return a concise TLDR. Return only raw JSON, no markdown wrapper.",
        tools: [{ type: "web_fetch_20260209", name: "web_fetch" }],
        messages,
      });

      if (response.stop_reason !== "pause_turn") break;

      messages.push({
        role: "assistant",
        content: response.content as unknown as Anthropic.MessageParam["content"],
      });
      messages.push({ role: "user", content: "Continue." });
      iterations++;
    }

    if (!response) {
      return Response.json({ error: "No response" }, { status: 500 });
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!textBlock) {
      return Response.json({ error: "No text" }, { status: 500 });
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "No JSON" }, { status: 500 });
    }

    return Response.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
