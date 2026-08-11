package com.github.fridayai.fridayintellijextension.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.DumbAware
import com.intellij.util.messages.Topic
import com.github.fridayai.fridayintellijextension.utils.getFridayBinaryPath
import com.github.fridayai.fridayintellijextension.utils.getFridayCorePath
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Font
import java.awt.Insets
import javax.swing.*

class FridaySettingsComponent : DumbAware {
    val panel: JPanel = JPanel(GridBagLayout())
    val enableTabAutocomplete: JCheckBox = JCheckBox("启用 Tab 自动补全 (Enable Tab Autocomplete)")
    val displayEditorTooltip: JCheckBox = JCheckBox("显示编辑器提示 (Display Editor Tooltip)")
    val showIDECompletionSideBySide: JCheckBox = JCheckBox("并排显示 IDE 补全 (Show IDE completions side-by-side)")

    init {
        // 主面板布局：每一项独占一行，gridy 从 0 开始顺序递增，避免重叠
        val gbc = GridBagConstraints()
        gbc.fill = GridBagConstraints.HORIZONTAL
        gbc.anchor = GridBagConstraints.NORTHWEST
        gbc.weightx = 1.0
        gbc.weighty = 0.0
        gbc.gridx = 0
        gbc.gridy = 0
        gbc.insets = Insets(6, 4, 6, 4)

        // 顶部“路径展示”区域，与下方配置项明显分隔，不会被覆盖
        val pathPanel = JPanel(GridBagLayout())
        val pathTitle = JLabel("Friday 安装路径 (Installation Path)")
        pathTitle.font = pathTitle.font.deriveFont(Font.BOLD)

        val pgbc = GridBagConstraints()
        pgbc.fill = GridBagConstraints.HORIZONTAL
        pgbc.weightx = 1.0
        pgbc.insets = Insets(2, 6, 2, 6)

        val binaryPath = runCatching { getFridayBinaryPath() }.getOrDefault("N/A")
        val corePath = runCatching { getFridayCorePath() }.getOrDefault("N/A")

        pgbc.gridy = 0
        pathPanel.add(pathTitle, pgbc)
        pgbc.gridy = 1
        pathPanel.add(JLabel("核心脚本 (Binary):"), pgbc)
        pgbc.gridy = 2
        pathPanel.add(makePathField(binaryPath), pgbc)
        pgbc.gridy = 3
        pathPanel.add(JLabel("核心目录 (Core):"), pgbc)
        pgbc.gridy = 4
        pathPanel.add(makePathField(corePath), pgbc)

        panel.add(pathPanel, gbc)
        gbc.gridy++

        panel.add(
            JLabel("Friday AI 以本地模式运行，远程配置已禁用。(Friday AI runs in local-only mode. Remote config is disabled.)"),
            gbc
        )
        gbc.gridy++

        panel.add(enableTabAutocomplete, gbc)
        gbc.gridy++
        panel.add(displayEditorTooltip, gbc)
        gbc.gridy++
        panel.add(showIDECompletionSideBySide, gbc)
        gbc.gridy++

        // 占位组件：占据剩余垂直空间，把上方内容顶到顶部
        gbc.weighty = 1.0
        panel.add(JPanel(), gbc)
    }

    private fun makePathField(path: String): JTextField =
        JTextField(path).apply {
            isEditable = false
            border = null
            background = panel.background
            toolTipText = path
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
        "Friday AI 设置 (Friday AI Settings)"
}
