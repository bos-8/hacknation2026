export type AsideVariant = "overlay" | "push";

/** Keep the panel in the viewport and preserve a usable workspace beside a docked panel. */
export function asideSize(viewport: number, desired: number, variant: AsideVariant, minimum = 280, maximum = 720) {
  const available = Math.max(0, Number.isFinite(viewport) ? viewport : 0);
  const mobile = available < 768;
  const max = mobile ? available : Math.max(0, Math.min(maximum, available - (variant === "push" ? 320 : 48)));
  const min = Math.max(0, Math.min(minimum, max));
  return { mobile, min, max, width: mobile ? available : Math.max(min, Math.min(max, Number.isFinite(desired) ? desired : min)) };
}

export function asideKeyboardWidth(key: string, width: number, min: number, max: number, shift = false): number | null {
  const step = shift ? 40 : 16;
  const next = key === "ArrowLeft" ? width + step : key === "ArrowRight" ? width - step : key === "Home" ? min : key === "End" ? max : null;
  return next === null ? null : Math.max(min, Math.min(max, next));
}
