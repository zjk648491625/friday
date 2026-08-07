import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import { T } from "../../util/i18n";
import { BaseSessionMetadata, ChatMessage, Session } from "core";
import { NEW_SESSION_TITLE } from "core/util/constants";
import { renderChatMessage } from "core/util/messageContent";
import { IIdeMessenger } from "../../context/IdeMessenger";
import { selectSelectedChatModel } from "../slices/configSlice";
import { selectSelectedProfile } from "../slices/profilesSlice";
import {
  deleteSessionMetadata,
  newSession,
  recordFork,
  setAllSessionMetadata,
  setIsSessionMetadataLoading,
  updateSessionMetadata,
} from "../slices/sessionSlice";
import { addTab, setTabs } from "../slices/tabsSlice";
import { ThunkApiType } from "../store";
import { updateSelectedModelByRole } from "../thunks/updateSelectedModelByRole";

const MAX_TITLE_LENGTH = 100;

// Compact local timestamp for fork titles, e.g. "20260807184900".
// Appended so multiple forks of the same session get distinguishable names.
function formatForkTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

// Async session functions live in thunks (because of IDE messaging mostly)
// see sessionSlice for sync redux session functions

export async function getSession(
  ideMessenger: IIdeMessenger,
  id: string,
): Promise<Session> {
  const result = await ideMessenger.request("history/load", { id });
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.content;
}

export const refreshSessionMetadata = createAsyncThunk<
  BaseSessionMetadata[],
  {
    offset?: number;
    limit?: number;
  },
  ThunkApiType
>("session/refreshMetadata", async ({ offset, limit }, { dispatch, extra, getState }) => {
  const dirsResult = await extra.ideMessenger.request("getWorkspaceDirs", undefined);
  const workspaceDirectory = (dirsResult.status === "success" ? dirsResult.content?.[0] : undefined) || "";
  const result = await extra.ideMessenger.request("history/list", {
    limit,
    offset,
    workspaceDirectory,
  });
  if (result.status === "error") {
    throw new Error(result.error);
  }
  const sessions = result.content;
  const sessionIds = new Set(sessions.map((s) => s.sessionId));

  // Filter tabs: keep only tabs belonging to current workspace sessions
  const state = getState();
  const filteredTabs = state.tabs.tabs.filter(
    (tab) => !tab.sessionId || sessionIds.has(tab.sessionId),
  );
  dispatch(setTabs(filteredTabs));

  dispatch(setIsSessionMetadataLoading(false));
  dispatch(setAllSessionMetadata(sessions));
  return sessions;
});

export const deleteSession = createAsyncThunk<void, string, ThunkApiType>(
  "session/delete",
  async (id, { getState, dispatch, extra }) => {
    dispatch(deleteSessionMetadata(id)); // optimistic
    const state = getState();
    if (id === state.session.id) {
      await dispatch(loadLastSession());
    }
    const result = await extra.ideMessenger.request("history/delete", { id });
    if (result.status === "error") {
      throw new Error(result.error);
    }
    void dispatch(refreshSessionMetadata({}));
  },
);

export const updateSession = createAsyncThunk<void, Session, ThunkApiType>(
  "session/update",
  async (session, { extra, dispatch }) => {
    dispatch(
      updateSessionMetadata({
        sessionId: session.sessionId,
        title: session.title,
      }),
    ); // optimistic session metadata update
    await extra.ideMessenger.request("history/save", session);
    await dispatch(refreshSessionMetadata({}));
  },
);

/*
 this is only used for the custom focusFridaySessionId command at the moment
*/
export const loadSession = createAsyncThunk<
  void,
  {
    sessionId: string;
    saveCurrentSession: boolean;
  },
  ThunkApiType
>(
  "session/load",
  async ({ sessionId, saveCurrentSession: save }, { extra, dispatch }) => {
    if (save) {
      // save the session in the background
      void dispatch(
        saveCurrentSession({
          openNewSession: false,
          generateTitle: true,
        }),
      );
    }
    const session = await getSession(extra.ideMessenger, sessionId);
    dispatch(newSession(session));

    // Restore fork relationship (if this session was forked from another).
    if (session.forkedFrom) {
      dispatch(recordFork({ parentId: session.forkedFrom, childId: session.sessionId, forkPoint: session.forkPoint }));
    }

    // Restore selected chat model from session, if present
    if (session.chatModelTitle) {
      void dispatch(selectChatModelForProfile(session.chatModelTitle));
    }
  },
);

