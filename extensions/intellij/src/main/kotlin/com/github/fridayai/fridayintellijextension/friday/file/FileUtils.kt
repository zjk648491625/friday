package com.github.fridayai.fridayintellijextension.`friday`.file

import com.github.fridayai.fridayintellijextension.FileStats
import com.github.fridayai.fridayintellijextension.FileType
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import java.io.File
import kotlin.math.min


class FileUtils(
    private val project: Project,
) {
    fun fileExists(fileUri: String): Boolean =
        toIoFile(fileUri).exists() || findFile(fileUri) != null

    fun writeFile(fileUri: String, content: String) {
        val io = toIoFile(fileUri)
        io.parentFile?.mkdirs()
        io.writeText(content)
        // Best-effort: refresh the VFS so the IDE editor reflects the change.
        findFile(fileUri)?.let { VfsUtil.markDirtyAndRefresh(true, false, false, it) }
    }

    fun removeFile(fileUri: String) {
        val io = toIoFile(fileUri)
        var deleted = false
        if (io.exists()) {
            deleted = io.delete()
            if (!deleted) {
                LOG.warn("Failed to delete file via filesystem, trying VFS: $fileUri")
            }
        }
        if (!deleted) {
            val found = findFile(fileUri)
            if (found != null) {
                runWriteAction {
                    found.delete(this)
                }
            } else if (!io.exists()) {
                // File already gone (may have been deleted by the filesystem attempt above)
            } else {
                LOG.warn("File not found in VFS and filesystem delete failed: $fileUri")
            }
        }
    }

    fun listDir(fileUri: String): List<List<Any>> {
        val io = toIoFile(fileUri)
        if (io.exists() && io.isDirectory) {
            return io.listFiles()?.map { f ->
                listOf(f.name, if (f.isDirectory) FileType.DIRECTORY.value else FileType.FILE.value)
            } ?: emptyList()
        }
        val found = findFile(fileUri)
            ?: return emptyList()
        if (!found.isDirectory)
            return emptyList()
        return found.children.map { file ->
            val fileType = if (file.isDirectory)
                FileType.DIRECTORY.value
            else
                FileType.FILE.value
            listOf(file.name, fileType)
        }
    }

    fun readFile(fileUri: String, maxLength: Int = 100_000): String {
        val io = toIoFile(fileUri)
        if (io.exists()) {
            val text = runCatching { io.readText() }.getOrElse { "" }
            return normalizeLineEndings(text)
        }
        val found = findFile(fileUri)
            ?: return ""
        val text = runReadAction {
            // note: document (if exists) is more up-to-date than VFS
            readDocument(found, maxLength) ?: VfsUtil.loadText(found, maxLength)
        }
        return normalizeLineEndings(text)
    }

    fun openFile(fileUri: String) {
        val found = findFile(fileUri)
            ?: return
        FileEditorManager.getInstance(project).openFile(found, true)
    }

    fun saveFile(fileUri: String) {
        val found = findFile(fileUri)
            ?: return
        val manager = FileDocumentManager.getInstance()
        val document = manager.getDocument(found)
            ?: return
        manager.saveDocument(document)
    }

    fun getFileStats(fileUris: List<String>): Map<String, FileStats> =
        fileUris.mapNotNull { fileUri ->
            val file = findFile(fileUri)
                ?: return@mapNotNull null
            fileUri to FileStats(file.timeStamp, file.length)
        }.toMap()

    private fun findFile(fileUri: String): VirtualFile? {
        val noParams = fileUri.substringBefore("?")
        val normalizedAuthority = normalizeWindowsAuthority(noParams)
        return VirtualFileManager.getInstance()
            .refreshAndFindFileByUrl(normalizedAuthority)
    }

    /**
     * Resolves a file URI (or a raw filesystem path) to a [File] so that
     * operations work regardless of whether the file lives inside the IDE's
     * VFS (e.g. global config/rules under the user home or a .friday folder
     * which may not be part of any content root).
     */
    private fun toIoFile(fileUri: String): File {
        val noParams = fileUri.substringBefore("?")
        val url = if (noParams.startsWith("file://")) {
            normalizeWindowsAuthority(noParams)
        } else {
            // Raw path: Windows "C:\..." or "/C:/..." or unix "/path"
            "file:///" + noParams.replace('\\', '/').removePrefix("/")
        }
        val path = VfsUtilCore.urlToPath(url)
        return File(path)
    }

    private fun readDocument(file: VirtualFile, maxLength: Int): String? {
        val document = FileDocumentManager.getInstance().getDocument(file)
            ?: return null
        val length = min(document.textLength, maxLength)
        return document.getText(TextRange(0, length))
    }

    private fun normalizeLineEndings(text: String) =
        text.replace("\r\n", "\n")
            .replace("\r", "\n")

    private fun normalizeWindowsAuthority(fileUri: String): String {
        val authorityPrefix = "file://"
        val noAuthorityPrefix = "file:///"
        if (fileUri.startsWith(authorityPrefix) && !fileUri.startsWith(noAuthorityPrefix)) {
            val path = fileUri.substringAfter(authorityPrefix)
            return "$noAuthorityPrefix$path"
        }
        return fileUri
    }

    private companion object {
        private val LOG = Logger.getInstance(FileUtils::class.java)
    }
}