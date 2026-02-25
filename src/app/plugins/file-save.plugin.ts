import { registerPlugin } from '@capacitor/core';

export interface FileSavePlugin {
  /**
   * Save a base64-encoded file directly to the device's Downloads folder.
   * Android only – on other platforms this method will not be called.
   */
  saveToDownloads(options: {
    /** Target file name, e.g. "export.png" */
    filename: string;
    /** MIME type, e.g. "image/png" */
    mimeType: string;
    /** Base64-encoded file contents (no data-URI prefix) */
    data: string;
  }): Promise<{ uri: string; path: string }>;
}

export const FileSave = registerPlugin<FileSavePlugin>('FileSave');
