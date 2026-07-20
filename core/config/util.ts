import fs from "fs";
import os from "os";
import { execSync } from "child_process";

import { ModelConfig } from "@friday-ai/config-yaml";
import {
  FridayConfig,
  ExperimentalModelRoles,
  IDE,
  ILLM,
  JSONModelDescription,
  PromptTemplate,
} from "../";
import { GlobalContext } from "../util/GlobalContext";
import { editConfigFile } from "../util/paths";

function stringify(obj: any, indentation?: number): string {
  return JSON.stringify(
    obj,
    (key, value) => {
      return value === null ? undefined : value;
    },
    indentation,
  );
}

export function addModel(
  model: JSONModelDescription,
  role?: keyof ExperimentalModelRoles,
  roles?: string[],
) {
  editConfigFile(
    (config) => {
      if (config.models?.some((m) => stringify(m) === stringify(model))) {
        return config;
      }

      const numMatches = config.models?.reduce(
        (prev, curr) => (curr.title.startsWith(model.title) ? prev + 1 : prev),
        0,
      );
      if (numMatches !== undefined && numMatches > 0) {
        model.title = `${model.title} (${numMatches})`;
      }

      config.models.push(model);

      // Set the role for the model (JSON: single role via experimental.modelRoles)
      if (role) {
        if (!config.experimental) {
          config.experimental = {};
        }
        if (!config.experimental.modelRoles) {
          config.experimental.modelRoles = {};
        }
        config.experimental.modelRoles[role] = model.title;
      }

      return config;
    },
    (config) => {
      const numMatches = config.models?.reduce(
        (prev, curr) =>
          "name" in curr && curr.name.startsWith(model.title) ? prev + 1 : prev,
        0,
      );
      if (numMatches !== undefined && numMatches > 0) {
        model.title = `${model.title} (${numMatches})`;
      }

      if (!config.models) {
        config.models = [];
      }

      const capabilities: string[] = [];
      if (model.capabilities?.tools) capabilities.push("tool_use");
      if (model.capabilities?.uploadImage) capabilities.push("image_input");

      const desc: ModelConfig = {
        name: model.title,
        provider: model.provider,
        model: model.model,
        apiKey: model.apiKey,
        apiBase: model.apiBase,
        contextLength: model.contextLength,
        maxStopWords: model.maxStopWords,
        defaultCompletionOptions: model.completionOptions,
        ...(model.cacheBehavior ? { cacheBehavior: model.cacheBehavior } : {}),
        ...(model.underlyingProviderName
          ? { underlyingProviderName: model.underlyingProviderName }
          : {}),
        ...(capabilities.length > 0 ? { capabilities } : {}),
        ...(roles && roles.length > 0 ? { roles: roles as any } : {}),
      };
      config.models.push(desc);
      return config;
    },
  );
}

export function deleteModel(title: string) {
  editConfigFile(
    (config) => {
      config.models = config.models.filter((m: any) => m.title !== title);
      return config;
    },
    (config) => {
      config.models = config.models?.filter((m: any) => m.name !== title);
      return config;
    },
  );
}

export function getModelByRole<T extends keyof ExperimentalModelRoles>(
  config: FridayConfig,
  role: T,
): ILLM | undefined {
  const roleTitle = config.experimental?.modelRoles?.[role];

  if (!roleTitle) {
    return undefined;
  }

  const matchingModel = config.modelsByRole.chat.find(
    (model) => model.title === roleTitle,
  );

  return matchingModel;
}

/**
 * This check is to determine if the user is on an unsupported CPU
 * target for our Lance DB binaries.
 *
 * See here for details: https://github.com/friday-ai/friday/issues/940
 */
/**
 * 检测当前 Linux 是否使用 musl C 库（Alpine 等轻量发行版）。
 * 非 Linux 平台直接返回 false，避免无谓的 exec。
 */
function isMusl(): boolean {
  if (os.platform() !== "linux") return false;
  try {
    const out = execSync("ldd --version 2>&1 || true", { encoding: "utf8" });
    if (/musl/.test(out)) return true;
  } catch {
    // 忽略，继续走 process.report 检测
  }
  try {
    const report = (process as any).report?.getReport?.();
    if (report?.header && report.header.glibcVersionRuntime === undefined) {
      return true;
    }
  } catch {
    // 忽略
  }
  return false;
}

export function isSupportedLanceDbCpuTargetForLinux(ide?: IDE) {
  const CPU_FEATURES_TO_CHECK = ["avx2", "fma"] as const;

  const globalContext = new GlobalContext();
  const globalContextVal = globalContext.get(
    "isSupportedLanceDbCpuTargetForLinux",
  );

  // If we've already checked the CPU target, return the cached value
  if (globalContextVal !== undefined) {
    return globalContextVal;
  }

  const arch = os.arch();

  // This check only applies to x64
  //https://github.com/lancedb/lance/issues/2195#issuecomment-2057841311
  if (arch !== "x64") {
    globalContext.update("isSupportedLanceDbCpuTargetForLinux", true);
    return true;
  }

  // musl 环境（如 Alpine 容器）放宽 CPU 限制：LanceDB 提供独立的 musl 构建，
  // 且容器内 /proc/cpuinfo 检测可能不可靠，允许下载对应原生包后由运行时验证。
  if (isMusl()) {
    console.log(
      "[config] musl environment detected, relaxing LanceDB CPU target check",
    );
    globalContext.update("isSupportedLanceDbCpuTargetForLinux", true);
    return true;
  }

  try {
    const cpuFlags = fs.readFileSync("/proc/cpuinfo", "utf-8").toLowerCase();

    const isSupportedLanceDbCpuTargetForLinux = cpuFlags
      ? CPU_FEATURES_TO_CHECK.every((feature) => cpuFlags.includes(feature))
      : true;

    // If it's not a supported CPU target, and it's the first time we are checking,
    // show a toast to inform the user that we are going to disable indexing.
    if (!isSupportedLanceDbCpuTargetForLinux && ide) {
      // We offload our async toast to `showUnsupportedCpuToast` to prevent making
      // our config loading async upstream of `isSupportedLanceDbCpuTargetForLinux`
      void showUnsupportedCpuToast(ide);
    }

    globalContext.update(
      "isSupportedLanceDbCpuTargetForLinux",
      isSupportedLanceDbCpuTargetForLinux,
    );

    return isSupportedLanceDbCpuTargetForLinux;
  } catch (error) {
    // If we can't determine CPU features, default to true
    return true;
  }
}

async function showUnsupportedCpuToast(ide: IDE) {
  const shouldOpenLink = await ide.showToast(
    "warning",
    "Codebase indexing disabled - Your Linux system lacks required CPU features (AVX2, FMA)",
    "Learn more",
  );

  if (shouldOpenLink) {
    void ide.openUrl(
      "https://docs.friday.dev/troubleshooting#i-received-a-codebase-indexing-disabled---your-linux-system-lacks-required-cpu-features-avx2-fma-notification",
    );
  }
}

/**
 * This is required because users are only able to define prompt templates as a
 * string, while internally we also allow prompt templates to be functions
 * @param templates
 * @returns
 */
export function serializePromptTemplates(
  templates: Record<string, PromptTemplate> | undefined,
): Record<string, string> | undefined {
  if (!templates) return undefined;

  return Object.fromEntries(
    Object.entries(templates).map(([key, template]) => {
      const serialized = typeof template === "function" ? "" : template;
      return [key, serialized];
    }),
  );
}
