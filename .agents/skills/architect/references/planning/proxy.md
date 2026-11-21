# Proxy And Ingress Questions

Use for ingress ownership, TLS and network exposure decisions.

- Which clients and networks must reach each component: public Internet,
  private network, internal services or an existing gateway?
- Is a proxy/gateway already provided by the hosting platform? Which routing,
  load balancing, rate limiting or isolation need requires another component?
- Where do DNS, TLS termination and certificate renewal belong? Are WebSocket,
  streaming, large upload, timeout, body-size or client-IP requirements relevant?
- What trusted-proxy headers, origin/CORS, authentication forwarding and health
  checks must agree across hops?

Capture entrypoints, trust boundaries and ownership. Preserve TLS verification;
do not expose internal services or add a proxy solely because it is common in a
reference stack. Implementation can return to the infrastructure/network workflow.
