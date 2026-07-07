// Modified by Friday AI Team - Rebranded from Continue
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
        val path = getFridayBinaryPath()
        runBlocking(Dispatchers.IO) {
            setPermissions()
        }

        val builder = ProcessBuilder(path)
        builder.environment() += ProxySettings.getSettings().toFridayEnvVars()
        return builder
            .directory(File(path).parentFile)
            .start()
            // Friday AI: Telemetry removed (local-only mode)
            .apply { onExit().thenRun(onUnexpectedExit) }
    }

    private companion object {

        private fun setPermissions() {
            val os = getOS()
            when (os) {
                OS.MAC -> setMacOsPermissions()
                OS.WINDOWS -> {}
                OS.LINUX -> elevatePermissions()
            }
        }

        private fun setMacOsPermissions() {
            ProcessBuilder("xattr", "-dr", "com.apple.quarantine", getFridayBinaryPath()).start().waitFor()
            elevatePermissions()
        }

        // todo: consider setting permissions ahead-of-time during build/packaging, not at runtime
        private fun elevatePermissions() {
            val path = getFridayBinaryPath()
            val permissions = setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE
            )
            Files.setPosixFilePermissions(Paths.get(path), permissions)
        }
    }

}
