# STORBIT UI fonts

Inter-Regular.woff and Inter-SemiBold.woff are unmodified local copies of
Prisma's bundled inter-all-400-normal.4c1f8a0d.woff and
inter-all-600-normal.d0a7c8a9.woff in node_modules/prisma/build/public/assets.
The embedded name table identifies Inter and Copyright 2020 The Inter Project
Authors (https://github.com/rsms/inter), and links to the SIL OFL.
The full license is included in Inter-OFL.txt.

These are static 400/600 fonts, not variable fonts. Other requested weights
use browser weight matching. Full bundled glyph repertoire retained; no
subsetting or renaming of the embedded font. CSS uses a separate UI-only alias.

Poppins is NOT bundled. CSS performs local lookup for approved Poppins
Medium/SemiBold/Bold, with explicitly named Inter/system fallbacks. Fetching
the approved upstream files was blocked by DNS in this execution environment.
Do not describe fallback rendering as verified Poppins. Obtain the approved
Poppins binaries and their OFL notice before typography sign-off.

Upstream license/source references:
https://github.com/google/fonts/tree/main/ofl/inter
https://github.com/google/fonts/tree/main/ofl/poppins

Font faces and font usage are screen-only. Root Tailwind/system/print font
families remain unchanged. No runtime external font requests or dependencies.
