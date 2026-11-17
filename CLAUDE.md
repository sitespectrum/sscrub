# sscrub

A tool for culling through footage. **Sinks** represent recording devices (camera, drone, recorder…); you dump their footage into the library. Next, **projects** pick a set of sinks plus a time range, and an Adobe‑style **editor** shows each sink as a track on a timeline so you can scrub through everything that was recording at once.

## Layout

| Path | What |
|---|---|
| `be/` | ASP.NET Core (.NET 10) minimal API, EF Core + SQLite, ffmpeg media pipeline. Project `SscrubServer`. |
| `fe/` | Next.js 16 (App Router, React 19, React Compiler) + shadcn (`base-mira` style, Base UI) + Tailwind 4. pnpm. |
| `cf-b2-proxy/` | Vendored Backblaze sample Cloudflare Worker. It serves private B2 objects through presigned (HMAC) URLs, and its `wrangler.toml` is untracked. |
| `garage/` | Local S3 (Garage) for dev only, with a `setup.sh` that creates bucket, key and CORS. |
| `compose.yaml` | Production: `api`, `frontend`, `cloudflared`. |

## Architecture

**Storage: two buckets plus a proxy**
- **Asset bucket** (B2 in prod, Garage locally): the original footage. It's private, and the browser reaches it only through presigned URLs.
- **Derived bucket** (Cloudflare R2): thumbnails and filmstrip sprites. The browser loads them straight from `DerivedStorageBucket__PublicUrl` / `NEXT_PUBLIC_DERIVED_URL` with zero egress, and they need no CORS since they're CSS `background-image`s.
- **Playback/probing** of originals goes through `cf-b2-proxy`. `be/Services/AssetUrlSigner.cs` signs `{exp}\n{path}` with `AssetProxy__UrlSigningSecret`, and `GET /api/assets/{id}/presignedUrl` redirects to that signed URL, so it can be used directly as a `<video src>`.

**Upload flow** (`fe/lib/upload.ts`, `be/Endpoints/AssetAndUploadEndpoints.cs`)
1. `POST /api/uploads` creates the Asset (`Uploading`) and an S3 multipart upload, then returns presigned part URLs. Parts are at least 32 MiB and at most 10k per upload.
2. The browser PUTs the parts directly to the bucket: 4 parts per file concurrently, retries with backoff, and progress via `xhr.upload.onprogress`. **The bucket CORS must expose `ETag`**, or every part fails with "Missing ETag" after uploading in full.
3. `POST /api/uploads/{id}/complete` completes the multipart upload, sets the asset to `Processing` and enqueues it.

**Media processing** (`be/Services/`)
- `MediaProcessingQueue` is a channel that `MediaProcessingWorker` (a hosted service, `MaxConcurrency`) drains by running `MediaProcessor`. On startup the worker re-queues every asset that is `Processing`/`Failed`; this is also how to reprocess old assets.
- **Never download the whole source file.** The head hash is BLAKE3 over a ranged GET of the first `HeadHashBytes`. ffprobe and ffmpeg read the signed proxy URL using HTTP range requests.
- **Thumbnail:** seeks to 20% of the clip (at most 5s), then the `thumbnail` filter picks from the next 30 frames, scaled to 640px webp.
- **Filmstrip:** one seek per frame, up to 100 frames run with `SeekConcurrency`, then tiled into a sprite with at most 10 columns. Frames are **320×214**, kept small on purpose: a 720×480 sprite decoded to ~138 MB and crashed tabs. Each asset stores its own `FilmstripInfo`, so old and new sizes coexist.
- Errors live **in memory only** (`MediaProcessingErrors`) and are served by `GET /api/assets/attention` (the "Needs attention" page), so they're lost on restart.

