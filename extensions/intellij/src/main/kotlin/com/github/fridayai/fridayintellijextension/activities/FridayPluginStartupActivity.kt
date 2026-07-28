package com.github.fridayai.fridayintellijextension.activities

import com.intellij.openapi.fileEditor.FileEditorManagerListener

import com.github.fridayai.fridayintellijextension.browser.FridayBrowserService.Companion.getBrowser
import com.github.fridayai.fridayintellijextension.constants.getFridayGlobalPath
import com.github.fridayai.fridayintellijextension.`friday`.*
import com.github.fridayai.fridayintellijextension.listeners.FridayPluginSelectionListener
import com.github.fridayai.fridayintellijextension.services.FridayExtensionSettings
import com.github.fridayai.fridayintellijextension.services.FridayPluginService
import com.github.fridayai.fridayintellijextension.services.SettingsListener
import com.github.fridayai.fridayintellijextension.utils.toUriOrNull
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.keymap.KeymapManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.util.io.StreamUtil
import com.intellij.openapi.vfs.LocalFileSystem
import kotlinx.coroutines.*
import java.io.*
import java.nio.charset.StandardCharsets
import java.nio.file.Paths
import javax.swing.*
import com.intellij.openapi.components.service
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.project.ModuleListener
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.newvfs.events.VFileDeleteEvent
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileCreateEvent
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.Function

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.util.registry.Registry

fun showTutorial(project: Project) {
    val tutorialFileName = getTutorialFileName()

    FridayPluginStartupActivity::class.java.getClassLoader().getResourceAsStream(tutorialFileName)
        .use { `is` ->
            if (`is` == null) {
                throw IOException("Resource not found: $tutorialFileName")
            }
            var content = `is`.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }

            // All jetbrains will use J instead of L
            content = content.replace("[Cmd + L]", "[Cmd + J]")
            content = content.replace("[Cmd + Shift + L]", "[Cmd + Shift + J]")

            if (!System.getProperty("os.name").lowercase().contains("mac")) {
                content = content.replace("[Cmd + J]", "[Ctrl + J]")
                content = content.replace("[Cmd + Shift + J]", "[Ctrl + Shift + J]")
                content = content.replace("[Cmd + I]", "[Ctrl + I]")
                content = content.replace("⌘", "⌃")
            }
            val filepath = Paths.get(getFridayGlobalPath(), tutorialFileName).toString()
            File(filepath).writeText(content)
            val virtualFile = LocalFileSystem.getInstance().findFileByPath(filepath)

            ApplicationManager.getApplication().invokeLater {
                if (virtualFile != null) {
                    FileEditorManager.getInstance(project).openFile(virtualFile, true)
                }
            }
        }
}

private fun getTutorialFileName(): String {
    val appName = ApplicationNamesInfo.getInstance().fullProductName.lowercase()
    return when {
        appName.contains("intellij") -> "friday_tutorial.java"
        appName.contains("pycharm") -> "friday_tutorial.py"
        appName.contains("webstorm") -> "friday_tutorial.ts"
        else -> "friday_tutorial.py" // Default to Python tutorial
    }
}

class FridayPluginStartupActivity : StartupActivity, DumbAware {

    /**
     * Fix JCEF registry settings that may have been changed by other plugins (e.g. Tencent CodeBuddy).
     * On 2026.2+, out-of-process mode is required for OSR rendering to work correctly.
     * Setting out-of-process=false or gpu.disable=true causes AbstractMethodError in CefRenderHandler → blank screen.
     */
    private fun fixJcefRegistryFor2026() {
        val build = ApplicationInfo.getInstance().build
        if (build.baselineVersion < 262) return  // Only needed for 2026.2+

        Registry.get("ide.browser.jcef.out-of-process.enabled").setValue(true)
        Registry.get("ide.browser.jcef.gpu.disable").setValue(false)
    }

    override fun runActivity(project: Project) {
        fixJcefRegistryFor2026()
        ApplicationManager.getApplication().invokeLater {
            removeShortcutFromAction(getPlatformSpecificKeyStroke("J"))
            removeShortcutFromAction(getPlatformSpecificKeyStroke("shift J"))
            removeShortcutFromAction(getPlatformSpecificKeyStroke("I"))
        }
        initializePlugin(project)
    }

    private fun getPlatformSpecificKeyStroke(key: String): String {
        val osName = System.getProperty("os.name").lowercase()
        val modifier = if (osName.contains("mac")) "meta" else "control"
        return "$modifier $key"
    }

    private fun removeShortcutFromAction(shortcut: String) {
        val keymap = KeymapManager.getInstance().activeKeymap
        val keyStroke = KeyStroke.getKeyStroke(shortcut)
        val actionIds = keymap.getActionIds(keyStroke)

        // If Friday has been re-assigned to another key, don't remove the shortcut
        if (!actionIds.any { it.startsWith("friday") }) {
            return
        }

        for (actionId in actionIds) {
            if (actionId.startsWith("friday")) {
                continue
            }
            val shortcuts = keymap.getShortcuts(actionId)
            for (shortcut in shortcuts) {
                if (shortcut is KeyboardShortcut && shortcut.firstKeyStroke == keyStroke) {
                    keymap.removeShortcut(actionId, shortcut)
                }
            }
        }
    }

