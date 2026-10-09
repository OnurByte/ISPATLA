export const SIDEBAR_WIDTH_MIN = 280;
export const SIDEBAR_WIDTH_MAX = 420;
export const SIDEBAR_WIDTH_DEFAULT = 300;

export function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width));
}

export function getStoredSidebarWidth(width: number) {
  return Number.isFinite(width) && width >= SIDEBAR_WIDTH_MIN && width <= SIDEBAR_WIDTH_MAX
    ? width
    : SIDEBAR_WIDTH_DEFAULT;
}
