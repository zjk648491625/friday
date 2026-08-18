package com.github.fridayai.fridayintellijextension.`friday`.process

import com.github.fridayai.fridayintellijextension.proxy.ProxySettings
import com.github.fridayai.fridayintellijextension.utils.OS
import com.github.fridayai.fridayintellijextension.utils.getFridayBinaryPath
import com.github.fridayai.fridayintellijextension.utils.getOS
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermission

class FridayBinaryProcess(
    private val onUnexpectedExit: () -> Unit
) : FridayProcess {

    private val process = startBinaryProcess()
    override val input: InputStream = process.inputStream
    override val output: OutputStream = process.outputStream

    override fun close() =
        process.destroy()

    private fun startBinaryProcess(): Process {
        val jsPath = getFridayBinaryPath()
        val nodeExe = findNodeExe() ?: "node"
        
        val builder = ProcessBuilder(nodeExe, jsPath)
        builder.environment() += ProxySettings.getSettings().toFridayEnvVars()
        return builder
            .directory(File(jsPath).parentFile)
            .redirectErrorStream(true)
            .start()
            .apply { onExit().thenRun(onUnexpectedExit) }
    }
    
    private fun findNodeExe(): String? {
        // Try nvs-managed Node.js: use the default symlink first
        val localAppData = System.getenv("LOCALAPPDATA")
        if (localAppData != null) {
            val nvsDefault = "$localAppData\\nvs\\default\\node.exe"
            if (File(nvsDefault).exists()) return nvsDefault

            // Fallback: scan nvs/node directory for any installed version
            val nvsNodeDir = File("$localAppData\\nvs\\node")
            if (nvsNodeDir.exists() && nvsNodeDir.isDirectory) {
                val nodeExe = nvsNodeDir.listFiles { file ->
                    file.isDirectory && File(file, "x64\\node.exe").exists()
                }?.firstOrNull()?.let { versionDir ->
                    File(versionDir, "x64\\node.exe").absolutePath
                }
                if (nodeExe != null) return nodeExe
            }
        }
        
        // Try PATH
        return try {
            ProcessBuilder("where", "node").start().inputStream.bufferedReader().readLine()?.trim()
        } catch (_: Exception) { null }
    }

}