import { BeadSize } from '../models';

/**
 * Compute the pivot point for radial clone rotation.
 *
 * The pivot is the theoretical apex where the wedge converges to zero
 * width. Row r has width ≈ a + r·dNum/dDen, so extrapolating back to
 * width 0 gives r_apex = -(a·dDen/dNum). In screen space that is
 * r_apex × rowSpacing above the first row.
 */
export function clonePivot(
  beadSize: BeadSize,
  maxWidth: number,
  usesPeyote: boolean,
  a: number,
  dNum: number,
  dDen: number,
): { x: number; y: number } {
  const rowSpacing = usesPeyote ? beadSize.height / 2 : beadSize.height;
  const pivotY = -(a * dDen / dNum) * rowSpacing;
  if (usesPeyote) {
    return { x: (maxWidth - 0.5) * beadSize.width, y: pivotY };
  }
  return { x: (maxWidth / 2) * beadSize.width, y: pivotY };
}
