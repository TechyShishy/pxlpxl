export type { Color } from './color.model';
export {
  colorToRgba,
  colorToHex,
  hexToColor,
  colorsEqual,
  extractUniqueColors,
  colorInPalette,
  deduplicateColorList,
  TRANSPARENT,
  BLACK,
  WHITE,
  DEFAULT_PALETTE,
} from './color.model';
export type { Layer } from './layer.model';
export { createLayer, cloneLayerData } from './layer.model';
export type { Project, SerializedLayer, GridType, TriangularParams } from './project.model';
export {
  serializeLayer,
  deserializeLayer,
  createDefaultProject,
  computeBufferDimensions,
  computeBufferPixelCount,
  triangularRowWidth,
  triangularSlowRowWidth,
  triangularCumPixels,
  triangularSlowCumPixels,
  resolveTriangularD,
  resolveTriangularSlowD,
} from './project.model';
export { pixelOffset, pixelOffsetFromCtx } from './pixel-offset';
export type { Tool, ToolContext, ToolResult, ModifiedPixel, PixelCoord } from './tool.interface';
export { ToolType } from './tool.interface';
export type { Command } from './command.interface';
export type {
  PxlFile,
  PxlLayer,
  PxlHistory,
  HistoryEntryType,
  SerializedHistoryEntry,
  SerializedDrawEntry,
  SerializedFillEntry,
  SerializedLayerEntry,
  SerializedDuplicateLayerEntry,
  SerializedMoveLayerEntry,
  SerializedMovePaletteEntry,
  SerializedReplaceColorEntry,
  SerializedFlattenLayerEntry,
  SerializedAbsorbColorEntry,
  SerializedPixelEntry,
  SerializedModifiedPixel,
} from './pxl-file.model';
export { PXL_FORMAT_VERSION, uint8ArrayToBase64, base64ToUint8Array } from './pxl-file.model';
export { GestureState } from './gesture.model';
export type { BeadSize, ViewTransform, GestureEvent } from './gesture.model';
export type { RgpStep, RgpRow, RgpProject } from './rgp-file.model';
export {
  RgpStepSchema,
  RgpRowSchema,
  RgpProjectSchema,
  buildPaletteLetterMap,
  letterToColor,
} from './rgp-file.model';
export { PxlFileSchema } from './pxl-file.model';
