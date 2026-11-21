# Mobile

Design mobile interfaces around touch, constrained space, and interrupted use.

## Mobile Checks

- Prioritize the primary task in the first screen.
- Keep navigation reachable with thumbs.
- Use touch targets at least 44px where practical.
- Respect safe areas, notches, browser chrome, and virtual keyboard changes.
- Avoid hover-only interactions.
- Keep forms short, grouped, and easy to recover from.
- Use appropriate mobile controls: bottom sheets, segmented controls, steppers, native-friendly inputs.
- Keep critical actions visible but separated from destructive actions.

## Layout Rules

- Avoid horizontal overflow except intentional scroll regions.
- Stack dense desktop grids into grouped mobile sections.
- Keep tables usable through cards, summaries, or pinned key columns.
- Use sticky action bars only when they do not cover content.
- Ensure long labels, translated strings, and dynamic data wrap or truncate cleanly.
- Test smallest supported viewport, not only an average phone width.

## Mobile Validation

When the app can run:

- inspect at least one narrow phone viewport and one larger mobile viewport;
- verify touch target spacing, keyboard overlap, scroll behavior, and safe area padding;
- use screenshots or e2e checks when layout risk is high;
- report any mobile checks that could not run.
