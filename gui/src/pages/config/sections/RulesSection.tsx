import { parseConfigYaml } from "@friday-ai/config-yaml";
import {
  ArrowsPointingOutIcon,
  BookmarkIcon as BookmarkOutline,
  EyeIcon,
  PencilIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolid } from "@heroicons/react/24/solid";
import {
  BrowserSerializedFridayConfig,
  RuleSource,
  RuleWithSource,
  SlashCommandDescWithSource,
} from "core";
import {
  DEFAULT_AGENT_SYSTEM_MESSAGE,
  DEFAULT_CHAT_SYSTEM_MESSAGE,
  DEFAULT_PLAN_SYSTEM_MESSAGE,
} from "core/llm/defaultSystemMessages";
import { getRuleDisplayName } from "core/llm/rules/rules-utils";
import { useContext, useMemo, useState } from "react";
import { DropdownButton } from "../../../components/DropdownButton";
import AddRuleDialog from "../../../components/dialogs/AddRuleDialog";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import HeaderButtonWithToolTip from "../../../components/gui/HeaderButtonWithToolTip";
import Switch from "../../../components/gui/Switch";
import {
  useEditBlock,
  useOpenRule,
} from "../../../components/mainInput/Lump/useEditBlock";
import { useMainEditor } from "../../../components/mainInput/TipTapEditor";
import { Card, EmptyState } from "../../../components/ui";
import { useAuth } from "../../../context/Auth";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useBookmarkedSlashCommands } from "../../../hooks/useBookmarkedSlashCommands";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import {
  DEFAULT_RULE_SETTING,
  setDialogMessage,
  setShowDialog,
  toggleRuleSetting,
} from "../../../redux/slices/uiSlice";
import { fontSize } from "../../../util";
import { ConfigHeader } from "../components/ConfigHeader";
import { T } from "../../../util/i18n";

interface PromptCommandWithSlug extends SlashCommandDescWithSource {
  slug?: string;
}

interface PromptRowProps {
  prompt: PromptCommandWithSlug;
  isBookmarked: boolean;
  setIsBookmarked: (isBookmarked: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
}

/**
 * Displays a single prompt row with bookmark, edit and delete controls
 */
function PromptRow({
  prompt,
  isBookmarked,
  setIsBookmarked,
  onEdit,
  onDelete,
}: PromptRowProps) {
  const { mainEditor } = useMainEditor();

  const handlePromptClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    mainEditor?.commands.insertPrompt({
      title: prompt.name,
      description: prompt.description,
      content: prompt.prompt,
    });
  };

  const handleBookmarkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBookmarked(!isBookmarked);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  const canEdit = prompt.source !== "built-in";
  const canDelete = prompt.source !== "built-in" && !!prompt.sourceFile;
  const canRename = prompt.source !== "built-in" && !!prompt.sourceFile;

