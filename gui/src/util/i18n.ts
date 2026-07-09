// Friday AI — i18n 全面汉化
// 用法: import { T } from "../util/i18n";  <span>{T("Settings")}</span>
// 默认中文，localStorage "ironhero-language"="en" 切换英文

type Dict = Record<string, string>;

const zh: Dict = {
  // ═══════ 导航/标签 ═══════
  Settings: "设置", Back: "返回", Models: "模型", Rules: "规则",
  Tools: "工具", Prompts: "提示词", Configs: "配置", Indexing: "索引",
  "Back to settings": "返回设置", Chat: "对话", Autocomplete: "自动补全",
  Edit: "编辑", Apply: "应用", Embed: "嵌入", Rerank: "重排",
  Appearance: "外观", Experimental: "实验性",
  Resources: "资源", Documentation: "文档",
  "Help Center": "帮助中心", "Keyboard Shortcuts": "快捷键",
  History: "历史记录", "User Settings": "用户设置",
  "Main Config": "主配置", "Friday AI": "Friday AI",
  "Friday AI": "Friday AI",

  // ═══════ 按钮 ═══════
  "Add": "添加", "Add Model": "添加模型", "Add Rule": "添加规则",
  "Add Prompt": "添加提示词", "Add Docs": "添加文档",
  "Add documentation": "添加文档", "Add Server": "添加服务器",
  "Add MCP Server": "添加MCP服务器",
  "Create": "创建", "Cancel": "取消", "Confirm": "确认",
  "Delete": "删除", "Save": "保存", "Remove": "移除",
  "Connect": "连接", "Disconnect": "断开连接",
  "Submit": "提交", "Restart": "重启", "Retry": "重试",
  "Rebuild": "重建", "Clear chats": "清空对话",
  "Clear history": "清除历史", "Delete session": "删除会话",
  "Rename": "重命名", "Reset": "重置", "Refresh": "刷新",
  "Reload": "刷新", "Copy": "复制", "Copied": "已复制",
  "Paste": "粘贴", "Insert": "插入", "Run": "运行",
  "Accept": "接受", "Reject": "拒绝",
  "Accept All": "全部接受", "Reject All": "全部拒绝",
  "Apply Code": "应用代码", "Generate Code": "生成代码",
  "Expand": "展开", "Collapse": "折叠", "Stop": "停止",
  "Pause": "暂停", "Resume": "继续", "Close": "关闭",
  "Hide": "隐藏", "Show": "显示",
  "Open": "打开", "Open config": "打开配置",
  "Open Config": "打开配置", "Config": "配置",
  "View": "查看", "View config": "查看配置",
  "View Logs": "查看日志", "View error output": "查看错误输出",
  "View help documentation": "查看帮助文档",
  "Check API key": "检查API密钥",
  "Resubmit last message": "重新发送上一条消息",
  "Copy output": "复制输出", "Copy text": "复制文本",
  "Insert Code": "插入代码", "Insert at Cursor": "光标处插入",
  "Run in Terminal": "终端运行",

  // ═══════ 设置标签 ═══════
  "Font Size": "字体大小", "Show Session Tabs": "显示会话标签",
  "Wrap Codeblocks": "折叠代码块", "Enable Autocomplete": "开启自动补全",
  "Show Experimental Settings": "显示实验性设置",
  "Additional model roles": "其他模型角色",
  "Tool Policies": "工具策略", "Tool Group": "工具组",
  "MCP Servers": "MCP服务器", Servers: "服务器",
  "Global Rules": "全局规则", "Workspace Rules": "工作区规则",

  // ═══════ 模型 ═══════
  "Configure Model": "配置模型", "Select Model": "选择模型",
  "No models configured": "未配置模型",
  "Setup Chat model": "设置对话模型",
  "Setup Autocomplete model": "设置自动补全模型",
  "Setup Embed model": "设置嵌入模型",
  "Setup Rerank model": "设置重排模型",
  "Setup Apply model": "设置应用模型",
  "Setup Edit model": "设置编辑模型",
  "Setup model": "设置模型", "Setup {displayName} model": "设置{displayName}模型",
  "No valid models": "无有效模型",
  "No valid {displayName} models": "无有效{displayName}模型",
  ". Using Chat model": "，使用对话模型",
  "No models available": "无可用模型",
  "Select {displayName} model": "选择{displayName}模型",
  "Model": "模型", "Provider": "提供商",
  "API Key": "API密钥", "API Base": "API地址",
  "System Message": "系统消息", "Temperature": "温度",
  "Max Tokens": "最大Token数", "Top P": "Top P",
  "Frequency Penalty": "频率惩罚", "Presence Penalty": "存在惩罚",
  "(Invalid config)": "（无效配置）",
  "(Missing env secret)": "（缺少环境变量）",
  "(Missing API Key)": "（缺少API密钥）",

  // ═══════ 模式 ═══════
  "Mode": "模式", "Chat": "对话", "Agent": "代理", "Plan": "规划",
  "Select Mode": "选择模式", "Attach Image": "添加图片",
  "Attach File": "添加文件", "Add Context": "添加上下文",

  // ═══════ 对话 ═══════
  "New Chat": "新对话", "New Session": "新建会话",
  "Send Message": "发送消息", "Type a message...": "输入消息...",
  "Send": "发送", Thinking: "思考中",
  "Generating...": "生成中...", "Streaming...": "流式输出中...",
  "Loading...": "加载中...", "Please wait...": "请稍候...",
  "Empty": "空", "No items": "暂无内容",
  "No history yet": "暂无历史记录",
  "No data": "无数据", "Select...": "请选择...",

  // ═══════ 错误/状态 ═══════
  "Error": "错误", "Warning": "警告", "Success": "成功",
  "Info": "信息", "Loading": "加载中",
  "An error occurred": "发生错误", "Operation failed": "操作失败",
  "Operation successful": "操作成功", "Try again": "重试",
  "Are you sure?": "确定吗？", "Delete Rule": "删除规则",
  "Delete Model": "删除模型",
  "Confirmation": "确认", "Confirm Delete": "确认删除",

  // ═══════ 索引 ═══════
  "Indexing in-progress": "索引进行中", "Indexing complete": "索引完成",
  "Indexing paused": "索引已暂停", "Indexing failed": "索引失败",
  "Indexing disabled": "索引已禁用", "Indexing cancelled": "索引已取消",
  "Initializing": "初始化中", "Indexing is disabled": "索引已禁用",
  "@codebase index": "@代码库索引",
  "Reloading rules from your config...": "正在重新加载规则配置...",
  "No rules configured": "未配置规则",
  "No prompts configured": "未配置提示词",
  "Click to re-index": "点击重新索引", "Click to pause": "点击暂停",
  "Click to resume": "点击继续", "Click to retry": "点击重试",
  "Click to open configuration": "点击打开配置",
  "Click to restart": "点击重新开始",
  "Indexing other workspace": "正在索引其他工作区",
  "Indexing in-progress": "索引进行中",

  // ═══════ MCP ═══════
  "Connected": "已连接", "Disconnected": "已断开",
  "Connecting": "连接中", "Error connecting": "连接失败",
  "No MCP servers configured. Click the + button to add your first server.": "未配置MCP服务器，点击+按钮添加。",
  "No MCP prompts available": "无可用MCP提示词",
  "No MCP resources available": "无可用MCP资源",

  // ═══════ 工具 ═══════
  "No tools available": "无可用工具",
  "No {title.toLowerCase()} available": "无可用{title.toLowerCase()}",
  "Disable all tools in {groupName} group": "禁用{groupName}组所有工具",
  "Enable all tools in {groupName} group": "启用{groupName}组所有工具",
  "Tools disabled in current mode": "当前模式已禁用工具",

  // ═══════ 文档 ═══════
  "Start URL": "起始URL", "Title": "标题",
  "pages indexed": "页已索引", "Page": "页面", "Pages": "页面",
  "Indexed": "已索引", "Pending": "等待中",
  "Complete": "完成", "Failed": "失败", "Aborted": "已中止",
  "Closing this dialog will not affect indexing progress": "关闭此窗口不影响索引进度",
  "Common documentation sites are cached for faster loading": "常用文档站点已缓存以加快加载速度",
  "Choose a name for the new rule file.": "为新规则文件命名。",

  // ═══════ 其他 ═══════
  "Screen width too small": "屏幕宽度不足",
  "To view settings, please expand the sidebar by dragging the": "要查看设置，请拖动侧边栏扩大宽度",
  "Always applied": "始终应用", "Pattern": "匹配模式",
  "Source": "来源", "Applies to files": "应用于文件",
  "More": "更多", "Less": "收起",
  "Show more": "展开更多", "Show less": "收起",
  "On": "开", "Off": "关", "Yes": "是", "No": "否", "OK": "确定",
  "Auto": "自动", "Always": "总是", "Never": "从不",
  "Excluded": "排除", "Automatic": "自动", "Ask First": "先询问",
  "Next": "下一步", "Previous": "上一步",
  "Export": "导出", "Import": "导入", "Upload": "上传",
  "Download": "下载", "File": "文件", "Folder": "文件夹",
  "Name": "名称", "Description": "描述",
  "Content": "内容", "Type": "类型", "Size": "大小",
  "Status": "状态", "Language": "语言", "Theme": "主题",
  "Version": "版本", "Help": "帮助", "About": "关于",
  "Feedback": "反馈", "Report Issue": "报告问题",
  "License": "许可证", "Copyright": "版权",
  "Quickstart": "快速开始", "Tutorial": "教程",
  "Restart Process": "重启进程", "Reload Browser": "刷新页面",
  "Open Settings": "打开设置", "Open Logs": "打开日志",
  "View History": "查看历史",
  "New Chat / New Chat With Selected Code / Close Friday Sidebar": "新建对话/选中代码对话/关闭侧边栏",
  "Edit highlighted code": "编辑选中代码",
  "Toggle Selected Model": "切换选中模型",
  "Add highlighted code to context": "添加选中代码到上下文",
  "Show Tutorial": "显示教程",

  // ═══════ Provider 名称 ═══════
  "anthropic": "Anthropic", "openai": "OpenAI", "google": "Google",
  "azure": "Azure", "ollama": "Ollama", "deepseek": "DeepSeek",
  "groq": "Groq", "mistral": "Mistral", "cohere": "Cohere",
  "bedrock": "Bedrock", "watsonx": "WatsonX", "gemini": "Gemini",
  "lmstudio": "LM Studio", "together": "Together",
  "fireworks": "Fireworks", "perplexity": "Perplexity",
  "asksage": "AskSage", "inception": "Inception",
  "OpenAI Compatible": "OpenAI兼容",

  // ═══════ 规则提示词默认名 ═══════
  "Default Chat System Message": "默认对话系统消息",
  "Default Agent System Message": "默认代理系统消息",
  "Default Plan System Message": "默认规划系统消息",
  "default-chat": "默认对话", "default-agent": "默认代理",
  "default-plan": "默认规划",
  "model-options-chat": "模型选项-对话",
  "model-options-agent": "模型选项-代理",
  "model-options-plan": "模型选项-规划",

  // ═══════ 提示/引导 ═══════
  "Friday is an open-source AI code assistant.": "Friday是一款开源AI编程助手。",
  "Ask to edit code, get explanations, or generate from scratch.": "请求编辑代码、获取解释或从头生成。",
  "Learn more": "了解更多",
  "Tab to autocomplete": "Tab键补全",
  "New Session": "新建会话",
  "Enter Enterprise License Key": "输入企业许可证密钥",
};

export function T(en: string): string {
  try {
    const lang = localStorage.getItem("ironhero-language") || "zh";
    if (lang === "en") return en;
    if (zh[en]) return zh[en];
    // Dynamic substitution: "Setup {displayName} model" etc
    if (zh[en]) return zh[en];
  } catch (_) {}
  return en;
}

export function Tfmt(template: string, vars: Record<string, string>): string {
  let result = T(template);
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(`{${k}}`, v);
  }
  return result;
}
