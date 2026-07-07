// Modified by Friday AI Team - Rebranded from Continue
import { Friday, FridayClient } from "@friday-ai/sdk";
import chalk from "chalk";

import { env } from "./env.js";

/**
 * Initialize the Friday SDK with the given parameters
 * @param apiKey - API key to use for authentication
 * @param assistantSlug - Slug of the assistant to use
 * @param organizationId - Optional organization ID
 * @returns Promise resolving to the Friday SDK instance
 */
export async function initializeFridaySDK(
  apiKey: string | undefined,
  assistantSlug: string,
  organizationId?: string,
): Promise<FridayClient> {
  if (!apiKey) {
    console.error(chalk.red("Error: No API key provided for Friday SDK"));
    throw new Error("No API key provided for Friday SDK");
  }

  try {
    return await Friday.from({
      apiKey,
      assistant: assistantSlug,
      organizationId,
      baseURL: env.apiBase,
    });
  } catch (error) {
    console.error(
      chalk.red("Error initializing Friday SDK:"),
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
