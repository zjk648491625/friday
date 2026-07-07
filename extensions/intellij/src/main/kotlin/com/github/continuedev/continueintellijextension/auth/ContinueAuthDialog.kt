// Modified by Friday AI Team - Cloud auth stripped (local-only mode)
package com.github.continuedev.continueintellijextension.auth

import com.intellij.openapi.ui.DialogWrapper
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

class ContinueAuthDialog(
    private val useOnboarding: Boolean,
    private val authUrl: String? = null,
    private val onTokenEntered: (String) -> Unit,
) : DialogWrapper(true) {
    init {
        init()
        title = "Friday AI - Local Only"
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel()
        panel.add(JLabel("Friday AI runs in local-only mode. No authentication required."))
        return panel
    }

    override fun doOKAction() {
        // No-op: auth disabled in local-only mode
        super.doOKAction()
    }
}
