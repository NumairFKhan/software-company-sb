# CourtCoach AI

An AI-powered tennis coach — log sessions, get personalised drills, and track your progress.

Built with **Next.js 14 App Router**, **Supabase** (magic-link auth + Postgres), and **Tailwind CSS**, deployed as a **PWA**.

---

## Getting started

### 1. Clone and install

```bash
git clone <repo>
cd courtcoach-ai
npm install
```

### 2. Set up environment variables

```bash
cp env.example .env.local
```

Edit `.env.local` and fill in:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NEXT_PUBLIC_SITE_URL` | Public URL (e.g. `http://localhost:3000`) |

### 3. Run the database migration

In the **Supabase SQL Editor**, run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

This creates the `player_profiles` table with Row Level Security.

### 4. Configure Supabase Auth

In **Supabase Dashboard → Authentication → URL Configuration**:
- Add `http://localhost:3000/auth/callback` to **Redirect URLs**

Enable **Magic Link** (OTP) email provider under **Authentication → Providers**.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project structure

```
src/
  app/
    (app)/                   # Auth-required routes (shares AppLayout)
      dashboard/page.tsx     # Dashboard
      onboarding/            # Player profile setup / edit
        page.tsx
        OnboardingForm.tsx   # Client component
    api/
      profile/route.ts       # GET + PUT /api/profile (auth-gated)
    auth/callback/route.ts   # Magic-link exchange
    login/                   # Sign-in page + server action
  components/
    SignOutButton.tsx
  lib/
    supabase/
      client.ts              # Browser client
      server.ts              # Server component client
      middleware.ts          # Middleware session refresh
    profile-validation.ts    # Pure validation (also unit-tested)
  middleware.ts              # Redirects unauthenticated users
  types/
    database.ts              # Full Supabase Database type
supabase/
  migrations/
    001_initial_schema.sql   # player_profiles table + RLS
public/
  manifest.json              # PWA manifest
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm test` | Run unit tests (Jest) |
| `npm run lint` | ESLint |