**Frontend**
- The API client is `fe/lib/api/openapi-clients.ts` (`$api` = openapi-react-query over openapi-fetch). Its types are generated in `fe/lib/api/sscrub-api-schema.ts`. After changing backend DTOs, run `pnpm openapi-codegen` with the API running on :5200.
- Client state uses jotai (`fe/lib/atoms.ts`), and formatting helpers are in `fe/lib/format.ts` / `fe/lib/utils.ts`.
- `app/app/(library)/` is real and wired to the API (library grouped by day, newest first; sinks; upload tray; attention page). `app/app/projects/**` (project list, new project, editor/timeline/monitor) still runs on **placeholder data** from `fe/lib/placeholder/`, because the backend has no projects yet.
- Large libraries: cards show static thumbnails and load the filmstrip only on hover, with lazy images and off‑screen `content-visibility`. Keep it that way.
- **Read `fe/AGENTS.md`**: this Next.js version differs from training data, so check `fe/node_modules/next/dist/docs/` before writing Next code. `next dev` re-adds that file automatically.

**Not built yet / known gaps:** auth (there's a `Secrets__JwtKey` and an auth/refresh middleware in the client, but no auth endpoints), projects backend, audio waveforms (designed in an earlier chat, not implemented), and H.264 preview transcodes. HEVC sources don't play in Firefox on Windows without the HEVC extension.

## Running locally

```bash
cd garage && docker compose up -d && ./setup.sh   # once; S3 on :3900, CORS for :5201
```
```bash
cd be && dotnet watch            # API on :5200, Scalar UI at /scalar in Development
```
```bash
cd fe && pnpm install && pnpm dev   # :5201
```
The proxy runs with `wrangler dev` in `cf-b2-proxy/` on :8787 (`appsettings.Development.json` points `AssetProxy:BaseUrl` there). The backend needs `ffmpeg`/`ffprobe` at the paths in `MediaProcessing` (default `/usr/bin/`). The SQLite DB and the processing workdir live in `be/data/`, and migrations are applied on startup.

Note: `dotnet` is not installed in the Claude Code distrobox, so backend builds have to run on the host.

## Checks

- Backend: `dotnet build` in `be/`, with no warnings.
- Frontend: `pnpm lint` and `pnpm exec tsc --noEmit` in `fe/`. Prettier config is in `fe/.prettierrc`. `pnpm build` is what the Docker image runs, so a type error breaks deploys.
- There are no automated tests yet.

## Conventions (follow the project, not the global defaults)

- **Backend:**
  - Endpoints are `Map*Endpoints` extension methods in `be/Endpoints/`, using full `/api/...` routes and `TypedResults` with `Results<...>` unions.
  - DTO records live in `be/Types.cs`, EF entities in `be/Models/`, and options classes in `be/Options/` with a `SectionName`.
  - DI wiring is in `be/Extensions/ServiceCollectionExtensions.cs`, and S3 clients are keyed singletons `"asset"` / `"derived"`.
  - The DbContext is used directly; there is no repository layer.
- **Migrations:** `dotnet ef migrations add <Name>` in `be/`. Never edit an applied migration.
- **Config:** `appsettings.json` holds placeholders, and real values come from env (`Section__Key`) or `be/.env` (loaded by dotenv.net). In `compose.yaml`, required values use `${VAR:?}`, while optional ones are a bare `Key:` so that an unset value falls back to `appsettings.json`. Never use plain `${VAR}`, which would override the default with an empty string.
- **Frontend:** shadcn components live in `fe/components/ui/`, and you add more with the shadcn CLI. Use `lucide-react` icons. Feature components go in route‑local `_components/` folders.
- **Deploy:** public traffic flows only through `cloudflared`, and services have no `ports:`. `NEXT_PUBLIC_*` values are baked in at frontend build time as build args.

## Working in this repo

- **Edit the main working tree directly; don't use git worktrees** unless asked.
- **Commits use [Conventional Commits](https://www.conventionalcommits.org/):** `<type>(<scope>): <description>`, e.g. `fix(upload): expose etag progress`. Use one logical change per commit, and add no AI attribution trailers. Older history predates this convention.
- `master` is the working branch, and `origin/main` only has the initial commit.
- UI changes: verify with screenshots in the browser (light + dark, small + large), as the global instructions describe.
