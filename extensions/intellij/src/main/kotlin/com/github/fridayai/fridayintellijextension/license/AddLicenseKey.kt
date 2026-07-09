package com.github.fridayai.fridayintellijextension.license

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent

class AddLicenseKey : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val notification = NotificationGroupManager.getInstance()
            .getNotificationGroup("Friday")
            .createNotification(
                "Friday AI runs in local-only mode. No license key required.",
                NotificationType.INFORMATION
            )
        notification.notify(project)
    }
}