export const selectChatModelForProfile = createAsyncThunk<
  void,
  string,
  ThunkApiType
>(
  "session/selectModelForCurrentProfile",
  async (modelTitle, { extra, dispatch, getState }) => {
    const state = getState();
    const modelMatch = state.config.config?.modelsByRole?.chat?.find(
      (m) => m.title === modelTitle,
    );
    const selectedProfile = selectSelectedProfile(state);
    if (selectedProfile && modelMatch) {
      await dispatch(
        updateSelectedModelByRole({
          role: "chat",
          modelTitle: modelTitle,
          selectedProfile,
        }),
      );
    }
  },
);

export const loadLastSession = createAsyncThunk<void, void, ThunkApiType>(
  "session/loadLast",
  async (_, { extra, dispatch, getState }) => {
    let lastSessionId = getState().session.lastSessionId;

    // const lastSessionResult = await extra.ideMessenger.request("history/list", {
    //   limit: 1,
    // });
    // if (lastSessionResult.status === "success") {
    //   lastSessionId = lastSessionResult.content.at(0)?.sessionId;
    // }

    if (!lastSessionId) {
      dispatch(newSession());
      return;
    }

    let session: Session;
    try {
      session = await getSession(extra.ideMessenger, lastSessionId);
    } catch {
      // retry again after 1 sec
      await new Promise((resolve) => setTimeout(resolve, 1000));
      session = await getSession(extra.ideMessenger, lastSessionId);
    }
    dispatch(newSession(session));
    if (session.forkedFrom) {
      dispatch(recordFork({ parentId: session.forkedFrom, childId: session.sessionId, forkPoint: session.forkPoint }));
    }
    if (session.chatModelTitle) {
      dispatch(selectChatModelForProfile(session.chatModelTitle));
    }
  },
);

function getChatTitleFromMessage(message: ChatMessage) {
  const text =
    renderChatMessage(message)
      .split("\n")
      .filter((l) => l.trim() !== "")
      .slice(-1)[0] || "";

  // Truncate
  if (text.length > MAX_TITLE_LENGTH) {
    return text.slice(0, MAX_TITLE_LENGTH - 3) + "...";
  }
  return text;
}

export const saveCurrentSession = createAsyncThunk<
  void,
  { openNewSession: boolean; generateTitle: boolean },
  ThunkApiType
>(
  "session/saveCurrent",
  async ({ openNewSession, generateTitle }, { dispatch, extra, getState }) => {
    const session = getState().session; // assign to a variable so that even when current session changes, we have the reference to the old session
    if (session.history.length === 0) {
      return;
    }

    if (openNewSession) {
      dispatch(newSession());
    }

    const selectedChatModel = selectSelectedChatModel(getState());

    // New session has already been dispatched
    // Now save previous session and update chat title if relevant
    let title = session.title;
    if (title === NEW_SESSION_TITLE) {
      if (
        !getState().config.config?.disableSessionTitles &&
        selectedChatModel
      ) {
        let assistantResponse = session.history
          ?.filter((h) => h.message.role === "assistant")[0]
          ?.message?.content?.toString();

        if (assistantResponse && generateTitle) {
          try {
            const result = await extra.ideMessenger.request(
              "chatDescriber/describe",
              {
                text: assistantResponse,
              },
            );
            if (result.status === "success" && result.content) {
              title = result.content;
            }
          } catch (e) {
            console.error("Error generating chat title", e);
          }
        }
      }
      // Fallbacks if above doesn't work out or session titles disabled
      if (title === NEW_SESSION_TITLE) {
        title = getChatTitleFromMessage(session.history[0].message);
      }
    }
    // More fallbacks in case of no title
    if (!title.length) {
      const metadata = session.allSessionMetadata.find(
        (m) => m.sessionId === session.id,
      );
      if (metadata?.title) {
        title = metadata.title;
      }
    }
    if (!title.length) {
      title = NEW_SESSION_TITLE;
    }

    const dirsResult = await extra.ideMessenger.request("getWorkspaceDirs", undefined);
    const workspaceDir = dirsResult.status === "success" ? dirsResult.content?.[0] || "" : "";
    const updatedSession: Session = {
      sessionId: session.id,
      title,
      workspaceDirectory: workspaceDir,
      history: session.history,
      mode: session.mode,
      chatModelTitle: selectedChatModel?.title ?? null,
    };

    const result = await dispatch(updateSession(updatedSession));
    unwrapResult(result);
  },
);

