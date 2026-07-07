// Modified by Friday AI Team - Rebranded from Continue
// ProfileHandlers manage the loading of a config, allowing us to abstract over different ways of getting to a FridayConfig

import { ConfigResult } from "@continuedev/config-yaml";
import { FridayConfig } from "../../index.js";
import { ProfileDescription } from "../ProfileLifecycleManager.js";

// After we have the FridayConfig, the ConfigHandler takes care of everything else (loading models, lifecycle, etc.)
export interface IProfileLoader {
  description: ProfileDescription;
  doLoadConfig(): Promise<ConfigResult<FridayConfig>>;
  setIsActive(isActive: boolean): void;
}
