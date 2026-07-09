package com.github.fridayai.fridayintellijextension.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.DumbAware
import com.intellij.util.messages.Topic
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.*

class FridaySettingsComponent : DumbAware {
    val panel: JPanel = JPanel(GridBagLayout())
    val enableTabAutocomplete: JCheckBox = JCheckBox("Enable Tab Autocomplete")
    val displayEditorTooltip: JCheckBox = JCheckBox("Display Editor Tooltip")
    val showIDECompletionSideBySide: JCheckBox = JCheckBox("Show IDE completions side-by-side")

    init {
        val constraints = GridBagConstraints()

        constraints.fill = GridBagConstraints.HORIZONTAL
        constraints.weightx = 1.0
        constraints.weighty = 0.0
        constraints.gridx = 0
        constraints.gridy = GridBagConstraints.RELATIVE

        panel.add(JLabel("Friday AI runs in local-only mode. Remote config is disabled."), constraints)
        constraints.gridy++
        panel.add(enableTabAutocomplete, constraints)
        constraints.gridy++
        panel.add(displayEditorTooltip, constraints)
        constraints.gridy++
        panel.add(showIDECompletionSideBySide, constraints)
        constraints.gridy++

        // Add a "filler" component that takes up all remaining vertical space
        constraints.weighty = 1.0
        val filler = JPanel()
        panel.add(filler, constraints)
    }
}

@State(
    name = "com.github.fridayai.fridayintellijextension.services.FridayExtensionSettings",
    storages = [Storage("FridayExtensionSettings.xml")]
)
open class FridayExtensionSettings : PersistentStateComponent<FridayExtensionSettings.FridayState> {

    class FridayState {
        var lastSelectedInlineEditModel: String? = null
        var shownWelcomeDialog: Boolean = false
        var enableTabAutocomplete: Boolean = true
        var displayEditorTooltip: Boolean = true
        var showIDECompletionSideBySide: Boolean = false
    }

    var fridayState: FridayState = FridayState()

    override fun getState(): FridayState {
        return fridayState
    }

    override fun loadState(state: FridayState) {
        fridayState = state
    }

    companion object {
        val instance: FridayExtensionSettings
            get() = service<FridayExtensionSettings>()
    }

    // Friday AI: Remote sync removed (local-only mode)
    fun addRemoteSyncJob() {
        // No-op
    }
}

interface SettingsListener {
    fun settingsUpdated(settings: FridayExtensionSettings.FridayState)

    companion object {
        val TOPIC = Topic.create("SettingsUpdate", SettingsListener::class.java)
    }
}

class FridayExtensionConfigurable : Configurable {
    private var mySettingsComponent: FridaySettingsComponent? = null

    override fun createComponent(): JComponent {
        mySettingsComponent = FridaySettingsComponent()
        return mySettingsComponent!!.panel
    }

    override fun isModified(): Boolean {
        val settings = FridayExtensionSettings.instance
        val modified =
            mySettingsComponent?.enableTabAutocomplete?.isSelected != settings.fridayState.enableTabAutocomplete ||
                    mySettingsComponent?.displayEditorTooltip?.isSelected != settings.fridayState.displayEditorTooltip ||
                    mySettingsComponent?.showIDECompletionSideBySide?.isSelected != settings.fridayState.showIDECompletionSideBySide
        return modified
    }

    override fun apply() {
        val settings = FridayExtensionSettings.instance
        settings.fridayState.enableTabAutocomplete = mySettingsComponent?.enableTabAutocomplete?.isSelected ?: false
        settings.fridayState.displayEditorTooltip = mySettingsComponent?.displayEditorTooltip?.isSelected ?: true
        settings.fridayState.showIDECompletionSideBySide =
            mySettingsComponent?.showIDECompletionSideBySide?.isSelected ?: false

        ApplicationManager.getApplication().messageBus.syncPublisher(SettingsListener.TOPIC)
            .settingsUpdated(settings.fridayState)
    }

    override fun reset() {
        val settings = FridayExtensionSettings.instance
        mySettingsComponent?.enableTabAutocomplete?.isSelected = settings.fridayState.enableTabAutocomplete
        mySettingsComponent?.displayEditorTooltip?.isSelected = settings.fridayState.displayEditorTooltip
        mySettingsComponent?.showIDECompletionSideBySide?.isSelected =
            settings.fridayState.showIDECompletionSideBySide
    }

    override fun disposeUIResources() {
        mySettingsComponent = null
    }

    override fun getDisplayName(): String =
        "Friday AI Settings"
}
