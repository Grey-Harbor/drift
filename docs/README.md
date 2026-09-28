# Drift documentation

Use this index to choose documentation by the kind of help you need. Drift follows Diátaxis so guided learning, operational tasks, precise lookup, and design context remain separate.

- [Tutorials](./tutorial/getting-started.md) teach a complete first graph; [tenant and key administration](./tutorial/administering-tenants-and-keys.md) teaches the operator workflow.
- [How-to guides](./how-to/docker.md) solve operational tasks such as Docker deployment,
  [PostgreSQL operation and migration](./how-to/postgres.md), and
  [publishing a GHCR image](./how-to/release.md); the
  [contributing guide](./how-to/contributing.md) covers project changes and pull requests.
- [Reference](./reference/api.md) defines API routes and the [persisted model](./reference/model.md).
- [Explanation](./explanation/retrieval.md) explains why retrieval is constrained and declarative; [adapter guidance](./explanation/adapters.md) explains the storage boundary; [tenancy and API keys](./explanation/tenancy-and-api-keys.md) explains bootstrap and tenant isolation.
- [Drift CLI](https://github.com/cuzz22000/drift-cli) is the companion administration client for tenant-scoped key management and recovery workflows. Use its [operator documentation](https://drift-cli.greyharborsoftware.com/docs/) when you want commands instead of hand-crafted HTTP requests and JSON.
- [Documentation style](./STYLE.md) defines how contributors write and validate these pages.
