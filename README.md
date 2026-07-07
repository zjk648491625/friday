# Friday AI

> 🚀 开源 AI 编程助手 | 本地优先 · 隐私至上

**Friday AI** 是领先的开源 AI 代码助手，作为 IDE 扩展直接嵌入你的开发环境，让你完全掌控自己的数据和模型选择。

## ✨ 核心特性

- 🔒 **本地优先** — 无需云账号，完全本地运行。远程同步和遥测已移除
- 🧠 **代码补全** — Tab 键自动补全，支持多行建议
- 💬 **AI 对话** — 在编辑器内与任意 LLM 对话，理解你的完整代码上下文
- ✏️ **代码编辑** — 选中代码按 `Ctrl+I`，用自然语言指令修改
- 🔌 **自带 Key (BYOK)** — 支持 OpenAI、Anthropic、本地 Ollama 等任意兼容 API 的模型
- 📎 **上下文感知** — 自动理解当前文件、项目结构、文档和终端输出
- 🛠️ **多 IDE 支持** — VS Code 和 JetBrains 全系列

## 🚀 快速开始

### 安装
- **VS Code**: [Marketplace 链接]
- **JetBrains**: [JetBrains Marketplace 链接]

### 配置模型
在项目根目录创建 `.friday/config.yaml` 或使用 GUI 设置页配置你的 API Key：

```yaml
models:
  - name: GPT-4o
    provider: openai
    model: gpt-4o
    apiKey: sk-xxx
```

## 🏗️ 项目结构

```
friday/
├── core/           # 核心引擎（TypeScript）
├── gui/            # GUI 前端（React）
├── extensions/     # IDE 扩展
│   ├── vscode/     # VS Code 扩展
│   ├── intellij/   # JetBrains 扩展（Kotlin）
│   └── cli/        # 命令行工具
├── packages/       # 共享包
│   ├── config-yaml/    # YAML 配置解析
│   ├── openai-adapters/ # LLM 适配器
│   ├── fetch/          # 网络请求
│   └── terminal-security/ # 终端安全
├── binary/         # 二进制构建工具
├── sync/           # 同步引擎（Rust）
└── scripts/        # 构建/开发脚本
```

## 📦 技术栈

| 组件 | 技术 |
|------|------|
| Core Engine | TypeScript, Node.js |
| GUI | React, TypeScript, Redux, Tailwind CSS |
| VS Code Extension | TypeScript, VS Code API |
| JetBrains Extension | Kotlin, IntelliJ Platform SDK |
| Sync Engine | Rust |
| Config & Schema | YAML, Zod |

## 🤝 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目基于 Continue (Continue Dev, Inc.) 修改而来，使用 Apache License 2.0。

```
Copyright 2023 Continue
Modified by Friday AI Team
Licensed under Apache License 2.0
```

完整许可详见 [LICENSE](./LICENSE) 和 [NOTICE](./NOTICE)。
