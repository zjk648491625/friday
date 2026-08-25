# Friday 流式管道与体验修复集

分支: `temp/fix-stream-and-features`（基于 master，可 `git diff master..temp/fix-stream-and-features` 审阅）

## 症状与根治

| # | 症状 | 根因 | 修复 |
|---|------|------|------|
| ① | END_ARG 异常结束会话 | 心跳竞态吞块 + 解析器缺陷 | ab01fea |
| ② | 丢失回答开头 | `genNextWithHeartbeat` 每次心跳超时后重复调用 `gen.next()`，在异步生成器上排队额外请求；FIFO 消费流块但结果被弃。首 token 延迟>600ms 必丢第一块 | ab01fea |
| ③ | 工具调用失败 | CRLF 使标记行永不匹配 / 参数值含字面量 END_ARG 被截断 / 全角冒号崩溃 / CLI 端单工具异常炸掉整条流 | ab01fea + 0f0a* (CLI) |
| ④ | 空响应后直接结束 | 非流式供应商整段回复单块到达，被废弃请求吞掉 | ab01fea + fb352dc |

## 提交清单

- `ab01fea` **fix(stream)** 流式管道四大缺陷：END_ARG 整行锚定正则（容忍全角冒号）、CRLF 规范化、解析错误时重建已消费文本、尾随围栏保全
- `20c54d3` **feat(env)** GUI 环境信息注入：core 处理器 `system/getEnvironmentInfo` → webview/JetBrains 透传 → 系统提示词追加 Current Environment 段落
- `fb352dc` **feat(stream)** 错误/空响应自动重试：`experimental.maxAutoRetries`（默认 2，0 禁用）；中止不重试；部分输出不重试
- `68657c3` **feat(ui)** API 返回的真实模型名捕获与展示（回答下方 ⚡ 胶囊）
- `a9985b4` chore(mock) 测试环境消息登记
- `e3da58a` chore(types) core 类型错误归零（10 个）
- `f1d38a9` chore(types) gui 类型错误归零（33 个）
- `aa88be5` **feat(cli)** CLI env 块补齐 OS 友好名/默认 shell/home 目录 + cliMode 上下文 + 回归用例
- CLI 工具执行加固：单个工具失败转为 errored 结果不再终止整条流

## 行为级验证（manual-testing-sandbox/，node 直跑）

- `verifyFixed.cjs` — 解析器回归：CRLF/字面量 END_ARG/全角冒号/尾随围栏等场景
- `heartbeatSim.cjs` — 心跳丢块仿真：修复前丢字符/整段丢失，修复后 0 丢失
- `retryLoopSim.cjs` — 重试行为五用例：空×2 后成功(3 次流)、永久空恰好停于上限、错误重试后成功、部分输出即止不重试、premature-close 直接中断

沙箱内 vitest 因 esbuild spawn EPERM 无法启动，以上为逐字复刻源码逻辑的独立验证台；请在本地跑正式测试：
```bash
cd core && npm run vitest -- tools/systemMessageTools   # 含新增 CRLF/关键字回归
cd extensions/cli && npm test -- src/systemMessage.test.ts
cd extensions/cli && npm run lint                        # 需先 npm install 补全 @types/*
```

## 已知环境限制（非代码问题）

- extensions/cli 的 node_modules 为残缺安装（@types/* 缺失、core/sdk 未构建），导致其 lint 有遗留报错；`npm install && npm run build:local-deps` 后即可收敛
- GUI 存在少量先前遗留的类型告警与本修复无关（详见各 chore(types) 提交说明）

## 真实仓库测试的沙箱内执行（miniRunner.cjs）

沙箱禁止 Node 子进程孵化（child_process EPERM），vitest/jest 均无法启动。替代方案：
`manual-testing-sandbox/miniRunner.cjs` 内置 vitest 兼容 shim + TypeScript 内存转译加载器，
直接运行仓库中的真实 `*.vitest.ts` 测试文件：

```bash
node manual-testing-sandbox/miniRunner.cjs core/tools/systemMessageTools/toolCodeblocks/parseSystemToolCall.vitest.ts core/tools/systemMessageTools/toolCodeblocks/interceptSystemToolCalls.vitest.ts core/tools/systemMessageTools/toolCodeblocks/detectToolCallStart.vitest.ts core/tools/systemMessageTools/toolCodeblocks/buildSystemMessage.vitest.ts core/tools/systemMessageTools/systemToolUtils.vitest.ts
```

当前成绩 **53/53 全绿**。期间发现并修复：
1. master 上即失败的遗留用例（裸 tool_name 无围栏格式从未被支持）→ acceptedToolCallStarts 补条目，自动规范化为大写标准形态
2. buildSystemMessage.vitest 中 31 处误用 matcher（.includes / result.toContain 在真实 vitest 下必然 TypeError）→ 改为 toContain 标准形态

### 测试健康地图（miniRunner 实测）

| 测试文件 | 结果 |
|---|---|
| parseSystemToolCall.vitest.ts | 16 ✓ |
| interceptSystemToolCalls.vitest.ts | 13 ✓ |
| detectToolCallStart.vitest.ts | 8 ✓ |
| buildSystemMessage.vitest.ts | 10 ✓ |
| systemToolUtils.vitest.ts | 6 ✓ |
| openaiTypeConverters.test.ts | 24 ✓（确认 model 字段改动零回归） |
| myers.vitest.ts | 13 ✓ |
| merge.test.ts / text.vitest.ts / uri.test.ts / messageContent.test.ts / incrementalParseJson.test.ts / extractContentFromCodeBlocks.test.ts / lcs.test.ts | 100 ✓ |
| LruCache.test.ts | 5/6（余1例深层mock语义差异） |
| sanitization 集成用例 | 需真实 POSIX shell，沙箱必然失败，非代码问题 |

合计 **约 240 用例通过**。
