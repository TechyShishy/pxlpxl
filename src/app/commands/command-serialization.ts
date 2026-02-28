import { Command, SerializedHistoryEntry, SerializedPixelEntry, uint8ArrayToBase64, base64ToUint8Array, GridType, TriangularParams } from '../models';
import { DrawCommand } from './draw.command';
import { FillCommand } from './fill.command';
import { LayerCommand } from './layer.command';
import { DuplicateLayerCommand } from './duplicate-layer.command';
import { MoveLayerCommand } from './move-layer.command';
import { MovePaletteCommand } from './move-palette.command';
import { ReplaceColorCommand } from './replace-color.command';
import { FlattenLayerCommand } from './flatten-layer.command';
import { LayerService } from '../services/layer.service';
import { ColorService } from '../services/color.service';

/**
 * Remap legacy 'triangular-slow' gridType to unified 'triangular'
 * and fix dNum/dDen parameters accordingly.
 */
function remapLegacyGridType(
  entry: SerializedPixelEntry,
): { gridType?: GridType; dNum?: number; dDen?: number } {
  const gt = entry.gridType as string | undefined;
  if (gt === 'triangular-slow') {
    const dNum = entry.triangularDNum ?? 1;
    const dDen = entry.triangularDDen ?? (entry.triangularD ?? 2);
    return { gridType: 'triangular', dNum, dDen };
  }
  // Old fast-growth triangular: convert integer d → dNum=d, dDen=1
  if (gt === 'triangular' && entry.triangularDNum === undefined && entry.triangularD !== undefined) {
    return { gridType: 'triangular', dNum: entry.triangularD, dDen: 1 };
  }
  return { gridType: entry.gridType, dNum: entry.triangularDNum, dDen: entry.triangularDDen };
}

/**
 * Serialize a Command instance into a plain object for .pxl file storage.
 * Throws if the command type is unrecognised.
 */
export function serializeCommand(command: Command): SerializedHistoryEntry | null {
  if (command instanceof DrawCommand) {
    return {
      type: 'draw',
      description: command.description,
      layerIndex: command.layerIdx,
      canvasWidth: command.width,
      gridType: command.gridType,
      triangularA: command.triangular?.a,
      triangularD: command.triangular?.d,
      triangularDNum: command.triangular?.dNum,
      triangularDDen: command.triangular?.dDen,
      triangularShift: command.triangular?.shift,
      modifiedPixels: command.modifiedPixels.map((p) => ({
        coord: { x: p.coord.x, y: p.coord.y },
        oldColor: { ...p.oldColor },
        newColor: { ...p.newColor },
      })),
    };
  }

  if (command instanceof FillCommand) {
    return {
      type: 'fill',
      description: command.description,
      layerIndex: command.layerIdx,
      canvasWidth: command.width,
      gridType: command.gridType,
      triangularA: command.triangular?.a,
      triangularD: command.triangular?.d,
      triangularDNum: command.triangular?.dNum,
      triangularDDen: command.triangular?.dDen,
      triangularShift: command.triangular?.shift,
      modifiedPixels: command.modifiedPixels.map((p) => ({
        coord: { x: p.coord.x, y: p.coord.y },
        oldColor: { ...p.oldColor },
        newColor: { ...p.newColor },
      })),
    };
  }

  if (command instanceof LayerCommand) {
    return {
      type: 'layer',
      description: command.description,
      layerIndex: command.layerIdx,
      canvasWidth: 0, // not used by LayerCommand but required by schema
      previousData: uint8ArrayToBase64(command.previousData),
      newData: uint8ArrayToBase64(command.newData),
    };
  }

  if (command instanceof DuplicateLayerCommand) {
    return {
      type: 'duplicate-layer',
      description: command.description,
      layerIndex: command.insertIndex,
      canvasWidth: 0,
      insertIndex: command.insertIndex,
      duplicatedLayer: {
        id: command.layer.id,
        name: command.layer.name,
        visible: command.layer.visible,
        opacity: command.layer.opacity,
        data: uint8ArrayToBase64(command.layer.data),
      },
    };
  }

  if (command instanceof MoveLayerCommand) {
    return {
      type: 'move-layer',
      description: command.description,
      layerIndex: command.fromIndex,
      canvasWidth: 0,
      fromIndex: command.fromIndex,
      toIndex: command.toIndex,
    };
  }

  if (command instanceof MovePaletteCommand) {
    return {
      type: 'move-palette',
      description: command.description,
      layerIndex: 0,
      canvasWidth: 0,
      fromIndex: command.fromIndex,
      toIndex: command.toIndex,
    };
  }

  if (command instanceof ReplaceColorCommand) {
    return {
      type: 'replace-color',
      description: command.description,
      layerIndex: 0,
      canvasWidth: 0,
      paletteIndex: command.paletteIndex,
      oldColor: { ...command.oldColor },
      newColor: { ...command.newColor },
      affected: command.affected?.map(a => ({ layerIndex: a.layerIndex, byteOffset: a.byteOffset })) ?? undefined,
    };
  }

  if (command instanceof FlattenLayerCommand) {
    return {
      type: 'flatten-layer',
      description: command.description,
      layerIndex: command.layerIndex,
      canvasWidth: 0,
      sourceLayerSnapshot: {
        id: command.sourceLayerSnapshot.id,
        name: command.sourceLayerSnapshot.name,
        visible: command.sourceLayerSnapshot.visible,
        opacity: command.sourceLayerSnapshot.opacity,
        data: uint8ArrayToBase64(command.sourceLayerSnapshot.data),
      },
      previousAboveData: uint8ArrayToBase64(command.previousAboveData),
      previousAboveOpacity: command.previousAboveOpacity,
      mergedData: uint8ArrayToBase64(command.mergedData),
    };
  }

  return null;
}

