/**
 * 皮肤 → 立绘几何（窗口尺寸用）。
 * 数据来源：对 src/assets/skins/<skin> 全部动作帧做不透明像素联合包围盒实测（2048 画布）：
 * - default: bbox (729,345)-(1325,1942) → heightFrac 0.7803, aspect 0.3736
 * - classic: bbox (656,344)-(1391,1942) → heightFrac 0.7808, aspect 0.4603
 * - shiba: bbox (254,66)-(1738,1994) → heightFrac 0.9414, aspect 0.7697
 * 与 src/renderer/pet/skin-geometry.ts 中的数值保持一致。
 * 窗口尺寸 = 立绘包围盒：高 = baseWindowPx * petScale * heightFrac，宽 = 高 * aspect。
 * 这样点击/拖拽范围贴合立绘本身，而不是带大量安全留白的正方形窗口。
 */
export const SKIN_GEOMETRY: Record<string, { aspect: number; heightFrac: number }> = {
  default: { aspect: 0.3736, heightFrac: 0.7803 },
  classic: { aspect: 0.4603, heightFrac: 0.7808 },
  shiba: { aspect: 0.7697, heightFrac: 0.9414 },
};

export function skinGeometry(skin: string): { aspect: number; heightFrac: number } {
  const geo = SKIN_GEOMETRY[skin];
  return geo ?? { aspect: 0.3736, heightFrac: 0.7803 };
}

export interface PetWindowSize {
  width: number;
  height: number;
}
