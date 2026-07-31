# How-to: contribute changes

Use this guide when you want to make a code or documentation change and move it through a
branch and pull request cleanly. For the project-wide rules behind this workflow,
read [AGENTS.md](../../AGENTS.md).

## Clone the repository

Clone Drift and move into its root directory:

```bash
git clone git@github.com:Grey-Harbor/drift.git
cd drift
```

Install the dependencies before making changes:

```bash
npm install
```

If you will change documentation or the site, install its locked dependencies as
well:

```bash
npm --prefix site ci
```

## Start on a branch

Do not work directly on `main`. Create a focused branch for the change:

```bash
git switch -c docs/my-change
```

Pick a branch name that describes the work itself. Do not use agent names or
unrelated internal references in branch names.

## Make and verify the change

Keep the change small enough to review as one logical unit. Run the checks that
cover the area you changed:

```bash
npm run format:check
npm run check
npm test
npm run build
```

For changes that affect the Docker image or startup behavior, also build and run
the image locally. The [Docker guide](./docker.md) explains the expected setup,
bootstrap, persistence, and cleanup behavior.

For every documentation change, also run the documentation-specific checks:

```bash
npm run docs:check
npm run site:check
npm run site:build
```

These commands validate fenced JSON and internal links, type-check the Fumadocs
site, and build the static export. Review the page against
[the documentation checklist](../STYLE.md#documentation-review-checklist) before
committing.

## Commit the work

Stage only the files that belong to the change, then make a Conventional Commit:

```bash
git add docs/how-to/contributing.md
git commit -m "docs(contributing): add contributor guide"
```

Commit messages use `<type>(<scope>): <description>`. Keep them imperative and
under 72 characters. Each commit should be one logical change; avoid vague
messages such as `update stuff` and do not include agent names.

Common types are `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`,
`build`, and `perf`.

## Push the branch

Push the branch and set its upstream:

```bash
git push -u origin docs/my-change
```

## Open the pull request

Create a focused pull request from the branch into `main`:

```bash
gh pr create --base main --head docs/my-change
```

Keep the PR to one reviewable change. Explain the change in plain language, list
the checks you ran, and record important assumptions or follow-up work.

GitHub preloads the repository’s [pull-request template](../../.github/pull_request_template.md).
Use it to summarize the work, record validation, and state whether documentation
was updated or intentionally left unchanged.

## Keep documentation aligned

If a change affects behavior, defaults, public usage, or durable design guidance,
update the documentation with it:

- update `README.md` when the landing-page view of Drift changes;
- update `ARCHITECTURE.md` when an architectural commitment changes;
- update the relevant page in `docs/` when user-facing guidance changes.

Drift uses Diátaxis: add tutorials for learning by doing, how-to guides for a
specific task, reference for precise facts, and explanation for design context.
Keep the root README short, link to an existing home for related information, and
write in Drift’s calm, practical voice. The canonical examples and complete
quality rules are in [the documentation style guide](../STYLE.md).

Formatting, link correction, and explicitly specified identifier or version
replacement are safe to automate. Business semantics, release readiness,
credential scopes, operational risk, and whether a behavior is a public guarantee
require maintainer input; neither scripts nor AI assistants should infer them.

## Things to avoid

- Do not work directly on or force-push `main`.
- Do not use destructive Git commands unless explicitly authorized.
- Do not bypass `DriftService` or the repository boundary for convenience.
- Do not leave related tests or documentation stale after changing behavior.
