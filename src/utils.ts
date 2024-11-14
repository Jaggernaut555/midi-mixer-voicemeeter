import { settings } from "./context";

/**
 * Convert 0.0-1.0 to voicemeeter gain of -60 to 12
 */
export function convertVolumeToGain(level: number): number {
  return level * (settings.maxdb - settings.mindb) + settings.mindb;
  // Default values:
  // return (level * 72) - 60;
  // 72 = total range from max to minimum values
  // -60 = minimum value
}

/**
 * Convert -60-12 voicemeeter gain to 0.0-1.0
 */
export function convertGainToVolume(level: number): number {
  return (level - settings.mindb) / (settings.maxdb - settings.mindb);
  // Default values:
  // return (level + 60) / 72;
}

/**
 * Clamp between 0 and 1 for midi mixer volume/peak levels
 * @param value
 */
export function clampBar(value: number): number {
  return Math.min(Math.max(0, value), 1);
}

/**
 * Convert 0.0-1.0 to -40 to 12
 * @param value midi mixer volume level
 */
export function convertVolumeToLimit(level: number): number {
  const newLevel: number = level * 52 - 40;
  return newLevel;
}

/**
 * Convert -40 to 12 into 0.0-1.0
 * @param value voicemeeter limit.
 */
export function convertLimitToVolume(level: number): number {
  const newLevel: number = (level + 40) / 52;
  return newLevel;
}
