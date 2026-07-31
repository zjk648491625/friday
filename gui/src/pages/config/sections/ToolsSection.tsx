import { JSONContent } from "@tiptap/core";
import { ConfigYaml, parseConfigYaml } from "@friday-ai/config-yaml";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  CircleStackIcon,
  CommandLineIcon,
  EllipsisVerticalIcon,
  GlobeAltIcon,
  PencilIcon,
  PlayCircleIcon,
  StopCircleIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { MCPConnectionStatus, MCPServerStatus } from "core";
import { BUILT_IN_GROUP_NAME, CLI_BRIDGE_GROUP_NAME } from "core/tools/builtIn";
import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../../../components/gui/Alert";
import { ToolTip } from "../../../components/gui/Tooltip";
import { useEditBlock } from "../../../components/mainInput/Lump/useEditBlock";
import {
  Button,
  Card,
  EmptyState,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "../../../components/ui";
import { useAuth } from "../../../context/Auth";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { updateConfig } from "../../../redux/slices/configSlice";
import { newSession, setMainEditorContentTrigger } from "../../../redux/slices/sessionSlice";
import { saveCurrentSession } from "../../../redux/thunks/session";
import { ConfigHeader } from "../components/ConfigHeader";
import { ToolPoliciesGroup } from "../components/ToolPoliciesGroup";
import { T } from "../../../util/i18n";

// Four-tier install fallback:
//   1) "Install"      -> backend silently runs `npm i -g @friday-ai/cli`
//   2) fail -> open terminal and run the command (user sees the error)
//   3) fail -> jump to a new chat session with the command prefilled, let AI do it
//   4) fail -> copy-command fallback
// If already installed (detected via `friday --version`), hide the card / show a green check.
type CliInstallStatus =
  | "checking"
  | "not-installed"
  | "installing"
  | "installed"
  | "terminal"
  | "ai"
  | "copy";

const CLI_INSTALL_CMD = "npm install -g @friday-ai/cli";

function buildEditorState(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

interface MCPServerStatusProps {
  allToolsOff: boolean;
  server: MCPServerStatus;
  serverFromYaml?: NonNullable<ConfigYaml["mcpServers"]>[number];
  duplicateDetection: Record<string, boolean>;
}

const ServerStatusTooltip: Record<MCPConnectionStatus, string> = {
  connected: "Active",
  connecting: "Connecting",
  "not-connected": "Inactive",
  disabled: "Off",
  authenticating: "Authenticating",
  error: "Error",
};

const ServerStatusColor: Record<MCPConnectionStatus, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  "not-connected": "bg-description-muted",
  disabled: "bg-description-muted",
  authenticating: "bg-warning",
  error: "bg-error",
};

function MCPServerPreview({
  server,
  serverFromYaml,
  allToolsOff,
  duplicateDetection,
}: MCPServerStatusProps) {
  const [expandedSections, setExpandedSections] = useState<{
    [key: string]: boolean;
  }>({});
  const ideMessenger = useContext(IdeMessengerContext);
  const config = useAppSelector((store) => store.config.config);
  const editBlock = useEditBlock();

  const dispatch = useAppDispatch();
  const updateMCPServerStatus = (status: MCPServerStatus["status"]) => {
    // optimistic config update
    dispatch(
      updateConfig({
        ...config,
        mcpServerStatuses: config.mcpServerStatuses.map((s) =>
          s.id === server.id
            ? {
                ...s,
                status,
              }
            : s,
        ),
      }),
    );
  };

  const onAuthenticate = async () => {
    if ("url" in server) {
      updateMCPServerStatus("authenticating");
      await ideMessenger.request("mcp/startAuthentication", {
        serverId: server.id,
        serverUrl: server.url,
      });
    }
  };

  const onRemoveAuth = async () => {
    if ("url" in server) {
      updateMCPServerStatus("authenticating");
      await ideMessenger.request("mcp/removeAuthentication", {
        serverId: server.id,
        serverUrl: server.url,
      });
    }
  };

  const onRefresh = async () => {
    updateMCPServerStatus("connecting");
    if (server.status === "disabled") {
      await ideMessenger.request("mcp/setServerEnabled", {
        id: server.id,
        enabled: true,
      });
    } else {
      await ideMessenger.request("mcp/reloadServer", {
        id: server.id,
      });
    }
  };

  const onDisconnect = async () => {
    updateMCPServerStatus("disabled");
    dispatch(
      updateConfig({
        ...config,
        tools: config.tools.filter((tool) => tool.group !== server.id),
      }),
    );
    await ideMessenger.request("mcp/setServerEnabled", {
      id: server.id,
      enabled: false,
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const ResourceRow = ({
    title,
    items,
    icon,
    sectionKey,
  }: {
    title: string;
    items:
      | MCPServerStatus["prompts"]
      | MCPServerStatus["resources"]
      | MCPServerStatus["resourceTemplates"];
    icon: React.ReactNode;
    sectionKey: string;
  }) => {
    const isExpanded = expandedSections[sectionKey];
    const hasItems = items.length > 0;

    return (
      <div>
        <div
          className="mx-2 flex cursor-pointer items-center justify-between rounded hover:bg-gray-50 hover:bg-opacity-5"
          onClick={() => toggleSection(sectionKey)}
        >
          <div className="flex items-center gap-3">
            <ChevronDownIcon
              className={`text-description h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
            <div className="flex items-center gap-2">
              {icon}
              <span className="text-sm">{title}</span>
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-badge px-0.5 text-xs font-medium text-badge-foreground">
                {items.length}
              </div>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="mx-2 my-2 mb-3">
            {hasItems ? (
              <div className="space-y-1">
                {items.map((item, idx) => {
                  return (
                    <div
                      key={idx}
                      className="text-description rounded bg-gray-50 bg-opacity-5 px-2 py-1 text-xs"
                    >
                      <code>{item.name}</code>
                      {item.description && (
                        <div className="mt-1 text-xs text-description-muted">
                          {item.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs italic text-description-muted">{T("No {title.toLowerCase()} available")}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="">
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h3 className="my-0 text-sm font-medium text-foreground">{server.name}</h3>
              <ToolTip content={ServerStatusTooltip[server.status] ?? "Error"}>
                <div
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${ServerStatusColor[server.status] ?? "bg-error"}`}
                />
              </ToolTip>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {server.isProtectedResource &&
            "url" in server &&
            server.status !== "connected" && (
              <ToolTip
                content={
                  server.status === "error"
                    ? "Authenticate"
                    : server.status === "authenticating"
                      ? "Authenticating..."
                      : "Remove authentication"
                }
              >
                <Button
                  onClick={
                    server.status === "error"
                      ? onAuthenticate
                      : server.status === "authenticating"
                        ? undefined
                        : onRemoveAuth
                  }
                  variant="ghost"
                  size="sm"
                  className="text-description-muted hover:enabled:text-foreground my-0 h-6 w-6 p-0 pt-0.5"
                  disabled={server.status === "authenticating"}
                >
                  {server.status === "authenticating" ? (
                    <GlobeAltIcon className="animate-spin-slow h-4 w-4 flex-shrink-0" />
                  ) : (
                    <UserCircleIcon className="h-4 w-4 flex-shrink-0" />
                  )}
                </Button>
              </ToolTip>
            )}
          <Listbox>
            <ListboxButton>
              <EllipsisVerticalIcon className="h-4 w-4 flex-shrink-0" />
            </ListboxButton>
            <ListboxOptions className="min-w-fit" anchor="bottom end">
              {server.isProtectedResource && server.status === "connected" && (
                <ListboxOption
                  value="remove auth"
                  onClick={onRemoveAuth}
                  className="justify-start gap-x-1.5"
                >
                  <UserCircleIcon className="h-4 w-4 flex-shrink-0" /> Logout
                </ListboxOption>
              )}

              <ListboxOption
                value="edit mcp"
                className="justify-start gap-x-1.5"
                onClick={() =>
                  editBlock(
                    serverFromYaml && "uses" in serverFromYaml
                      ? serverFromYaml.uses
                      : undefined,
                    server.sourceFile,
                  )
                }
              >
                <PencilIcon
                  className={
                    "h-3.5 w-3.5 flex-shrink-0 cursor-pointer text-description-muted hover:brightness-125"
                  }
                />
                Edit
              </ListboxOption>

              {server.status === "connected" && (
                <ListboxOption
                  value="disconnect"
                  onClick={onDisconnect}
                  className="justify-start gap-x-1.5"
                >
                  <StopCircleIcon className="h-4 w-4 flex-shrink-0" />{" "}
                  Disconnect
                </ListboxOption>
              )}

              {server.status !== "connecting" && (
                <ListboxOption
                  value="reconnect"
                  onClick={onRefresh}
                  className="justify-start gap-x-1.5"
                >
                  {server.status === "disabled" ? (
                    <PlayCircleIcon className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <ArrowPathIcon className="h-4 w-4 flex-shrink-0" />
                  )}
                  Reload
                </ListboxOption>
              )}
            </ListboxOptions>
          </Listbox>
        </div>
      </div>

      {/* Individual resource rows */}
      <div className="mt-1">
        <ToolPoliciesGroup
          showIcon={true}
          groupName={server.name}
          displayName={"Tools"}
          allToolsOff={allToolsOff}
          duplicateDetection={duplicateDetection}
        />
        {server.prompts.length > 0 && (
          <ResourceRow
            title="Prompts"
            items={server.prompts}
            icon={
              <CommandLineIcon className="text-description h-4 w-4 flex-shrink-0" />
            }
            sectionKey={`${server.id}-prompts`}
          />
        )}
        {(server.resources.length > 0 ||
          server.resourceTemplates.length > 0) && (
          <ResourceRow
            title="Resources"
            items={[...server.resources, ...server.resourceTemplates]}
            icon={
              <CircleStackIcon className="text-description h-4 w-4 flex-shrink-0" />
            }
            sectionKey={`${server.id}-resources`}
          />
        )}
      </div>

      {/* Error display below expandable section */}
      {server.errors && server.errors.length > 0 && (
        <div className="mt-3 space-y-2">
          {server.errors.map((error, errorIndex) => (
            <Alert
              key={errorIndex}
              type="error"
              size="sm"
              className="cursor-pointer transition-all hover:underline"
              onClick={() =>
                void ideMessenger.ide.showVirtualFile(server.name, error)
              }
            >
              <span className="text-xs">
                {error.length > 150 ? error.substring(0, 150) + "..." : error}
              </span>
            </Alert>
          ))}
        </div>
      )}

      {server.infos && server.infos.length > 0 && (
        <div className="mt-3 space-y-2">
          {server.infos.map((info, infoIndex) => (
            <Alert
              key={infoIndex}
              type="info"
              size="sm"
              className="transition-all"
              onClick={() =>
                void ideMessenger.ide.showVirtualFile(server.name, info)
              }
            >
              <span
                className="text-xs"
                dangerouslySetInnerHTML={{ __html: info }}
              />
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolsSection() {
  const availableTools = useAppSelector((state) => state.config.config.tools);

  const mode = useAppSelector((store) => store.session.mode);
  const servers = useAppSelector(
    (store) => store.config.config.mcpServerStatuses,
  );
  const { selectedProfile } = useAuth();
  const ideMessenger = useContext(IdeMessengerContext);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const disableMcp = false;

  // Four-tier CLI install flow + live "is it already installed?" detection.
  const [cliStatus, setCliStatus] = useState<CliInstallStatus>("checking");
  const [cliError, setCliError] = useState<string | null>(null);

  const detectInstalled = async () => {
    try {
      const [stdout] = await ideMessenger.ide.subprocess("friday --version");
      if (stdout && stdout.trim().length > 0) {
        setCliStatus("installed");
        return;
      }
    } catch {
      // not installed (or friday not on PATH) — fall through to not-installed
    }
    setCliStatus("not-installed");
  };

  useEffect(() => {
    void detectInstalled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recheckAfterInstall = async () => {
    // Give the install a moment, then re-detect so the green check can appear.
    await new Promise((r) => setTimeout(r, 1500));
    await detectInstalled();
  };

  // Tier 1: backend silently installs. On failure drop to terminal tier.
  const installSilently = async () => {
    setCliStatus("installing");
    setCliError(null);
    try {
      const [stdout, stderr] = await ideMessenger.ide.subprocess(
        CLI_INSTALL_CMD,
      );
      const out = `${stdout}\n${stderr}`.toLowerCase();
      if (
        stderr &&
        stderr.trim().length > 0 &&
        !out.includes("npm warn") &&
        !out.includes("added") &&
        !out.includes("up to date")
      ) {
        throw new Error(stderr || "install failed");
      }
      await recheckAfterInstall();
      if ((await ideMessenger.ide.subprocess("friday --version"))[0]?.trim()) {
        setCliStatus("installed");
      } else {
        setCliStatus("terminal");
      }
    } catch (e) {
      setCliError(e instanceof Error ? e.message : String(e));
      setCliStatus("terminal");
    }
  };

  // Tier 2: open the IDE terminal and run the command (user watches the error).
  const runInTerminal = () => {
    void ideMessenger.ide.runCommand(CLI_INSTALL_CMD);
    setCliStatus("ai");
  };

  // Tier 3: open a fresh chat session with the command prefilled so the AI can install it.
  const installViaAi = () => {
    navigate("/");
    void dispatch(
      saveCurrentSession({ openNewSession: true, generateTitle: true }),
    );
    void dispatch(newSession());
    void dispatch(
      setMainEditorContentTrigger(
        buildEditorState(
          `Please install the Friday CLI by running this command in the terminal: ${CLI_INSTALL_CMD}. ` +
            `After it succeeds, tell me it's done.`,
        ),
      ),
    );
    setCliStatus("copy");
  };

  // Tier 4: copy-command fallback.
  const copyCommand = () => {
    void navigator.clipboard.writeText(CLI_INSTALL_CMD);
    setCliStatus("copy");
  };

  const duplicateDetection = useMemo(() => {
    const counts: Record<string, number> = {};
    availableTools.forEach((tool) => {
      if (counts[tool.function.name]) {
        counts[tool.function.name] = counts[tool.function.name] + 1;
      } else {
        counts[tool.function.name] = 1;
      }
    });
    return Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, v > 1]),
    );
  }, [availableTools]);

  const mergedBlocks = useMemo(() => {
    const parsed = selectedProfile?.rawYaml
      ? parseConfigYaml(selectedProfile?.rawYaml ?? "")
      : undefined;

    // Create a map of YAML servers keyed by name for stable matching
    const yamlServersByName = new Map(
      parsed?.mcpServers
        ?.filter(
          (server): server is NonNullable<typeof server> & { name: string } =>
            server != null && "name" in server,
        )
        .map((server) => [server.name, server]) ?? [],
    );

    return (servers ?? []).map((doc: MCPServerStatus) => ({
      block: doc,
      blockFromYaml: yamlServersByName.get(doc.name),
    }));
  }, [servers, selectedProfile]);

  const handleAddMcpServer = () => {
    void ideMessenger.request("config/addLocalWorkspaceBlock", {
      blockType: "mcpServers",
    });
  };

  const allToolsOff = useMemo(() => {
    return mode === "chat";
  }, [mode]);

  const availableToolsMessage =
    mode === "chat"
      ? "All tools disabled in Chat, switch to Plan or Agent mode to use tools"
      : mode === "plan"
        ? "Read-only tools available in Plan mode"
        : "";

  return (
    <>
      <ConfigHeader
        title="Tools"
        subtext={T("Manage MCP servers and tool policies")}
        className="mb-2"
      />
      {!!availableToolsMessage && (
        <div className="mb-4">
          <Alert type="info" size="sm">
            <span className="text-2xs italic">{availableToolsMessage}</span>
          </Alert>
        </div>
      )}
      <div className="mb-4 space-y-6">
        <ToolPoliciesGroup
          showIcon={false}
          groupName={BUILT_IN_GROUP_NAME}
          displayName={"Built-in Tools"}
          allToolsOff={allToolsOff}
          duplicateDetection={duplicateDetection}
        />
        <ToolPoliciesGroup
          showIcon={false}
          groupName={CLI_BRIDGE_GROUP_NAME}
          displayName={"LSP Code Graph"}
          allToolsOff={allToolsOff}
          duplicateDetection={duplicateDetection}
        />
        {cliStatus !== "installed" && cliStatus !== "checking" && (
          <div className="mb-4 mt-2 rounded-lg border border-blue-500/20 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-description">
                💡{" "}
                {T(
                  "Install Friday CLI for precise LSP-powered analysis (function definitions, call hierarchy, references). Without it, tools use text-based fallback.",
                )}
              </span>
              {cliStatus === "not-installed" && (
                <button
                  onClick={() => void installSilently()}
                  className="ml-3 shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {T("Install")}
                </button>
              )}
              {cliStatus === "installing" && (
                <span className="ml-3 shrink-0 rounded-md bg-blue-600/80 px-3 py-1.5 text-xs font-medium text-white">
                  {T("Installing...")}
                </span>
              )}
              {cliStatus === "terminal" && (
                <div className="ml-3 flex shrink-0 gap-2">
                  <button
                    onClick={() => runInTerminal()}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {T("Run in Terminal")}
                  </button>
                  <button
                    onClick={() => installViaAi()}
                    className="rounded-md border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-blue-500/10"
                  >
                    {T("Let AI Install")}
                  </button>
                </div>
              )}
              {cliStatus === "ai" && (
                <button
                  onClick={() => installViaAi()}
                  className="ml-3 shrink-0 rounded-md border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-blue-500/10"
                >
                  {T("Let AI Install")}
                </button>
              )}
              {cliStatus === "copy" && (
                <button
                  onClick={() => copyCommand()}
                  className="ml-3 shrink-0 rounded-md border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-blue-500/10"
                >
                  {T("Copy Install Command")}
                </button>
              )}
            </div>
            {cliError && cliStatus === "terminal" && (
              <p className="mt-1.5 text-xs text-error">{cliError}</p>
            )}
            <p className="mt-1.5 text-xs text-description-muted">
              <code className="rounded bg-gray-500/10 px-1.5 py-0.5 font-mono text-xs">
                {CLI_INSTALL_CMD}
              </code>
            </p>
          </div>
        )}
        {cliStatus === "installed" && (
          <div className="mb-4 mt-2 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm">
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-success" />
            <span className="text-foreground">
              {T("Friday CLI is installed — LSP-powered analysis is active.")}
            </span>
          </div>
        )}
        <ConfigHeader
          className="pr-2"
          title={T("MCP Servers")}
          variant="sm"
          onAddClick={handleAddMcpServer}
          addButtonTooltip={T("Add MCP Server")}
          showAddButton={!disableMcp}
        />
        {disableMcp ? (
          <Card>
            <EmptyState message="MCP servers are disabled in your organization" />
          </Card>
        ) : (
          <>
            {mode === "chat" && (
              <Alert type="info" size="sm">
                <span className="text-2xs italic">
                  All MCPs are disabled in Chat, switch to Plan or Agent mode to
                  use MCPs
                </span>
              </Alert>
            )}
            {mergedBlocks.length > 0 ? (
              mergedBlocks.map(({ block, blockFromYaml }) => (
                <MCPServerPreview
                  key={block.name}
                  server={block}
                  serverFromYaml={blockFromYaml}
                  allToolsOff={allToolsOff}
                  duplicateDetection={duplicateDetection}
                />
              ))
            ) : (
              <Card>
                <EmptyState message={T("No MCP servers configured. Click the + button to add your first server.")} />
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
