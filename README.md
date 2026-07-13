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

## Docker

`apps/api/Dockerfile` and `apps/web/Dockerfile` are multi-stage builds for
this npm-workspaces monorepo — build them from the **repo root** so the
workspace `package-lock.json` and `packages/shared` are in context:

```bash
docker build -f apps/api/Dockerfile -t pos-api .
docker build -f apps/web/Dockerfile -t pos-web .
```

To run the full stack locally (Postgres + API + web, wired together):

```bash
docker compose -f docker-compose.prod.yml up --build
```

The web container serves the built frontend via nginx on `:8080` and
reverse-proxies `/api/*` to the `api` service — visit http://localhost:8080.
`docker-compose.prod.yml` sets placeholder JWT secrets and CORS origin for
local smoke testing only; override them (env vars or a real secrets manager)
before deploying anywhere real. Cloud-specific deploy config (Fly.io,
Render, ECS, etc.) isn't included yet — these Dockerfiles are the portable
building block for whichever platform gets chosen.
