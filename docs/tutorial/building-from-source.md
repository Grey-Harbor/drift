# Build Drift from source

Use this tutorial when you want to build Drift from a fresh checkout, run its verification suite, exercise
the source CLI, and preview the documentation site as GitHub Pages will serve it.

If you want to model a first graph after the build is working, continue with
[getting started](./getting-started.md). For the regular branch and pull-request
workflow, use the [contributing guide](../how-to/contributing.md).

## Clone the repository

Start from a clean checkout:

```bash
git clone git@github.com:Grey-Harbor/drift.git
cd drift
```

This tutorial assumes commands run from the repository root unless a step says
otherwise.

## Use Node.js 22 and install dependencies

Drift and its GitHub Pages workflow use Node.js 22. Confirm that version first:

```bash
node --version
```

The repository has two Node work areas: the Drift service at the root and the
documentation site in `site/`. Install their locked dependencies:

```bash
npm ci
npm --prefix site ci
```

## Build the service

Compile the TypeScript service into `dist/`:

```bash
npm run build
```

The compiled server starts with `npm run start`. During source development,
`npm run dev` watches the TypeScript entrypoint instead.

## Exercise the source CLI

Apply the local SQLite migrations, then bootstrap a tenant and its first admin
key:

```bash
npm run cli -- migrate
npm run cli -- bootstrap --slug acme --name "Acme Inc."
```

The bootstrap command prints the key secret exactly once. Store it securely if
you plan to keep the local database. The commands use `./data/drift.sqlite` by
default; set `DRIFT_DATABASE_PATH` to use a different local database.

Start the source server in another terminal:

```bash
npm run dev
```

Then verify that it is available:

```bash
curl http://localhost:3000/health
```

## Run the service verification

Run the same service checks used by the repository's **Verify** workflow after
its dependency-install step:

```bash
npm run ci
```

This runs formatting, the type check, tests, and the compiled service build. It
does not include the GitHub Pages site.

## Build the site and documentation

Run the same site checks that the GitHub Pages workflow runs after its
dependency-install step:

```bash
npm run docs:check
npm run site:check
npm run site:build
```

The first command validates fenced JSON and internal Markdown links. The site
type check validates the Fumadocs application. The build produces `site/out/`, including the landing page, rendered Diátaxis
documentation, crawler files, and site assets. The same `site:check` and
`site:build` commands also work after changing into `site/`; `check` and `build`
remain their shorter local aliases.

## Preview the Pages output locally

Preview the generated export rather than the Next.js development server:

```bash
npm run site:preview
```

The same `site:preview` command also works after changing into `site/`; `preview`
remains its shorter local alias. Open `http://127.0.0.1:3000` and check the
homepage, `/docs/`, `/docs/tutorial/`, and the API reference. This serves
`site/out/`, so it matches the shape that GitHub Pages publishes.

## Verify and publish the Pages artifact

Confirm that the generated export includes the custom-domain and crawler files:

```bash
test -f site/out/CNAME
test -f site/out/robots.txt
test -f site/out/sitemap.xml
```

`CNAME` must contain `drift.greyharborsoftware.com`. `robots.txt` must allow
indexing and point to the HTTPS sitemap. The sitemap must include the homepage
and every route generated from `docs/`.

The [Publish website](../../.github/workflows/pages.yml) workflow runs after
changes reach `main` and can also be started manually from GitHub Actions. It
installs the locked site dependencies, runs `npm run check` and `npm run build`
inside `site/`, then deploys `site/out/` to GitHub Pages.

Before the first publication, configure the repository's Pages source as GitHub
Actions and point the `drift.greyharborsoftware.com` DNS record at GitHub Pages.

## What a healthy build looks like

At the end of this tutorial, you should be able to:

- compile Drift without TypeScript errors;
- run the source CLI to migrate and bootstrap a local tenant;
- pass the service and site verification commands;
- export the site into `site/out/`; and
- preview the landing page and documentation locally.

If the service build works but the site export fails, debug them separately. The
root checks cover service behavior; the site build covers the documentation and
Pages experience.

## Where to go next

- Model connected records in the [getting-started tutorial](./getting-started.md).
- Run a containerized instance with the [Docker guide](../how-to/docker.md).
- Publish a Docker image with the [release guide](../how-to/release.md).