// Synchronously-reserved fork ids so two rapid forks of the same original
// session never compute identical ids and overwrite each other.
const reservedForkIds = new Set<string>();

/**
 * Fork the conversation up to (and including) the assistant reply at `index`
 * into a brand-new session, leaving the original session completely intact.
 *
 * Order of operations matters:
 *   1. Persist the ORIGINAL session first so it is never lost or altered.
 *   2. Persist the forked session to disk (history/save + refresh metadata)
 *      so it appears in History and can be reloaded later.
 *   3. Record the parent/child relationship (redux + localStorage).
 *   4. Open the fork as a NEW tab and switch the view to it, keeping the
 *      original tab untouched.
 */
export const forkSession = createAsyncThunk<
  void,
  number,
  ThunkApiType
>(
  "session/fork",
  async (filteredIndex, { dispatch, extra, getState }) => {
    const state = getState().session;
    const history = state.history;

    // The index coming from the UI is the system-filtered index (Chat.tsx
    // renders history sans system messages). Map it to the real index in
    // state.history so slicing/cloning stays correct even when a system
    // message is present. Also keep the filtered index as forkPoint so the
    // divider renders in the same coordinate system the UI uses.
    const nonSystemIndexes = history
      .map((item, i) => (item.message.role !== "system" ? i : -1))
      .filter((i) => i !== -1);
    const index = nonSystemIndexes[filteredIndex];
    if (index == null || index < 0 || index >= history.length) return;
    const target = history[index];
    // Only fork from a completed assistant reply.
    if (target.message.role !== "assistant") return;
    // Never fork while a response is still streaming: newSession() below
    // aborts the current generation, which would kill the original session.
    if (state.isStreaming) return;

    const originalId = state.id;
    const originalTitle = state.title;
    const mode = state.mode;
    const selectedChatModel = selectSelectedChatModel(getState());

    const dirsResult = await extra.ideMessenger.request(
      "getWorkspaceDirs",
      undefined,
    );
    const workspaceDirectory =
      dirsResult.status === "success"
        ? dirsResult.content?.[0] || ""
        : "";

    // Deep clone the slice up to and including the clicked reply, and
    // regenerate every message id so the fork never collides with the
    // original (editor inputs, React keys, etc.).
    const clone: typeof history =
      typeof structuredClone === "function"
        ? structuredClone(history.slice(0, index + 1))
        : JSON.parse(JSON.stringify(history.slice(0, index + 1)));
    clone.forEach((item) => {
      item.message.id = uuidv4();
    });

    // Derive a fork id from the original: <originalId>_1, _2, ...
    // Reserve the id synchronously (before any await) so two rapid clicks on
    // the same original never compute the same id and overwrite each other.
    const taken = new Set(state.allSessionMetadata.map((m) => m.sessionId));
    let suffix = 1;
    let candidate = `${originalId}_${suffix}`;
    while (taken.has(candidate) || reservedForkIds.has(candidate)) {
      suffix++;
      candidate = `${originalId}_${suffix}`;
    }
    reservedForkIds.add(candidate);
    const forkId = candidate;
    const forkTitle = `${T("Fork")}: ${originalTitle}-${formatForkTimestamp(new Date())}`;

    const forkedSession: Session = {
      sessionId: forkId,
      title: forkTitle,
      workspaceDirectory,
      history: clone,
      mode,
      chatModelTitle: selectedChatModel?.title ?? null,
      forkedFrom: originalId,
      forkPoint: filteredIndex,
    };

    // 1) Persist the ORIGINAL session first.
    await dispatch(
      saveCurrentSession({ openNewSession: false, generateTitle: true }),
    );

    // 2) Persist the forked session to disk + refresh metadata.
    await dispatch(updateSession(forkedSession));

    // 3) Record relationship (in-memory + localStorage).
    dispatch(recordFork({ parentId: originalId, childId: forkId, forkPoint: filteredIndex }));
    try {
      window.localStorage.setItem(
        "friday-fork-map",
        JSON.stringify(getState().session.forkMap),
      );
    } catch {
      // ignore storage errors
    }

    // 4) Open fork as a NEW tab and switch the view to it.
    dispatch(
      addTab({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        title: forkTitle,
        isActive: true,
        sessionId: forkId,
      }),
    );
    dispatch(newSession(forkedSession));
  },
);
