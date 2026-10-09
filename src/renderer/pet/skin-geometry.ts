/**
 * 皮肤 → 立绘在素材画布内的几何参数（用于把桌宠窗口收紧到立绘包围盒）。
 * 数据来源：对 src/assets/skins/<skin> 全部动作帧做不透明像素联合包围盒实测（2048 画布）：
 * - default: bbox (729,345)-(1325,1942) → topFrac 0.1685, heightFrac 0.7803, aspect 0.3736
 * - classic: bbox (656,344)-(1391,1942) → topFrac 0.1680, heightFrac 0.7808, aspect 0.4603
 * - shiba: bbox (254,66)-(1738,1994) → topFrac 0.0322, heightFrac 0.9414, aspect 0.7697
 * 与 src/main/pet-aspect.ts 中的数值保持一致（两者分别用于窗口尺寸与渲染定位）。
 */
export interface SkinGeometry {
  /** 立绘包围盒顶部距画布顶部的比例 */
  topFrac: number;
  /** 立绘包围盒高度占画布比例 */
  heightFrac: number;
  /** 立绘包围盒宽高比（窗口宽/高） */
  aspect: number;
}

export const SKIN_GEOMETRY: Record<string, SkinGeometry> = {
  default: { topFrac: 0.1685, heightFrac: 0.7803, aspect: 0.3736 },
  classic: { topFrac: 0.1680, heightFrac: 0.7808, aspect: 0.4603 },
  shiba: { topFrac: 0.0322, heightFrac: 0.9414, aspect: 0.7697 },
};

export function skinGeometry(skin: string): SkinGeometry {
  const geo = SKIN_GEOMETRY[skin];
  return geo ?? { topFrac: 0.1685, heightFrac: 0.7803, aspect: 0.3736 };
}
