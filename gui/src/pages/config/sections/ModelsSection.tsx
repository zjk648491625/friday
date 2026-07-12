import { ModelRole } from "@friday-ai/config-yaml";
import { ModelDescription } from "core";
import { useContext, useEffect, useState } from "react";
import Shortcut from "../../../components/gui/Shortcut";
import { useEditModel } from "../../../components/mainInput/Lump/useEditBlock";
import { Card, Divider, Toggle } from "../../../components/ui";
import { useAuth } from "../../../context/Auth";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { AddModelForm } from "../../../forms/AddModelForm";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { setDialogMessage, setShowDialog } from "../../../redux/slices/uiSlice";
import { updateSelectedModelByRole } from "../../../redux/thunks/updateSelectedModelByRole";
import { getMetaKeyLabel, isJetBrains } from "../../../util";
import { ConfigHeader } from "../components/ConfigHeader";
import { ModelRoleRow } from "../components/ModelRoleRow";
import { T } from "../../../util/i18n";
import { getPromptOptimizeModel, setPromptOptimizeModel } from "../../../hooks/usePromptOptimizer";
import ModelRoleSelector from "../components/ModelRoleSelector";

const MODEL_DOCS_URLS = {
  chat: {
    learnMore: "https://docs.friday.dev/ide-extensions/chat/quick-start",
    setup: "https://docs.friday.dev/ide-extensions/chat/model-setup",
  },
  autocomplete: {
    learnMore:
      "https://docs.friday.dev/ide-extensions/autocomplete/quick-start",
    setup: "https://docs.friday.dev/ide-extensions/autocomplete/model-setup",
  },
  edit: {
    learnMore: "https://docs.friday.dev/ide-extensions/edit/quick-start",
    setup: "https://docs.friday.dev/ide-extensions/edit/model-setup",
  },
} as const;

