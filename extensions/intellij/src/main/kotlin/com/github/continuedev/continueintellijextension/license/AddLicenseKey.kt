// Modified by Friday AI Team - Enterprise license disabled (local-only mode)
package com.github.continuedev.continueintellijextension.license

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent

class AddLicenseKey : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val notification = NotificationGroupManager.getInstance()
            .getNotificationGroup("Continue")
            .createNotification(
                "Friday AI runs in local-only mode. No license key required.",
                NotificationType.INFORMATION
            )
        notification.notify(project)
    }
}