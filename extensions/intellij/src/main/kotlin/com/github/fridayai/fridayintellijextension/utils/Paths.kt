// Modified by Friday AI Team - Rebranded from Continue
package com.github.fridayai.fridayintellijextension.utils

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.extensions.PluginId
import com.github.fridayai.fridayintellijextension.constants.FridayConstants
import java.nio.file.Path
import java.nio.file.Paths

/**
 * Gets the path to the Friday plugin directory
 *
 * @return Path to the plugin directory
 * @throws Exception if the plugin is not found
 */
fun getFridayPluginPath(): Path {
    val pluginDescriptor =
        PluginManagerCore.getPlugin(PluginId.getId(FridayConstants.PLUGIN_ID)) ?: throw Exception("Plugin not found")
    return pluginDescriptor.pluginPath
}

/**
 * Gets the path to the Friday core directory with target platform
 *
 * @return Path to the Friday core directory with target platform
 * @throws Exception if the plugin is not found
 */
fun getFridayCorePath(): String {
    val pluginPath = getFridayPluginPath()
    val corePath = Paths.get(pluginPath.toString(), "core").toString()
    val target = getOsAndArchTarget()
    return Paths.get(corePath, target).toString()
}

/**
 * Gets the path to the Friday binary executable
 *
 * @return Path to the Friday binary executable
 * @throws Exception if the plugin is not found
 */
fun getFridayBinaryPath(): String {
    val targetPath = getFridayCorePath()
    val os = getOS()
    val exeSuffix = if (os == OS.WINDOWS) ".exe" else ""
    return Paths.get(targetPath, "friday-binary$exeSuffix").toString()
}

/**
 * Gets the path to the Ripgrep executable
 *
 * @return Path to the Ripgrep executable
 * @throws Exception if the plugin is not found
 */
fun getRipgrepPath(): String {
    val targetPath = getFridayCorePath()
    val os = getOS()
    val exeSuffix = if (os == OS.WINDOWS) ".exe" else ""
    return Paths.get(targetPath, "rg$exeSuffix").toString()
}