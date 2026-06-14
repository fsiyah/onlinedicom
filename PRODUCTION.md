# Online DICOM Production Checklist

## Branching

- Keep `main` as the production branch.
- Create short-lived feature branches for changes, then merge into `main` when verified.
- Avoid a permanent `production` branch unless you need staged releases, hotfix cherry-picks, or multiple deployed versions.

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- The project includes `public/_redirects` for SPA fallback.
- The project includes `public/_headers` for the COOP/COEP headers required by Cornerstone.

## Cloudflare DNS

- Add `onlinedicom.com` as the custom domain on the Cloudflare Pages project.
- Let Cloudflare create/manage the DNS record for the Pages project.
- Keep HTTPS enabled end to end.

## Analytics

- Do not send DICOM files, patient identifiers, study identifiers, file names, metadata, measurements, or screenshots to analytics.
- Prefer Cloudflare Web Analytics first. Enable it from the Pages project Metrics tab.
- If product analytics are needed later, collect only anonymous events such as `app_opened`, `files_imported_count_bucket`, `viewer_mode_changed`, and `tool_selected`.
- Keep analytics disabled by default until a privacy notice is added.

## Release Checks

- Run `npm.cmd run build` on Windows before deploy.
- Open the Cloudflare Pages preview deployment and verify local DICOM import, 2D viewer, MPR, and 3D mode.
- Test in Chrome and Edge. Safari may be stricter with SharedArrayBuffer and cross-origin isolation behavior.
