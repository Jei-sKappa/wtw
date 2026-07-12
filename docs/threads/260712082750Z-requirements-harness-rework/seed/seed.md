# Seed: Rework requirement manifests and E2E harness toward 1:1 AC-to-case mapping
External: none — personal project, no external tracker in use

The wtw-genesis implementation (docs/threads/260711114414Z-wtw-genesis) left the
requirements/E2E/BEHAVIOR.md layer messy: too few FRs and ACs, with long
"group" criteria bundling many cases each, redundant AC IDs repeated inside
statements, unexplained gaps (FR-01, FR-14), and an AC ID scheme (AC-0301)
inconsistent with jastr's FR.AC numbering. Proposal to discuss: split ACs into
short, single-angle criteria with a strict one-to-one AC-to-E2E-case mapping,
so BEHAVIOR.md serves its purpose — letting the owner verify delegated
implementations — and align the ID convention across both projects.
