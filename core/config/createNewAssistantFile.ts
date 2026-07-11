import { IDE } from "..";
import { joinPathsToUri } from "../util/uri";

const DEFAULT_ASSISTANT_FILE = `# This is an example configuration file
# To learn more, see the full config.yaml reference: https://docs.friday.dev/reference

name: Example Config
version: 1.0.0
schema: v1

# Define which models can be used
# https://docs.friday.dev/customization/models
models:
  - name: my gpt-5
    provider: openai
    model: gpt-5
    apiKey: YOUR_OPENAI_API_KEY_HERE
  - name: qwen2.5-coder 7b
    provider: ollama
    model: qwen2.5-coder:7b
    roles:
      - apply
      - autocomplete
      - chat
      - edit
  - name: Claude 4 Sonnet
    provider: anthropic
    model: claude-sonnet-4-20250514
    apiKey: \${{ secrets.ANTHROPIC_API_KEY }}
    roles:
      - chat
      - edit
      - apply
    defaultCompletionOptions:
      contextLength: 200000
      maxTokens: 64000
    capabilities:
      - tool_use
      - image_input
`;

import { getFridayGlobalPath } from "../util/paths";
import { localPathToUri } from "../util/pathToUri";

export async function createNewAssistantFile(
  ide: IDE,
  assistantPath: string | undefined,
  global: boolean = true,
): Promise<void> {
  let baseDirUri: string;
  if (global) {
    baseDirUri = joinPathsToUri(
      localPathToUri(getFridayGlobalPath()),
      assistantPath ?? "agents",
    );
  } else {
    const workspaceDirs = await ide.getWorkspaceDirs();
    if (workspaceDirs.length === 0) {
      throw new Error("No workspace directories found.");
    }
    baseDirUri = joinPathsToUri(
      workspaceDirs[0],
      `.friday/${assistantPath ?? "agents"}`,
    );
  }

  // Generate timestamp-based filename to avoid conflicts
  const ts = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  const assistantFileUri = joinPathsToUri(baseDirUri, `config_${ts}.yaml`);

  await ide.writeFile(assistantFileUri, DEFAULT_ASSISTANT_FILE);
  await ide.openFile(assistantFileUri);
}
