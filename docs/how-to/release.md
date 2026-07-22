# Release a Drift Docker image

This guide describes the controlled v0.1.0 release path. Drift publishes Docker
images only; it does not publish an npm package or client SDK in this release.

## Prepare the release

Confirm the version is `0.1.0` in `package.json` and add the final release notes
to the matching section of `CHANGELOG.md`. Then complete the service verification
steps in [build Drift from source](../tutorial/building-from-source.md). That
tutorial is the source of truth for local install, build, CLI, site, and Pages
verification commands.

Push the reviewed `main` branch and wait for the **Verify** workflow to pass. Do
not create a release tag from an unverified commit.

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
