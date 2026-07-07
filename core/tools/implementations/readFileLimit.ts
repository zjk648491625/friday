// Modified by Friday AI Team - Rebranded from Continue
import { ILLM } from "../..";
import { countTokensAsync } from "../../llm/countTokens";
import { FridayError, FridayErrorReason } from "../../util/errors";

export async function throwIfFileExceedsHalfOfContext(
  filepath: string,
  content: string,
  model: ILLM | null,
) {
  if (model) {
    const tokens = await countTokensAsync(content, model.title);
    const tokenLimit = model.contextLength / 2;
    if (tokens > tokenLimit) {
      throw new FridayError(
        FridayErrorReason.FileTooLarge,
        `File ${filepath} is too large (${tokens} tokens vs ${tokenLimit} token limit). Try another approach`,
      );
    }
  }
}
