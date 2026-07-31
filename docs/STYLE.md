# Documentation style and review guide

Use this guide whenever you add or change Drift documentation. It keeps pages useful to a reader completing a task while preserving the exact contracts that human and automated adopters need.

## Choose one Diátaxis purpose

Put each page in the section that matches the reader's immediate need:

| Section        | Reader need                            | Page shape                                        |
| -------------- | -------------------------------------- | ------------------------------------------------- |
| `tutorial/`    | Learn by completing a guided path.     | Ordered steps with a known starting state.        |
| `how-to/`      | Accomplish a specific real-world task. | Prerequisites, procedure, verification, recovery. |
| `reference/`   | Look up an exact contract.             | Inputs, outputs, defaults, invariants, failures.  |
| `explanation/` | Understand a design choice.            | Context, constraints, tradeoffs, consequences.    |

Do not make one page serve multiple purposes. Link to the canonical page in another section when a task needs definitions or design context.

## Open with use and intent

The first paragraph must say when the reader should use the page and why it matters. Prefer a direct opening:

> Use this guide when you need to rotate a service key without changing its tenant. Rotation immediately revokes the old credential, so coordinate the secret update with the client deployment.

Avoid openings that only repeat the title or describe the document itself.

## Write complete, reviewable examples

Examples should be copyable from a stated working directory or environment. Include required headers, variables, dependencies, and a way to verify the result. Use placeholders that cannot be mistaken for production credentials.

Format JSON across multiple lines:

```json
{
  "label": "inventory-service",
  "scopes": ["read", "write"]
}
```

When documenting JSONL, pretty-print the objects for human review and state that the stored or transmitted representation contains one complete JSON object per physical line:

```jsonl
{
  "type": "product",
  "slug": "anvil"
}
{
  "type": "invoice",
  "slug": "acme-1001"
}
```

The display above is intentionally expanded. A real JSONL file stores each object on one physical line; whitespace between objects is not part of the format.

## State the contract explicitly

Reference pages and operational guidance must cover the applicable contract dimensions:

- **Inputs:** required and optional values, accepted forms, and validation.
- **Outputs:** response shape, persisted effects, and generated artifacts.
- **Defaults:** behavior when the caller omits a value.
- **Invariants:** rules that remain true across implementations.
- **Failures:** status or exit behavior, partial effects, and recovery.
- **Ownership:** which layer, operator, tenant, or client controls the value.
- **Limitations:** bounds, unsupported operations, and environment constraints.

Use these labels consistently:

- **Guaranteed:** part of Drift's versioned public or repository contract.
- **Recommended:** operational advice that adopters may adapt deliberately.
- **Adapter-specific:** behavior of one persistence implementation, not a portable Drift guarantee.

The generated OpenAPI document at `GET /v1/openapi.json` is the canonical HTTP contract. `src/interfaces/repository.ts` is the canonical storage port. Link to the relevant reference or architecture page instead of copying a contract into multiple guides.

## Cover operations when relevant

Deployment, migration, credential, persistence, and release changes should explain:

- rollout prerequisites and verification;
- rollback steps and any compatibility boundary;
- secret handling, authorization, and other security effects;
- durable state, backup, restore, and deletion behavior; and
- health checks, logs, metrics, or other available observability signals.

Say plainly when Drift does not yet provide an operational capability. Do not imply that a health endpoint, backup, or log signal proves more than it actually does.

## Guide automation safely

Write for human readers and automation, including AI-assisted maintenance. Identify transformations that are safe to perform mechanically, such as formatting JSON or replacing a version string after verifying every canonical occurrence.

Do not ask automation to infer business meaning, production risk tolerance, tenant ownership, release readiness, credential scope, retention policy, or rollback timing. Require an operator or maintainer to supply or approve those decisions.

## Documentation review checklist

Before committing a documentation change, confirm:

- [ ] The page has one Diátaxis purpose and opens with when and why to use it.
- [ ] Procedures use complete, copyable examples and include verification.
- [ ] JSON is readable; JSONL is expanded for review and its physical-line format is stated.
- [ ] Applicable inputs, outputs, defaults, invariants, failures, ownership, and limitations are explicit.
- [ ] Guaranteed, recommended, and adapter-specific behavior are distinguishable.
- [ ] Operational pages cover rollout, rollback, security, persistence, and observability where relevant.
- [ ] Automation guidance separates safe transformations from human decisions.
- [ ] Canonical contracts are linked rather than duplicated.
- [ ] Fenced JSON and internal links pass `npm run docs:check`.
- [ ] Markdown is formatted with `npm run format` or the equivalent focused Prettier command.
- [ ] The Fumadocs application passes `npm run site:check`.
- [ ] The static export passes `npm run site:build`.
