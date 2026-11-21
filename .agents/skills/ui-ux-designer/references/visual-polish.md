# Visual Polish

Make UI feel intentional without adding unnecessary decoration.

## Polish Checklist

- Align to existing design tokens, components, border radii, shadows, and spacing scale.
- Use clear visual hierarchy: primary action, secondary actions, metadata, supporting details.
- Keep headings and body text proportional to the surface.
- Make interactive states visible: hover, focus, active, disabled, loading, selected.
- Use icon buttons for familiar tool actions and add tooltips when meaning is not obvious.
- An intentional monochromatic palette is valid when it fits the brand and preserves hierarchy, contrast and non-color status cues. Existing design tokens and explicit user goals take precedence over default palette preferences.
- Keep color purposeful: status, emphasis, grouping, or brand signal.
- Keep cards at modest radius unless the existing system says otherwise.

## Layout Rules

- Prefer dense but organized layouts for work tools.
- Do not nest cards inside cards.
- Do not create oversized hero compositions for apps or tools unless the task is a landing page.
- Preserve scan lines: labels, values, actions, and status should be easy to compare.
- Use constraints such as `minmax`, `aspect-ratio`, fixed toolbar heights, and max widths to prevent layout jumps.

## Anti-Patterns

- Decorative gradient blobs, orbs, and bokeh as default backgrounds.
- Marketing-style hero pages when the user asked for an app/tool.
- Large text inside compact panels.
- Buttons with long text where an icon or shorter label is clearer.
