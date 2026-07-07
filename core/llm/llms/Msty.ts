// Modified by Friday AI Team - Rebranded from Continue
import { LLMOptions } from "../../index.js";

import Ollama from "./Ollama.js";

class Msty extends Ollama {
  static providerName = "msty";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "http://localhost:10000",
    model: "codellama-7b",
  };
}

export default Msty;
