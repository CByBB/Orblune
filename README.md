# Orblune

Live Earth wallpaper for Windows 10 and 11 — day and night lighting, local times, and weather on a calm globe behind your desktop icons.

**One-click install:** grab the latest `Orblune_*_x64-setup.exe` from [Releases](https://github.com/CByBB/Orblune/releases/latest). Double-click, wait for the short progress view, and Orblune opens. No admin prompt (current-user install into `%LOCALAPPDATA%`).

## Features

- Animated globe with real sun-based day and night
- Your location plus curated world cities
- Weather via [MET Norway Locationforecast](https://api.met.no/) (attribution required)
- Free: live wallpaper, your weather, 3 other cities (time)
- Premium ($5 once, crypto via NOWPayments): full city list, weather on every city, appearance controls

## Develop

Requirements: Node 22+, Rust stable, Windows WebView2.

```bash
npm install
npm run tauri dev
```

Build an installer locally:

```bash
npm run tauri build
```

The NSIS setup lands under `src-tauri/target/release/bundle/nsis/`.

### Multi-window

- `settings` — configuration UI with live preview
- `wallpaper` — borderless WebView attached to the desktop `WorkerW` layer

## Payments worker

Checkout and license signing run in [`worker/`](worker/) (Cloudflare Worker). Secrets never ship inside the desktop app.

```bash
cd worker
npm install
npx wrangler kv namespace create ORDERS
# update wrangler.toml with the KV id
npx wrangler secret put NOWPAYMENTS_API_KEY
npx wrangler secret put NOWPAYMENTS_IPN_SECRET
npx wrangler secret put LICENSE_SIGNING_KEY_HEX
npx wrangler deploy
```

Set `VITE_ORBLUNE_WORKER_URL` when building the app to the Worker URL. Put the matching Ed25519 **public** key hex into:

- `src-tauri/src/license.rs` → `LICENSE_PUBLIC_KEY_HEX`
- `src/lib/license.ts` → `LICENSE_PUBLIC_KEY_HEX`

Generate a keypair (example):

```bash
# 32-byte seed hex for LICENSE_SIGNING_KEY_HEX
openssl rand -hex 32
```

Derive the public key with your preferred Ed25519 tooling and paste it into the app sources before a production build.

Sandbox: keep `NOWPAYMENTS_API_URL` on `https://api-sandbox.nowpayments.io/v1` until you are ready for live charges, then switch to `https://api.nowpayments.io/v1`.

## Publish a GitHub Release

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Generate updater keys once: `npm run tauri signer generate -w ~/.tauri/orblune.key` and put the **public** key into `tauri.conf.json` → `plugins.updater.pubkey`. Store the private key in the `TAURI_SIGNING_PRIVATE_KEY` repository secret (and password if any).
3. Update the updater endpoint repo path if your GitHub repo is not `CByBB/Orblune`.
4. Commit, tag, and push:

```bash
git add -A
git commit -m "Release v0.1.0"
git tag v0.1.0
git push origin HEAD
git push origin v0.1.0
```

GitHub Actions builds the Windows x64 NSIS installer and publishes the Release assets (including updater `latest.json`).

Unsigned installers show Windows SmartScreen once (**More info → Run anyway**) until you add a paid Authenticode certificate.

## Attributions

- Weather: © Norwegian Meteorological Institute / MET Norway — [Terms of Use](https://www.met.no/en/free-meteorological-data/Licensing-and-crediting)
- Day/night lighting computed on-device from solar position
- Earth day map: [Natural Earth II with bathymetry](https://www.shadedrelief.com/natural2/) by Tom Patterson (public domain)
- Night lights: [NASA Black Marble 2016](https://earthobservatory.nasa.gov/features/NightLights)

## License

Proprietary — Orblune. Free tier for personal use; Premium is a one-time purchase.
