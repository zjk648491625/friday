import { SUBAGENT_TOOL_META } from "../subagent/index.js";

import { askQuestionTool } from "./askQuestion.js";
import { editTool } from "./edit.js";
import { exitTool } from "./exit.js";
import { fetchTool } from "./fetch.js";
import { fileDepsTool } from "./fileDeps.js";
import { findReferencesTool } from "./findReferences.js";
import { listFilesTool } from "./listFiles.js";
import { listSymbolsTool } from "./listSymbols.js";
import { multiEditTool } from "./multiEdit.js";
import { readFileTool } from "./readFile.js";
import { readSymbolTool } from "./readSymbol.js";
import { reportFailureTool } from "./reportFailure.js";
import { runTerminalCommandTool } from "./runTerminalCommand.js";
import { searchCodeTool } from "./searchCode.js";
import { SKILLS_TOOL_META } from "./skills.js";
import { statusTool } from "./status.js";
import { traceCalleesTool } from "./traceCallees.js";
import { traceCallersTool } from "./traceCallers.js";
import { uploadArtifactTool } from "./uploadArtifact.js";
import { viewDiffTool } from "./viewDiff.js";
import { writeChecklistTool } from "./writeChecklist.js";
import { writeFileTool } from "./writeFile.js";

// putting in here for circular import issue
export const ALL_BUILT_IN_TOOLS = [
  askQuestionTool,
  editTool,
  exitTool,
  fetchTool,
  fileDepsTool,
  findReferencesTool,
  listFilesTool,
  listSymbolsTool,
  multiEditTool,
  readFileTool,
  readSymbolTool,
  reportFailureTool,
  runTerminalCommandTool,
  searchCodeTool,
  statusTool,
  SUBAGENT_TOOL_META,
  SKILLS_TOOL_META,
  traceCalleesTool,
  traceCallersTool,
  uploadArtifactTool,
  viewDiffTool,
  writeChecklistTool,
  writeFileTool,
];
