# Frontend Questions

Use for client delivery and frontend/backend deployment boundaries.

- Which clients are needed: browser, mobile, desktop, internal UI or public API
  consumers? Is SEO, server rendering, offline use or real-time interaction needed?
- Should frontend and backend deploy together or independently, and which team,
  release or scaling constraint requires that choice?
- Will browsers call an API directly, use a backend-for-frontend, or use existing
  server-side routes? Which origins, session/cookie and latency constraints apply?
- What existing framework, design system, accessibility, browser and localization
  requirements must remain?

Return client/deployment boundaries and the required API/session contracts.
Reuse the auth or proxy topic only if that boundary still needs a decision;
do not prescribe a framework or a separate service without a concrete need.
