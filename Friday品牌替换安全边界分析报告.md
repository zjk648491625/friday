# Friday 品牌替换安全边界分析报告

> 分析对象: `d:\Microservice\friday` (Continue v2.0.0 完整源码)
> 分析日期: 2026-07-07
> 许可协议: Apache License 2.0
> 原项目: https://github.com/continuedev/continue

---

## 一、总体概述

本项目是 **Continue** (continuedev) 的完整 monorepo，包含 VS Code 扩展、IntelliJ 插件、CLI 工具、GUI 前端、核心库、Continue SDK 以及 Rust 同步模块。品牌名称 "Continue" 以多种形式深度嵌入项目：npm 包名 (`@continuedev/*`)、IDE 扩展 ID (`continue.*`)、IntelliJ 插件 ID (`com.github.continuedev.*`)、域名 (`continue.dev`)、文件路径 (`~/.continue`)、环境变量 (`CONTINUE_*`)、API 端点 (`api.continue.dev`)、Java/Kotlin 类名、TypeScript 文件名等。

品牌替换风险等级定义：
- 🔴 **高风险（禁止替换）**: 替换将导致运行时崩溃、第三方集成断裂或违反开源许可
- 🟡 **中风险（需人工决策）**: 可替换但有风险，需评估业务和技术影响
- 🟢 **低风险（可安全替换）**: 纯 UI/展示层，替换后不影响功能

---

## 二、🟢 可安全替换层

### 2.1 VS Code 扩展 - package.json

| 位置 | 原值 | 建议替换为 | 风险 |
|------|------|------------|------|
| `extensions/vscode/package.json:2` | `"name": "continue"` | `"name": "friday-ai"` | 🟢 |
| `extensions/vscode/package.json:4` | `"author": "Continue Dev, Inc"` | `"author": "Friday AI"` | 🟢 |
| `extensions/vscode/package.json:21` | `"displayName": "Continue - open-source AI code agent"` | `"displayName": "Friday AI"` | 🟢 |
| `extensions/vscode/package.json:22` | `"pricing": "Free"` | 保留或修改 | 🟢 |
| `extensions/vscode/package.json:23` | `"description": "The leading open-source AI code agent"` | 自定义描述 | 🟢 |
| `extensions/vscode/package.json:24` | `"publisher": "Continue"` | `"publisher": "Friday AI"` | 🟢 |
| `extensions/vscode/package.json:87` | `"title": "Continue"` | `"title": "Friday"` | 🟢 |
| `extensions/vscode/package.json:600` | `"title": "Continue"` (侧边栏) | `"title": "Friday"` | 🟢 |
| `extensions/vscode/package.json:607` | `"title": "Continue Console"` (面板) | `"title": "Friday Console"` | 🟢 |
| `extensions/vscode/package.json:617` | `"name": "Continue"` (视图) | `"name": "Friday"` | 🟢 |
| `extensions/vscode/package.json:626` | `"name": "Continue Console"` (视图) | `"name": "Friday Console"` | 🟢 |
| `extensions/vscode/package.json` 各命令 | `"category": "Continue"` (约25处) | `"category": "Friday"` | 🟢 |
| `extensions/vscode/package.json` 各命令 | `"group": "Continue"` | `"group": "Friday"` | 🟢 |
| `extensions/vscode/package.json:42-50` | keywords 中的品牌无关词 | 保留 | 🟢 |

### 2.2 IntelliJ 插件 - plugin.xml

| 位置 | 原值 | 建议替换为 | 风险 |
|------|------|------------|------|
| `plugin.xml:4` | `<name>Continue</name>` | `<name>Friday AI</name>` | 🟢 |
| `plugin.xml:18` | `id="Continue"` (toolWindow) | `id="Friday"` | 🟢 |
| `plugin.xml:40` | `id="Continue"` (notificationGroup) | `id="Friday"` | 🟢 |
| `plugin.xml:51` | `displayName="Continue"` | `displayName="Friday AI"` | 🟢 |
| `plugin.xml:65,75,82,92,102,112,119,130,139,147,155,163,171,190` | `override-text` 中以 "Continue: " 开头的文本 | `"Friday: "` | 🟢 |
| `plugin.xml:192` | `text="Continue"` (popup menu) | `text="Friday"` | 🟢 |

