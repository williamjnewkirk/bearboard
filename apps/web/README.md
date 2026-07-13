# @bearboard/web

Coach command center â Next.js (App Router) + Tailwind. Deployed on Vercel.

## Status

Placeholder scaffold. Dependencies are declared in `package.json` but not yet
installed. To bring it up:

```bash
# from the repo root
npm install
npm run web        # -> next dev on http://localhost:3000
```

## Notes

- Imports shared types from `@bearboard/shared` (raw TS, transpiled via
  `transpilePackages` in `next.config.mjs`).
- Copy `.env.local.example` -> `.env.local` before running against Supabase/Clerk.
- The flagship screen is the plan grid (PRD Â§5.2.3).
