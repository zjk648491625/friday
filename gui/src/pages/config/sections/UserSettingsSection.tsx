import {
  SharedConfigSchema,
  modifyAnyConfigWithSharedConfig,
} from "core/config/sharedConfig";
import { useContext, useEffect, useState } from "react";
import { Card, Toggle, useFontSize } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { updateConfig } from "../../../redux/slices/configSlice";
import { setLocalStorage } from "../../../util/localStorage";
import { ConfigHeader } from "../components/ConfigHeader";
import { UserSetting } from "../components/UserSetting";
import { T } from "../../../util/i18n";
import { useLanguage } from "../../../context/Language";
import { useSettings, loadSettings } from "../../../hooks/useSettings";
import { useThemeMode } from "../../../context/ThemeMode";

function DebugToggle() {
  const [on, setOn] = useState(() => {
    try { return !!localStorage.getItem("friday_debug_enabled"); } catch { return false; }
  });
  const { saveSetting } = useSettings();
  return (
    <UserSetting
      type="toggle"
      title={T("Debug Logging")}
      description={T("Write raw API request/response to ~/.friday/logs/debug.log for troubleshooting. (Restart required to apply)")}
      value={on}
      onChange={(v) => {
        setOn(v);
        try { localStorage.setItem("friday_debug_enabled", v ? "1" : ""); } catch {}
        saveSetting("debugEnabled", v);
      }}
    />
  );
}

