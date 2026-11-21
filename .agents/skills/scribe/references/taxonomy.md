# Taxonomy

Use four digits as a stable context address.

```text
0000-overview.md
0300-architecture.md
0301-high-level.md
0310-runtime.md
0311-runtime-map.md
```

Rules:

- `0000-overview.md` is the root router and header schema authority.
- `XX00-*.md` files are chapter routers, such as `0300-architecture.md`.
- `XXX0-*.md` files are optional subrouters, such as `0310-runtime.md`.
- Concrete files end in `1-9`, such as `0301-high-level.md` or `0311-runtime-map.md`.
- `0000-overview.md` links every chapter router; a chapter links direct leaves and its subrouters.
- If the matching `XXX0-*` subrouter exists, link `XXXx-*` leaves from it. Otherwise link them directly from `XX00-*`.
- `9999-backlog.md` is a parking lot, not source of truth.
- Add a subrouter only when it reduces a genuinely crowded chapter.

Routing flow:

```text
0000 -> 0300 -> 0301 -> code
0000 -> 0300 -> 0310 -> 0311 -> code
```
