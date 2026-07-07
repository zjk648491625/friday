// Modified by Friday AI Team - Rebranded from Continue
package com.github.fridayai.fridayintellijextension.`friday`.process

import java.io.InputStream
import java.io.OutputStream

interface FridayProcess {

    val input: InputStream
    val output: OutputStream

    fun close()

}
