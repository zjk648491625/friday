// Modified by Friday AI Team - Stripped unique ID (local-only mode)
import { IdeInfo } from "../index.js";

export class IdeInfoService {
  static uniqueId = "LOCAL_ONLY";
  static os: string | undefined = undefined;
  static ideInfo: IdeInfo | undefined = undefined;

  static setup(ideInfo: IdeInfo): void {
    IdeInfoService.ideInfo = ideInfo;
  }
}
