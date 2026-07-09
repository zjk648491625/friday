package com.github.fridayai.fridayintellijextension.toolWindow

import com.github.fridayai.fridayintellijextension.browser.FridayBrowserService.Companion.getBrowser
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class FridayPluginToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val browserOrError = project.getBrowser()?.getComponent()
            ?: JcefErrorPanel.create()
        toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(browserOrError, null, false))
        toolWindow.setTitleActions(
            listOf(
                ActionManager.getInstance().getAction("FridaySidebarActionsGroup"),
                ActionManager.getInstance().getAction("MaximizeToolWindow")
            )
        )
    }

}
