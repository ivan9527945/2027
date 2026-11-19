// branded-website 的畫質分級在這裡只需要貼圖縮放：手機把大於 512px 的貼圖減半。
import { deviceTier } from "../../core";

export const QUALITY = Object.freeze({ textureScale: deviceTier.texScale < 1 ? 0.5 : 1 });
