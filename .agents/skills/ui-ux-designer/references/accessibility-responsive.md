# Accessibility Responsive

Validate that the interface remains usable across input methods, states, and viewport sizes.

## Accessibility Checks

- Semantic elements for buttons, links, forms, labels, headings, and landmarks.
- Keyboard access for all interactive controls.
- Visible focus state.
- Accessible names for icon-only controls.
- Sufficient contrast for text, borders that carry meaning, and status indicators.
- Error messages tied to the relevant field or action.
- Do not rely on color alone for critical status.

## Responsive Checks

- Verify mobile, tablet, and desktop layouts when the app is responsive.
- Ensure text fits within buttons, cards, sidebars, tables, and toolbars.
- Use wrapping, accessible truncation or responsive density for overflow. Bounded responsive typography is valid when it respects user zoom and text-size preferences; avoid sizing based only on viewport width.
- Keep controls reachable without horizontal overflow unless the component is intentionally scrollable.
- Preserve fixed-format UI with stable dimensions.

## Validation

When a frontend can run locally:

- run the narrowest build/typecheck/lint check;
- inspect relevant viewport sizes;
- use screenshots or e2e checks when visual layout risk is high.

Report any validation that could not run.
