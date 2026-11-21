export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export function tooltipPosition(
  anchor: { left: number; top: number; width: number; height: number },
  tooltip: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: TooltipPlacement,
) {
  // Five-pixel arrow, followed by two pixels of space before the trigger.
  const gap = 7;
  const viewportPadding = 8;
  let left = anchor.left + (anchor.width - tooltip.width) / 2;
  let top = anchor.top - tooltip.height - gap;
  if (placement === "bottom") top = anchor.top + anchor.height + gap;
  if (placement === "left" || placement === "right") {
    left = placement === "left" ? anchor.left - tooltip.width - gap : anchor.left + anchor.width + gap;
    top = anchor.top + (anchor.height - tooltip.height) / 2;
  }
  return {
    left: Math.max(viewportPadding, Math.min(left, viewport.width - tooltip.width - viewportPadding)),
    top: Math.max(viewportPadding, Math.min(top, viewport.height - tooltip.height - viewportPadding)),
  };
}
