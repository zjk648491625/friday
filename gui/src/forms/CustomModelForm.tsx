import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useContext, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button, Input } from "../components";
import { defaultBorderRadius } from "../components/index";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { T } from "../util/i18n";

const PROVIDER_OPTIONS = [
  { label: "OpenAI Compatible", value: "openai" },
  { label: "Anthropic Compatible", value: "anthropic" },
];

const ROLE_OPTIONS = [
  { key: "chat", label: "Chat", desc: "对话模型，用于聊天和代码生成" },
  {
    key: "autocomplete",
    label: "Autocomplete",
    desc: "代码补全（需模型支持 FIM / Fill-in-the-Middle）",
  },
  { key: "edit", label: "Edit", desc: "行内编辑" },
  { key: "apply", label: "Apply", desc: "应用差异/补丁" },
];

interface FetchedModel {
  id: string;
  created?: number;
}

export function CustomModelForm({ onDone }: { onDone: () => void }) {
  const formMethods = useForm({
    defaultValues: { provider: "openai", roles: ["chat"] },
  });
  const ideMessenger = useContext(IdeMessengerContext);

  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFetched, setShowFetched] = useState(false);

  const watchProvider = formMethods.watch("provider");
  const watchApiBase = formMethods.watch("apiBase");
  const watchApiKey = formMethods.watch("apiKey");

  const handleFetchModels = useCallback(async () => {
    const apiBase = watchApiBase?.trim();
    const apiKey = watchApiKey?.trim();
    if (!apiBase) return;
    setIsFetching(true);
    setShowFetched(true);
    try {
      const baseUrl = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
      const resp = await fetch(`${baseUrl}/models`, {
        headers: apiKey
          ? { Authorization: `Bearer ${apiKey}` }
          : {},
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const list: FetchedModel[] = Array.isArray(data?.data)
        ? data.data.map((m: any) => ({ id: m.id, created: m.created }))
        : Array.isArray(data)
          ? data.map((m: any) => ({ id: m.id || m.name || m, created: m.created }))
          : [];
      list.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      setFetchedModels(list);
    } catch {
      setFetchedModels([]);
    } finally {
      setIsFetching(false);
    }
  }, [watchApiBase, watchApiKey]);

  const handleSelectModel = (id: string) => {
    formMethods.setValue("modelName", id);
    setShowFetched(false);
  };

  function onSubmit(data: any) {
    const modelName = data.modelName?.trim();
    if (!modelName) return;

    const apiBase = data.apiBase?.trim();
    const apiKey = data.apiKey?.trim();
    const provider = data.provider;
    const roles: string[] = data.roles || ["chat"];
    const contextLength = data.contextLength ? Number(data.contextLength) : undefined;
    const maxTokens = data.maxTokens ? Number(data.maxTokens) : undefined;
    const temperature = data.temperature ? Number(data.temperature) : undefined;
    const topP = data.topP ? Number(data.topP) : undefined;
    const enableCache = data.enableCache;

    const model: Record<string, any> = {
      title: modelName,
      provider,
      model: modelName,
    };
    if (apiBase) model.apiBase = apiBase;
    if (apiKey) model.apiKey = apiKey;
    if (contextLength) model.contextLength = contextLength;
    if (maxTokens)
      model.completionOptions = { ...(model.completionOptions || {}), maxTokens };
    if (temperature !== undefined && temperature !== "")
      model.completionOptions = { ...(model.completionOptions || {}), temperature };
    if (topP !== undefined && topP !== "")
      model.completionOptions = { ...(model.completionOptions || {}), topP };
    if (enableCache)
      model.cacheBehavior = { cacheConversation: true, cacheSystemMessage: true };

    ideMessenger.post("config/addModel", { model, roles });
    ideMessenger.post("config/openProfile", { profileId: "local" });
    onDone();
  }

  const isDisabled = !formMethods.watch("modelName")?.trim();

  return (
    <FormProvider {...formMethods}>
      <form
        onSubmit={formMethods.handleSubmit(onSubmit)}
        className="p-6"
        style={{ maxWidth: 480, margin: "0 auto" }}
      >
        <h1 className="mb-0 text-center text-2xl">{T("Custom Model")}</h1>

        <div className="my-8 flex flex-col gap-5">
          {/* 1. Provider Type */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              {T("Provider Type")}
            </label>
            <select
              {...formMethods.register("provider")}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{
                background:
                  "var(--vscode-input-background, rgba(128,128,128,0.08))",
                borderColor: "var(--vscode-panel-border, #444)",
                color: "var(--vscode-foreground)",
                borderRadius: defaultBorderRadius,
              }}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. API Base URL */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              {T("API Base URL")}
            </label>
            <Input
              id="apiBase"
              className="w-full"
              placeholder={
                watchProvider === "anthropic"
                  ? "https://api.anthropic.com/v1/"
                  : "https://api.openai.com/v1/"
              }
              {...formMethods.register("apiBase")}
            />
            <span className="text-description-muted mt-0.5 block text-xs">
              {watchProvider === "anthropic"
                ? T("Any Anthropic Messages API compatible endpoint")
                : T("Any OpenAI compatible endpoint")}
            </span>
          </div>

          {/* 4. API Key */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              {T("API Key")}
            </label>
            <Input
              id="apiKey"
              className="w-full"
              type="password"
              placeholder={T("Enter API key (optional for local endpoints)")}
              {...formMethods.register("apiKey")}
            />
          </div>

          {/* 5. Model Name + Refresh + Model List */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium">
                {T("Model Name")}
              </label>
              <Button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetching || !watchApiBase}
                className="gap-1 !px-2 !py-0.5 text-xs"
                variant="ghost"
                size="sm"
              >
                <ArrowPathIcon
                  className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
                />
                {T("Refresh")}
              </Button>
            </div>
            <Input
              id="modelName"
              className="w-full"
              placeholder={T("e.g. gpt-4o, claude-sonnet-4-6")}
              {...formMethods.register("modelName")}
            />

            {showFetched && (
              <div
                className="mt-1 max-h-40 overflow-y-auto rounded border"
                style={{
                  background:
                    "var(--vscode-input-background, rgba(128,128,128,0.06))",
                  borderColor: "var(--vscode-panel-border, #444)",
                }}
              >
                {fetchedModels.length === 0 ? (
                  <div
                    className="px-3 py-2 text-xs"
                    style={{ color: "var(--vscode-descriptionForeground)" }}
                  >
                    {isFetching ? "Loading..." : "No models found"}
                  </div>
                ) : (
                  fetchedModels.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => handleSelectModel(m.id)}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      <CubeIcon className="h-3 w-3 opacity-50" />
                      <span>{m.id}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 6. Role */}
          <div>
            <label className="mb-2 block text-sm font-medium">{T("Role")}</label>
            <div className="flex flex-col gap-2">
              {ROLE_OPTIONS.map((opt) => {
                const roles: string[] = formMethods.watch("roles") || [];
                const checked = roles.includes(opt.key);
                return (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-start gap-2 rounded border px-3 py-2"
                    style={{
                      borderColor: checked
                        ? "#3b82f6"
                        : "var(--vscode-panel-border, #444)",
                      background: checked
                        ? "rgba(59,130,246,0.1)"
                        : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? roles.filter((r) => r !== opt.key)
                          : [...roles, opt.key];
                        formMethods.setValue("roles", next.length > 0 ? next : ["chat"]);
                      }}
                      className="mt-0.5 accent-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span
                        className="mt-0.5 block text-xs"
                        style={{ color: "var(--vscode-descriptionForeground)" }}
                      >
                        {opt.desc}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 8. Context Length */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              {T("Context Length")}
            </label>
            <Input
              id="contextLength"
              className="w-full"
              type="number"
              placeholder="128000"
              {...formMethods.register("contextLength")}
            />
          </div>

          {/* 9. Cache Support */}
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                {...formMethods.register("enableCache")}
                className="h-4 w-4 rounded accent-blue-500"
              />
              {T("Enable Prompt Caching")}
            </label>
            <span className="text-description-muted block text-xs">
              {T(
                "Reduces cost and latency for repeated prompts (provider must support it)",
              )}
            </span>
          </div>

          {/* 10. Advanced Options Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between border-none bg-transparent py-1 text-sm font-medium"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              <span>{T("Advanced Options")}</span>
              {showAdvanced ? (
                <ArrowUpIcon className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownIcon className="h-3.5 w-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-2 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {T("Max Tokens")}
                    </label>
                    <Input
                      id="maxTokens"
                      type="number"
                      placeholder="4096"
                      {...formMethods.register("maxTokens")}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {T("Temperature")}
                    </label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      placeholder="0.7"
                      {...formMethods.register("temperature")}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {T("Top P")}
                    </label>
                    <Input
                      id="topP"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      placeholder="1.0"
                      {...formMethods.register("topP")}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="w-full">
          <Button type="submit" className="w-full" disabled={isDisabled}>
            {T("Add Model")}
          </Button>
          <span className="text-description-muted mt-1 block w-full text-center text-xs">
            {T("This will add the model to your config file")}
          </span>
        </div>
      </form>
    </FormProvider>
  );
}

export default CustomModelForm;
