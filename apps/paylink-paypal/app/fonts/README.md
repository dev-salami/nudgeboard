# Font handoff — Cabinet Grotesk blocked

The commercial font was removed. `app/globals.css` keeps `--font-sans` using
system sans temporarily; Keel colors and tracking are unchanged.

The requested Cabinet Grotesk is **not SIL OFL 1.1 in its official distribution**.
On 9 November 2026 the official Fontshare download
<https://api.fontshare.com/v2/fonts/download/cabinet-grotesk> included
`License/FFL.txt`: ITF Free Font License 2.0, dated 17 August 2026.
It permits self-hosting for a licensee's own site but section 02 restricts
redistribution through repositories, libraries and other platforms. It cannot
be represented as OFL or bundled as MIT code. No font files from that download
were saved or committed. The suggested `@fontsource/cabinet-grotesk` package
returned 404 at the official npm registry.

Remaining work: obtain an official, repository-redistributable Cabinet Grotesk
release or explicit permission, or approve an alternative OFL family. Then add
unaltered WOFF2 Regular (and real Medium/Bold cuts if used), the actual license
beside the files, and `next/font/local` sources in `app/layout.tsx`, with
`variable: "--font-sans"`. Do not substitute an unrelated OFL license or source
files from an unofficial mirror. The current system fallback avoids shipping
restricted font assets but does not complete the requested Cabinet replacement.
