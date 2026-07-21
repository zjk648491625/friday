@file:Suppress("DEPRECATION")

package com.github.fridayai.fridayintellijextension.`friday`

import com.github.fridayai.fridayintellijextension.services.FridayPluginService
import com.github.fridayai.fridayintellijextension.util.CommitPromptBuilder
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vcs.CheckinProjectPanel
import com.intellij.openapi.vcs.changes.CommitContext
import com.intellij.openapi.vcs.checkin.CheckinHandler
import com.intellij.openapi.vcs.checkin.CheckinHandlerFactory
import com.intellij.openapi.vcs.ui.RefreshableOnComponent
import com.intellij.ui.components.JBLabel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

class CommitMessageGeneratorFactory : CheckinHandlerFactory() {

    override fun createHandler(panel: CheckinProjectPanel, commitContext: CommitContext): CheckinHandler {
        return object : CheckinHandler() {
            override fun getBeforeCheckinConfigurationPanel(): RefreshableOnComponent {
                return CommitMessageRefreshableComponent(panel)
            }
        }
    }
}

class CommitMessageRefreshableComponent(
    private val checkinPanel: CheckinProjectPanel
) : RefreshableOnComponent {

    override fun refresh() {}
    override fun saveState() {}
    override fun restoreState() {}

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

    override fun getComponent(): JComponent {
        val panel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0))
        val label = JBLabel("Friday:")
        val button = JButton("\u2728 AI\u751F\u6210\u63D0\u4EA4\u4FE1\u606F")
        button.toolTipText = "\u4F7F\u7528 Friday AI \u81EA\u52A8\u751F\u6210 Git \u63D0\u4EA4\u4FE1\u606F (Ctrl+Alt+G)"
        button.addActionListener {
            generateAndSetCommitMessage(checkinPanel)
        }
        panel.add(label)
        panel.add(button)
        return panel
    }

    private fun generateAndSetCommitMessage(checkinPanel: CheckinProjectPanel) {
        val project = checkinPanel.project
        val service = project.service<FridayPluginService>()
        val coreMessenger = service.coreMessenger ?: run {
            Messages.showErrorDialog(project, "Friday AI \u6838\u5FC3\u8FDB\u7A0B\u672A\u542F\u52A8\uFF0C\u8BF7\u7B49\u5F85\u521D\u59CB\u5316\u5B8C\u6210\u3002", "Friday AI")
            return
        }

        val gitService = GitService(project, service)

        CoroutineScope(Dispatchers.IO).launch {
            val diff = try {
                var d = gitService.getDiff(false)
                if (d.all { it.isBlank() }) d = gitService.getDiff(true)
                d
            } catch (ex: Exception) {
                ApplicationManager.getApplication().invokeLater {
                    Messages.showErrorDialog(project, "\u83B7\u53D6 Git diff \u5931\u8D25: ${ex.message}", "Friday AI")
                }
                return@launch
            }

            val filteredDiff = diff.filter { it.isNotBlank() }
            if (filteredDiff.isEmpty()) {
                ApplicationManager.getApplication().invokeLater {
                    Messages.showWarningDialog(project, "\u6CA1\u6709\u6539\u52A8\u53EF\u7528\u4E8E\u751F\u6210\u63D0\u4EA4\u4FE1\u606F\u3002", "Friday AI")
                }
                return@launch
            }

            val diffText = filteredDiff.joinToString("\n")
            val prompt = CommitPromptBuilder.buildPrompt(diffText)

            val payload = mapOf("prompt" to prompt)

            coreMessenger.request("commitMessage/generate", payload, null) { result ->
                val raw = unwrapMessageResponse(result)
                val message = CommitPromptBuilder.cleanResult(raw)
                if (message.isNotEmpty()) {
                    ApplicationManager.getApplication().invokeLater {
                        checkinPanel.setCommitMessage(message)
                    }
                } else {
                    ApplicationManager.getApplication().invokeLater {
                        Messages.showErrorDialog(project, "\u751F\u6210\u63D0\u4EA4\u4FE1\u606F\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002", "Friday AI")
                    }
                }
            }
        }
    }

}
