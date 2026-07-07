// Modified by Friday AI Team - Rebranded from Continue
package com.github.fridayai.fridayintellijextension.autocomplete


interface CompletionService {

    suspend fun getAutocomplete(uuid: String, url: String, line: Int, column: Int): String?

    fun acceptAutocomplete(uuid: String?)

}