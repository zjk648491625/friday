// Modified by Friday AI Team - Rebranded from Continue
import { decodePackageSlug } from "@friday-ai/config-yaml";
import type { OpenAI } from "openai";
import { Configuration, DefaultApi } from "../api/dist/index.js";
import { Assistant } from "./Assistant.js";
import { createOpenAIClient } from "./createOpenAIClient.js";

export interface FridayClientOptions {
  /**
   * The assistant identifier in the format owner-slug/package-slug
   * If not provided, only the Friday API client will be returned
   */
  assistant?: string;

  /**
   * API Key Authentication
   *
   * API keys must be prefixed with "con_" and provided in the Authorization header.
   * Example: `Authorization: Bearer con_your_api_key_here`
   *
   * API keys can be generated in the Friday Hub web interface under account settings.
   */
  apiKey: string;

  /**
   * Optional organization ID
   *
   * TODO: This should be an org name, not the UUID
   */
  organizationId?: string;

  /**
   * Base URL for the Friday API
   */
  baseURL?: string;
}

export type FridayClient = {
  /**
   * The Friday API client
   */
  api: DefaultApi;

  /**
   * The OpenAI client configured to use the Friday API
   */
  client: OpenAI;

  /**
   * The full YAML configuration for the assistant, along
   * with some additional utility methods
   */
  assistant: Assistant;
};

export type FridayClientBase = {
  /**
   * The Friday API client
   */
  api: DefaultApi;
};

export class Friday {
  /**
   * Create a Friday instance with a specific assistant
   *
   * When you provide an assistant name, this returns a full client with:
   * - Friday API access
   * - A configured OpenAI-compatible client
   * - Assistant configuration and helper methods
   *
   * @param options - Configuration including your API key and assistant name
   * @returns Full Friday environment with API client, LLM client, and assistant config
   */
  static async from(
    options: FridayClientOptions & { assistant: string },
  ): Promise<FridayClient>;

  /**
   * Create a simple Friday API client
   *
   * When you don't specify an assistant, this returns just the Friday API client
   * for making direct API calls.
   *
   * @param options - Configuration including your API key
   * @returns Just the Friday API client
   */
  static async from(
    options: FridayClientOptions & { assistant?: undefined },
  ): Promise<FridayClientBase>;

  /**
   * Internal implementation
   */
  static async from(
    options: FridayClientOptions,
  ): Promise<FridayClientBase | FridayClient> {
    const baseURL = options.baseURL || "https://api.friday.dev/";

    const fridayClient = new DefaultApi(
      new Configuration({
        basePath: baseURL,
        accessToken: options.apiKey
          ? async () => options.apiKey as string
          : undefined,
      }),
    );

    if (!options.assistant) {
      return { api: fridayClient };
    }

    const { ownerSlug, packageSlug } = decodePackageSlug(options.assistant);
    if (!ownerSlug || !packageSlug) {
      throw new Error(
        `Invalid assistant identifier: ${options.assistant}. Expected format: owner-slug/package-slug`,
      );
    }

    const assistants = await fridayClient.listAssistants({
      organizationId: options.organizationId,
      alwaysUseProxy: "true",
    });

    const assistantRes = assistants.find(
      (a) => a.ownerSlug === ownerSlug && a.packageSlug === packageSlug,
    );

    if (!assistantRes) {
      throw new Error(`Assistant ${options.assistant} not found`);
    }

    const assistant = new Assistant(assistantRes.configResult.config);

    const client = createOpenAIClient({
      models: assistant.config.models,
      organizationId: options.organizationId || null,
      apiKey: options.apiKey,
      baseURL: baseURL,
    });

    return {
      api: fridayClient,
      client,
      assistant,
    };
  }
}
