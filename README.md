# OpenBell Portfolio — Deployment Guide

## Launch on Chrome via Vercel in 5 steps

### What you need before starting
- A computer with Node.js installed → check with `node -v` (need v18+)
- A GitHub account → github.com (free)
- A Vercel account → vercel.com (free, sign in with GitHub)
- An Anthropic API key → console.anthropic.com (free tier available)
- A Finnhub API key → finnhub.io (free, 60 req/min)

---

## Step 1 — Set up the project locally

Open your terminal and run these commands one by one:

```bash
# Navigate to where you want the project
cd ~/Desktop

# Copy this project folder to your Desktop
# (or wherever you saved openbell-nextjs)

# Enter the project
cd openbell-nextjs

# Install dependencies
npm install
```

---

## Step 2 — Add your API keys

Create a file called `.env.local` in the project root:

```bash
# On Mac/Linux:
touch .env.local

# On Windows (Command Prompt):
type nul > .env.local
```

Open `.env.local` in any text editor (Notepad, VS Code, etc.) and add:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
FINNHUB_API_KEY=your-finnhub-key-here
```

**Where to get the keys:**
- Anthropic: go to console.anthropic.com → API Keys → Create Key
- Finnhub: go to finnhub.io → Register (free) → Dashboard → copy your API token

---

## Step 3 — Test locally first

```bash
npm run dev
```

Open your browser and go to: **http://localhost:3000**

You should see the full OpenBell app. Test that:
- Holdings load (prices appear)
- AI Brief button works
- Holdings can be added and persist after refresh

Press Ctrl+C to stop the server when done.

---

## Step 4 — Deploy to Vercel (your live URL)

### 4a — Push to GitHub

```bash
# Initialize git (first time only)
git init
git add .
git commit -m "OpenBell initial deploy"

# Create a new repo on github.com (click + → New repository)
# Name it: openbell-portfolio
# Don't add README, .gitignore, or license (we have them)
# Then run:

git remote add origin https://github.com/YOUR_USERNAME/openbell-portfolio.git
git branch -M main
git push -u origin main
```

### 4b — Connect to Vercel

1. Go to **vercel.com/new**
2. Click **"Import Git Repository"**
3. Select your `openbell-portfolio` repo
4. Click **"Deploy"** — Vercel auto-detects Next.js

### 4c — Add environment variables (CRITICAL)

Before or right after your first deploy:

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add these two variables:

| Name | Value | Environment |
|------|-------|-------------|
| `ANTHROPIC_API_KEY` | `sk-ant-your-key` | Production |
| `FINNHUB_API_KEY` | `your-finnhub-key` | Production |

4. Click **Save** then **Redeploy** (Deployments → Redeploy)

Your app is now live at: `https://openbell-portfolio.vercel.app`

---

## Step 5 — Share your link

Send anyone `https://openbell-portfolio.vercel.app`

They can open it in **Chrome on any device** — desktop, Android, iPhone.

---

## Updating the app

Every time you change code and push to GitHub, Vercel auto-deploys:

```bash
git add .
git commit -m "your change description"
git push
```

Vercel deploys in ~30 seconds. The URL stays the same.

---

## Troubleshooting

**"AI features not working"**
→ Check that `ANTHROPIC_API_KEY` is set in Vercel → Settings → Environment Variables
→ Redeploy after adding variables

**"Prices showing as mock data"**
→ Check that `FINNHUB_API_KEY` is set in Vercel
→ Finnhub free tier allows 60 requests/minute — refresh slowly

**"npm install fails"**
→ Make sure Node.js v18+ is installed: `node -v`
→ Download from nodejs.org if needed

**"git push rejected"**
→ Run: `git pull origin main --rebase` then push again

---

## Project structure

```
openbell-nextjs/
├── app/
│   ├── page.tsx          ← Your entire app lives here
│   ├── layout.tsx        ← HTML wrapper + meta tags
│   └── api/
│       ├── ai/route.ts        ← Anthropic proxy (key stays server-side)
│       └── quotes/route.ts    ← Finnhub/Yahoo proxy
├── public/
│   └── icons/            ← Add app icons here (192px, 512px)
├── .env.local            ← Your API keys (NEVER commit this)
├── .env.example          ← Template (safe to commit)
├── next.config.ts        ← Next.js config + security headers
├── package.json
└── tsconfig.json
```

---

## Cost estimate (all free tiers)

| Service | Free tier | What it covers |
|---------|-----------|----------------|
| Vercel | 100GB bandwidth/month | Thousands of daily users |
| Anthropic | $5 free credit | ~500 AI briefs |
| Finnhub | 60 req/min | Full real-time quotes |
| GitHub | Unlimited public repos | Code hosting |

**Total cost to launch: $0**
