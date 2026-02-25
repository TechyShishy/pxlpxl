package com.techyshishy.pxlpxl;

import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Capacitor plugin that saves a base64-encoded file directly to the
 * device's Downloads folder, bypassing the share sheet.
 *
 * On Android 10+ (API 29+): uses MediaStore.Downloads — no storage
 * permissions required.
 *
 * On Android 9 and below (API 28-): writes to the public Downloads
 * directory via the legacy filesystem API and triggers a MediaScanner
 * scan so the file appears immediately in the Files app.
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    /**
     * Save a file to the Downloads folder.
     *
     * <p>Call options:
     * <ul>
     *   <li>filename  (String, required) — target file name, e.g. "export.png"
     *   <li>mimeType  (String, required) — MIME type, e.g. "image/png"
     *   <li>data      (String, required) — base64-encoded file contents (no data-URI prefix)
     * </ul>
     *
     * <p>Resolves with:
     * <ul>
     *   <li>uri   (String) — content:// or file:// URI of the saved file
     *   <li>path  (String) — human-readable path shown to the user
     * </ul>
     */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null || filename.isEmpty()) {
            call.reject("filename is required");
            return;
        }

        String mimeType = call.getString("mimeType");
        if (mimeType == null || mimeType.isEmpty()) {
            mimeType = "application/octet-stream";
        }

        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("data is required");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid base64 data: " + e.getMessage());
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveViaMediaStore(call, filename, mimeType, bytes);
            } else {
                saveViaLegacyFilesystem(call, filename, mimeType, bytes);
            }
        } catch (Exception e) {
            call.reject("Failed to save file: " + e.getMessage());
        }
    }

    private void saveViaMediaStore(
            PluginCall call,
            String filename,
            String mimeType,
            byte[] bytes) throws Exception {

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri uri = getContext().getContentResolver().insert(collection, values);
        if (uri == null) {
            call.reject("Failed to create MediaStore entry for " + filename);
            return;
        }

        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri)) {
            if (stream == null) {
                call.reject("Failed to open output stream for " + filename);
                return;
            }
            stream.write(bytes);
        }

        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        getContext().getContentResolver().update(uri, values, null, null);

        JSObject result = new JSObject();
        result.put("uri", uri.toString());
        result.put("path", "Downloads/" + filename);
        call.resolve(result);
    }

    private void saveViaLegacyFilesystem(
            PluginCall call,
            String filename,
            String mimeType,
            byte[] bytes) throws Exception {

        File downloadsDir =
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!downloadsDir.exists()) {
            downloadsDir.mkdirs();
        }

        File file = new File(downloadsDir, filename);
        try (FileOutputStream stream = new FileOutputStream(file)) {
            stream.write(bytes);
        }

        final String fileMimeType = mimeType;
        MediaScannerConnection.scanFile(
                getContext(),
                new String[]{file.getAbsolutePath()},
                new String[]{fileMimeType},
                null);

        JSObject result = new JSObject();
        result.put("uri", file.toURI().toString());
        result.put("path", file.getAbsolutePath());
        call.resolve(result);
    }
}
