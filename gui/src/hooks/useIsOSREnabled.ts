// Modified by Friday AI Team - Rebranded from Continue
import { useState, useEffect, useContext } from "react";
import { isJetBrains } from "../util";
import { IdeMessengerContext } from "../context/IdeMessenger";

export default function useIsOSREnabled() {
  // Default true for JetBrains (Kotlin backend always returns true)
  const [isOSREnabled, setIsOSREnabled] = useState(isJetBrains());
  const ideMessenger = useContext(IdeMessengerContext);

  useEffect(() => {
    if (isJetBrains()) {
      (async () => {
        await ideMessenger
          .request("jetbrains/isOSREnabled", undefined)
          .then((result) => {
            if (result.status === "success") {
              setIsOSREnabled(result.content);
            }
          });
      })();
    }
  }, [ideMessenger]);

  return isOSREnabled;
}
