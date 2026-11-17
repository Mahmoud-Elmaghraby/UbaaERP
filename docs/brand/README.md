# Ubaa brand

Approved 2026-11-17. The logo direction is "D2" from the user's ChatGPT session, and Claude redrew it as clean flat vectors. The project doc `brand-identity-2026-11-17.md` has the history.

- **Name:** Ubaa. It is always written in Latin letters, never in Arabic.
- **Core colours (fixed):**
  - Navy `#0B2D4D`: the primary colour for buttons, text accents and the app theme default.
  - Blue `#0F77C8`: highlights, soft accents, and the primary colour in dark mode.
  - Orange `#FF8A00`: **logo only**. It fails contrast as text on white.
- **Facet tints (logo only):** blue `#3FA9F0`, orange `#FFAE3D`. On dark surfaces the navy band becomes `#D6E4F2`.
- **Fonts:**
  - The UI uses Cairo, bundled through `@fontsource/cairo`, which works offline.
  - The wordmark is Montserrat Bold, outlined to paths, so no font is needed to show it.
- **No gradients.** The mark is flat on purpose: it prints cleanly and stays readable at 16 px.

| File | Use |
|---|---|
| ubaa-symbol.svg | The app icon source. Also used for the favicon. |
| ubaa-symbol-on-dark.svg | The symbol on navy or dark surfaces. |
| ubaa-symbol-mono.svg | One colour, navy. Black-and-white print. |
| ubaa-symbol-white.svg | One colour, white. |
| ubaa-logo-horizontal*.svg | Sidebar, login screen, footers. Comes in colour, on-dark, mono and white. |
| ubaa-logo-stacked*.svg | Splash screen, installer, marketing. |
| ubaa-wordmark.svg | The name alone. |

**Where the brand is used in code:**
- `apps/web/src/components/brand/brand-mark.tsx`: `BrandMark` and `BrandWordmark`.
- `apps/web/public/favicon.svg`.
- `apps/desktop/assets/icon.ico` and `icon.png`.
- `apps/web/src/app/theme/palette.ts`: `DEFAULT_ACCENT` is navy, with blue as its companion.

**Regenerating the files:** `generator/` rebuilds every file, including `brand-mark.tsx`. You need Python, fontTools, and Montserrat from Google Fonts.