### 2.3 GUI 前端

| 文件 | 说明 | 风险 |
|------|------|------|
| `gui/src/components/svg/ContinueLogo.tsx` | Logo 组件，需要新 Logo | 🟢 |
| `gui/src/components/svg/ContinueSignet.tsx` | 印章图标组件 | 🟢 |
| `gui/src/components/mainInput/ContinueInputBox.tsx` | 输入框组件名 | 🟢 |
| `gui/src/components/DeprecationBanner.tsx` | 弃用提示，含 `continue.dev` 链接 | 🟡 需更新为新文档链接 |
| `gui/src/components/config/FatalErrorNotice.tsx` | 错误提示中的文档链接 | 🟡 需更新 |
| `gui/src/util/errorAnalysis.ts` | 错误分析中的文档链接 | 🟡 需更新 |
| `gui/src/util/isContinueTeamMember.ts` | 团队成员检查逻辑 | 🟡 需评估是否需要保留 |
| `gui/src/pages/config/` 下多个文件 | 配置页面中的帮助链接 | 🟡 需更新链接 |
| `gui/rules.md` | 规则文档引用 | 🟢 |

### 2.4 CLI 工具

| 文件 | 说明 | 风险 |
|------|------|------|
| `extensions/cli/package.json:4` | `"description": "Continue CLI"` → `"Friday CLI"` | 🟢 |
| `extensions/cli/package.json:37` | `"author": "Continue Dev, Inc."` | 🟢 |
| `extensions/cli/package.json:46` | `"homepage": "https://continue.dev"` | 🟡 需更新 |
| `extensions/cli/src/systemMessage.ts` | 系统消息中的品牌名 | 🟢 |
| `extensions/cli/src/ui/` 下多个文件 | UI 文本 | 🟢 |

### 2.5 根 package.json 和根级配置

| 文件 | 原值 | 建议替换为 | 风险 |
|------|------|------------|------|
| `package.json:2` | `"name": "continue"` | `"name": "friday-ai"` | 🟢 |
| `package-lock.json:2` | `"name": "continue"` | 重新生成 | 🟢 |

### 2.6 品牌文件重命名

| 原文件名 | 建议新文件名 | 风险 |
|----------|-------------|------|
| `.continueignore` → `.fridayignore` | 根目录和子目录中的 ignore 文件 | 🟡 需同步更新读取代码 |
| `continue_tutorial.py` → `friday_tutorial.py` | 教程文件 | 🟢 |
| `continue_tutorial.ts` → `friday_tutorial.ts` | 教程文件 | 🟢 |
| `continue_tutorial.java` → `friday_tutorial.java` | 教程文件 | 🟢 |
| `continue_rc_schema.json` → `friday_rc_schema.json` | 配置文件 JSON Schema | 🟡 需同步更新引用 |
| `ContinueLogo.tsx` → `FridayLogo.tsx` | Logo 组件 | 🟢 |
| `ContinueSignet.tsx` → `FridaySignet.tsx` | 印章组件 | 🟢 |
| `ContinueInputBox.tsx` → `FridayInputBox.tsx` | 输入框组件 | 🟢 |
| `ContinueGUIWebviewViewProvider.ts` → `FridayGUIWebviewViewProvider.ts` | VSCode Provider | 🟢 |
| `ContinueConsoleWebviewViewProvider.ts` → `FridayConsoleWebviewViewProvider.ts` | VSCode Console Provider | 🟢 |

---

## 三、🔴 禁止替换层

### 3.1 Apache 2.0 许可证文件 (法律要求)

| 文件 | 内容 | 说明 |
|------|------|------|
| `d:\Microservice\friday\LICENSE` | Apache License 2.0 全文 | **必须保留原样**。这是原始许可协议文本，不可修改 |
| `d:\Microservice\friday\extensions\vscode\LICENSE.txt` | `Copyright 2023 Continue` + Apache 2.0 boilerplate | **必须保留** `Copyright 2023 Continue` 行（原始版权声明） |

