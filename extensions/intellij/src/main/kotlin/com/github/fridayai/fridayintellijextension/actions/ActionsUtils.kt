// Modified by Friday AI Team - Rebranded from Continue
package com.github.fridayai.fridayintellijextension.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.vfs.VirtualFile

fun AnActionEvent.getSelectedFiles(): Array<out VirtualFile> {
    val multipleFiles = this.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY)
    if (multipleFiles != null) {
        return multipleFiles
    }

    return this.getData(CommonDataKeys.VIRTUAL_FILE)?.let { arrayOf(it) } ?: emptyArray()
}
