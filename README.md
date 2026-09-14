# Star Rating App v2 — Joylashtirish vositalarini toifalash

Static web app (no backend) for classifying accommodation facilities in Uzbekistan under:

- **O‘zMSt 958:2026** «Turizm xizmatlari. Joylashtirish vositalari. Umumiy talablar» (replaces O‘z DSt 3220:2023, effective 12.09.2026) — Annex A (hotels, specialized, individual, dormitory), Annex B (B&B), Annex C (hostels).
- **O‘zMSt 125:2024** «Balli tasniflash tizimi» with **Amendment No. 1** (approved 03.08.2026, effective 03.09.2026) — 169 criteria, new thresholds, Uzbek breakfast categories.

## Files

```
index.html          page shell
css/app.css         styles (mobile-first, print stylesheet for the PDF report)
js/data_958.js      958:2026 annexes A/B/C, footnotes and applicability rules (generated from the DOCX)
js/data_125.js      MSt 125 criteria, points, mandatory marks per star, thresholds (generated from the PDF)
js/translations.js  RU/EN translations of all criteria (UZ is the source of truth)
js/i18n.js          UI strings (uz/ru/en)
js/app.js           application logic
```

## Deploy to GitHub Pages

Copy the contents of this folder into the root of the `star_Rate_app` repository (replacing the old `index.html`, `js/` and `data/`), commit and push. GitHub Pages serves it as before. The only external dependency is SheetJS (Excel export) loaded from cdnjs; everything else works offline.

## Regenerating the data files

The data files were generated from the official documents with the scripts in the build folder (`parse_mst125.py`, `parse_958.py`, `build_data.py`). If a new amendment is published, rerun the parsers on the new document and review the printed summary (item counts, mandatory counts per star, thresholds).

## Data model of a saved assessment (JSON export)

```
{ facility: { name, kind, rooms, target, seasonal, heritage, rural, naturalWater, sensorDoors, brand, ... },
  a958: { "<requirement id>": { v: "yes"|"no"|"na", note, photos: [dataURL] } },
  a125: { "<criterion id>": { v: "yes"|"no", qty, note, photos: [dataURL] } } }
```

## Accounts and the shared registry (Supabase)

Without configuration the app runs in local mode: no sign-in, assessments stay in the browser. To let several inspectors work and to see every facility in one registry:

1. Create a free project at https://supabase.com (region: any). Wait until it is provisioned.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, run it once.
3. Open **Project Settings → API**. Copy *Project URL* and the *anon public* key into `js/config.js`:
   ```js
   window.CLOUD_CONFIG = { url: "https://xxxx.supabase.co", anonKey: "eyJ..." };
   ```
4. (Recommended) **Authentication → Providers → Email**: keep "Confirm email" on so accounts need a valid address. Under **Authentication → URL Configuration** set the Site URL to your GitHub Pages address.
5. Commit and push. Open the site, create the first account: it automatically becomes **admin**. Everyone who signs up later is **pending** until an admin sets their role on the Users page.

Roles: *pending* (no access), *inspector* (own assessments only), *admin* (all assessments, registry with history per facility, user roles). Access rules are enforced in the database (row-level security), not only in the page.

Each save is synced to the cloud after 1.5 s; when offline it stays local and syncs when the connection returns.
