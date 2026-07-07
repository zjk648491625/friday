// Modified by Friday AI Team - Rebranded from Continue
import { ModelProvider } from "../types.js";
import { OsLlms } from "./os.js";

export const Vllm: ModelProvider = {
  models: OsLlms,
  id: "vllm",
  displayName: "vLLM",
};
