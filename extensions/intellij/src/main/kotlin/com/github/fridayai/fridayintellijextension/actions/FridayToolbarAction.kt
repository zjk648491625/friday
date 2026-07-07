// Modified by Friday AI Team - Rebranded from Continue
package com.github.fridayai.fridayintellijextension.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager

/**
 * Extend your action with [FridayToolbarAction] if you need a visible, active toolbar.
 */
abstract class FridayToolbarAction : AnAction() {

    abstract fun toolbarActionPerformed(project: Project)

    final override fun actionPerformed(event: AnActionEvent) {
        val project = event.project
            ?: return
        val tool = ToolWindowManager.getInstance(project).getToolWindow("Friday")
            ?: return
        tool.activate(null) // un-collapse toolbar
        toolbarActionPerformed(project)
    }

}