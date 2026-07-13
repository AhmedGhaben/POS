# POS

Cloud-based point-of-sale system. React + TypeScript + Tailwind + shadcn/ui frontend, NestJS + PostgreSQL + Prisma backend.

## Structure

- `apps/api` — NestJS backend
- `apps/web` — React (Vite) frontend
- `packages/shared` — shared TypeScript types/enums

## Development

```bash
docker compose up -d       # start local Postgres
npm install
npm run dev:api             # backend on :3000
npm run dev:web             # frontend on :5173
```

See `docs/plans/` for phase design docs.
