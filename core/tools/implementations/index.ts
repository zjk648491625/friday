// Modified by Friday AI Team - Rebranded from Continue
import { ContextItem, ToolExtras } from "../..";

export type ToolImpl = (
  parameters: any,
  extras: ToolExtras,
) => Promise<ContextItem[]>;
