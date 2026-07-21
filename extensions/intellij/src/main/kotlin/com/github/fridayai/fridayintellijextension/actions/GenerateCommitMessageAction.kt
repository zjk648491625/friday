package com.github.fridayai.fridayintellijextension.actions

import com.github.fridayai.fridayintellijextension.`friday`.GitService
import com.github.fridayai.fridayintellijextension.util.CommitPromptBuilder
import com.github.fridayai.fridayintellijextension.services.FridayPluginService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vcs.CommitMessageI
import com.intellij.openapi.vcs.VcsDataKeys
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection

/**
 * Generates a Git commit message from the current diff using Friday AI.
 * Available via keyboard shortcut, Find Action, editor context menu, and VCS menu.
 */
class GenerateCommitMessageAction : AnAction() {

    override fun update(e: AnActionEvent) {
        val project = e.project
        e.presentation.isEnabled = project != null && !generating.contains(project)
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        if (generating.contains(project)) return
        // Capture the commit message control (commit tool window input box) while the
        // DataContext is still valid — the generation itself runs asynchronously.
        val commitControl = event.getData(VcsDataKeys.COMMIT_MESSAGE_CONTROL) as? CommitMessageI
        generateAndShow(project, commitControl, event)
    }

    companion object {
        /** Whether a generation is currently in progress (per project). */
        private val generating = mutableSetOf<Project>()

        private const val PLACEHOLDER = "Friday 生成提交信息中..."

        /** Extract plain text from core response which may be wrapped as {done, content, status}. */
        private fun unwrapMessageResponse(result: Any?): String {
            return when (result) {
                is String -> result
                is Map<*, *> -> {
                    (result["content"] as? String)
                        ?: (result["data"] as? String)
                        ?: result.toString()
                }
                else -> result?.toString() ?: ""
            }
        }

        fun generateAndShow(project: Project, commitControl: CommitMessageI? = null, event: AnActionEvent? = null) {
            if (generating.contains(project)) return
            generating.add(project)
            // Pre-fill the commit message box with a placeholder so the user gets
            // immediate feedback, and disable the action button while generating.
            ApplicationManager.getApplication().invokeLater {
                commitControl?.setCommitMessage(PLACEHOLDER)
                event?.let { refreshPresentation(it) }
            }

            val service = project.service<FridayPluginService>()
            val coreMessenger = service.coreMessenger ?: run {
                finish(project, commitControl, event)
                Messages.showErrorDialog(project, "Friday AI 核心进程未启动，请等待初始化完成。", "Friday AI")
                return
            }

            val gitService = GitService(project, service)

            CoroutineScope(Dispatchers.IO).launch {
                val diff = try {
                    var d = gitService.getDiff(false)
                    if (d.all { it.isBlank() }) {
                        d = gitService.getDiff(true)
                    }
                    d
                } catch (ex: Exception) {
                    ApplicationManager.getApplication().invokeLater {
                        finish(project, commitControl, event)
                        Messages.showErrorDialog(project, "获取 Git diff 失败: ${ex.message}", "Friday AI")
                    }
                    return@launch
                }

                val filteredDiff = diff.filter { it.isNotBlank() }
                if (filteredDiff.isEmpty()) {
                    ApplicationManager.getApplication().invokeLater {
                        finish(project, commitControl, event)
                        Messages.showWarningDialog(project, "没有改动可用于生成提交信息。", "Friday AI")
                    }
                    return@launch
                }

                val diffText = filteredDiff.joinToString("\n")
                val prompt = CommitPromptBuilder.buildPrompt(diffText)

                val payload = mapOf("prompt" to prompt)

                coreMessenger.request("commitMessage/generate", payload, null) { result ->
                    val raw = unwrapMessageResponse(result)
                    val message = CommitPromptBuilder.cleanResult(raw)
                    ApplicationManager.getApplication().invokeLater {
                        if (message.isNotEmpty()) {
                            if (commitControl != null) {
                                // Write directly into the commit message input box.
                                commitControl.setCommitMessage(message)
                            } else {
                                // Fallback (e.g. triggered outside commit context):
                                // copy to clipboard so the user can paste it.
                                val clipboard = Toolkit.getDefaultToolkit().systemClipboard
                                clipboard.setContents(StringSelection(message), null)
                                Messages.showInfoMessage(
                                    project,
                                    "提交信息已生成并复制到剪贴板：\n\n$message",
                                    "Friday AI - 提交信息"
                                )
                            }
                        } else {
                            // Generation failed — restore the input box and notify.
                            commitControl?.setCommitMessage("")
                            Messages.showErrorDialog(project, "生成提交信息失败，请重试。", "Friday AI")
                        }
                        finish(project, commitControl, event)
                    }
                }
            }
        }

        /** Clear the generating flag and re-enable the action button. */
        private fun finish(project: Project, commitControl: CommitMessageI?, event: AnActionEvent?) {
            generating.remove(project)
            // Re-run `update` on the live event presentation to re-enable the button.
            ApplicationManager.getApplication().invokeLater {
                event?.let { refreshPresentation(it) }
            }
        }

        /** Re-evaluate the action's enabled state against the live event. */
        private fun refreshPresentation(event: AnActionEvent) {
            val action = com.intellij.openapi.actionSystem.ActionManager.getInstance()
                .getAction("friday.generateCommitMessage") as? AnAction ?: return
            action.update(event)
        }
    }
}
