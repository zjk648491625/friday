import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  CheckIcon,
  CubeIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Fragment, useCallback, useContext, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button, Input } from "../components";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "../components/ui";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { T, Tfmt } from "../util/i18n";

const PROVIDER_OPTIONS = [
  { label: "OpenAI Compatible", value: "openai" },
  { label: "Anthropic Compatible", value: "anthropic" },
];

const ROLE_OPTIONS = [
  { key: "chat",       label: "Chat",             desc: "对话模型，用于聊天和代码生成" },
  { key: "autocomplete",label: "Autocomplete",     desc: "代码补全（需模型支持 FIM / Fill-in-the-Middle）" },
  { key: "edit",       label: "Edit",              desc: "行内编辑，用自然语言修改代码" },
  { key: "apply",      label: "Apply",             desc: "应用差异/补丁到文件" },
  { key: "embed",      label: "Embed",             desc: "生成嵌入向量，用于 @codebase 和 @docs 检索" },
  { key: "rerank",     label: "Rerank",            desc: "对 @codebase 和 @docs 检索结果进行重排序" },
  { key: "summarize",  label: "Summarize",         desc: "总结聊天历史和上下文" },
  { key: "subagent",   label: "Subagent",          desc: "自主子代理任务执行" },
  { key: "commitMessage", label: "Commit Message", desc: "生成 Git 提交信息" },
];

interface FetchedModel {
  id: string;
  created?: number;
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (!t) return 0;
  let score = 0, qi = 0, last = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 1 + (last === i - 1 ? 5 : 0);
      last = i;
      qi++;
    }
  }
  return qi === q.length ? score / t.length : 0;
}

