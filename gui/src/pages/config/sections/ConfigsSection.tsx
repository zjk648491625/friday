import { Cog6ToothIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useCallback, useContext, useRef } from "react";
import { AssistantIcon } from "../../../components/AssistantAndOrgListbox/AssistantIcon";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import { ToolTip } from "../../../components/gui/Tooltip";
import { Button, Card, Divider, EmptyState } from "../../../components/ui";
import { useAuth } from "../../../context/Auth";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { ConfigHeader } from "../components/ConfigHeader";
import { setDialogMessage, setShowDialog } from "../../../redux/slices/uiSlice";
import { T } from "../../../util/i18n";

export function ConfigsSection() {
  const { profiles, selectedProfile } = useAuth();
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const configError = useAppSelector((state) => state.config.configError);
  const renameInputRef = useRef<HTMLInputElement>(null);

  function handleAddConfig() {
    void ideMessenger.request("config/newAssistantFile", undefined);
  }

  function handleConfigureAgent(profileId: string) {
    ideMessenger.post("config/openProfile", { profileId });
  }

  const handleDeleteProfile = useCallback(
    (uri: string) => {
      dispatch(
        setDialogMessage(
          <ConfirmationDialog
            title={T("Delete Config")}
            text={T("Are you sure you want to delete this config file?")}
            confirmText={T("Delete")}
            onConfirm={async () => {
              try {
                await ideMessenger.request("config/deleteProfile", { uri });
                dispatch(setShowDialog(false));
              } catch (error) {
                console.error("Failed to delete profile:", error);
              }
            }}
          />,
        ),
      );
      dispatch(setShowDialog(true));
    },
    [dispatch, ideMessenger],
  );

  return (
    <>
      <ConfigHeader
        title="Configs"
        onAddClick={handleAddConfig}
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
                          const uri = profile.uri;
                          const title = profile.title;
                          // Extract base name without .yaml suffix for editing
                          const baseName = title.replace(/\.yaml$/, "");
                          dispatch(
                            setDialogMessage(
                              <div className="p-4">
                                <h2 className="mb-3 text-lg font-semibold">{T("Rename Config")}</h2>
                                <div className="flex items-center gap-1">
                                  <input
                                    ref={(el) => { (renameInputRef as any).current = el; }}
                                    type="text"
                                    defaultValue={baseName}
                                    className="bg-vsc-input-background text-vsc-foreground w-full rounded-md border border-gray-500 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const val = (e.target as HTMLInputElement).value.trim();
                                        if (val && val !== baseName) {
                                          dispatch(setShowDialog(false));
                                          dispatch(setDialogMessage(undefined));
                                          void ideMessenger.request("config/renameProfile", { uri, newName: val });
                                        }
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <span className="text-description text-sm">.yaml</span>
                                </div>
                                <div className="mt-3 flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      dispatch(setShowDialog(false));
                                      dispatch(setDialogMessage(undefined));
                                    }}
                                  >
                                    {T("Cancel")}
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      const val = renameInputRef.current?.value?.trim();
                                      if (val && val !== baseName) {
                                        dispatch(setShowDialog(false));
                                        dispatch(setDialogMessage(undefined));
                                        void ideMessenger.request("config/renameProfile", { uri, newName: val });
                                      }
                                    }}
                                  >
                                    {T("Confirm")}
                                  </Button>
                                </div>
                              </div>,
                            ),
                          );
                          dispatch(setShowDialog(true));
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
    </>
  );
}
