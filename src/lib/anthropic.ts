import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

export async function prompt(
  system: string,
  user: string,
  maxTokens = 2048
): Promise<string> {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  const block = res.content[0];
  if (block.type === "text") return block.text;
  throw new Error("Unexpected response type");
}
