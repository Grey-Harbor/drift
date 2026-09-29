# Release a Drift Docker image

Use this guide when publishing the reviewed v0.2.0 Docker image to GHCR. The
process ties an immutable source tag to verified multi-architecture artifacts and
provenance. Drift publishes Docker images only; it does not publish an npm package
or client SDK in this release.

## Prepare the release

Confirm the version is `0.2.0` in `package.json` and `package-lock.json`. Review
the v0.2.0 section of `CHANGELOG.md` and replace its `pending` date only when
the release is approved. Then complete the service verification steps in
[build Drift from source](../tutorial/building-from-source.md). That tutorial
is the source of truth for local install, build, CLI, site, and Pages
verification commands. Review the site dependency audit and require the
PostgreSQL 16, 17, and 18 CI jobs and both container smoke tests to pass.

Push the reviewed `main` branch and wait for the **Verify** workflow to pass. Do
not create a release tag from an unverified commit.

Release readiness, version selection, changelog meaning, compatibility, and
rollout timing require maintainer approval. Automation may compare explicit
version strings, run checks, build from the approved tag, and publish configured
artifacts; it must not infer that passing checks makes a release appropriate.

## Publish the tag

Create an annotated tag whose version exactly matches `package.json`, then push
that tag:

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

The **Release container image** workflow reruns verification, builds
`linux/amd64` and `linux/arm64` images, publishes `v0.2.0` and `latest`, attaches
build provenance, and creates a GitHub release with the manifest digest.

## Recover a failed tag release

Release tags are immutable. If a tag-triggered workflow fails before publishing,
do not delete, move, or recreate the tag. Fix the workflow through a pull request,
then open **Actions → Release container image → Run workflow**. Enter the existing
tag, such as `v0.2.0`, in the required `tag` field.

The manual run verifies the selected tag in every **Verify** job, confirms that
its `package.json` version matches the tag, and builds from the tagged commit.
It then performs the same image publication, provenance, and GitHub release
steps as a tag-triggered run.

## Verify package visibility

Confirm that `ghcr.io/grey-harbor/drift` remains public in GitHub package
settings. Repository visibility does not by itself establish package visibility.

Verify the result from a clean environment:

```bash
docker pull ghcr.io/grey-harbor/drift:v0.2.0
docker buildx imagetools inspect ghcr.io/grey-harbor/drift:v0.2.0
```

The inspection must list both Linux platforms. Record the release digest in
deployment configuration when an immutable production pin is required.

## Roll out and observe

Roll out the immutable digest to a non-production environment first. Verify the
container health status, `/health`, startup logs, tenant authentication, and
representative reads and writes against an operator-approved dataset. Retain the
prior digest and take a verified database backup before updating a deployment.
For an SQLite-to-Postgres cutover, use the separate
[PostgreSQL migration procedure](postgres.md); it requires stopped writes and an
empty destination.

GitHub Actions logs, the image manifest, provenance attestation, and GitHub release
are the publication record. Runtime health, capacity, request failures, and backup
freshness remain the deployment operator's responsibility.

## Roll back a deployment

Stop writes, redeploy the previously recorded digest, and restore the pre-rollout
database only if the release changed persisted state incompatibly. Decide whether
to restore data from the release notes and an approved migration plan; neither the
container health check nor automation can infer database compatibility or an
acceptable recovery point.

If PostgreSQL has accepted authoritative writes, do not switch back to the
previous SQLite database: Drift does not provide reverse migration. Follow the
[PostgreSQL rollback guidance](postgres.md#roll-back) and identify the
authoritative dataset before reopening writes.

Do not move or delete the published Git tag. If an image itself must be superseded,
publish a new reviewed version and update consumers deliberately.