### 3.2 第三方依赖坐标（npm registry / Maven / Cargo）

| 包名 | 说明 | 禁止替换原因 |
|------|------|-------------|
| `@continuedev/core` | npm 包 (core/package.json) | 已在 npm registry 发布，修改会导致依赖解析失败 |
| `@continuedev/config-types` | npm 包 | 同上 |
| `@continuedev/config-yaml` | npm 包 | 同上 |
| `@continuedev/fetch` | npm 包 | 同上 |
| `@continuedev/llm-info` | npm 包 | 同上 |
| `@continuedev/openai-adapters` | npm 包 | 同上 |
| `@continuedev/terminal-security` | npm 包 | 同上 |
| `@continuedev/sdk` | npm 包 | 同上 |
| `@continuedev/sdk-generator` | npm 包 | 同上 |
| `@continuedev/cli` | npm 包 | 同上 |

> **⚠️ 关键决策**: 上述 `@continuedev/*` 包名是在 npm registry 中发布的公开包。如果你计划将 Friday 发布为全新产品，必须：
> 1. 将所有 `@continuedev/*` 改为 `@friday-ai/*`（或类似命名空间）
> 2. 重新发布到 npm
> 3. **但这不能在分析阶段直接替换**，需要作为整体构建系统改造计划的一部分

### 3.3 IntelliJ 插件 ID（Maven/Gradle 坐标）

| 位置 | 值 | 说明 |
|------|-----|------|
| `plugin.xml:3` | `<id>com.github.continuedev.continueintellijextension</id>` | IntelliJ 插件唯一 ID，发布后不可更改 |
| `build.gradle.kts` / `settings.gradle.kts` | 所有包含 `continuedev` 的包路径 | Gradle 构建坐标 |
| Kotlin 源文件中的 `package com.github.continuedev.continueintellijextension.*` | Java/Kotlin 包名 | 代码结构依赖 |

> 如果重新发布为全新产品，插件 ID 应改为 `com.fridayai.fridayintellijextension`，且需要全局重构所有 Kotlin 包名。

### 3.4 环境变量名

| 环境变量 | 出现位置（部分） | 说明 |
|----------|-----------------|------|
| `CONTINUE_GLOBAL_DIR` | `core/util/paths.ts:28`、`extensions/cli/src/env.ts:11`、`extensions/vscode/package.json`、多个测试文件 | 用户目录配置，**绝对不能改**——否则所有现有用户的配置和数据路径将断裂 |
| `CONTINUE_API_KEY` | `packages/continue-sdk/typescript/tests/continue.test.ts`、`extensions/cli/src/smoke-api/` | API 密钥环境变量 |
| `CONTINUE_USE_AI_SDK` | `packages/openai-adapters/src/index.ts:85` | 特性开关 |
| `CONTINUE_BUILD_TARGET` | `extensions/vscode/scripts/prepackage.js:41` | 构建系统 |
| `CONTINUE_VSCODE_TARGET` | `extensions/vscode/scripts/prepackage.js:40` | 构建系统 |
| `CONTINUE_PLUGIN_DIR` | IntelliJ 构建脚本 | 构建系统 |
| `CONTINUE_API_BASE` | `extensions/cli/src/env.ts:9` | API 端点配置 |

> **建议**: 可以新增 `FRIDAY_*` 系列环境变量并同时支持两者（优先读新，回退旧），但不能直接删除旧变量。

### 3.5 第三方 API 端点

| URL | 出现位置 | 说明 |
|-----|---------|------|
| `https://api.continue.dev/` | 14 个文件（CLI env.ts、SDK、Python 客户端等） | Continue Hub API 服务器，**不可修改**（不属于本项目） |
| `https://continue.dev` | 76 个文件 | 官方网站 |
| `https://www.continue.dev/` | OpenRouter API 适配器 | HTTP Referer 头 |
| `https://docs.continue.dev/` | 配置验证等 | 文档站 |
| `https://github.com/continuedev/continue` | 28 个文件 | GitHub 仓库 |
| `Continue/IDE` (User-Agent) | `packages/openai-adapters/src/apis/ClawRouter.ts:36` | HTTP User-Agent 头 |

