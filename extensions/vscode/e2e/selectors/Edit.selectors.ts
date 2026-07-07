// Modified by Friday AI Team - Rebranded from Continue
import { WebView } from "vscode-extension-tester";

import { SelectorUtils } from "./SelectorUtils";

export class EditSelectors {
  public static getEditAcceptButton(view: WebView) {
    return SelectorUtils.getElementByDataTestId(view, "edit-accept-button");
  }

  public static getEditRejectButton(view: WebView) {
    return SelectorUtils.getElementByDataTestId(view, "edit-reject-button");
  }
}
