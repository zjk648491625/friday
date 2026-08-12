import { createAsyncThunk } from "@reduxjs/toolkit";

import StreamErrorDialog from "../../pages/gui/StreamError";
import { analyzeError } from "../../util/errorAnalysis";

const OVERLOADED_RETRIES = 3;
const OVERLOADED_DELAY_MS = 2000;

function isOverloadedErrorMessage(message?: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("overloaded") || lower.includes("529");
}
import { selectSelectedChatModel } from "../slices/configSlice";
import { setDialogMessage, setShowDialog } from "../slices/uiSlice";
import { ThunkApiType } from "../store";
import { cancelStream } from "./cancelStream";
import { saveCurrentSession } from "./session";

export const streamThunkWrapper = createAsyncThunk<
  void,
  () => Promise<void>,
  ThunkApiType
>("chat/streamWrapper", async (runStream, { dispatch, getState }) => {
  for (let attempt = 0; attempt <= OVERLOADED_RETRIES; attempt++) {
    try {
      await runStream();
      const state = getState();
      if (!state.session.isInEdit) {
        await dispatch(
          saveCurrentSession({
            openNewSession: false,
            generateTitle: true,
          }),
        );
      }
      return;
    } catch (e) {
      try {
        await dispatch(cancelStream());

        const state = getState();
        const selectedModel = selectSelectedChatModel(state);
        const { message } = analyzeError(e, selectedModel);

        const shouldRetry =
          isOverloadedErrorMessage(message) && attempt < OVERLOADED_RETRIES;

        if (shouldRetry) {
          const delayMs = OVERLOADED_DELAY_MS * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          await dispatch(cancelStream());
          continue;
        }

        dispatch(setDialogMessage(<StreamErrorDialog error={e} />));
        dispatch(setShowDialog(true));
        return;
      } catch (innerError) {
        console.error(
          "Failed to show error dialog:",
          innerError,
          "Original error:",
          e,
        );
        dispatch(
          setDialogMessage(
            <div className="px-3 pb-3 pt-3">
              <h3 className="text-error m-0 p-0 text-lg font-medium">
                Error handling model response
              </h3>
              <div className="mb-1 mt-3">
                <p className="m-0 mb-2 p-0">
                  An error occurred while chatting:{" "}
                  {(e as any)?.message || String(e)}
                </p>
              </div>
            </div>,
          ),
        );
        dispatch(setShowDialog(true));
        return;
      }
    }
  }
});