> **重要**: `api.continue.dev` 是 Continue 公司的云端服务端点。如果 Friday 将使用自己的后端，需要替换为自己的 API 端点。但若暂时不改变后端，这些 URL **绝对不能改**。

### 3.6 用户数据路径 (`~/.continue`)

| 路径 | 代码位置 | 说明 |
|------|---------|------|
| `~/.continue/` (根目录) | `core/util/paths.ts:35` | 用户全局配置和数据目录 |
| `~/.continue/sessions/` | `paths.ts:78` | 会话存储 |
| `~/.continue/index/` | `paths.ts:86` | 代码索引 |
| `~/.continue/index/sync.db` | `sync/src/db/mod.rs:58` | SQLite 数据库 |
| `~/.continue/config.json` | `paths.ts:114` | 配置文件 |
| `~/.continue/config.yaml` | `paths.ts:119` | 配置文件 |
| `~/.continue/config.ts` | `paths.ts:140` | TypeScript 配置 |
| `~/.continue/logs/` | `paths.ts:385` | 日志目录 |
| `~/.continue/.continuerc.json` | `paths.ts:210` | RC 配置 |
| `~/.continue/.continueignore` | `paths.ts:58` | Ignore 文件 |
| `~/.continue/.env` | `paths.ts:377` | 环境变量 |
| `~/.continue/.migrations` | `paths.ts:292` | 迁移标记 |

> **禁止直接修改默认路径**。建议方案：
> 1. 新增 `FRIDAY_GLOBAL_DIR` 环境变量
> 2. 默认路径改为 `~/.friday`
> 3. 启动时检测 `~/.continue` 是否存在，若存在则自动迁移数据
> 4. 保留 `CONTINUE_GLOBAL_DIR` 向后兼容

### 3.7 Git 远程 URL

| 文件 | URL | 说明 |
|------|-----|------|
| `extensions/vscode/package.json:8` | `https://github.com/continuedev/continue` | 仓库地址 |
| `extensions/vscode/package.json:15` | `https://github.com/continuedev/continue/issues` | Issue 跟踪 |
| `extensions/vscode/package.json:19` | `https://github.com/continuedev/continue/issues/new/choose` | Q&A |
| `extensions/cli/package.json:41` | `https://github.com/continuedev/continue.git` | 仓库地址 |
| `extensions/cli/package.json:44` | `https://github.com/continuedev/continue/issues` | Issue 跟踪 |
| `packages/config-yaml/CHANGELOG.md` | 多处 commit 链接 | 历史记录 |
| `plugin.xml:7` | `https://github.com/continuedev/continue/releases` | Release 页面 |

> 这些是原始项目的元数据，**应更新为 Friday 的新仓库地址**。但 CHANGELOG 中的历史 commit 链接是历史记录的一部分，建议保留。

### 3.8 OpenAPI / API 规范

| 文件 | 内容 | 说明 |
|------|------|------|
| `packages/continue-sdk/openapi.yaml:3` | `title: Continue Hub IDE API` | API 规范标题 |
| `openapi.yaml:9` | `name: Continue Dev Team` | 联系人 |
| `openapi.yaml:10,12` | `url: https://continue.dev`, `url: https://api.continue.dev` | 服务器 URL |
| `openapi.yaml:30,141` | `"Continue-managed proxy"` | API 描述文本 |
| `openapi.yaml:517` | `"Continue Hub web interface"` | 文档引用 |

> 这是 **Continue Hub 服务端 API 规范**，描述的是云端服务接口。如果 Friday 有独立后端，需创建新的 OpenAPI 规范。如果暂时复用 Continue Hub，则不应修改。

### 3.9 Docker 相关