/**
 * Reconstruct a Command instance from serialized data.
 * The returned command is in "already executed" state — caller should NOT call execute() again.
 */
export function deserializeCommand(
  entry: SerializedHistoryEntry,
  layerService: LayerService,
  colorService: ColorService,
): Command {
  switch (entry.type) {
    case 'draw': {
      const { gridType, dNum, dDen } = remapLegacyGridType(entry);
      const triDraw: TriangularParams | undefined = gridType === 'triangular'
        ? { a: entry.triangularA, d: entry.triangularD, dNum, dDen, shift: entry.triangularShift }
        : undefined;
      return new DrawCommand(
        layerService,
        entry.layerIndex,
        entry.canvasWidth,
        (entry.modifiedPixels ?? []).map((p) => ({
          coord: { x: p.coord.x, y: p.coord.y },
          oldColor: { ...p.oldColor },
          newColor: { ...p.newColor },
        })),
        entry.description,
        gridType,
        triDraw,
      );
    }

    case 'fill': {
      const { gridType, dNum, dDen } = remapLegacyGridType(entry);
      const triFill: TriangularParams | undefined = gridType === 'triangular'
        ? { a: entry.triangularA, d: entry.triangularD, dNum, dDen, shift: entry.triangularShift }
        : undefined;
      return new FillCommand(
        layerService,
        entry.layerIndex,
        entry.canvasWidth,
        (entry.modifiedPixels ?? []).map((p) => ({
          coord: { x: p.coord.x, y: p.coord.y },
          oldColor: { ...p.oldColor },
          newColor: { ...p.newColor },
        })),
        gridType,
        triFill,
      );
    }

    case 'layer':
      return new LayerCommand(
        layerService,
        entry.layerIndex,
        base64ToUint8Array(entry.previousData ?? ''),
        base64ToUint8Array(entry.newData ?? ''),
        entry.description,
      );

    case 'duplicate-layer': {
      const dl = entry.duplicatedLayer;
      if (!dl) throw new Error('duplicate-layer entry is missing duplicatedLayer');
      const layer = {
        id: dl.id,
        name: dl.name,
        visible: dl.visible,
        opacity: dl.opacity,
        data: base64ToUint8Array(dl.data),
      };
      return new DuplicateLayerCommand(layerService, entry.insertIndex ?? entry.layerIndex, layer);
    }

    case 'move-layer':
      if (entry.fromIndex == null || entry.toIndex == null) {
        throw new Error('move-layer entry is missing fromIndex or toIndex');
      }
      return new MoveLayerCommand(layerService, entry.fromIndex, entry.toIndex);

    case 'move-palette':
      if (entry.fromIndex == null || entry.toIndex == null) {
        throw new Error('move-palette entry is missing fromIndex or toIndex');
      }
      return new MovePaletteCommand(colorService, entry.fromIndex, entry.toIndex);

    case 'replace-color': {
      if (entry.paletteIndex == null || !entry.oldColor || !entry.newColor) {
        throw new Error('replace-color entry is missing paletteIndex, oldColor, or newColor');
      }
      const cmd = new ReplaceColorCommand(
        layerService,
        colorService,
        entry.paletteIndex,
        { ...entry.oldColor },
        { ...entry.newColor },
      );
      if (entry.affected) {
        cmd.affected = (entry.affected as Array<{ layerIndex: number; byteOffset: number }>).map(
          (a) => ({ layerIndex: a.layerIndex, byteOffset: a.byteOffset }),
        );
      }
      return cmd;
    }

    case 'flatten-layer': {
      const src = entry.sourceLayerSnapshot;
      if (!src || !entry.previousAboveData || !entry.mergedData) {
        throw new Error('flatten-layer entry is missing required fields');
      }
      return FlattenLayerCommand.fromSerialized(
        layerService,
        entry.layerIndex,
        {
          id: src.id,
          name: src.name,
          visible: src.visible,
          opacity: src.opacity,
          data: base64ToUint8Array(src.data),
        },
        base64ToUint8Array(entry.previousAboveData),
        entry.previousAboveOpacity ?? 1,
        base64ToUint8Array(entry.mergedData),
      );
    }

    default: {
      const _exhaustive: never = entry;
      throw new Error(`Unknown history entry type: ${(_exhaustive as SerializedHistoryEntry).type}`);
    }
  }
}
