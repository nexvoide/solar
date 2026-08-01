# Knox PV9000 Dashboard

A lightweight read-only web dashboard for **Knox Krypton PV9000** inverters. It reads live data from the same ShineMonitor cloud API used by the Knox Android app (`android.shinemonitor.com`).

## Features

- ☀️ PV Power, 🏠 Load Power, ⚡ Grid Power, 🟢 Inverter Status
- Auto-refresh every 3 seconds
- Connection via Datalogger ID (with automatic credential detection)
- Read-only — never sends commands to the inverter

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

1. **Connect** — Enter your datalogger ID (PN). If the API accepts PN-only auth, it connects automatically. Otherwise, enter your Knox app username and password.
2. **Dashboard** — Live metrics refresh every 3 seconds from `webQueryDeviceEnergyFlowEs` and device status endpoints.
3. **Authentication** — Token, sign, and salt are generated server-side per ShineMonitor API spec. They are never exposed to the browser.

## Tech Stack

- Next.js + React + TypeScript
- Express (custom server for `/api/*` routes)
- Axios + Tailwind CSS

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/connect` | POST | Connect with `{ pn, username?, password? }` |
| `/api/live` | GET | Live inverter data |
| `/api/status` | GET | Connection status |
| `/api/disconnect` | POST | Clear session |

## Project Structure

```
lib/knox.ts          # ShineMonitor API client (auth, signing, live data)
server.ts            # Express + Next.js custom server
components/          # Connection screen & dashboard UI
app/                 # Next.js app router pages
```