| 文件 | 内容 | 说明 |
|------|------|------|
| `scripts/create-docker-ssh-container.sh:19` | `docker build -t continue-ubuntu-ssh .` | Docker 镜像名 |
| `scripts/create-docker-ssh-container.sh:23` | `container_name="continue-ssh-container"` | 容器名 |
| `core/llm/llms/Docker.ts:25` | `"continue model name"` | 注释 |
| `core/context/providers/GitLabMergeRequestContextProvider.ts:80` | `https://continue.dev/docker/mcp-gitlab` | 外部 Docker 镜像 URL |
| `core/context/providers/GitCommitContextProvider.ts:48` | `https://continue.dev/docker/mcp-git` | 外部 Docker 镜像 URL |

### 3.10 Rust Crate 元数据

| 文件 | 内容 | 说明 |
|------|------|------|
| `sync/Cargo.toml:4` | `description = "Continue Codebase Syncing"` | 描述文本 |
| `sync/Cargo.toml:5` | `authors = ["Nate Sesti and Ty Dunn"]` | 作者信息，需保留或追加 |

### 3.11 测试用例中的品牌引用

| 文件/位置 | 内容 | 风险 |
|-----------|------|------|
| `extensions/vscode/e2e/` 目录中所有引用 | E2E 测试路径 `e2e/test-continue/` | 🔴 E2E 测试基础设施依赖 |
| `extensions/cli/src/smoke-api/headless-continue-proxy.test.ts` | 测试文件名和内容 | 🔴 测试断言中引用 API 端点 |
| `core/test/vitest.global-setup.ts:7` | `CONTINUE_GLOBAL_DIR` 设置 | 🔴 测试基础设施 |
| 各种 `*.vitest.ts`, `*.test.ts` 文件 | 断言字符串中的 "Continue" | 🟡 取决于是否为功能测试 |

---

## 四、🟡 需人工决策层

### 4.1 VS Code 扩展 ID（`continue.*` 命名空间）

| ID | 说明 | 决策建议 |
|----|------|---------|
| `continue.continueGUIView` | GUI WebView ID | 🟡 改 vs 不改都会有问题 |
| `continue.continueConsoleView` | Console WebView ID | 🟡 同上 |
| `continue.continueSubMenu` | 子菜单 ID | 🟡 同上 |
| `continue.telemetryEnabled` | 配置项 | 🟡 需要评估用户迁移 |
| `continue.showInlineTip` | 配置项 | 🟡 同上 |
| `continue.disableQuickFix` | 配置项 | 🟡 同上 |
| `continue.enableQuickActions` | 配置项 | 🟡 同上 |
| `continue.enableTabAutocomplete` | 配置项 | 🟡 同上 |
| `continue.enableNextEdit` | 配置项 | 🟡 同上 |
| `continue.pauseTabAutocompleteOnBattery` | 配置项 | 🟡 同上 |
| `continue.pauseCodebaseIndexOnStart` | 配置项 | 🟡 同上 |
| `continue.enableConsole` | 配置项 | 🟡 同上 |
| `continue.remoteConfigServerUrl` | 配置项 | 🟡 同上 |
| `continue.userToken` | 配置项 | 🟡 同上 |
| `continue.remoteConfigSyncPeriod` | 配置项 | 🟡 同上 |
| `continue.applyCodeFromChat` ~ 共约25个命令 ID | 命令标识符 | 🟡 同上 |

> **决策要点**: 修改这些 ID 意味着所有现有用户的键盘快捷键绑定、设置项将失效。建议：
> - **方案A**: 全部替换为 `friday.*`，发布时明确告知用户这是 breaking change
> - **方案B**: 保留 `continue.*` 作为内部 ID（不可见），仅改变用户可见的 displayName
> - **方案C**: 新旧同时支持，提供自动迁移脚本

### 4.2 IntelliJ Action ID（`continue.*` 命名空间）

