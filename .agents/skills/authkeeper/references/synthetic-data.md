# Synthetic Replacement Rules

Use with the censor branch when selecting realistic replacements.

| Data | Replacement rule |
| --- | --- |
| People and organizations | Invent locale-appropriate names, roles and organizations; never substitute a known real identity. Keep identity relationships consistent. |
| Email and hostnames | Use synthetic local parts and reserved example domains, such as `mila.arden@example.com` and `api.example.net`. Remove original subdomains, usernames and tenant slugs. |
| IPv4 | Use documentation blocks `192.0.2.0/24`, `198.51.100.0/24` or `203.0.113.0/24`; keep host relationships consistent. Private address space can identify an actual internal network. |
| IPv6 | Use documentation prefix `2001:db8::/32`, with consistent synthetic host IDs. |
| Phone numbers | Prefer a published test/reserved range for the requested locale. Otherwise use a clearly non-dialable replacement with the expected shape; do not claim arbitrary plausible numbers are unassigned. |
| Government, banking and payment IDs | Use visible demo identifiers or appropriate official test fixtures. When checksum-valid input is required, use documented sandbox values for that system; do not present invented numbers as genuine or unissued. |
| Credentials and credential URLs | Replace the complete secret with an unmistakably inactive marker. Remove URI userinfo and secret query/header values; keep the useful protocol, error and request structure. |
| Dates, amounts and locations | Generate plausible values consistently across the example. Preserve ordering, durations and arithmetic where needed; change identifying dates and generalize precise/rare location or demographic combinations. |
| Paths and opaque IDs | Keep OS syntax and field types, using synthetic usernames/projects and distinct stable aliases. Do not use an unsalted hash of the original as an anonymity guarantee. |

Never reuse a protected source value as its own replacement. If a safe synthetic
namespace cannot preserve all required uniqueness or validation constraints,
state that limitation and use explicit aliases instead of silently merging records.
Preserve field names unless they themselves identify the source. Keep JSON/YAML
escaping, CSV quoting, SQL relationships and log event ordering valid. A successful
format check establishes syntax, not complete privacy protection.

Reserved-domain and address references:
[RFC 2606](https://www.rfc-editor.org/rfc/rfc2606),
[RFC 5737](https://www.rfc-editor.org/rfc/rfc5737),
[RFC 3849](https://www.rfc-editor.org/rfc/rfc3849).
