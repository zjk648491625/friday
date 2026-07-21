import { ModelRole } from "@friday-ai/config-yaml";

import { FridayConfig, ILLM } from "..";
import { LLMConfigurationStatuses } from "../llm/constants";
import {
  GlobalContext,
  GlobalContextModelSelections,
} from "../util/GlobalContext";

export function rectifySelectedModelsFromGlobalContext(
  fridayConfig: FridayConfig,
  profileId: string,
): FridayConfig {
  const configCopy = { ...fridayConfig };

  const globalContext = new GlobalContext();
  const currentSelectedModels = globalContext.get("selectedModelsByProfileId");
  const currentForProfile: GlobalContextModelSelections =
    currentSelectedModels?.[profileId] ?? {};

  let fellBack = false;

  const roles: ModelRole[] = [
    "autocomplete",
    "apply",
    "edit",
    "embed",
    "rerank",
    "chat",
    "summarize",
    "subagent",
    "commitMessage",
  ];

  for (const role of roles) {
    // Skip roles not present in modelsByRole (e.g. roles added later
    // that aren't yet populated by intermediateToFinalConfig).
    const candidates = fridayConfig.modelsByRole[role];
    if (!candidates) continue;

    let newModel: ILLM | null = null;
    const currentSelection = currentForProfile[role] ?? null;

    if (currentSelection) {
      const match = candidates.find(
        (m) => m.title === currentSelection,
      );
      if (match) {
        newModel = match;
      }
    }

    if (!newModel && candidates.length > 0) {
      newModel = candidates[0];
    }

    if (!(currentSelection === (newModel?.title ?? null))) {
      fellBack = true;
    }

    // Currently only check for configuration status for apply
    if (
      role === "apply" &&
      newModel?.getConfigurationStatus() !== LLMConfigurationStatuses.VALID
    ) {
      continue;
    }

    configCopy.selectedModelByRole[role] = newModel;
  }

  // In the case shared config wasn't respected,
  // Rewrite the shared config
  if (fellBack) {
    globalContext.update("selectedModelsByProfileId", {
      ...currentSelectedModels,
      [profileId]: Object.fromEntries(
        Object.entries(configCopy.selectedModelByRole).map(([key, value]) => [
          key,
          value?.title ?? null,
        ]),
      ),
    });
  }

  return configCopy;
}
