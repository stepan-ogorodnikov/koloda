# Backwards Compatibility Policy

This project is currently in pre-release. Do not maintain backwards compatibility. 

When modifying an existing feature:

- Update all call sites directly. If you change a function signature, update every file that calls it.
- Delete old code. Do not leave "deprecated" functions, comments, or unused exports. Git history is the source of truth for old code.
- Do not create adapter layers. Do not write wrapper functions to maintain old shapes or interfaces. Refactor the consumers to use the new shape directly.
- Rely on the compiler/linter. Let TypeScript and Rust's strict types guide your refactors. If the types pass, the refactor is likely safe.

Exception: If a deletion or refactor would remove a significant architectural pattern (e.g., deleting an entire lib, removing a major state machine), stop and ask for permission first. For standard feature updates, be ruthless and delete freely.
