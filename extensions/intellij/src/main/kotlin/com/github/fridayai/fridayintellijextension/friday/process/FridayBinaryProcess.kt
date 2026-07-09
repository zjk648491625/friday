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
        // Try nvs-managed Node.js first
        val nvsNode = listOf(
            System.getenv("LOCALAPPDATA")?.let { "$it\\nvs\\default\\node.exe" },
            System.getenv("LOCALAPPDATA")?.let { "$it\\nvs\\node\\20.20.1\\x64\\node.exe" },
        ).firstOrNull { it != null && File(it).exists() }
        if (nvsNode != null) return nvsNode
        
        // Try PATH
        return try {
            ProcessBuilder("where", "node").start().inputStream.bufferedReader().readLine()?.trim()
        } catch (_: Exception) { null }
    }

}
