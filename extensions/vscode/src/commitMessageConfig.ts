import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface CommitMessageSettings {
  template: string;
  language: string;
  detailLevel: string;
  referenceHistory: boolean;
}

const DEFAULT_SETTINGS: CommitMessageSettings = {
  template: "conventional",
  language: "zh",
  detailLevel: "standard",
  referenceHistory: false,
};

function getSettingsFilePath(): string {
  return path.join(os.homedir(), ".friday", "friday-settings.json");
}

function getSettings(): CommitMessageSettings {
  try {
    const filePath = getSettingsFilePath();
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (raw.commitMessage && typeof raw.commitMessage === "object") {
        return {
          template: raw.commitMessage.template ?? DEFAULT_SETTINGS.template,
          language: raw.commitMessage.language ?? DEFAULT_SETTINGS.language,
          detailLevel:
            raw.commitMessage.detailLevel ?? DEFAULT_SETTINGS.detailLevel,
          referenceHistory:
            raw.commitMessage.referenceHistory ??
            DEFAULT_SETTINGS.referenceHistory,
        };
      }
    }
  } catch {
    // fall through
  }
  return { ...DEFAULT_SETTINGS };
}

export async function buildCommitMessagePrompt(
  diff: string,
  recentCommits?: string[],
): Promise<string> {
  const settings = getSettings();
  const langInstr = settings.language === "zh" ? "中文" : "English";

  const formatInstr: Record<string, string> = {
    gitmoji:
      "使用 Gitmoji 风格，title 以 emoji 开头，例如 \":sparkles: 新增: 描述\"。",
    simple: "直接一句话描述变更内容，不需要 type 前缀。",
    conventional:
      "使用 Conventional Commits 格式：<type>(<scope>): <简短描述>，type 从 feat/fix/docs/style/refactor/perf/test/chore/build/ci 中选择。",
  };

  const detailInstr: Record<string, string> = {
    concise: "只输出 title，不需要 body。",
    detailed:
      'title 下面用一段简要说明，再用 "- " 列出主要变更点。',
    standard: 'title 下面用 "- " 列出主要变更点。',
  };

  const format = formatInstr[settings.template] ?? formatInstr.conventional;
  const detail = detailInstr[settings.detailLevel] ?? detailInstr.standard;

  let historyPart = "";
  if (settings.referenceHistory && recentCommits && recentCommits.length > 0) {
    historyPart = `\n参考最近提交风格：\n${recentCommits.slice(0, 5).join("\n")}\n`;
  }

  return [
    `根据以下 git diff 生成一条${langInstr} Git 提交信息：`,
    `- ${format}`,
    `- ${detail}`,
    `${historyPart}`,
    `git diff:`,
    diff,
  ].join("\n");
}

export function cleanCommitMessage(raw: string): string {
  return raw.trim();
}
