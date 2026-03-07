import { graph } from "../route";
import { Command, isGraphInterrupt } from "@langchain/langgraph";

// ---------------------------------------------------------------------------
// POST /api/p2/approve
// Resume a paused graph thread after the user approves or rejects a tool call.
// Body: { threadId: string; decision: "approve" | "reject" }
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const { threadId, decision }: { threadId: string; decision: "approve" | "reject" } =
    await req.json();

  if (!threadId || !decision) {
    return Response.json({ error: "threadId and decision are required" }, { status: 400 });
  }

  const config = { configurable: { thread_id: threadId } };

  let result;
  try {
    // Pass a Command({ resume }) to resume from the last checkpoint.
    // The resume value is what interrupt() returns inside the approval node.
    result = await graph.invoke(new Command({ resume: decision }), config);
  } catch (err) {
    if (isGraphInterrupt(err)) {
      const interruptValue = (err as { interrupts?: { value: unknown }[] })
        ?.interrupts?.[0]?.value;
      return Response.json({ status: "awaiting_approval", interrupt: interruptValue });
    }
    throw err;
  }

  const lastMessage = result.messages[result.messages.length - 1];
  return Response.json({
    status: "done",
    reply: typeof lastMessage?.content === "string" ? lastMessage.content : "",
  });
}