| ID | 说明 |
|----|------|
| `continue.inlineEdit` | 内联编辑 |
| `continue.acceptDiff` | 接受差异 |
| `continue.rejectDiff` | 拒绝差异 |
| `continue.restartProcess` | 重启进程 |
| `continue.addLicenseKey` | 添加许可证 |
| `continue.focusContinueInputWithoutClear` | 聚焦输入框 |
| `continue.newContinueSession` | 新建会话 |
| `continue.viewHistory` | 查看历史 |
| `continue.openConfigPage` | 打开配置 |
| `continue.reloadPage` | 重新加载 |
| `continue.openLogs` | 打开日志 |
| `continue.focusContinueInput` | 聚焦输入框（带清除） |
| `continue.acceptVerticalDiffBlock` | 接受垂直差异块 |
| `continue.rejectVerticalDiffBlock` | 拒绝垂直差异块 |

> 同上，这些是 IntelliJ 键盘映射中的 Action ID，修改将导致用户自定义快捷键失效。

### 4.3 内部类名/文件名（品牌相关）

| 类名/文件名 | 位置 | 决策建议 |
|-------------|------|---------|
| `ContinueConsoleWebviewViewProvider` | `extensions/vscode/src/` | 🟡 建议重命名，影响面可控 |
| `ContinueGUIWebviewViewProvider` | `extensions/vscode/src/` | 🟡 同上 |
| `ContinueCompletionProvider` | `extensions/vscode/src/` | 🟡 同上 |
| `ContinuePluginService` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinuePluginStartupActivity` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinuePluginDisposable` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinuePluginToolWindowFactory` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueActionPromote` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueToolbarAction` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueCompletionService` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueNextEditService` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueInlineCompletionProvider` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueExtensionSettings` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueExtensionConfigurable` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueAuthDialog` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueAuthService` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueBrowser` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueBrowserService` | IntelliJ Kotlin | 🟡 建议重命名 |
| `ContinueInputBox` | GUI | 🟡 建议重命名 |
| `ContinueLogo` / `ContinueSignet` | GUI | 🟡 建议重命名 |
| `SerializedContinueConfig` | core/ | 🟡 建议重命名 |
| `isContinueTeamMember` | core/ + gui/ | 🟡 需评估是否保留逻辑 |
| `getWorkspaceContinueRuleDotFiles` | core/ | 🟡 建议重命名 |
| `continueignore` (ignore 系统) | core/ | 🟡 建议改为 `.fridayignore` |
| `yamlToContinueConfig` | core/ | 🟡 建议重命名 |
| `continueServer/` 目录 | core/ | 🟡 建议重命名 |

### 4.4 日志和错误消息中的品牌名

| 位置 | 说明 | 决策建议 |
|------|------|------|
| `core/util/paths.ts:159` | `"name": "continue-config"` (生成的 package.json) | 🟡 需改为 `friday-config` |
| `core/util/paths.ts:161` | `"description": "My Continue Configuration"` | 🟡 需改为 `"My Friday Configuration"` |
| `core/util/paths.ts:70` | 注释 `// This is ~/.continue on mac/linux` | 🟡 建议更新注释 |
| `extensions/cli/package.json:32` | `"watch:logs": "touch ~/.continue/logs/cn.log..."` | 🟡 需更新路径 |
| 各种 `.diff` 文件 (core/edit/lazy/test-examples/) | 可能含品牌名 | 🟡 按需更新 |
| `scripts/oneper:9-10,316` | GitHub 路径和扩展 ID 引用 | 🟡 按需更新 |

### 4.5 Python SDK 元数据

| 文件 | 内容 | 决策建议 |
|------|------|------|
| `packages/continue-sdk/python/api/pyproject.toml:4` | `description = "Continue Hub IDE API"` | 🟡 需更新 |
| `packages/continue-sdk/python/api/pyproject.toml:5` | `authors = ["Continue Dev Team <team@openapitools.org>"]` | 🟡 需更新 |
| `packages/continue-sdk/python/api/pyproject.toml:9` | `keywords = ["OpenAPI", "OpenAPI-Generator", "Continue Hub IDE API"]` | 🟡 需更新 |

### 4.6 `api.continue.dev` 的默认 API Base

