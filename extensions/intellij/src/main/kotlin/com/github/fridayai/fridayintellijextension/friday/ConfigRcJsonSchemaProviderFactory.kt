// Modified by Friday AI Team - Rebranded from Continue
package com.github.fridayai.fridayintellijextension.`friday`

import com.github.fridayai.fridayintellijextension.activities.FridayPluginStartupActivity
import com.github.fridayai.fridayintellijextension.constants.getFridayGlobalPath
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.StreamUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.jsonSchema.extension.JsonSchemaFileProvider
import com.jetbrains.jsonSchema.extension.JsonSchemaProviderFactory
import com.jetbrains.jsonSchema.extension.SchemaType
import java.io.File
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.nio.file.Paths

class ConfigRcJsonSchemaProviderFactory : JsonSchemaProviderFactory {
    override fun getProviders(project: Project): MutableList<JsonSchemaFileProvider> {
        return mutableListOf(ConfigRcJsonSchemaFileProvider())
    }
}

class ConfigRcJsonSchemaFileProvider : JsonSchemaFileProvider {
    override fun isAvailable(file: VirtualFile): Boolean {
        return file.name == ".fridayrc.json"
    }

    override fun getName(): String {
        return ".fridayrc.json"
    }

    override fun getSchemaFile(): VirtualFile? {
        FridayPluginStartupActivity::class.java.getClassLoader().getResourceAsStream("friday_rc_schema.json")
            .use { `is` ->
                if (`is` == null) {
                    throw IOException("Resource not found: friday_rc_schema.json")
                }
                val content = `is`.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
                val filepath = Paths.get(getFridayGlobalPath(), "friday_rc_schema.json").toString()
                File(filepath).writeText(content)
                return LocalFileSystem.getInstance().findFileByPath(filepath)
            }
    }

    override fun getSchemaType(): SchemaType {
        return SchemaType.embeddedSchema
    }

}
