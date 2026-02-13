import { Command, SerializedHistoryEntry, uint8ArrayToBase64, base64ToUint8Array } from '../models';
import { DrawCommand } from './draw.command';
import { FillCommand } from './fill.command';
import { LayerCommand } from './layer.command';
import { LayerService } from '../services/layer.service';

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

  return null;
}

/**
 * Reconstruct a Command instance from serialized data.
 * The returned command is in "already executed" state — caller should NOT call execute() again.
 */
export function deserializeCommand(
  entry: SerializedHistoryEntry,
  layerService: LayerService,
): Command {
  switch (entry.type) {
    case 'draw':
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
      );

    case 'fill':
      return new FillCommand(
        layerService,
        entry.layerIndex,
        entry.canvasWidth,
        (entry.modifiedPixels ?? []).map((p) => ({
          coord: { x: p.coord.x, y: p.coord.y },
          oldColor: { ...p.oldColor },
          newColor: { ...p.newColor },
        })),
      );

    case 'layer':
      return new LayerCommand(
        layerService,
        entry.layerIndex,
        base64ToUint8Array(entry.previousData ?? ''),
        base64ToUint8Array(entry.newData ?? ''),
        entry.description,
      );

    default:
      throw new Error(`Unknown history entry type: ${entry.type}`);
  }
}
