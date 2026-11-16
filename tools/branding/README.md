# STORBIT icon assets

Master: `apps/web/public/brand/storbit-app-icon.svg`.

The SVG is a clean vector reconstruction of the selected top-right app icon on
`docs/brand-reference/storbit-brand-board.png.png`: rounded gradient square,
white four-point star. It contains no screenshot crop, wordmark or S/ribbon mark.
The supplied light/dark wordmark PNGs remain unchanged and are used separately.

Regenerate with the existing Python/Pillow installation:

```powershell
python tools/branding/generate-icons.py
```

The small renderer reads the SVG gradients, rounded rectangle and absolute
M/C/Q/Z star path. It samples Bezier curves and supersamples the shape masks;
it is intentionally scoped to this master, not a general SVG library. Extend
the renderer if the master gains different SVG features. No runtime dependency
or browser is needed. Outputs are the 1024px master PNG, desktop 192/256/512/1024
PNGs, PWA 192/512 PNGs, 180px Apple icon and two ICO files, each containing
16/32/48/64/128/256px frames. The old `/pwa-icon.svg` URL serves the same new SVG
for clients with an older cached manifest.

After building the web application, validate packaging identity, metadata,
manifest references, wordmark bytes and preserved application source:

```powershell
node tools/branding/verify-branding.cjs
```

This compares configuration with the current repository HEAD, the pre-branding
identity in this local task. It also uses the saved source hashes in
`docs/storbit-verification/branding-final/source-before.json`. It does not run
an installer, install an update, launch a browser or exercise real hardware.
