# Release a Drift Docker image

Use this guide when publishing the reviewed v0.1.0 Docker image to GHCR. The
process ties an immutable source tag to verified multi-architecture artifacts and
provenance. Drift publishes Docker images only; it does not publish an npm package
or client SDK in this release.

## Prepare the release

Confirm the version is `0.1.0` in `package.json` and add the final release notes
to the matching section of `CHANGELOG.md`. Then complete the service verification
steps in [build Drift from source](../tutorial/building-from-source.md). That
tutorial is the source of truth for local install, build, CLI, site, and Pages
verification commands.

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
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

The **Release container image** workflow reruns verification, builds
`linux/amd64` and `linux/arm64` images, publishes `v0.1.0` and `latest`, attaches
build provenance, and creates a GitHub release with the manifest digest.

## Recover a failed tag release

Release tags are immutable. If a tag-triggered workflow fails before publishing,
do not delete, move, or recreate the tag. Fix the workflow through a pull request,
then open **Actions → Release container image → Run workflow**. Enter the existing
tag, such as `v0.1.0`, in the required `tag` field.

The manual run checks out that tag, confirms that its `package.json` version
matches the tag, and builds from the tagged commit. It then performs the same
verification, image publication, provenance, and GitHub release steps as a
tag-triggered run.

## Make the first package public

After the first successful publish, open the package settings for
`ghcr.io/grey-harbor/drift` in GitHub and set its visibility to **Public**. This is
a one-time GitHub package setting; the repository being public does not always make
a newly created container package public automatically.

Verify the result from a clean environment:

```bash
docker pull ghcr.io/grey-harbor/drift:v0.1.0
docker buildx imagetools inspect ghcr.io/grey-harbor/drift:v0.1.0
```

The inspection must list both Linux platforms. Record the release digest in
deployment configuration when an immutable production pin is required.

## Roll out and observe

Roll out the immutable digest to a non-production environment first. Verify the
container health status, `/health`, startup logs, tenant authentication, and
representative reads and writes against an operator-approved dataset. Retain the
prior digest and take a verified database backup before updating a deployment.

GitHub Actions logs, the image manifest, provenance attestation, and GitHub release
are the publication record. Runtime health, capacity, request failures, and backup
freshness remain the deployment operator's responsibility.

## Roll back a deployment

Stop writes, redeploy the previously recorded digest, and restore the pre-rollout
database only if the release changed persisted state incompatibly. Decide whether
to restore data from the release notes and an approved migration plan; neither the
container health check nor automation can infer database compatibility or an
acceptable recovery point.

Do not move or delete the published Git tag. If an image itself must be superseded,
publish a new reviewed version and update consumers deliberately.
