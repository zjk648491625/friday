package com.github.fridayai.fridayintellijextension.`friday`

import com.github.fridayai.fridayintellijextension.services.FridayPluginService
import com.github.fridayai.fridayintellijextension.utils.toUriOrNull
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader

class GitService(
    private val project: Project,
    private val fridayPluginService: FridayPluginService
) {


    /**
     * Returns the git diff for all workspace directories
     */
    suspend fun getDiff(includeUnstaged: Boolean): List<String> {
        return getDiffInternal(includeUnstaged, null)
    }

    /**
     * Returns the git diff for specific file paths only
     */
    suspend fun getDiffForPaths(includeUnstaged: Boolean, filePaths: List<String>): List<String> {
        return getDiffInternal(includeUnstaged, filePaths)
    }

    private suspend fun getDiffInternal(includeUnstaged: Boolean, filePaths: List<String>?): List<String> {
        val workspaceDirs = workspaceDirectories()
        val diffs = mutableListOf<String>()

        for (workspaceDir in workspaceDirs) {
            val workspaceDirFile = UriUtils.uriToFile(workspaceDir)
            val workspacePath = workspaceDirFile.absolutePath

            val commands = mutableListOf("git")
            if (includeUnstaged) {
                commands.add("diff")
            } else {
                commands.add("diff")
                commands.add("--cached")
            }

            val builder = if (filePaths != null && filePaths.isNotEmpty()) {
                // Filter to files under this workspace, convert to relative paths
                // Normalize both paths to use the same separator for reliable matching
                val normalizedWorkspacePath = workspacePath.replace('\\', '/').lowercase()
                val relativePaths = filePaths
                    .filter {
                        val normalizedFilePath = it.replace('\\', '/').lowercase()
                        normalizedFilePath.startsWith(normalizedWorkspacePath)
                    }
                    .map {
                        val normalizedFilePath = it.replace('\\', '/')
                        normalizedFilePath.removePrefix(workspacePath.replace('\\', '/'))
                            .removePrefix("/")
                    }
                if (relativePaths.isEmpty()) continue
                commands.add("--")
                commands.addAll(relativePaths)
                ProcessBuilder(commands)
            } else {
                ProcessBuilder(commands)
            }

            builder.directory(workspaceDirFile)
            val process = withContext(Dispatchers.IO) {
                builder.start()
            }

            // Read stdout and stderr in parallel
            val output = StringBuilder()
            val errorOutput = StringBuilder()

            val stdoutJob = CoroutineScope(Dispatchers.IO).async {
                val reader = BufferedReader(InputStreamReader(process.inputStream))
                var line: String? = reader.readLine()
                while (line != null) {
                    output.append(line)
                    output.append("\n")
                    line = reader.readLine()
                }
            }

            val stderrJob = CoroutineScope(Dispatchers.IO).async {
                val reader = BufferedReader(InputStreamReader(process.errorStream))
                var line: String? = reader.readLine()
                while (line != null) {
                    errorOutput.append(line)
                    errorOutput.append("\n")
                    line = reader.readLine()
                }
            }

            stdoutJob.await()
            stderrJob.await()

            val exitCode = withContext(Dispatchers.IO) {
                process.waitFor()
            }

            if (exitCode != 0 && errorOutput.isNotEmpty()) {
                System.err.println("[Friday] git diff failed with exit code $exitCode: $errorOutput")
            }

            diffs.add(output.toString())
        }

        return diffs
    }

    private fun workspaceDirectories(): Array<String> {
        val dirs = this.fridayPluginService.workspacePaths

        if (dirs?.isNotEmpty() == true) {
            return dirs
        }

        return listOfNotNull(project.guessProjectDir()?.toUriOrNull()).toTypedArray()
    }

}