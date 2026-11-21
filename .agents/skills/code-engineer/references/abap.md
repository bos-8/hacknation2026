# SAP ABAP

Make the smallest transport-safe ABAP change that fits the existing SAP artifact and activation chain.

## Invocation

Load through `$code-engineer abap` or when ABAP dominates the implementation task.

## Workflow

1. Identify the target SAP/ABAP release and language version before choosing syntax or APIs, then inspect artifact context: package, namespace, object type, enhancement spot, CDS/RAP layer, DDIC dependencies, and activation chain.
2. Preserve customer namespace rules such as `Z*`, `Y*`, or `/namespace/`.
3. Prefer ABAP Objects and modern constructs supported by the detected target for new code; preserve local style in legacy procedural objects unless refactor is requested.
4. Keep naming descriptive and consistent with the object. Respect existing prefixes like `iv_`, `ev_`, `lv_`, `lt_`, `ls_` when already used.
5. Keep database access explicit: avoid `SELECT *` on hot paths, handle ordering/package size, and use `sy-subrc` only when semantically useful.
6. Use ABAP Doc (`"!`) for public APIs when it adds value.
7. Check authorization, locks, LUW/update task behavior, commits, activation dependencies, transports, and backward compatibility.
8. Validate with syntax check, activation, ATC, Code Inspector, abaplint, ABAP Unit, or focused integration checks when available.

## Related Skills

- Use the `authkeeper` security-review-light leaf for authorization-sensitive changes.
- Use the `architect` API-contract-review leaf for RFC/BAPI/service contracts.
