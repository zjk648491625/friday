import { Cog6ToothIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useCallback, useContext, useState } from "react";
import { AssistantIcon } from "../../../components/AssistantAndOrgListbox/AssistantIcon";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import { DropdownButton } from "../../../components/DropdownButton";
import { ToolTip } from "../../../components/gui/Tooltip";
import { Button, Card, Divider, EmptyState } from "../../../components/ui";
import { useAuth } from "../../../context/Auth";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { ConfigHeader } from "../components/ConfigHeader";
import { setDialogMessage, setShowDialog } from "../../../redux/slices/uiSlice";
import { T } from "../../../util/i18n";

const configModeOptions = [
  { value: "workspace", label: "Current workspace" },
  { value: "global", label: "Global" },
];

// Extract the config file's base name (without extension) from its uri,
// so renaming operates on the real file rather than the display title.
function baseNameFromUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const base = decoded.split("/").pop() || "";
  return base.replace(/\.(yaml|yml)$/i, "");
}

export function ConfigsSection() {
  const { profiles, selectedProfile, refreshProfiles } = useAuth();
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const configError = useAppSelector((state) => state.config.configError);

  // Rename dialog state (local React state, NOT dispatched JSX)
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameUri, setRenameUri] = useState("");
  const [renameBaseName, setRenameBaseName] = useState("");
  const [renameInputValue, setRenameInputValue] = useState("");

  function handleAddConfig(mode: string = "global") {
    void ideMessenger.request("config/newAssistantFile", { global: mode === "global" });
  }

  function handleConfigureAgent(profileId: string) {
    ideMessenger.post("config/openProfile", { profileId });
  }

  const handleDeleteProfile = useCallback(
    (uri: string) => {
      console.log("[DELETE-CONFIG] preparing delete for:", uri);
      dispatch(
        setDialogMessage(
          <ConfirmationDialog
            title={T("Delete Config")}
            text={T("Are you sure you want to delete this config file?")}
            confirmText={T("Delete")}
            onConfirm={async () => {
              try {
                console.log("[DELETE-CONFIG] sending request with uri:", uri);
                const result = await ideMessenger.request("config/deleteProfile", { uri });
                console.log("[DELETE-CONFIG] result:", result);
                dispatch(setShowDialog(false));
                void refreshProfiles();
              } catch (error: any) {
                console.error("[DELETE-CONFIG] error:", error?.message || error);
                alert("Delete failed: " + (error?.message || String(error)));
              }
            }}
          />,
        ),
      );
      dispatch(setShowDialog(true));
    },
    [dispatch, ideMessenger],
  );

  const doRename = useCallback(async () => {
    const val = renameInputValue.trim();
    if (!val || val === renameBaseName) return;
    setRenameOpen(false);
    try {
      await ideMessenger.request("config/renameProfile", { uri: renameUri, newName: val });
      void refreshProfiles();
    } catch (error) {
      console.error("Failed to rename profile:", error);
    }
  }, [renameInputValue, renameBaseName, renameUri, ideMessenger, refreshProfiles]);

  return (
    <>
      <DropdownButton
        title="Configs"
        options={configModeOptions}
        onOptionClick={(val) => handleAddConfig(val)}
        addButtonTooltip={T("Add config")}
      />

      <Card>
        {profiles && profiles.length > 0 ? (
          profiles.map((profile, index) => {
            const isSelected = profile.id === selectedProfile?.id;
            const errors = isSelected ? configError : profile.errors;
            const hasFatalErrors =
              errors && errors.some((error) => error.fatal);
            const hasErrors = errors && errors.length > 0;
            return (
              <div key={profile.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                      <AssistantIcon assistant={profile} />
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <h3
                        className={`my-2 text-sm font-medium ${
                          hasFatalErrors
                            ? "text-error"
                            : hasErrors
                              ? "text-warning"
                              : ""
                        }`}
                      >
                        {profile.title}
                        <span className="ml-1 text-[10px] text-blue-400">
                          {/users|home/i.test(profile.uri || "") ? " [全局]" : " [工作区]"}
                        </span>
                      </h3>
                      {errors && errors.length > 0 && (
                        <div className="space-y-1 overflow-hidden">
                          {errors.map((error, errorIndex) => (
                            <div
                              onClick={(e) => {
                                if (error.uri) {
                                  e.stopPropagation();
                                  ideMessenger.post("openFile", {
                                    path: error.uri,
                                  });
                                }
                              }}
                              key={errorIndex}
                              className={`${
                                error.fatal
                                  ? "text-error bg-error/10"
                                  : "bg-yellow-500/10 text-yellow-500"
                              } break-all rounded border border-solid border-transparent px-2 py-1 text-xs ${error.uri ? "cursor-pointer " + (error.fatal ? "hover:border-error" : "hover:border-yellow-500") : ""}`}
                            >
                              {error.message.split("\n")[0]}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <ToolTip content={T("Rename Config")}>
                      <Button
                        onClick={() => {
                          setRenameUri(profile.uri);
                          setRenameBaseName(baseNameFromUri(profile.uri));
                          setRenameInputValue(baseNameFromUri(profile.uri));
                          setRenameOpen(true);
                        }}
                        variant="ghost"
                        size="sm"
                        className="text-description-muted hover:enabled:text-foreground my-0 h-6 w-6 p-0"
                      >
                        <PencilIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      </Button>
                    </ToolTip>
                    <ToolTip content={T("Delete Config")}>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(profile.uri);
                        }}
                        variant="ghost"
                        size="sm"
                        className="text-description-muted hover:enabled:text-red-400 my-0 h-6 w-6 p-0"
                      >
                        <TrashIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      </Button>
                    </ToolTip>
                    <ToolTip content={T("Open configuration")}>
                      <Button
                        onClick={() => handleConfigureAgent(profile.id)}
                        variant="ghost"
                        size="sm"
                        className="text-description-muted hover:enabled:text-foreground my-0 h-6 w-6 p-0"
                      >
                        <Cog6ToothIcon className="h-4 w-4 flex-shrink-0" />
                      </Button>
                    </ToolTip>
                  </div>
                </div>
                {index < profiles.length - 1 && <Divider />}
              </div>
            );
          })
        ) : (
          <EmptyState message={T("No agents configured. Click the + button to add your first agent.")} />
        )}
      </Card>

      {/* Rename dialog — controlled by local React state, NOT Redux dispatch */}
      {renameOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setRenameOpen(false)}>
          <div className="bg-vsc-editor-background w-full max-w-sm rounded-lg border border-gray-500 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg font-semibold">{T("Rename Config")}</h2>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={renameInputValue}
                onChange={(e) => setRenameInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doRename(); }}
                className="bg-vsc-input-background text-vsc-foreground w-full rounded-md border border-gray-500 px-3 py-2 text-sm outline-none focus:border-blue-500"
                autoFocus
              />
              <span className="text-description text-sm">.yaml</span>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameOpen(false)}>{T("Cancel")}</Button>
              <Button onClick={doRename} disabled={!renameInputValue.trim() || renameInputValue.trim() === renameBaseName}>{T("Confirm")}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
