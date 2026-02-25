package com.techyshishy.pxlpxl

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream

@CapacitorPlugin(name = "FileSave")
class FileSavePlugin : Plugin() {

    /**
     * Save a base64-encoded file directly to the device's Downloads folder.
     *
     * On Android 10+ (API 29+) uses the MediaStore Downloads collection so no
     * WRITE_EXTERNAL_STORAGE permission is required.
     *
     * On Android 9 and below falls back to the legacy public Downloads
     * directory and triggers a MediaScanner scan so the file appears in the
     * system file manager.
     *
     * Call options:
     *   filename  (string, required) – target file name, e.g. "export.png"
     *   mimeType  (string, required) – MIME type, e.g. "image/png"
     *   data      (string, required) – base64-encoded file contents (no data-URI prefix)
     *
     * Resolves with:
     *   uri   (string) – content:// or file:// URI of the saved file
     *   path  (string) – human-readable path shown to the user
     */
    @PluginMethod
    fun saveToDownloads(call: PluginCall) {
        val filename = call.getString("filename") ?: run {
            call.reject("filename is required")
            return
        }
        val mimeType = call.getString("mimeType") ?: "application/octet-stream"
        val data = call.getString("data") ?: run {
            call.reject("data is required")
            return
        }

        try {
            val bytes = Base64.decode(data, Base64.DEFAULT)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveViaMediaStore(call, filename, mimeType, bytes)
            } else {
                saveViaLegacyFilesystem(call, filename, mimeType, bytes)
            }
        } catch (e: Exception) {
            call.reject("Failed to save file: ${e.message}", e)
        }
    }

    private fun saveViaMediaStore(
        call: PluginCall,
        filename: String,
        mimeType: String,
        bytes: ByteArray,
    ) {
        val resolver = context.contentResolver
        val contentValues = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, filename)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }

        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, contentValues) ?: run {
            call.reject("Failed to create MediaStore entry for $filename")
            return
        }

        resolver.openOutputStream(uri)?.use { stream ->
            stream.write(bytes)
        } ?: run {
            call.reject("Failed to open output stream for $filename")
            return
        }

        contentValues.clear()
        contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, contentValues, null, null)

        val result = JSObject()
        result.put("uri", uri.toString())
        result.put("path", "Downloads/$filename")
        call.resolve(result)
    }

    private fun saveViaLegacyFilesystem(
        call: PluginCall,
        filename: String,
        mimeType: String,
        bytes: ByteArray,
    ) {
        val downloadsDir =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        downloadsDir.mkdirs()

        val file = File(downloadsDir, filename)
        FileOutputStream(file).use { stream ->
            stream.write(bytes)
        }

        MediaScannerConnection.scanFile(
            context,
            arrayOf(file.absolutePath),
            arrayOf(mimeType),
            null,
        )

        val result = JSObject()
        result.put("uri", file.toURI().toString())
        result.put("path", file.absolutePath)
        call.resolve(result)
    }
}