  return (
    <div
      className="hover:bg-list-active hover:text-list-active-foreground flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:cursor-pointer"
      onClick={handlePromptClick}
      style={{
        fontSize: fontSize(-3),
      }}
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-foreground shrink-0 font-medium">
          {prompt.name}
          {prompt.sourceFile && (
            <span className="ml-1 text-[10px] text-blue-400">
              {/users|home/i.test(prompt.sourceFile) ? " [全局]" : " [工作区]"}
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-[11px] text-description-muted">
          {prompt.description}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {canEdit && (
          <PencilIcon
            className={`h-3 w-3 cursor-pointer text-description-muted hover:brightness-125`}
            onClick={canEdit ? handleEditClick : undefined}
            aria-disabled={!canEdit}
          />
        )}
        {canRename && (
          <PencilSquareIcon
            className="h-3 w-3 cursor-pointer text-description-muted hover:brightness-125"
            onClick={(e) => {
              e.stopPropagation();
              onRename?.();
            }}
            aria-label="Rename"
          />
        )}
        {canDelete && (
          <TrashIcon
            className="h-3 w-3 cursor-pointer text-description-muted hover:text-red-400"
            onClick={handleDeleteClick}
          />
        )}
        <div
          onClick={handleBookmarkClick}
          className="cursor-pointer pt-0.5 text-description-muted hover:brightness-125"
        >
          {isBookmarked ? (
            <BookmarkSolid className="h-3 w-3" />
          ) : (
            <BookmarkOutline className="h-3 w-3" />
          )}
        </div>
      </div>
    </div>
  );
}

interface RuleCardProps {
  rule: RuleWithSource;
  onRename?: (filepath: string) => void;
}

const RuleCard: React.FC<RuleCardProps> = ({ rule, onRename }) => {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const policy = useAppSelector((state) =>
    rule.name
      ? state.ui.ruleSettings[rule.name] || DEFAULT_RULE_SETTING
      : undefined,
  );

  const isDisabled = policy === "off";
  const openRule = useOpenRule();
  const handleTogglePolicy = () => {
    if (rule.name) {
      dispatch(toggleRuleSetting(rule.name));
    }
  };

  const title = useMemo(() => {
    return getRuleDisplayName(rule);
  }, [rule]);

  function onClickExpand() {
    dispatch(setShowDialog(true));
    dispatch(
      setDialogMessage(
        <div className="max-h-4/5 p-4">
          <h3>{title}</h3>
          <pre className="max-w-full overflow-scroll">{rule.rule}</pre>
        </div>,
      ),
    );
  }

  const handleDelete = () => {
    if (!rule.sourceFile) {
      return;
    }

    dispatch(
      setDialogMessage(
        <ConfirmationDialog
          title={T("Delete Rule")}
          text={T("Are you sure you want to delete this rule file?")}
          confirmText={T("Delete")}
          onConfirm={async () => {
            try {
              await ideMessenger.request("config/deleteRule", {
                filepath: rule.sourceFile!,
              });
            } catch (error) {
              console.error("Failed to delete rule file:", error);
            }
          }}
        />,
      ),
    );
    dispatch(setShowDialog(true));
  };

  const canDeleteRule =
    rule.sourceFile &&
    !["default-chat", "default-agent", "default-plan"].includes(rule.source);

  const smallFont = fontSize(-2);
  const tinyFont = fontSize(-3);
  return (
    <div
      className={`border-border flex flex-col rounded-sm px-2 py-1.5 transition-colors ${isDisabled ? "opacity-50" : ""}`}
    >
      <div className="flex flex-col">
        <div className="flex flex-row justify-between gap-1">
          <span
            className={`line-clamp-2 ${isDisabled ? "text-description-muted" : "text-foreground"}`}
            style={{
              fontSize: smallFont,
            }}
          >
            {title}
            {rule.sourceFile && (
              <span className="ml-1 text-[10px] text-blue-400">
                {/users|home/i.test(rule.sourceFile) ? " [全局]" : " [工作区]"}
              </span>
            )}
          </span>
          <div className="flex flex-row items-center gap-2">
            {rule.name && policy && (
              <div className="flex cursor-pointer flex-row items-center justify-end gap-1 px-2 py-0.5">
                <Switch
                  isToggled={policy === "on"}
                  onToggle={() => handleTogglePolicy()}
                  size={10}
                  text=""
                />
              </div>
            )}
            <div className="flex flex-row items-start gap-1">
              <HeaderButtonWithToolTip onClick={onClickExpand} text={T("Expand")}>
                <ArrowsPointingOutIcon className="h-3 w-3 text-description-muted" />
              </HeaderButtonWithToolTip>{" "}
              {rule.source === "default-chat" ||
              rule.source === "default-agent" ? (
                <HeaderButtonWithToolTip
                  onClick={() => openRule(rule)}
                  text={T("View")}
                >
                  <EyeIcon className="h-3 w-3 text-description-muted" />
                </HeaderButtonWithToolTip>
              ) : (
                <HeaderButtonWithToolTip
                  onClick={() => openRule(rule)}
                  text={T("Edit")}
                >
                  <PencilIcon className="h-3 w-3 text-description-muted" />
                </HeaderButtonWithToolTip>
              )}
              {canDeleteRule && (
                <HeaderButtonWithToolTip
                  onClick={() => onRename?.(rule.sourceFile!)}
                  text={T("Rename")}
                >
                  <PencilSquareIcon className="h-3 w-3 text-description-muted" />
                </HeaderButtonWithToolTip>
              )}
              {canDeleteRule && (
                <HeaderButtonWithToolTip onClick={handleDelete} text={T("Delete")}>
                  <TrashIcon className="h-3 w-3 text-description-muted" />
                </HeaderButtonWithToolTip>
              )}
            </div>
          </div>
        </div>

        <span
          style={{
            fontSize: tinyFont,
          }}
          className={`mt-1 line-clamp-3 ${isDisabled ? "text-description-muted" : "text-description-muted"}`}
        >
          {rule.rule}
        </span>
        {rule.globs ? (
          <div
            style={{
              fontSize: tinyFont,
            }}
            className="mt-1.5 flex flex-col gap-1"
          >
            <span className="italic">{T("Applies to files")}</span>
            <code
              className={`line-clamp-1 px-1 py-0.5 ${isDisabled ? "text-description-muted" : "text-description-muted"}`}
            >
              {rule.globs}
            </code>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Section that displays all available prompts with bookmarking functionality
 */
function PromptsSubSection({
  onRenamePrompt,
}: {
  onRenamePrompt?: (filepath: string) => void;
}) {
  const { selectedProfile } = useAuth();
  const { isCommandBookmarked, toggleBookmark } = useBookmarkedSlashCommands();
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();

  const slashCommands = useAppSelector(
    (state) => state.config.config.slashCommands ?? [],
  );

  const editBlock = useEditBlock();

  const handleEdit = (prompt: PromptCommandWithSlug) => {
    editBlock(prompt.slug, prompt.sourceFile);
  };

  const handleDelete = (prompt: PromptCommandWithSlug) => {
    if (!prompt.sourceFile) return;
    dispatch(
      setDialogMessage(
        <ConfirmationDialog
          title={T("Delete Prompt")}
          text={T("Are you sure you want to delete this prompt?")}
          confirmText={T("Delete")}
          onConfirm={async () => {
            try {
              await ideMessenger.request("config/deletePrompt", {
                filepath: prompt.sourceFile!,
              });
            } catch (error) {
              console.error("Failed to delete prompt:", error);
            }
          }}
        />,
      ),
    );
    dispatch(setShowDialog(true));
  };

  const handleAddPrompt = (mode: string = "global") => {
    if (mode === "global") {
      void ideMessenger.request("config/addGlobalBlock", { blockType: "prompts" });
    } else {
      void ideMessenger.request("config/addLocalWorkspaceBlock", { blockType: "prompts" });
    }
  };

  const sortedCommands = useMemo(() => {
    const promptsWithSlug: PromptCommandWithSlug[] =
      structuredClone(slashCommands);
    // get the slugs from rawYaml
    if (selectedProfile?.rawYaml) {
      const parsed = parseConfigYaml(selectedProfile.rawYaml);
      const parsedPrompts = parsed.prompts ?? [];

      let index = 0;
      for (const commandWithSlug of promptsWithSlug) {
        // skip for local prompt files
        if (commandWithSlug.sourceFile) continue;

        const yamlPrompt = parsedPrompts[index];
        if (yamlPrompt) {
          if ("uses" in yamlPrompt) {
            commandWithSlug.slug = yamlPrompt.uses;
          } else {
            commandWithSlug.slug = `${selectedProfile?.fullSlug.ownerSlug}/${selectedProfile?.fullSlug.packageSlug}`;
          }
        }
        index = index + 1;
      }
    }
    return promptsWithSlug.sort((a, b) => {
      const aBookmarked = isCommandBookmarked(a.name);
      const bBookmarked = isCommandBookmarked(b.name);
      if (aBookmarked && !bBookmarked) return -1;
      if (!aBookmarked && bBookmarked) return 1;
      return 0;
    });
  }, [slashCommands, isCommandBookmarked, selectedProfile]);

  return (
    <div>
      <DropdownButton
        title="Prompts"
        variant="sm"
        options={globalRulesOptions}
        onOptionClick={handleAddPrompt}
        addButtonTooltip={T("Add Prompt")}
      />

      {sortedCommands.length > 0 ? (
        <Card>
          <div>
            {sortedCommands.map((prompt) => (
              <PromptRow
                key={prompt.name}
                prompt={prompt}
                isBookmarked={isCommandBookmarked(prompt.name)}
                setIsBookmarked={() => toggleBookmark(prompt)}
                onEdit={() => handleEdit(prompt)}
                onDelete={() => handleDelete(prompt)}
                onRename={
                  prompt.sourceFile
                    ? () => onRenamePrompt?.(prompt.sourceFile!)
                    : undefined
                }
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState message={T("No prompts configured. Click the + button to add your first prompt.")} />
        </Card>
      )}
    </div>
  );
}

/**
 * Helper function to add the appropriate default system message based on mode
 */
function addDefaultSystemMessage(
  rules: RuleWithSource[],
  mode: string,
  config: BrowserSerializedFridayConfig,
) {
  const modeConfig = {
    chat: {
      customMessage: config.selectedModelByRole.chat?.baseChatSystemMessage,
      defaultMessage: DEFAULT_CHAT_SYSTEM_MESSAGE,
      customSource: "model-options-chat" as RuleSource,
      defaultSource: "default-chat" as RuleSource,
    },
    agent: {
      customMessage: config.selectedModelByRole.chat?.baseAgentSystemMessage,
      defaultMessage: DEFAULT_AGENT_SYSTEM_MESSAGE,
      customSource: "model-options-agent" as RuleSource,
      defaultSource: "default-agent" as RuleSource,
    },
    plan: {
      customMessage: config.selectedModelByRole.chat?.basePlanSystemMessage,
      defaultMessage: DEFAULT_PLAN_SYSTEM_MESSAGE,
      customSource: "model-options-plan" as RuleSource,
      defaultSource: "default-plan" as RuleSource,
    },
  };

  const currentMode = modeConfig[mode as keyof typeof modeConfig];
  if (currentMode) {
    const message = currentMode.customMessage || currentMode.defaultMessage;
    const source = currentMode.customMessage
      ? currentMode.customSource
      : currentMode.defaultSource;

    rules.unshift({
      rule: message,
      source,
    });
  }
}

// Define dropdown options for global rules
const globalRulesOptions = [
  { value: "workspace", label: "Current workspace" },
  { value: "global", label: "Global" },
];

function RulesSubSection({
  onRenameRule,
}: {
  onRenameRule?: (filepath: string) => void;
}) {
  const { selectedProfile } = useAuth();
  const config = useAppSelector((store) => store.config.config);
  const mode = useAppSelector((store) => store.session.mode);
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const [globalRulesMode, setGlobalRulesMode] = useState<string>("workspace");
  const configLoading = useAppSelector((store) => store.config.loading);

  const handleAddRule = (mode?: string) => {
    const currentMode = mode || globalRulesMode;
    dispatch(setShowDialog(true));
    dispatch(
      setDialogMessage(
        <AddRuleDialog
          mode={currentMode === "global" ? "global" : "workspace"}
        />,
      ),
    );
  };

  const handleOptionClick = (value: string) => {
    setGlobalRulesMode(value);
    handleAddRule(value);
  };

  const sortedRules: RuleWithSource[] = useMemo(() => {
    const rules = [...config.rules.map((rule) => ({ ...rule }))];

    // Use profile rawYaml to infer slugs
    if (selectedProfile?.rawYaml) {
      try {
        const parsed = parseConfigYaml(selectedProfile.rawYaml);
        const parsedRules = parsed?.rules ?? [];
        let index = 0;
        for (const rule of rules) {
          if (rule.source === "rules-block") {
            let slug: string | undefined = undefined;
            const yamlRule = parsedRules[index];
            if (yamlRule) {
              if (typeof yamlRule !== "string" && "uses" in yamlRule) {
                slug = yamlRule.uses;
              } else {
                slug = `${selectedProfile?.fullSlug.ownerSlug}/${selectedProfile?.fullSlug.packageSlug}`;
              }
            }
            if (slug) {
              rule.slug = slug;
            }

            index++;
          }
        }
      } catch (e) {
        console.error(
          "Rules notch section: failed to parse selected profile",
          e,
        );
      }
    }

    addDefaultSystemMessage(rules, mode, config);

    return rules;
  }, [config, selectedProfile, mode]);

  return (
    <div>
      <DropdownButton
        title="Rules"
        variant="sm"
        options={globalRulesOptions}
        onOptionClick={handleOptionClick}
        addButtonTooltip={T("Add rules")}
      />

      <Card>
        {sortedRules.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedRules.map((rule, index) => (
              <RuleCard
                key={index}
                rule={rule}
                onRename={
                  rule.sourceFile ? () => onRenameRule?.(rule.sourceFile!) : undefined
                }
              />
            ))}
            {configLoading && (
              <div className="px-2 py-1.5 text-xs opacity-65">{T("Reloading rules from your config...")}</div>
            )}
          </div>
        ) : (
          <EmptyState message={T("No rules configured. Click the + button to add your first rule.")} />
        )}
      </Card>
    </div>
  );
}

export function RulesSection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [renameTarget, setRenameTarget] = useState<{
    kind: "rule" | "prompt";
    filepath: string;
    baseName: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const openRename = (kind: "rule" | "prompt", filepath: string) => {
    const decoded = decodeURIComponent(filepath);
    const base = decoded.split("/").pop() || "";
    const name = base.replace(/\.(md|yaml|yml)$/i, "");
    setRenameTarget({ kind, filepath, baseName: name });
    setRenameValue(name);
  };

  const doRename = async () => {
    if (!renameTarget) return;
    const val = renameValue.trim();
    if (!val || val === renameTarget.baseName) {
      setRenameTarget(null);
      return;
    }
    const msg =
      renameTarget.kind === "rule" ? "config/renameRule" : "config/renamePrompt";
    try {
      await ideMessenger.request(msg, {
        filepath: renameTarget.filepath,
        newName: val,
      });
    } catch (error) {
      console.error("Failed to rename", error);
    }
    setRenameTarget(null);
  };

  return (
    <>
      <ConfigHeader title="Rules" />

      <div className="space-y-6">
        <RulesSubSection onRenameRule={(fp) => openRename("rule", fp)} />
        <PromptsSubSection onRenamePrompt={(fp) => openRename("prompt", fp)} />
      </div>

      {renameTarget && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
          onClick={() => setRenameTarget(null)}
        >
          <div
            className="bg-vsc-editor-background w-full max-w-sm rounded-lg border border-gray-500 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold">
              {renameTarget.kind === "rule" ? "Rename Rule" : "Rename Prompt"}
            </h2>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doRename();
                }}
                className="bg-vsc-input-background text-vsc-foreground w-full rounded-md border border-gray-500 px-3 py-2 text-sm outline-none focus:border-blue-500"
                autoFocus
              />
              <span className="text-description text-sm">.md</span>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>
                {T("Cancel")}
              </Button>
              <Button
                onClick={() => void doRename()}
                disabled={
                  !renameValue.trim() || renameValue.trim() === renameTarget.baseName
                }
              >
                {T("Confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
