# Identity And Authorization Questions

Use for identity ownership, sessions, tenant boundaries and permission decisions.

- Who signs in: staff, customers, administrators, services or several tenants?
  Is an identity provider, SSO or established account system already required?
- Which login, MFA, recovery, account lifecycle and external federation flows are
  needed? Which are handled by the existing provider rather than custom code?
- What roles, resource ownership, tenant isolation and administrative boundaries
  need server-side authorization? Which actions require audit evidence?
- How should browser sessions/cookies, mobile/API clients, service identities,
  expiry, revocation and logout work across the proposed deployment boundaries?

Capture identity/provider responsibilities and an authorization matrix with open
questions. Never collect real credentials for the interview or imply a custom
authenticator is necessary. Return implementation/security review to authkeeper.
