# Deployment notes

This repository includes a GitHub Actions workflow that builds and deploys a combined static site to GitHub Pages.

What it does
- Runs on pushes to `main` (and on-demand via workflow_dispatch).
- Builds the Slidev presentation in `presentation/` using `npm ci` and `npm run build` (it expects `slidev build` to output into `presentation/dist`).
- Copies the `generation/` folder (static HTML/CSS/JS) into the root of the deploy directory.
- Copies the Slidev `dist` into `out/presentation`.
- Deploys the `out/` directory to GitHub Pages using `peaceiris/actions-gh-pages`.

Assumptions
- `presentation/package.json` has a `build` script that emits a static site in `presentation/dist` (Slidev's default). If your Slidev configuration emits to a different folder, update `.github/workflows/deploy.yml`.
- The `generation/` folder contains the ready-to-serve static site (index.html, style.css, script.js).
- The repository's Pages source will be the branch that `actions-gh-pages` pushes to (the action manages that branch automatically).

Customizing
- To change the branch that triggers the workflow, edit the `on.push.branches` section in `.github/workflows/deploy.yml`.
- To change Node.js version, update the `node-version` in the workflow.
 - Note: Slidev and many Vite-based dependencies require Node >=20 (some require >=22). The workflow is configured to use Node 22 to satisfy package engine constraints.
 - Slidev base path: the workflow and build set the Slidev base to `/presentation/` so the presentation will be available at `https://<owner>.github.io/<repo>/presentation/`. If you prefer a different path (or the presentation to be at root `/`), update `presentation/package.json` build script or provide a `slidev.config.ts`.
 - Slidev base path: the workflow builds the presentation with a relative base so it will work under `presentation/`.

Main/docs deployment
--------------------
This repository uses GitHub Pages configured to serve from the `main` branch `docs/` folder. The CI workflow now:

- Builds the Slidev presentation and places the combined site into an `out/` folder locally.
- Copies `out/` to `docs/`, commits `docs/` and pushes to `main`.

Make sure your repository Pages settings are set to:

- Source: Branch `main` / Folder `docs/`

This keeps everything on `main` and avoids an extra `gh-pages` branch. If you later switch to serving from `gh-pages` instead, we can revert the workflow to publish to that branch.
- If Slidev outputs somewhere else, change the `presentation/dist` path in the "Prepare deploy directory" step.

Secrets
- This workflow uses the built-in `GITHUB_TOKEN`. No extra secrets are required for basic GitHub Pages deployment.

Troubleshooting
- If the workflow fails at the Slidev build step, run `npm ci` and `npm run build` locally in `presentation/` to reproduce the error.
- If the deploy step fails, check the Actions log for the `peaceiris/actions-gh-pages` step for details.
