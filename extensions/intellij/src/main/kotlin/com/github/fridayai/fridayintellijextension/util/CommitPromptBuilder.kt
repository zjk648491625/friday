package com.github.fridayai.fridayintellijextension.util

import com.google.gson.Gson
import com.google.gson.JsonParser
import java.io.File

/**
 * Shared commit prompt builder used by both AnAction and CheckinHandlerFactory.
 * Reads config from ~/.friday/friday-settings.json.
 */
object CommitPromptBuilder {
    private val gson = Gson()

    fun buildPrompt(diffText: String): String {
        val settings = loadSettings()
        val template = settings.getOrDefault("template", "conventional") as? String ?: "conventional"
        val language = settings.getOrDefault("language", "zh") as? String ?: "zh"
        val detailLevel = settings.getOrDefault("detailLevel", "standard") as? String ?: "standard"

        val langInstr = if (language == "zh") "中文" else "English"

        val formatInstr = when (template) {
            "gitmoji" -> "使用 Gitmoji 风格，title 以 emoji 开头，例如 \":sparkles: 新增: 描述\"。"
            "simple" -> "直接一句话描述变更内容，不需要 type 前缀。"
            else -> "使用 Conventional Commits 格式：<type>(<scope>): <简短描述>，type 从 feat/fix/docs/style/refactor/perf/test/chore/build/ci 中选择。"
        }

        val detailInstr = when (detailLevel) {
            "concise" -> "只输出 title，不需要 body。"
            "detailed" -> "title 下面用一段简要说明，再用 \"- \" 列出主要变更点。"
            else -> "title 下面用 \"- \" 列出主要变更点。"
        }

        return buildString {
            appendLine("根据以下 git diff 生成一条${langInstr} Git 提交信息：")
            appendLine("- $formatInstr")
            appendLine("- $detailInstr")
            appendLine()
            appendLine("git diff:")
            append(diffText)
        }
    }

    fun loadSettings(): Map<String, Any?> {
        return try {
            val home = System.getProperty("user.home")
            val settingsFile = File(home, ".friday/friday-settings.json")
            if (settingsFile.exists()) {
                var json = JsonParser.parseString(settingsFile.readText()).asJsonObject
                // Defensive: unwrap legacy nested `{ done, content }` payloads that
                // were accidentally written into the file, so we always reach the
                // flat settings object.
                while (json.has("done") && json.get("done").asBoolean &&
                    json.has("content") && json.get("content").isJsonObject
                ) {
                    json = json.getAsJsonObject("content")
                }
                val commitMsg = json.getAsJsonObject("commitMessage")
                if (commitMsg != null) {
                    gson.fromJson(commitMsg, Map::class.java) as? Map<String, Any?> ?: emptyMap()
                } else emptyMap()
            } else emptyMap()
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun cleanResult(raw: String): String {
        return raw.trim()
    }
}