export function CustomModelForm({ onDone }: { onDone: () => void }) {
  const formMethods = useForm({
    defaultValues: {
      provider: "openai",
      roles: ["chat", "autocomplete", "edit", "apply", "embed", "rerank", "summarize", "subagent", "commitMessage"],
      enableCache: true,
      apiBase: "",
      apiKey: "",
      modelName: "",
      providerName: "",
      contextLength: "",
      maxTokens: "",
      temperature: "",
      topP: "",
    },
  });
  const ideMessenger = useContext(IdeMessengerContext);

  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  const watchProvider = formMethods.watch("provider");
  const watchApiBase = formMethods.watch("apiBase");
  const watchApiKey = formMethods.watch("apiKey");
  const watchModelName = formMethods.watch("modelName");

  // Close dropdown on outside click
  const closeDropdown = useCallback(() => {
    setModelDropdownOpen(false);
    setModelSearch("");
  }, []);

  const handleFetchModels = useCallback(async () => {
    const apiBase = watchApiBase?.trim();
    const apiKey = watchApiKey?.trim();
    if (!apiBase) return;
    setIsFetching(true);
    try {
      const baseUrl = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
      const resp = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
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
      hasFetched.current = true;
    } catch {
      setFetchedModels([]);
    } finally {
      setIsFetching(false);
    }
  }, [watchApiBase, watchApiKey]);

  const handleToggleDropdown = useCallback(() => {
    if (!modelDropdownOpen) {
      // Open: if never fetched, auto-fetch; otherwise show cached
      if (!hasFetched.current && watchApiBase) {
        handleFetchModels();
      }
      setModelDropdownOpen(true);
    } else {
      closeDropdown();
    }
  }, [modelDropdownOpen, watchApiBase, handleFetchModels, closeDropdown]);

  const handleSelectModel = (id: string) => {
    formMethods.setValue("modelName", id);
    closeDropdown();
  };

  // Filter models by search
  const filteredModels = useMemo(() => {
    if (!modelSearch) return fetchedModels;
    return fetchedModels
      .map((m) => ({ model: m, score: fuzzyScore(modelSearch, m.id) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ model }) => model);
  }, [fetchedModels, modelSearch]);

  function onSubmit(data: any) {
    const modelName = data.modelName?.trim();
    if (!modelName) return;

    const apiBase = data.apiBase?.trim();
    const apiKey = data.apiKey?.trim();
    const provider = data.provider;
    const roles: string[] = data.roles?.length ? data.roles : ["chat"];
    const contextLength = data.contextLength ? Number(data.contextLength) : undefined;
    const maxTokens = data.maxTokens ? Number(data.maxTokens) : undefined;
    const temperature = data.temperature ? Number(data.temperature) : undefined;
    const topP = data.topP ? Number(data.topP) : undefined;
    const enableCache = data.enableCache;
    const providerName = data.providerName?.trim();

    const model: Record<string, any> = {
      title: modelName,
      provider,
      model: modelName,
    };
    if (apiBase) model.apiBase = apiBase;
    if (apiKey) model.apiKey = apiKey;
    if (providerName) model.providerName = providerName;
    if (contextLength) model.contextLength = contextLength;
    if (maxTokens)
      model.completionOptions = { ...(model.completionOptions || {}), maxTokens };
    if (temperature != null)
      model.completionOptions = { ...(model.completionOptions || {}), temperature };
    if (topP != null)
      model.completionOptions = { ...(model.completionOptions || {}), topP };
    if (enableCache)
      model.cacheBehavior = { cacheConversation: true, cacheSystemMessage: true };

    (ideMessenger as any).post("config/addModel", { model, roles });
    (ideMessenger as any).post("config/openProfile", { profileId: "local" });
    onDone();
  }

  const isDisabled = !formMethods.watch("modelName")?.trim();

  return (
    <FormProvider {...formMethods}>
      <form onSubmit={formMethods.handleSubmit(onSubmit)}>
        <div className="mx-auto max-w-md p-6">
          <h1 className="mb-0 text-center text-2xl">{T("Custom Model")}</h1>

          <div className="my-8 flex flex-col gap-6">
            {/* 1. Provider Type */}
            <div>
              <label className="block text-sm font-medium">{T("Provider Type")}</label>
              <Listbox
                value={watchProvider}
                onChange={(val: string) => formMethods.setValue("provider", val)}
              >
                <div className="relative mt-1">
                  <ListboxButton
                    className="bg-input border-border text-foreground hover:bg-list-active relative m-0 grid h-full w-full cursor-pointer grid-cols-[1fr_auto] items-center rounded-lg border border-solid py-2 pl-3 pr-10 text-left text-xs focus:outline-none"
                  >
                    <span className="flex items-center">
                      <CubeIcon className="mr-2 h-4 w-4 opacity-50" />
                      <span>{PROVIDER_OPTIONS.find((o) => o.value === watchProvider)?.label}</span>
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <svg className="text-description-muted h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                    </span>
                  </ListboxButton>
                  <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <ListboxOptions className="bg-input rounded-default absolute left-0 top-full z-10 mt-1 overflow-y-auto p-0 focus:outline-none [&]:!max-h-[20vh]" style={{ minWidth: 180, maxWidth: 300 }}>
                      {PROVIDER_OPTIONS.map((opt) => (
                        <ListboxOption
                          key={opt.value}
                          value={opt.value}
                          className={({ selected }: { selected: boolean }) =>
                            `${selected ? "bg-list-active" : "bg-input"} hover:bg-list-active hover:text-list-active-foreground relative flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-xs`
                          }
                        >
                          {({ selected }: { selected: boolean }) => (
                            <>
                              <div className="flex items-center">
                                <CubeIcon className="mr-2 h-4 w-4 opacity-50" />
                                <span>{opt.label}</span>
                              </div>
                              {selected && <CheckIcon className="h-3 w-3" />}
                            </>
                          )}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </Transition>
                </div>
              </Listbox>
            </div>

          {/* 2. Provider Display Name */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              {T("Provider Display Name")}
            </label>
            <Input
              id="providerName"
              className="w-full"
              placeholder={T("e.g. SiliconFlow, Tencent, Alibaba Bailian")}
              {...formMethods.register("providerName")}
            />
            <span className="text-description-muted mt-0.5 block text-xs">
              {T("Shown in model list; leave empty to show provider type")}
            </span>
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

          {/* 5. Model Name */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">{T("Model Name")}</label>
              <button
                type="button"
                title={T("Refresh models from endpoint")}
                className={`cursor-pointer border-none bg-transparent p-0 ${watchApiBase && watchProvider !== "anthropic" ? "text-description-muted hover:text-foreground" : "invisible"}`}
                onClick={handleFetchModels}
                disabled={isFetching}
              >
                <ArrowPathIcon className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="relative mt-1" ref={dropdownRef}>
              <Input
                id="modelName"
                className="w-full"
                placeholder={T("e.g. gpt-4o, claude-sonnet-4-6")}
                {...formMethods.register("modelName")}
              />
              {fetchedModels.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleDropdown}
                  className="absolute inset-y-0 right-0 flex items-center pr-2 border-0 bg-transparent cursor-pointer"
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                >
                  <ArrowDownIcon className={`h-3.5 w-3.5 transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`} />
                </button>
              )}
              {/* Dropdown panel */}
              {modelDropdownOpen && (
                <div className="bg-input border-border absolute left-0 right-0 top-full z-10 mt-1 flex max-h-52 flex-col overflow-hidden rounded-lg border">
                  <div className="border-border sticky top-0 border-b px-2 py-1.5">
                    <div className="bg-background border-border flex items-center rounded border pl-2">
                      <MagnifyingGlassIcon className="text-description-muted h-3.5 w-3.5 flex-shrink-0" />
                      <input type="text" placeholder={T("Search models...")} value={modelSearch} onChange={(e) => setModelSearch(e.target.value)}
                        className="w-full border-0 bg-transparent px-2 py-1 text-xs outline-none" style={{ color: "var(--vscode-foreground)" }} autoFocus onClick={(e) => e.stopPropagation()} />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {isFetching ? (
                      <div className="text-description-muted px-3 py-4 text-center text-xs"><ArrowPathIcon className="mr-1 inline h-3 w-3 animate-spin" />{T("Loading...")}</div>
                    ) : filteredModels.length === 0 ? (
                      <div className="text-description-muted px-3 py-4 text-center text-xs">
                        {Tfmt('No models found matching "{query}"', { query: modelSearch })}
                      </div>
                    ) : (
                      <>
                        <div className="text-description-muted px-3 py-1 text-[10px] font-medium uppercase tracking-wider">{T("Fetched Models")}</div>
                        {filteredModels.map((m) => {
                          const isActive = watchModelName === m.id;
                          return (
                            <div key={m.id} onClick={() => handleSelectModel(m.id)}
                              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${isActive ? "bg-list-active text-list-active-foreground" : "hover:bg-list-active"}`}>
                              <CubeIcon className="h-3 w-3 flex-shrink-0 opacity-50" />
                              <span className="flex-1 truncate">{m.id}</span>
                              {isActive && <CheckIcon className="h-3 w-3 flex-shrink-0 text-blue-400" />}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 6. Advanced Options (collapsible) */}
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
              <div className="mt-3 flex flex-col gap-4">
                {/* Roles */}
                <div>
                  <label className="mb-2 block text-sm font-medium">{T("Roles")}</label>
                  <div className="flex flex-col gap-2">
                    {ROLE_OPTIONS.map((opt) => {
                      const roles: string[] = formMethods.watch("roles") || [];
                      const checked = roles.includes(opt.key);
                      return (
                        <label
                          key={opt.key}
                          className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 ${
                            checked
                              ? "border-[var(--vscode-focusBorder,#3b82f6)] bg-[var(--vscode-list-activeSelectionBackground,rgba(128,128,128,0.1))]"
                              : "border-[var(--vscode-panel-border,#555)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? roles.filter((r) => r !== opt.key)
                                : [...roles, opt.key];
                              formMethods.setValue("roles", next);
                            }}
                            className="mt-0.5 accent-blue-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-foreground">{T(opt.label)}</span>
                            <span className="mt-0.5 block text-xs text-description">
                              {T(opt.desc)}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Context Length */}
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {T("Context Length")}
                  </label>
                  <Input id="contextLength" className="w-full" type="number" placeholder="128000" {...formMethods.register("contextLength")} />
                </div>

                {/* Cache */}
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" {...formMethods.register("enableCache")} className="h-4 w-4 rounded accent-blue-500" />
                    {T("Enable Prompt Caching")}
                  </label>
                  <span className="text-description-muted block text-xs">
                    {T("Reduces cost and latency for repeated prompts (provider must support it)")}
                  </span>
                </div>

                {/* Sampling params */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">{T("Max Tokens")}</label>
                    <Input id="maxTokens" type="number" placeholder="4096" {...formMethods.register("maxTokens")} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">{T("Temperature")}</label>
                    <Input id="temperature" type="number" step="0.1" min="0" max="2" placeholder="0.7" {...formMethods.register("temperature")} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">{T("Top P")}</label>
                    <Input id="topP" type="number" step="0.05" min="0" max="1" placeholder="1.0" {...formMethods.register("topP")} />
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
        </div>
      </form>
    </FormProvider>
  );
}

export default CustomModelForm;
