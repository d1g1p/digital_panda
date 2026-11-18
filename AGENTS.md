# AGENTS.md

Static Spanish-language site for DIGITAL PANDA: landing + quote calculator, public order tracking, and an admin panel. No framework, bundler, tests, linter, or CI. Node is only used by build/deploy scripts.

## Commands

- `npm run build` — generates `dist/` from root sources; loads `.env`, substitutes placeholders in `firebase-config.js`, copies files. Warns but does **not** fail on missing values.
- `npm run check` — validates local HTML asset references, build file list, and config consistency without deploying.
- `npm run check:prod` — builds, then fails if `dist/firebase-config.js` still has placeholders.
- `npm run deploy:rules` — deploys `firebase.rules` to Firestore.
- `npm run deploy:hosting` — validates config and links, builds, then deploys Firebase Hosting only.
- `npm run firebase:login` / `npm run firebase:logout`.
- There is no test/lint/typecheck command. Verify changes with `npm run check` and by opening `dist/index.html` (or `dist/admin.html`).

## Build and deploy gotchas

- `scripts/build.cjs` copies an explicit `publicFiles` list. Any new root or `muestras/` file must be added there or it will never reach `dist/`.
- Never edit `dist/`; it is generated and gitignored. Edit the root source files.
- `firebase-config.js` is a template containing `REEMPLAZAR_*` values. Real values come from `.env` at build time; keep placeholder names and the mapping in `build.cjs` in sync when changing config fields.
- `deploy:hosting` fails if `check-deploy-config.cjs` finds any of: missing `FIREBASE_*` values, `BUSINESS_WHATSAPP` not 8–15 digits, an invalid social URL, or `.firebaserc` default project not matching `FIREBASE_PROJECT_ID`.
- `scripts/firebase.cjs` uses local `node_modules/firebase-tools` if present, otherwise a global Firebase CLI. Node modules are not required for the build.
- `.env`, `dist/`, `.firebase/`, and service-account JSON files are gitignored. Never commit secrets; the Firebase web config itself is public.

## Architecture

- `index.html` + `public.js`: quote calculator, checkout via a single Firestore batch writing `orders/{code}` and `tracking/{code}`, then WhatsApp handoff and code-based public tracker.
- `admin.html` + `admin.js`: passwordless Firebase email-link auth for a single owner. Authorization is enforced by `firebase.rules`, which compares the verified token email to `REEMPLAZAR_CORREO_DUENO`; there is no `admins` collection or admin-management UI. Edits `settings/catalog`, lists `orders`, updates order status/progress/site link/discount/total and mirrors status into `tracking`.
- `firebase-config.js`: shared Firebase config, WhatsApp number, social URLs, and `CATALOG_DEFAULTS` fallback prices.
- `shared.js`: shared escaping, money formatting, toast, busy-state, status-label, and URL-validation helpers.
- `firebase.rules`: authoritative Firestore security. Orders are owner-only; `tracking/{code}` allows public `get` but denies `list`; `settings/catalog` allows public `get` and owner writes. Order updates are limited to `status`, `progress`, `siteLink`, `discount`, and `total`.
- `ui.css` is shared by all pages; `motion.js` handles `data-reveal` scroll animations.
- `muestras/` contains static demo pages copied to `dist/muestras/`; `404.html` and `robots.txt` are also published.

## Conventions

- Frontend uses native ES modules and Firebase 10.12.2 from the gstatic CDN; Tailwind and icons load from CDNs. Do not introduce npm dependencies or a bundling step without need.
- All user-facing copy, errors, and toasts are Spanish. Keep currency as Bs and `es-BO` formatting.
- Reuse `shared.js` for `escapeHtml`, `money`, `showToast`, `setBusy`, `safeHttpUrl`, and `statusLabel` instead of duplicating helpers.
- Escape dynamic data with `escapeHtml` before injecting it into `innerHTML`; validate external links with `safeHttpUrl`.
- Order code (e.g. `DP-XXXXXXXXXX`) is the Firestore document ID and must match the `code` field in both `orders` and `tracking`.
- Order/tracking writes are schema-validated by `validNewOrder` / `validNewTracking` using strict `hasAll` + `hasOnly` lists. Adding a field requires changing both the client object and `firebase.rules`, or the write is denied.
- Setup and security details live in `README.md` and `FIREBASE_SETUP.md`.