export function UserSettingsSection() {
  /////// User settings section //////
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const config = useAppSelector((state) => state.config.config);
  const { saveSetting } = useSettings();
  const { themeMode, setThemeMode } = useThemeMode();

  const [showExperimental, setShowExperimental] = useState(false);
  const { language, setLanguage } = useLanguage();

  // Commit message settings
  const [commitMsg, setCommitMsg] = useState({
    template: "conventional",
    language: "zh",
    detailLevel: "standard",
    referenceHistory: false,
  });
  useEffect(() => {
    loadSettings(ideMessenger).then((s: any) => {
      if (s.commitMessage) {
        setCommitMsg((prev) => ({ ...prev, ...s.commitMessage }));
      }
    });
  }, []);
  const updateCommitMsg = (key: string, value: any) => {
    const next = { ...commitMsg, [key]: value };
    setCommitMsg(next);
    saveSetting("commitMessage", next);
  };

  function handleUpdate(sharedConfig: SharedConfigSchema) {
    // Optimistic update
    const updatedConfig = modifyAnyConfigWithSharedConfig(config, sharedConfig);
    dispatch(updateConfig(updatedConfig));
    // IMPORTANT no need for model role updates (separate logic for selected model roles)
    // simply because this function won't be used to update model roles

    // Actual update to core which propagates back with config update event
    ideMessenger.post("config/updateSharedConfig", sharedConfig);
  }

  // Disable autocomplete
  const disableAutocompleteInFiles = (
    config.tabAutocompleteOptions?.disableInFiles ?? []
  ).join(", ");
  const [formDisableAutocomplete, setFormDisableAutocomplete] = useState(
    disableAutocompleteInFiles,
  );

  useEffect(() => {
    // Necessary so that reformatted/trimmed values don't cause dirty state
    setFormDisableAutocomplete(disableAutocompleteInFiles);
  }, [disableAutocompleteInFiles]);

  // Workspace prompts
  const promptPath = config.experimental?.promptPath || "";

  // TODO defaults are in multiple places, should be consolidated and probably not explicit here
  const showSessionTabs = config.ui?.showSessionTabs ?? false;
  const fridayAfterToolRejection =
    config.ui?.fridayAfterToolRejection ?? false;
  const codeWrap = config.ui?.codeWrap ?? false;
  const showChatScrollbar = config.ui?.showChatScrollbar ?? false;
  const readResponseTTS = config.experimental?.readResponseTTS ?? false;
  const displayRawMarkdown = config.ui?.displayRawMarkdown ?? false;
  const disableSessionTitles = config.disableSessionTitles ?? false;
  const useCurrentFileAsContext =
    config.experimental?.useCurrentFileAsContext ?? false;
  const enableExperimentalTools =
    config.experimental?.enableExperimentalTools ?? false;
  const onlyUseSystemMessageTools =
    config.experimental?.onlyUseSystemMessageTools ?? false;
  const codebaseToolCallingOnly =
    config.experimental?.codebaseToolCallingOnly ?? false;
  // Friday AI: Telemetry disabled (local-only mode)

  const useAutocompleteMultilineCompletions =
    config.tabAutocompleteOptions?.multilineCompletions ?? "auto";
  const modelTimeout = config.tabAutocompleteOptions?.modelTimeout ?? 150;
  const debounceDelay = config.tabAutocompleteOptions?.debounceDelay ?? 250;
  const fontSize = useFontSize();

  const cancelChangeDisableAutocomplete = () => {
    setFormDisableAutocomplete(disableAutocompleteInFiles);
  };
  const handleDisableAutocompleteSubmit = () => {
    handleUpdate({
      disableAutocompleteInFiles: formDisableAutocomplete
        .split(",")
        .map((val) => val.trim())
        .filter((val) => !!val),
    });
  };

  return (
    <div>
      <div className="flex flex-col">
        <ConfigHeader title={T("User Settings")} />
        <div className="space-y-6">
          {/* Chat Interface Settings */}
          <div>
            <ConfigHeader title="Chat" variant="sm" />
            <Card>
              <div className="flex flex-col gap-4">
                <UserSetting
                  type="toggle"
                  title={T("Show Session Tabs")}
                  description={T("Displays tabs above the chat as an alternative way to organize and access your sessions.")}
                  value={showSessionTabs}
                  onChange={(value) => handleUpdate({ showSessionTabs: value })}
                />
                <UserSetting
                  type="toggle"
                  title={T("Wrap Codeblocks")}
                  description={T("Wraps long lines in code blocks instead of showing horizontal scroll.")}
                  value={codeWrap}
                  onChange={(value) => handleUpdate({ codeWrap: value })}
                />
                <UserSetting
                  type="toggle"
                  title={T("Show chat scrollbar")}
                  description={T("Enables a scrollbar in the chat window.")}
                  value={showChatScrollbar}
                  onChange={(value) =>
                    handleUpdate({ showChatScrollbar: value })
                  }
                />
                <UserSetting
                  type="toggle"
                  title={T("Text-to-Speech Output")}
                  description={T("Reads LLM responses aloud with TTS.")}
                  value={readResponseTTS}
                  onChange={(value) => handleUpdate({ readResponseTTS: value })}
                />
                <UserSetting
                  type="toggle"
                  title={T("Enable Session Titles")}
                  description={T("Generates summary titles for each chat session after the first message, using the current Chat model.")}
                  value={!disableSessionTitles}
                  onChange={(value) =>
                    handleUpdate({ disableSessionTitles: !value })
                  }
                />
                <UserSetting
                  type="toggle"
                  title={T("Format Markdown")}
                  description={T("If off, shows responses as raw text.")}
                  value={!displayRawMarkdown}
                  onChange={(value) =>
                    handleUpdate({ displayRawMarkdown: !value })
                  }
                />
              </div>
            </Card>
          </div>

          {/* Appearance Settings */}
          <div>
            <ConfigHeader title="Appearance" variant="sm" />
            <Card>
              <div className="flex flex-col gap-4">
                <UserSetting
                  type="select"
                  title={T("Theme")}
                  description={T("Choose your preferred theme appearance.")}
                  value={themeMode}
                  onChange={(val) => setThemeMode(val as any)}
                  options={[
                    { label: T("Follow IDE"), value: "follow-ide" },
                    { label: T("Follow System"), value: "follow-system" },
                    { label: T("Dark"), value: "dark" },
                    { label: T("Light"), value: "light" },
                  ]}
                />
                <UserSetting
                  type="select"
                  title={T("Language")}
                  description={T("Switch UI language / 切换界面显示语言")}
                  value={language}
                  onChange={(lang) => { setLanguage(lang as "zh" | "en"); saveSetting("language", lang); }}
                  options={[
                    { label: "中文", value: "zh" },
                    { label: "English", value: "en" },
                  ]}
                />
                <UserSetting
                  type="number"
                  title={T("Font Size")}
                  description={T("Specifies base font size for UI elements.")}
                  value={fontSize}
                  onChange={(val) => {
                    setLocalStorage("fontSize", val);
                    handleUpdate({ fontSize: val });
                  }}
                  min={7}
                  max={50}
                />
              </div>
            </Card>
          </div>

          {/* Autocomplete Settings */}
          <div>
            <ConfigHeader title="Autocomplete" variant="sm" />
            <Card>
              <div className="flex flex-col gap-4">
                <UserSetting
                  type="select"
                  title={T("Multiline Autocompletions")}
                  description={T("Controls multiline completions for autocomplete.")}
                  value={useAutocompleteMultilineCompletions}
                  onChange={(value) =>
                    handleUpdate({
                      useAutocompleteMultilineCompletions: value as
                        | "auto"
                        | "always"
                        | "never",
                    })
                  }
                  options={[
                    { label: "Auto", value: "auto" },
                    { label: "Always", value: "always" },
                    { label: "Never", value: "never" },
                  ]}
                />
                <UserSetting
                  type="number"
                  title={T("Autocomplete Timeout (ms)")}
                  description={T("Maximum time in milliseconds for autocomplete request/retrieval.")}
                  value={modelTimeout}
                  onChange={(val) => handleUpdate({ modelTimeout: val })}
                  min={100}
                  max={5000}
                />
                <UserSetting
                  type="number"
                  title={T("Autocomplete Debounce (ms)")}
                  description={T("Minimum time in milliseconds to trigger an autocomplete request after a change.")}
                  value={debounceDelay}
                  onChange={(val) => handleUpdate({ debounceDelay: val })}
                  min={0}
                  max={2500}
                />
                <UserSetting
                  type="input"
                  title={T("Disable autocomplete in files")}
                  description={T("List of comma-separated glob pattern to disable autocomplete in matching files.")}
                  placeholder="**/*.(txt,md)"
                  value={formDisableAutocomplete}
                  onChange={setFormDisableAutocomplete}
                  onSubmit={handleDisableAutocompleteSubmit}
                  onCancel={cancelChangeDisableAutocomplete}
                  isDirty={
                    formDisableAutocomplete !== disableAutocompleteInFiles
                  }
                  isValid={formDisableAutocomplete.trim() !== ""}
                />
              </div>
            </Card>
          </div>

          {/* Commit Message Settings */}
          <div>
            <ConfigHeader title="提交信息生成" variant="sm" />
            <Card>
              <div className="flex flex-col gap-4">
                <UserSetting
                  type="select"
                  title="格式模板"
                  description="提交信息的格式结构"
                  value={commitMsg.template}
                  onChange={(val) => updateCommitMsg("template", val)}
                  options={[
                    { label: "Conventional Commits", value: "conventional" },
                    { label: "Gitmoji 风格", value: "gitmoji" },
                    { label: "简单 (纯描述)", value: "simple" },
                  ]}
                />
                <UserSetting
                  type="select"
                  title="详细程度"
                  description="控制输出内容的多少"
                  value={commitMsg.detailLevel}
                  onChange={(val) => updateCommitMsg("detailLevel", val)}
                  options={[
                    { label: "精简 (一句话)", value: "concise" },
                    { label: "标准 (标题+要点)", value: "standard" },
                    { label: "详细 (完整描述)", value: "detailed" },
                  ]}
                />
                <UserSetting
                  type="select"
                  title="生成语言"
                  description="提交信息使用的语言"
                  value={commitMsg.language}
                  onChange={(val) => updateCommitMsg("language", val)}
                  options={[
                    { label: "中文", value: "zh" },
                    { label: "English", value: "en" },
                  ]}
                />
                <UserSetting
                  type="toggle"
                  title="参考历史提交信息"
                  description="生成时参考最近 10 条 Git 提交记录的风格"
                  value={commitMsg.referenceHistory}
                  onChange={(val) => updateCommitMsg("referenceHistory", val)}
                />
              </div>
            </Card>
          </div>

          {/* Experimental Settings */}
          <div>
            <ConfigHeader title="Experimental" variant="sm" />
            <Card>
              <Toggle
                isOpen={showExperimental}
                onToggle={() => setShowExperimental(!showExperimental)}
                title={T("Show Experimental Settings")}
              >
                <div className="flex flex-col gap-x-1 gap-y-4">
                  <UserSetting
                    type="toggle"
                    title={T("Add Current File by Default")}
                    description=" the currently open file is added as context in every new conversation."
                    value={useCurrentFileAsContext}
                    onChange={(value) =>
                      handleUpdate({ useCurrentFileAsContext: value })
                    }
                  />
                  <UserSetting
                    type="toggle"
                    title={T("Enable experimental tools")}
                    description=" enables access to experimental tools that are still in development."
                    value={enableExperimentalTools}
                    onChange={(value) =>
                      handleUpdate({ enableExperimentalTools: value })
                    }
                  />
                  <UserSetting
                    type="toggle"
                    title={T("Only use system message tools")}
                    description=" Friday will not attempt to use native tool calling and will only use system message tools."
                    value={onlyUseSystemMessageTools}
                    onChange={(value) =>
                      handleUpdate({ onlyUseSystemMessageTools: value })
                    }
                  />
                  <UserSetting
                    type="toggle"
                    title={T("@Codebase: use tool calling only")}
                    description=" @codebase context provider will only use tool calling for code retrieval."
                    value={codebaseToolCallingOnly}
                    onChange={(value) =>
                      handleUpdate({ codebaseToolCallingOnly: value })
                    }
                  />
                  <UserSetting
                    type="toggle"
                    title={T("Stream after tool rejection")}
                    description=" streaming will friday after the tool call is rejected."
                    value={fridayAfterToolRejection}
                    onChange={(value) =>
                      handleUpdate({ fridayAfterToolRejection: value })
                    }
                  />
                  <DebugToggle />
                </div>
              </Toggle>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