    private fun initializePlugin(project: Project) {
        val coroutineScope = CoroutineScope(Dispatchers.IO)
        val fridayPluginService = project.service<FridayPluginService>()

        coroutineScope.launch {
            val settings = service<FridayExtensionSettings>()
            if (!settings.fridayState.shownWelcomeDialog) {
                settings.fridayState.shownWelcomeDialog = true
                // Open tutorial file
                showTutorial(project)
            }

            settings.addRemoteSyncJob()

            val ideProtocolClient = IdeProtocolClient(
                fridayPluginService,
                coroutineScope,
                project
            )

            val diffManager = DiffManager(project)

            fridayPluginService.diffManager = diffManager
            fridayPluginService.ideProtocolClient = ideProtocolClient

            // Listen to changes to settings so the core can reload remote configuration
            val connection = ApplicationManager.getApplication().messageBus.connect()
            connection.subscribe(SettingsListener.TOPIC, object : SettingsListener {
                override fun settingsUpdated(settings: FridayExtensionSettings.FridayState) {
                    // Friday AI: Remote config sync disabled (local-only mode)
                }
            })

            // Handle file changes and deletions - reindex
            connection.subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
                override fun after(events: List<VFileEvent>) {
                    // Collect all relevant URIs for deletions
                    val deletedURIs = events.filterIsInstance<VFileDeleteEvent>()
                        .mapNotNull { event -> event.file.toUriOrNull() }

                    // Send "files/deleted" message if there are any deletions
                    if (deletedURIs.isNotEmpty()) {
                        val data = mapOf("uris" to deletedURIs)
                        fridayPluginService.coreMessenger?.request("files/deleted", data, null) { _ -> }
                    }

                    // Collect all relevant URIs for content changes
                    val changedURIs = events.filterIsInstance<VFileContentChangeEvent>()
                        .mapNotNull { event -> event.file.toUriOrNull() }

                    // Notify core of content changes
                    if (changedURIs.isNotEmpty()) {
                        val data = mapOf("uris" to changedURIs)
                        fridayPluginService.coreMessenger?.request("files/changed", data, null) { _ -> }
                    }

                    events.filterIsInstance<VFileCreateEvent>()
                        .mapNotNull { event -> event.file?.toUriOrNull() }
                        .takeIf { it.isNotEmpty() }?.let {
                            val data = mapOf("uris" to it)
                            fridayPluginService.coreMessenger?.request("files/created", data, null) { _ -> }
                        }

                    // TODO: Missing handling of copying files, renaming files, etc.
                }
            })

            // Handle workspace directories changes
            connection.subscribe(
                ModuleListener.TOPIC,
                object : ModuleListener {
                    override fun modulesAdded(project: Project, modules: MutableList<out Module>) {

                        val allModulePaths = ModuleManager.getInstance(project).modules
                            .flatMap { module -> ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } }

                        val topLevelModulePaths = allModulePaths
                            .filter { modulePath -> allModulePaths.none { it != modulePath && modulePath.startsWith(it) } }

                        fridayPluginService.workspacePaths = topLevelModulePaths.toTypedArray();
                    }

                    override fun moduleRemoved(project: Project, module: Module) {
                        val removedPaths = ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } ;
                        fridayPluginService.workspacePaths = fridayPluginService.workspacePaths?.toList()?.filter { path -> removedPaths.none {removedPath -> path == removedPath }}?.toTypedArray();
                    }

                    override fun modulesRenamed(
                        project: Project,
                        modules: MutableList<out Module>,
                        oldNameProvider: Function<in Module, String>
                    ) {
                        val allModulePaths = ModuleManager.getInstance(project).modules
                            .flatMap { module -> ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } }

                        val topLevelModulePaths = allModulePaths
                            .filter { modulePath -> allModulePaths.none { it != modulePath && modulePath.startsWith(it) } }

                        fridayPluginService.workspacePaths = topLevelModulePaths.toTypedArray()
                    }
                }
            )

            connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, object : FileEditorManagerListener {
                override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                    file.toUriOrNull()?.let { uri ->
                        val data = mapOf("uris" to listOf(uri))
                        fridayPluginService.coreMessenger?.request("files/closed", data, null) { _ -> }
                    }
                }

                override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                    file.toUriOrNull()?.let { uri ->
                        val data = mapOf("uris" to listOf(uri))
                        fridayPluginService.coreMessenger?.request("files/opened", data, null) { _ -> }
                    }
                }
            })


            // Listen for theme changes
            connection.subscribe(LafManagerListener.TOPIC, LafManagerListener {
                val colors = GetTheme().getTheme()
                project.getBrowser()?.sendToWebview("jetbrains/setColors", colors)
            })

            val listener =
                FridayPluginSelectionListener(
                    coroutineScope,
                )

            // Reload the WebView
            fridayPluginService?.let { pluginService ->
                val allModulePaths = ModuleManager.getInstance(project).modules
                    .flatMap { module -> ModuleRootManager.getInstance(module).contentRoots.mapNotNull { it.toUriOrNull() } }

                val topLevelModulePaths = allModulePaths
                    .filter { modulePath -> allModulePaths.none { it != modulePath && modulePath.startsWith(it) } }

                pluginService.workspacePaths = topLevelModulePaths.toTypedArray()
            }

            EditorFactory.getInstance().eventMulticaster.addSelectionListener(
                listener,
                project.service<FridayPluginDisposable>()
            )

            val coreMessengerManager = CoreMessengerManager(project, ideProtocolClient, coroutineScope)
            fridayPluginService.coreMessengerManager = coreMessengerManager
        }
    }
}