export function ModelsSection() {
  const { selectedProfile } = useAuth();
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);

  const config = useAppSelector((state) => state.config.config);
  const jetbrains = isJetBrains();
  const metaKey = getMetaKeyLabel();
  const [showAdditionalRoles, setShowAdditionalRoles] = useState(false);

  // Prompt optimize model - stored in localStorage, independent of config roles
  // finalToBrowserConfig doesn't include a flat `models` field,
  // so we deduplicate from modelsByRole to get all configured models
  const allModels: ModelDescription[] = Object.values(config.modelsByRole ?? {})
    .flat()
    .filter((m: ModelDescription, i, arr) => arr.findIndex((x) => x.title === m.title) === i);
  const [promptOptModel, setPromptOptModel] = useState<ModelDescription | null>(null);
  const [promptOptInit, setPromptOptInit] = useState(false);

  useEffect(() => {
    const stored = getPromptOptimizeModel();
    if (stored) {
      const found = allModels.find((m) => m.title === stored) ?? null;
      setPromptOptModel(found);
    }
    setPromptOptInit(true);
  }, [allModels]);

  useEffect(() => {
    const handler = () => {
      const stored = getPromptOptimizeModel();
      if (stored) {
        const found = allModels.find((m) => m.title === stored) ?? null;
        setPromptOptModel(found);
      } else {
        setPromptOptModel(null);
      }
    };
    window.addEventListener("promptOptimizeModelChanged", handler);
    return () => window.removeEventListener("promptOptimizeModelChanged", handler);
  }, [allModels]);

  function handleRoleUpdate(role: ModelRole, model: ModelDescription | null) {
    if (!model) {
      return;
    }

    void dispatch(
      updateSelectedModelByRole({
        role,
        selectedProfile,
        modelTitle: model.title,
      }),
    );
  }

  const handleConfigureModel = useEditModel();

  function handleAddModel() {
    dispatch(setShowDialog(true));
    dispatch(
      setDialogMessage(
        <AddModelForm
          onDone={() => {
            dispatch(setShowDialog(false));
          }}
        />,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <ConfigHeader
        title="Models"
        onAddClick={handleAddModel}
        addButtonTooltip={T("Add Model")}
      />

      <Card>
        <ModelRoleRow
          role="chat"
          displayName="Chat"
          shortcut={
            <span className="text-2xs text-description-muted">
              (<Shortcut>{`cmd ${jetbrains ? "J" : "L"}`}</Shortcut>)
            </span>
          }
          description={
            <span>
              {T("Used in Chat, Plan, Agent mode")} (
              <a
                href={MODEL_DOCS_URLS.chat.learnMore}
                target="_blank"
                rel="noopener noreferrer"
                className="text-inherit underline hover:brightness-125"
              >{T("Learn more")}</a>
              )
            </span>
          }
          models={config.modelsByRole.chat}
          selectedModel={config.selectedModelByRole.chat ?? undefined}
          onSelect={(model) => handleRoleUpdate("chat", model)}
          onConfigure={handleConfigureModel}
          setupURL={MODEL_DOCS_URLS.chat.setup}
        />

        <Divider />

        <ModelRoleRow
          role="autocomplete"
          displayName="Autocomplete"
          description={
            <span>
              {T("Used in inline code completions as you type")} (
              <a
                href={MODEL_DOCS_URLS.autocomplete.learnMore}
                target="_blank"
                rel="noopener noreferrer"
                className="text-inherit underline hover:brightness-125"
              >{T("Learn more")}</a>
              )
            </span>
          }
          models={config.modelsByRole.autocomplete}
          selectedModel={config.selectedModelByRole.autocomplete ?? undefined}
          onSelect={(model) => handleRoleUpdate("autocomplete", model)}
          onConfigure={handleConfigureModel}
          setupURL={MODEL_DOCS_URLS.autocomplete.setup}
        />

        {/* Jetbrains has a model selector inline */}
        {!jetbrains && (
          <>
            <Divider />
            <ModelRoleRow
              role="edit"
              displayName="Edit"
              shortcut={
                <span className="text-2xs text-description-muted">
                  (<Shortcut>cmd I</Shortcut>)
                </span>
              }
              description={
                <span>
                  {T("Used to transform a selected section of code")} (
                  <a
                    href={MODEL_DOCS_URLS.edit.learnMore}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-inherit underline hover:brightness-125"
                  >{T("Learn more")}</a>
                  )
                </span>
              }
              models={config.modelsByRole.edit}
              selectedModel={config.selectedModelByRole.edit ?? undefined}
              onSelect={(model) => handleRoleUpdate("edit", model)}
              onConfigure={handleConfigureModel}
              setupURL={MODEL_DOCS_URLS.edit.setup}
            />
          </>
        )}
      </Card>

      <Card>
        <Toggle
          isOpen={showAdditionalRoles}
          onToggle={() => setShowAdditionalRoles(!showAdditionalRoles)}
          title={T("Additional model roles")}
          subtitle={T("Apply, Embed, Rerank")}
        >
          <div className="flex flex-col">
            <ModelRoleRow
              role="apply"
              displayName="Apply"
              description={T("Used to apply generated codeblocks to files")}
              models={config.modelsByRole.apply}
              selectedModel={config.selectedModelByRole.apply ?? undefined}
              onSelect={(model) => handleRoleUpdate("apply", model)}
              onConfigure={handleConfigureModel}
              setupURL="https://docs.friday.dev/customize/model-roles/apply"
            />

            <Divider />

            <ModelRoleRow
              role="embed"
              displayName="Embed"
              description={T("Used to generate and query embeddings for the @codebase and @docs context providers")}
              models={config.modelsByRole.embed}
              selectedModel={config.selectedModelByRole.embed ?? undefined}
              onSelect={(model) => handleRoleUpdate("embed", model)}
              onConfigure={handleConfigureModel}
              setupURL="https://docs.friday.dev/customize/model-roles/embeddings"
            />

            <Divider />

            <ModelRoleRow
              role="rerank"
              displayName="Rerank"
              description={T("Used for reranking results from the @codebase and @docs context providers")}
              models={config.modelsByRole.rerank}
              selectedModel={config.selectedModelByRole.rerank ?? undefined}
              onSelect={(model) => handleRoleUpdate("rerank", model)}
              onConfigure={handleConfigureModel}
              setupURL="https://docs.friday.dev/customize/model-roles/reranking"
            />
          </div>
        </Toggle>
      </Card>

      {promptOptInit && (
        <Card>
          <div className="py-6 first:pt-0 last:pb-0">
            <div className="mb-2">
              <span className="text-base font-medium text-foreground">{T("Prompt Optimization")}</span>
            </div>
            <p className="text-description mt-1 mb-2 text-xs">{T("Model used to optimize user prompts via the sparkle button in chat input")}</p>
            <ModelRoleSelector
              displayName={T("Prompt Optimization")}
              description={T("Select the model for prompt optimization")}
              models={allModels}
              selectedModel={promptOptModel}
              onSelect={(model) => {
                setPromptOptModel(model);
                setPromptOptimizeModel(model?.title ?? null);
              }}
              setupURL=""
            />
          </div>
        </Card>
      )}
    </div>
  );
}
