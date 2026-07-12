import { useAppSelector } from "../../redux/hooks";

export function TaskStatusBar() {
  const taskStatus = useAppSelector((state) => state.session.taskStatus);
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const progressMap = useAppSelector((state) => state.session.toolCallProgressById);
  const history = useAppSelector((state) => state.session.history);

  // Find current executing tool's progress
  const activeProgress = history.flatMap((item) => item.toolCallStates ?? [])
    .filter((tc) => tc.status === "calling")
    .map((tc) => progressMap[tc.toolCallId])
    .filter(Boolean)
    .join(" | ");

  if (!isStreaming && !activeProgress) return null;

  const displayStatus = activeProgress || taskStatus;

  if (!displayStatus) return null;

  return (
    <div className="border-border mx-2 mb-1 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-description">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-description-muted" />
      <span>{displayStatus}</span>
    </div>
  );
}
