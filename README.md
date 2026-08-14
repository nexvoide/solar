# Knox PV9000 Dashboard

Live read-only solar dashboard for **Knox Krypton PV9000** inverters.

## Run on your computer

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy on Vercel (simple — for non-developers)

Follow these steps once. After that, every code update redeploys automatically.

### Step 1 — Put the project on GitHub

1. Create a free account at [github.com](https://github.com) if you don’t have one.
2. Create a **new repository** (keep it private if you prefer).
3. Upload this project folder to that repository  
   (GitHub website: **Add file → Upload files**, or use GitHub Desktop).

### Step 2 — Connect Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (use **Continue with GitHub**).
2. Click **Add New → Project**.
3. Select your GitHub repository.
4. Vercel will detect Next.js — **don’t change the settings**.
5. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |------|--------|
   | `SESSION_SECRET` | Any long random text, e.g. `my-knox-solar-secret-2026-abc123xyz` |
   | `GEMINI_API_KEY` | Your free API key from Google AI Studio (optional; enables AI energy insights) |

   (This keeps your login session secure on the server.)

6. Click **Deploy** and wait ~2 minutes.

### Step 3 — Open your site

Vercel gives you a link like `https://your-project.vercel.app`.

- Open it on your phone in **Chrome**.
- Log in with your Knox machine number, username, and password.
- Tap **Install app** (or Chrome menu → **Install app**) to add it to your home screen.

### Custom domain (optional)

In Vercel: **Project → Settings → Domains** → add your domain and follow the DNS steps shown there.

---

## Login details

| Field | What to enter |
|-------|----------------|
| Machine number | From your inverter label or Knox app (e.g. `E50000251815378565`) |
| Username | Your **Knox app login** (e.g. `ahsanullah786`) — not the machine number |
| Password | Same password as the Knox app |

---

## What this app does

- Shows solar power, home usage, grid status, and today’s energy
- Updates every 3 seconds
- Read-only — never sends commands to your inverter
- Works as a phone app (PWA) after install
- Shows a concise Gemini-powered energy insight without exposing the API key to the browser
- Turns the calculated hourly solar forecast into an AI daily plan with confidence, weather timing, and appliance suggestions

## Optional Gemini energy insights

Create a free Gemini API key in Google AI Studio and add it to `.env.local` when running locally:

```bash
GEMINI_API_KEY=your_key_here
```

The dashboard sends only energy readings and recent numeric trends to Gemini—never Knox credentials or device identifiers. Insights are cached for 15 minutes to conserve the free quota. A meaningful state change (such as a new warning or a switch between surplus and deficit) refreshes the analysis sooner. If Gemini is not configured or unavailable, the card automatically uses an on-device rules-based insight.