| 文件 | 行号 | 说明 |
|------|------|------|
| `extensions/cli/src/env.ts:9` | `process.env.CONTINUE_API_BASE ?? "https://api.continue.dev/"` | CLI 默认 API 端点 |
| `packages/continue-sdk/typescript/src/Continue.ts:97` | 默认 baseURL | SDK |
| `packages/continue-sdk/typescript/src/createOpenAIClient.ts:48` | 默认 baseURL | SDK |
| `packages/continue-sdk/typescript/api/src/runtime.ts:15` | 默认 baseURL | 自动生成的 API 客户端 |
| `packages/continue-sdk/python/api/openapi_client/configuration.py:193` | 默认 host | Python SDK |

> 这是最关键的业务决策：如果 Friday 有独立后端，全部替换；如果暂时复用 Continue Hub，则不能改。

### 4.7 注释和文档中的历史引用

| 示例 | 建议 |
|------|------|
| `// See here for why this is optional: https://github.com/continuedev/continue/issues/2775` | 保留历史记录，但更新为新仓库 issue 链接 |
| `README.md` 中关于 Continue 的描述 | 完全重写 |
| CHANGELOG 文件中的品牌名 | 保留历史，新增 Friday 的变更日志 |
| `.md` 文档中的 `continue.dev` 链接 | 更新为 Friday 的文档站 |

---

## 五、合规检查清单 (Apache 2.0 §4)

### 5.1 根据 §4(a) - 必须保留的原始许可副本

| 项目 | 状态 | 说明 |
|------|------|------|
| `LICENSE` (根目录) | ✅ 存在 | Apache 2.0 全文，**必须保留** |
| `extensions/vscode/LICENSE.txt` | ✅ 存在 | 含 `Copyright 2023 Continue`，**必须保留** |

### 5.2 根据 §4(b) - 必须添加的修改说明

所有被修改的文件必须包含醒目的修改声明。建议在每个被修改的文件顶部添加：

```
/**
 * Modified from the original Continue project (https://github.com/continuedev/continue)
 * Copyright 2023 Continue. Licensed under Apache License 2.0.
 * Modified for Friday AI project.
 */
```

或者在项目根目录创建 `CHANGES.txt` 或 `MODIFICATIONS.md` 列出所有变更。

### 5.3 根据 §4(c) - 必须保留的版权声明

以下文件的原始版权声明必须保留：

| 文件 | 原始版权声明 | 操作 |
|------|-------------|------|
| `extensions/vscode/LICENSE.txt:1` | `Copyright 2023 Continue` | **保留不修改** |
| 所有 `package.json` 中的 `"license": "Apache-2.0"` | 许可声明 | **保留** |
| 所有源文件头部 | 如果有版权声明则保留 | **保留** |

### 5.4 NOTICE 文件检查

| 项目 | 状态 |
|------|------|
| 根目录 NOTICE 文件 | ❌ 不存在 |

> **建议**: 如果原始 Continue 项目的发布包中包含 NOTICE 文件，需要找到并保留。同时创建新的 NOTICE 文件：
>
> ```
> Friday AI
> Copyright 2026 [Your Company/Name]
>
> This product includes software developed by Continue Dev, Inc (https://continue.dev).
> Copyright 2023 Continue.
> Licensed under the Apache License, Version 2.0.
> ```

### 5.5 商标注意事项 (§6)

Apache 2.0 §6 明确说明：**许可不授予使用 "Continue" 商标的权利**，除非在 NOTICE 文件中合理描述作品来源。

> - 在 NOTICE 文件中引用 "Continue" 用于说明来源是合规的
> - 不能在产品中暗示与 Continue Dev, Inc 有关联或背书
> - 应移除所有暗示官方 Continue 品牌的 UI 元素

---

## 六、按风险等级排序的总览表

