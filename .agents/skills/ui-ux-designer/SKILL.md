---
name: ui-ux-designer
description: "Use for UI/UX design or implementation, screens, flows, layouts, dashboards, forms, design systems, visual polish, accessibility, responsive behavior, or mobile UI."
---

# UI UX Designer

One visible UI UX Designer skill. Route first, then load only the product branch or one leaf.

## Branch Routing

| Intent | Read |
| --- | --- |
| UI/UX design, screens, flows, dashboards, forms, layout, product fit, implementation constraints | `branches/product-flow.md` |

## Direct Leaf Commands

| Command intent | Read |
| --- | --- |
| `$ui-ux-designer visual`, spacing, typography, color balance, icons, interaction states | `references/visual-polish.md` |
| `$ui-ux-designer accessibility`, responsive behavior, keyboard, contrast, focus, text fit, viewport validation | `references/accessibility-responsive.md` |
| `$ui-ux-designer mobile`, phone-first layout, touch ergonomics, safe areas, mobile forms, keyboard behavior | `references/mobile.md` |

If intent is mixed, read `branches/product-flow.md` first, then the narrow leaf.

## Guardrails

- Inspect existing design patterns, component libraries, routes, and CSS before inventing new style.
- Prioritize the actual usable interface over landing-page copy unless the task is explicitly a landing page.
- Run established frontend checks directly; use `tester` when selecting coverage, investigating results or authoring tests needs its workflow.
- Use `scribe` only when persisting UI specs or design notes.
