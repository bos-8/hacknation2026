# Data And Database Questions

Use for storage ownership, consistency, retention and database capacity.

- What data, relationships, access patterns, volume and growth are expected?
  Which existing store and schema must be preserved?
- Which invariants require transactions or strong consistency? Can any views or
  jobs tolerate delay, and who owns each source of truth?
- Are structured records, files/blobs, search or cache actually needed? What
  evidence calls for a separate store rather than the existing database?
- What retention, deletion, tenancy, backup, restore, RPO/RTO and residency
  requirements apply? What read/write bottlenecks are measured or anticipated?

Capture data ownership, consistency and recovery requirements, then a migration
path for existing data. Do not infer replication, partitioning or another database
from user counts alone. Hand implementation details to the database workflow.
