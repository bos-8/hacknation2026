# Organization

Use routers for navigation and concrete docs for detail.

Default location:

```text
./docs/
```

All durable RepoRoute documentation should live under `./docs` unless the user explicitly chooses a different root.

Illustrative domain ranges, not a canonical mapping. Inherit the existing overview's assignments:

```text
0100 architecture
0200 domain model
0300 contracts and APIs
0400 data
0500 features
0600 integrations
0700 tests and validation
0800 cookbook
0900 reference
```

Prefer fewer routers at first. Add concrete docs only when they remove repeated discovery.

For a new repo, start with 3-5 routers. More than 9 top-level routers usually means the taxonomy is too broad for v1.
