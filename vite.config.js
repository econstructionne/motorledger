# MotorLedger

**Vehicle & Equipment Maintenance Tracker**

MotorLedger is a web app for tracking maintenance on vehicles and equipment — from daily drivers to skid loaders. It includes user accounts, service logging, smart reminders, AI-powered receipt scanning, a shop portal, shared vehicles, ownership transfers, printable reports, and a gamified health score.

## Features

- **Vehicle Tracking** — Log cars, trucks, and motorcycles with VIN, mileage, and full service history
- **Equipment Tracking** — Track mowers, chainsaws, skid steers, telehandlers, generators, and more by hours
- **AI Receipt Scanner** — Upload a photo of a service invoice and it auto-extracts service details and next-service reminders
- **Shop Portal** — Dealers and shops can look up vehicles by VIN or QR code and log service directly to the owner's account
- **QR Codes** — Each vehicle/equipment gets a unique QR code for shop scanning
- **Maintenance Health Score** — A+ through F letter grade based on how current services are, with a 0–100 point system
- **Smart Reminders** — Auto-calculated based on mileage/hours and time intervals
- **Shared Vehicles** — Multiple users can view and log service on the same vehicle
- **Ownership Transfer** — Move a vehicle and its full history to another user's account
- **Printable Reports** — Clean formatted reports with health score for buyers or records

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)

### Install & Run

```bash
git clone https://github.com/yourusername/motorledger.git
cd motorledger
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

Output goes to the `dist/` folder, ready for deployment.

## Deployment

Works with any static hosting:

- **Vercel** — Connect your GitHub repo, it auto-detects Vite
- **Netlify** — Set build command to `npm run build` and publish directory to `dist`
- **GitHub Pages** — Use the `dist/` output after building

## Tech Stack

- React 18
- Vite
- Anthropic Claude API (for receipt scanning)
- Persistent storage API for cross-session data

## License

MIT
