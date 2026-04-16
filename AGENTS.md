Always use `bun` instead of `npm` or `pnpm`.
Never use dev server.
Don't extract or compile i18n messages unless instructed otherwise.

For typescript follow this verification workflow:
1. Lint: Run `oxlint` from the monorepo root first
2. Typecheck: Run `nx typecheck <project>` for the relevant project(s)

For rust verify with `nx lint native-tauri`.
