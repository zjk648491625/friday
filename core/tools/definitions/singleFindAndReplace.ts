import { Tool } from "../..";
import { validateSingleEdit } from "../../edit/searchAndReplace/findAndReplaceUtils";
import { executeFindAndReplace } from "../../edit/searchAndReplace/performReplace";
import { validateSearchAndReplaceFilepath } from "../../edit/searchAndReplace/validateArgs";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";
import { NO_PARALLEL_TOOL_CALLING_INSTRUCTION } from "./editFile";

export interface SingleFindAndReplaceArgs {
  filepath: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export const singleFindAndReplaceTool: Tool = {
  type: "function",
  displayTitle: "Find and Replace",
  wouldLikeTo: "edit {{{ filepath }}}",
  isCurrently: "editing {{{ filepath }}}",
  hasAlready: "edited {{{ filepath }}}",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: false,
  function: {
    name: BuiltInToolNames.SingleFindAndReplace,
    description: `Performs exact string replacements in a file. Always read the file with ${BuiltInToolNames.ReadFile} first to get up-to-date contents. ${NO_PARALLEL_TOOL_CALLING_INSTRUCTION}. Use replace_all to replace all occurrences. Only use emojis if user explicitly requests. When not using replace_all, old_string must be unique; provide more surrounding context to make it unique if needed.`,
    parameters: {
      type: "object",
      required: ["filepath", "old_string", "new_string"],
      properties: {
        filepath: {
          type: "string",
          description:
            "The path to the file to modify, relative to the root of the workspace",
        },
        old_string: {
          type: "string",
          description:
            "The text to replace - must be exact including whitespace/indentation",
        },
        new_string: {
          type: "string",
          description:
            "The text to replace it with (MUST be different from old_string)",
        },
        replace_all: {
          type: "boolean",
          description: "Replace all occurrences of old_string (default false)",
        },
      },
    },
  },
  systemMessageDescription: {
    prefix: `To perform exact string replacements in files, use the ${BuiltInToolNames.SingleFindAndReplace} tool with a filepath (relative to the root of the workspace) and the strings to find and replace.

  For example, you could respond with:`,
    exampleArgs: [
      ["filepath", "path/to/file.ts"],
      ["old_string", "const oldVariable = 'value'"],
      ["new_string", "const newVariable = 'updated'"],
      ["replace_all", "false"],
    ],
  },
  defaultToolPolicy: "allowedWithPermission",
  preprocessArgs: async (args, extras) => {
    const { oldString, newString, replaceAll } = validateSingleEdit(
      args.old_string,
      args.new_string,
      args.replace_all,
    );
    const fileUri = await validateSearchAndReplaceFilepath(
      args.filepath,
      extras.ide,
    );

    const editingFileContents = await extras.ide.readFile(fileUri);
    const newFileContents = executeFindAndReplace(
      editingFileContents,
      oldString,
      newString,
      replaceAll ?? false,
      0,
    );

    return {
      ...args,
      fileUri,
      editingFileContents,
      newFileContents,
    };
  },
};
