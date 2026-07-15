# Friday AI

> 🚀 Open-Source AI Code Assistant | Local-First · Privacy-First

**Friday AI** is the leading open-source AI code assistant that lives directly inside your IDE as an extension, giving you full control over your data and model choices.

## ✨ Key Features

- 🔒 **Local-First** — No cloud account required. Runs entirely locally. Remote sync and telemetry removed
- 🧠 **Code Autocomplete** — Tab-to-accept completions with multiline suggestions
- 💬 **AI Chat** — Chat with any LLM inside your editor, with full code context awareness
- ✏️ **Code Editing** — Select code, press `Ctrl+I`, describe changes in natural language
- 🔌 **Bring Your Own Key (BYOK)** — Works with OpenAI, Anthropic, Ollama, and any API-compatible model
- 📎 **Context-Aware** — Automatically understands current file, project structure, docs, and terminal output
- 🛠️ **Multi-IDE** — Available for VS Code and all JetBrains IDEs

## 🚀 Quick Start

### Installation
- **VS Code**: [Marketplace link]
- **JetBrains**: [JetBrains Marketplace link]

### Configure Models
Create `.friday/config.yaml` in your project root, or use the GUI settings page:

```yaml
models:
  - name: GPT-4o
    provider: openai
    model: gpt-4o
    apiKey: sk-xxx
```

## 🏗️ Project Structure

```
friday/
├── core/           # Core engine (TypeScript)
├── gui/            # GUI frontend (React)
├── extensions/     # IDE extensions
│   ├── vscode/     # VS Code extension
│   ├── intellij/   # JetBrains extension (Kotlin)
│   └── cli/        # CLI tool
├── packages/       # Shared packages
│   ├── config-yaml/    # YAML config parsing
│   ├── openai-adapters/ # LLM adapters
│   ├── fetch/          # HTTP requests
│   └── terminal-security/ # Terminal security
├── binary/         # Binary build tools
├── sync/           # Sync engine (Rust)
└── scripts/        # Build/dev scripts
```

## 📦 Tech Stack

| Component | Technology |
|-----------|-----------|
| Core Engine | TypeScript, Node.js |
| GUI | React, TypeScript, Redux, Tailwind CSS |
| VS Code Extension | TypeScript, VS Code API |
| JetBrains Extension | Kotlin, IntelliJ Platform SDK |
| Sync Engine | Rust |
| Config & Schema | YAML, Zod |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Create a Pull Request

## 📄 License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for full details.
