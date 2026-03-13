import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

export class ServiceUnavailableError extends Error {
  public kind: "spend_limit" | "temporary";

  constructor(message: string, kind: "spend_limit" | "temporary") {
    super(message);
    this.name = "ServiceUnavailableError";
    this.kind = kind;
  }
}

export async function prompt(
  system: string,
  user: string,
  maxTokens = 2048
): Promise<string> {
  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });

    const block = res.content[0];
    if (block.type === "text") return block.text;
    throw new Error("Unexpected response type");
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // 402 or 429 with billing message = spend limit hit
      if (
        err.status === 402 ||
        (err.status === 429 &&
          err.message?.toLowerCase().includes("billing"))
      ) {
        throw new ServiceUnavailableError(
          "The AI service has reached its monthly limit.",
          "spend_limit"
        );
      }

      // 429 (rate limit) or 529 (overloaded) = temporary
      if (err.status === 429 || err.status === 529) {
        throw new ServiceUnavailableError(
          "The AI service is busy. Please try again in a moment.",
          "temporary"
        );
      }
    }
    throw err;
  }
}
