import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a documentation structure analyzer. Fetch the given documentation URL and extract its learning structure.

Return ONLY a valid JSON object (no markdown wrapper, no explanation, just raw JSON):
{
  "title": "Technology Name",
  "description": "One-sentence description of what this docs covers",
  "sections": [
    {
      "title": "Section Title",
      "url": "https://absolute-url-to-section",
      "level": 1
    }
  ]
}

Rules:
- Fetch the main documentation page and look at its navigation/sidebar/TOC
- Extract 5-20 sections representing a logical learning path (intro → concepts → advanced)
- Use absolute URLs — prepend base URL to any relative links
- level 1 for main topics, level 2 for subtopics
- Prioritize getting-started, tutorials, guides, core concepts sections
- Order sections so someone new could follow them top to bottom`;

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Fetch and analyze this documentation to extract its structure: ${url}`,
      },
    ];

    let response: Anthropic.Message | undefined;
    let iterations = 0;

    while (iterations < 5) {
      response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_fetch_20260209", name: "web_fetch" }],
        messages,
      });

      if (response.stop_reason !== "pause_turn") break;

      // Server-side tool hit iteration limit — re-send to continue
      messages.push({
        role: "assistant",
        content: response.content as unknown as Anthropic.MessageParam["content"],
      });
      iterations++;
    }

    if (!response) {
      return Response.json({ error: "No response from API" }, { status: 500 });
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!textBlock) {
      return Response.json({ error: "No text in response" }, { status: 500 });
    }

    // Extract JSON from response (handle any surrounding text)
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { error: "Could not extract JSON from response", raw: textBlock.text },
        { status: 500 }
      );
    }

    const outline = JSON.parse(jsonMatch[0]);
    return Response.json(outline);
  } catch (error) {
    console.error("Outline error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
