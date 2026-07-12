import { AnimatedEllipsis } from "../../../AnimatedEllipsis";
import { useAppSelector } from "../../../../redux/hooks";

export function GeneratingIndicator({
  text = "Generating",
  testId,
}: {
  text?: string;
  testId?: string;
}) {
  const taskStatus = useAppSelector((s) => s.session.taskStatus);

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <div className="text-description flex items-center">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 mr-1.5" />
        <span className="text-xs">{text}</span>
        <AnimatedEllipsis />
      </div>
      {taskStatus && (
        <span className="text-description text-2xs opacity-50">{taskStatus}</span>
      )}
    </div>
  );
}
