import { resolveInputPath } from "../../util/pathResolver";
import { getUriPathBasename } from "../../util/uri";

import { ToolImpl } from ".";
import { throwIfFileIsSecurityConcern } from "../../indexing/ignore";
import { getStringArg } from "../parseArgs";
import { throwIfFileExceedsHalfOfContext } from "./readFileLimit";
import { FridayError, FridayErrorReason } from "../../util/errors";

export const readFileImpl: ToolImpl = async (args, extras) => {
  const filepath = getStringArg(args, "filepath");

  // Resolve the path first to get the actual path for security check
  const resolvedPath = await resolveInputPath(extras.ide, filepath);
  if (!resolvedPath) {
    throw new FridayError(
      FridayErrorReason.FileNotFound,
      `File "${filepath}" does not exist. Use "ls" to list files in the directory, or "file_glob_search" to find files by pattern.`,
    );
  }

  // Security check on the resolved display path
  throwIfFileIsSecurityConcern(resolvedPath.displayPath);

  const content = await extras.ide.readFile(resolvedPath.uri);

  await throwIfFileExceedsHalfOfContext(
    resolvedPath.displayPath,
    content,
    extras.config.selectedModelByRole.chat,
  );

  return [
    {
      name: getUriPathBasename(resolvedPath.uri),
      description: resolvedPath.displayPath,
      content,
      uri: {
        type: "file",
        value: resolvedPath.uri,
      },
    },
  ];
};
