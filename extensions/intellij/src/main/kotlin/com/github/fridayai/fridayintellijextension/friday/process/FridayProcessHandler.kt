package com.github.fridayai.fridayintellijextension.`friday`.process

import com.intellij.openapi.diagnostic.Logger
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStreamWriter

class FridayProcessHandler(
    parentScope: CoroutineScope,
    private val process: FridayProcess,
    handleMessage: (String) -> (Unit)
) {
    private val innerJob = Job()
    private val scope = CoroutineScope(parentScope.coroutineContext + innerJob)
    private val pendingWrites = Channel<String>(Channel.UNLIMITED)
    private val writer = OutputStreamWriter(process.output, Charsets.UTF_8)
    private val reader = BufferedReader(InputStreamReader(process.input, Charsets.UTF_8))
    private val log = Logger.getInstance(FridayProcessHandler::class.java)

    // Messages containing these prefixes are logged at INFO level (one-time init events)
    private val infoLevelPrefixes = listOf("[nativeAddon]", "[LanceDbIndex]", "[FRIDAY_USAGE]")

    init {
        scope.launch(Dispatchers.IO) {
            try {
                while (isActive) {
                    val line = reader.readLine()
                    if (line != null && line.isNotEmpty()) {
                        try {
                            if (infoLevelPrefixes.any { line.contains(it) }) {
                                log.info("Handle: $line")
                            } else {
                                log.debug("Handle: $line")
                            }
                            handleMessage(line)
                        } catch (e: Exception) {
                        }
                    } else
                        delay(100)
                }
            } catch (e: IOException) {
            }
        }
        scope.launch(Dispatchers.IO) {
            for (message in pendingWrites) {
                try {
                    log.debug("Write: $message")
                    writer.write(message)
                    writer.write("\r\n")
                    writer.flush()
                } catch (e: IOException) {
                    log.warn(e)
                }
            }
        }
    }

    fun write(message: String) =
        pendingWrites.trySend(message)

    fun close() {
        innerJob.cancel()
        scope.launch(Dispatchers.IO) {
            reader.close()
            writer.close()
            process.close()
        }
    }
}