| 风险等级 | 类别 | 涉及文件数（约） | 操作建议 |
|----------|------|-----------------|---------|
| 🔴 禁止 | Apache LICENSE 文件 | 2 | 保留原样 |
| 🔴 禁止 | `~/.continue` 默认路径 | 1 (paths.ts) | 新增 `~/.friday` + 迁移方案 |
| 🔴 禁止 | `CONTINUE_*` 环境变量 | 15+ | 新增 `FRIDAY_*` + 向后兼容 |
| 🔴 禁止 | `api.continue.dev` / `continue.dev` URL | 76+ | 根据后端策略决定 |
| 🔴 禁止 | `@continuedev/*` npm 包名 | 9+ | 需整体构建系统改造 |
| 🔴 禁止 | IntelliJ 插件 ID 和包名 | 30+ Kotlin 文件 | 需全局重构 |
| 🔴 禁止 | Git remote URL | 5+ | 更新为新仓库 |
| 🔴 禁止 | OpenAPI 规范 (`openapi.yaml`) | 1 | 根据后端策略决定 |
| 🟡 需决策 | `continue.*` VS Code 扩展 ID | 1 (package.json) | 见 4.1 节三种方案 |
| 🟡 需决策 | `continue.*` IntelliJ Action ID | 1 (plugin.xml) | 见 4.2 节 |
| 🟡 需决策 | Java/Kotlin 类名 | 30+ | 建议全部重命名 |
| 🟡 需决策 | TypeScript 类/函数/变量名 | 50+ | 建议分批重命名 |
| 🟡 需决策 | 文件名（含 Continue） | 65+ | 建议分批重命名 |
| 🟡 需决策 | `~/.continue` 子目录和文件 | 20+ paths.ts | 跟随路径迁移方案 |
| 🟡 需决策 | `CONTINUE_API_BASE` 默认值 | 5+ | 根据后端策略决定 |
| 🟡 需决策 | Docker 镜像/容器名 | 2+ | 本地构建可改 |
| 🟡 需决策 | 测试基础设施 (E2E 路径等) | 10+ | 跟随整体迁移 |
| 🟢 安全 | VS Code package.json UI 文本 | 1 (约50处) | 直接替换 |
| 🟢 安全 | IntelliJ plugin.xml UI 文本 | 1 (约20处) | 直接替换 |
| 🟢 安全 | GUI 组件名称和文本 | 10+ | 直接替换 |
| 🟢 安全 | CLI 描述和 UI 文本 | 5+ | 直接替换 |
| 🟢 安全 | Logo/图标组件 | 2 | 重新设计 |
| 🟢 安全 | 教程文件内容 | 3 | 重写 |
| 🟢 安全 | 根 package.json 元数据 | 1 | 直接替换 |

---

## 七、建议的实施顺序

### 阶段 1: 基础合规（必须最先完成）
1. 确保 `LICENSE` 和 `extensions/vscode/LICENSE.txt` 保留原样
2. 创建 `NOTICE` 文件，注明原始版权和修改说明
3. 在每个修改过的文件中添加 §4(b) 修改声明

### 阶段 2: UI 层品牌替换（低风险）
4. 替换所有 VS Code `package.json` 中的 displayName、description、publisher、title 等
5. 替换 IntelliJ `plugin.xml` 中的 name、displayName、override-text
6. 重命名 GUI 组件文件（Logo、InputBox 等）
7. 更新 GUI 中的用户可见文本

### 阶段 3: 内部代码重构（中风险）
8. 重命名 TypeScript/Java/Kotlin 类名和文件名
9. 更新内部变量名
10. 更新日志前缀和内部字符串

### 阶段 4: 基础设施改造（高风险）
11. 确定后端策略 → 决定 API 端点是否修改
12. 实施用户数据路径迁移方案（`~/.continue` → `~/.friday`）
13. 新增 `FRIDAY_*` 环境变量支持
14. 更新 npm 包名（如果需要独立发布）
15. 更新 IntelliJ 插件 ID（如果需要独立发布）
16. 更新 Git remote URL

### 阶段 5: 清理
17. 更新所有文档和教程
18. 更新 CHANGELOG
19. 更新 Docker 相关配置
20. 全面回归测试

---

*报告由自动化代码分析生成，建议在实施前由团队进行人工审核。*
