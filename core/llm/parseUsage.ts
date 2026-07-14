import type { Usage } from "../index.js";

/**
 * Parse usage data from various LLM provider formats into a unified Usage object.
 * Handles: OpenAI (camelCase & snake_case), Anthropic, Cohere, Gemini, DeepSeek, and generic fallback.
 */
export function parseUsage(raw: any): Usage | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  // Debug: log usage format to help identify provider-specific fields
  if (typeof raw.prompt_tokens === "number" || typeof raw.promptTokens === "number") {
    const keys = Object.keys(raw).join(", ");
    const details = raw.prompt_tokens_details ? JSON.stringify(raw.prompt_tokens_details) : "none";
    const dscache = raw.prompt_cache_hit_tokens !== undefined
      ? ` deepseek_cache={hit:${raw.prompt_cache_hit_tokens},miss:${raw.prompt_cache_miss_tokens}}`
      : "";
    console.log(`[FRIDAY_USAGE] keys=[${keys}] details=${details}${dscache}`);
  }

  // Direct camelCase match (already normalized)
  if (
    typeof raw.promptTokens === "number" ||
    typeof raw.completionTokens === "number"
  ) {
    return {
      promptTokens: raw.promptTokens ?? 0,
      completionTokens: raw.completionTokens ?? 0,
      totalTokens:
        raw.totalTokens ??
        (raw.promptTokens ?? 0) + (raw.completionTokens ?? 0),
      promptTokensDetails: raw.promptTokensDetails,
      completionTokensDetails: raw.completionTokensDetails,
    };
  }

  // Cohere format: { tokens: { input_tokens, output_tokens }, cached_tokens }
  if (raw.tokens && typeof raw.tokens === "object") {
    const inp = raw.tokens.input_tokens ?? 0;
    const out = raw.tokens.output_tokens ?? 0;
    const details: Usage["promptTokensDetails"] = {};
    if (raw.cached_tokens !== undefined) {
      details.cachedTokens = raw.cached_tokens;
    }
    return {
      completionTokens: out,
      promptTokens: inp,
      totalTokens: inp + out,
      promptTokensDetails:
        Object.keys(details).length > 0 ? details : undefined,
    };
  }

  // Anthropic format: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
  // Distinguish from OpenAI snake_case by checking prompt_tokens is NOT present
  if (
    raw.input_tokens !== undefined &&
    raw.output_tokens !== undefined &&
    raw.prompt_tokens === undefined
  ) {
    const inp = raw.input_tokens ?? 0;
    const out = raw.output_tokens ?? 0;
    // Both can coexist in the same response — capture both simultaneously
    const details: NonNullable<Usage["promptTokensDetails"]> = {};
    if (raw.cache_read_input_tokens !== undefined) {
      details.cachedTokens = raw.cache_read_input_tokens;
    }
    if (raw.cache_creation_input_tokens !== undefined) {
      details.cacheWriteTokens = raw.cache_creation_input_tokens;
    }
    return {
      completionTokens: out,
      promptTokens: inp,
      totalTokens: inp + out,
      promptTokensDetails:
        Object.keys(details).length > 0 ? details : undefined,
    };
  }

  // Gemini format: { promptTokenCount, candidatesTokenCount, totalTokenCount, cachedContentTokenCount }
  if (raw.promptTokenCount !== undefined) {
    const inp = raw.promptTokenCount ?? 0;
    const out = raw.candidatesTokenCount ?? 0;
    const details: Usage["promptTokensDetails"] = {};
    if (raw.cachedContentTokenCount !== undefined) {
      details.cachedTokens = raw.cachedContentTokenCount;
    }
    return {
      completionTokens: out,
      promptTokens: inp,
      totalTokens: raw.totalTokenCount ?? inp + out,
      promptTokensDetails:
        Object.keys(details).length > 0 ? details : undefined,
    };
  }

  // DeepSeek: cache stats at top level (prompt_cache_hit_tokens / prompt_cache_miss_tokens)
  // DeepSeek also uses standard snake_case for prompt_tokens/completion_tokens
  if (
    typeof raw.prompt_cache_hit_tokens === "number" ||
    typeof raw.prompt_cache_miss_tokens === "number"
  ) {
    const inp = raw.prompt_tokens ?? 0;
    const out = raw.completion_tokens ?? 0;
    const details: NonNullable<Usage["promptTokensDetails"]> = {};
    if (typeof raw.prompt_cache_hit_tokens === "number") {
      details.cachedTokens = raw.prompt_cache_hit_tokens;
    }
    return {
      promptTokens: inp,
      completionTokens: out,
      totalTokens: raw.total_tokens ?? inp + out,
      promptTokensDetails:
        Object.keys(details).length > 0 ? details : undefined,
    };
  }

  // OpenAI / DeepSeek snake_case
  const promptTokens = raw.prompt_tokens ?? 0;
  const completionTokens = raw.completion_tokens ?? 0;
  if (promptTokens > 0 || completionTokens > 0) {
    const ptD = raw.prompt_tokens_details;
    const ctD = raw.completion_tokens_details;

    // Build promptTokensDetails only when values are actually present
    const ptDetails: NonNullable<Usage["promptTokensDetails"]> = {};
    if (ptD?.cached_tokens !== undefined)
      ptDetails.cachedTokens = ptD.cached_tokens;
    if (ptD?.cache_write_tokens !== undefined)
      ptDetails.cacheWriteTokens =
        ptD.cache_write_tokens ??
        ptD.cache_creation_input_tokens;
    if (ptD?.audio_tokens !== undefined)
      ptDetails.audioTokens = ptD.audio_tokens;

    const ctDetails: NonNullable<Usage["completionTokensDetails"]> = {};
    if (ctD?.accepted_prediction_tokens !== undefined)
      ctDetails.acceptedPredictionTokens =
        ctD.accepted_prediction_tokens;
    if (ctD?.audio_tokens !== undefined)
      ctDetails.audioTokens = ctD.audio_tokens;
    if (ctD?.reasoning_tokens !== undefined)
      ctDetails.reasoningTokens = ctD.reasoning_tokens;
    if (ctD?.rejected_prediction_tokens !== undefined)
      ctDetails.rejectedPredictionTokens =
        ctD.rejected_prediction_tokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens: raw.total_tokens ?? promptTokens + completionTokens,
      promptTokensDetails:
        Object.keys(ptDetails).length > 0 ? ptDetails : undefined,
      completionTokensDetails:
        Object.keys(ctDetails).length > 0 ? ctDetails : undefined,
    };
  }

  // Generic fallback: scan known token keys
  const aliases: Record<string, "p" | "c"> = {
    prompt_tokens: "p",
    completion_tokens: "c",
    input_tokens: "p",
    output_tokens: "c",
    promptTokens: "p",
    completionTokens: "c",
    inputTokens: "p",
    outputTokens: "c",
  };
  let fp = 0;
  let fc = 0;
  for (const [k, v] of Object.entries(aliases)) {
    const val = (raw as any)[k];
    if (typeof val === "number" && val > 0) {
      if (v === "p") fp = Math.max(fp, val);
      else fc = Math.max(fc, val);
    }
  }
  return fp > 0 || fc > 0
    ? { promptTokens: fp, completionTokens: fc, totalTokens: fp + fc }
    : undefined;
}
