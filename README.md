# LAN Party Voting Machine

A real-time, anonymous voting web app for deciding what to play at your LAN party. Players join from their phones over the local network, vote on a shared game list, and the winner is revealed on the big screen with a spinning wheel animation and confetti.

Built with Node.js, Express, and Socket.IO.

## Features

- **Anonymous real-time voting** — players vote from their phones; only aggregate counts are shown, never individual choices
- **QR-code join** — admin screen displays a QR code pointing at the LAN address so guests can join in seconds
- **Three synchronized views**
  - **Client** (`/`) — phone-friendly voting UI
  - **Admin** (`/admin.html`) — password-protected control panel
  - **Display** (`/display.html`) — big-screen view designed for a TV or projector
- **Phase machine** — `idle → voting → (tiebreaker) → winner`, orchestrated by the admin
- **Tiebreaker round** — automatic second round between tied games, with a shorter timer
- **Spinning wheel winner reveal** — dramatic animated reveal on the display
- **Player nominations** — admin can open a window for players to suggest games, then approve/reject them
- **Vetoes** — admins can open a veto phase where players can strike a game from the list
- **Weighted voting** (optional) — assign per-player weights 1–10 for handicapped voting
- **Minimum voters threshold** — hold the timer open until enough people have voted
- **Vote-change lock** — players can change their vote for a short grace period, then it locks
- **Broadcast messages** — push an announcement banner to every client
- **Hype chat** — anonymous live chat feed with unread badge
- **Round history & streaks** — persisted round-by-round results and per-player "picked the winner" streaks
- **Presets** — save and reload curated game lists
- **Kick & password change** — admin can remove a player and rotate the admin password
- **Persistence** — game list, history, presets, password, and settings saved to `data.json`

## Project Structure

```
.
├── server.js              # Express + Socket.IO server and phase state machine
├── package.json
├── public/
│   ├── index.html         # Player (client) view
│   ├── client.js
│   ├── admin.html         # Admin control panel
│   ├── admin.js
│   ├── display.html       # Big-screen display view
│   ├── display.js
│   ├── wheel.js           # Spinning wheel winner reveal
│   ├── confetti.js        # Confetti effect
│   ├── sounds.js          # Sound effects
│   └── style.css
└── data.json              # (generated) Persisted state
```

## Requirements

- Node.js 16+ (anything with modern Express/Socket.IO support)
- npm
- All players on the same LAN / Wi‑Fi as the host machine

## Installation

```bash
git clone https://github.com/kylecaulfield/lan-party-voting-machine.git
cd lan-party-voting-machine
npm install
```

## Running the Server

```bash
npm start
```

The `start` script sets `PORT=3000` on Windows. On macOS/Linux you can run directly:

```bash
PORT=3000 node server.js
```

If `PORT` is not set, the server defaults to **2000**.

On startup the console prints three URLs:

```
🎮  Caulfield LAN Party Vote Server
════════════════════════════════════════
  Admin   → http://localhost:3000/admin.html
  Clients → http://<your-LAN-IP>:3000/
  Display → http://<your-LAN-IP>:3000/display.html
════════════════════════════════════════
```

## How to Use

### 1. Open the three views

- **Admin** on the host machine: `http://localhost:3000/admin.html`
- **Display** on the TV/projector: `http://<LAN-IP>:3000/display.html`
- **Clients** on each player's phone: `http://<LAN-IP>:3000/` (or scan the QR code shown in the admin panel)

### 2. Log in as admin

The default password is `admin`. Change it from the admin panel after first use.

### 3. Set up the game list

- Add games manually, load a saved preset, or enable **Nominations** and let players suggest titles
- Each game has a name + emoji

### 4. Start a round

- Set the timer duration (5s–3600s; quick presets for 30s / 1m / 2m / 3m / 5m)
- Click **▶ Start**; players see the list, vote, and watch results update live
- Optionally set a **min voters** threshold — the round will pause at 0 until the threshold is met

### 5. Tiebreaker / winner

- If the top games tie, the app automatically runs a shorter tiebreaker round between them
- A single winner triggers the big-screen wheel-spin reveal and marks the game as played
- Hit **↺ Next Round** to start another vote with the remaining games

### 6. Optional phases

- **Veto phase** (only while idle) — players can strike one game from the list
- **Broadcast** — push a message banner to every connected screen
- **Weighted voting** — give specific players heavier votes

## Configuration & Persistence

State is written to `data.json` in the project root and reloaded on startup. Persisted fields:

- `history` — last 100 round results
- `presets` — saved game-list presets
- `adminPassword` — current admin password
- `settings.defaultTimer`, `settings.minVoters`
- `games` — current game list (name, emoji, played flag)

`data.json` is gitignored. Delete it to reset everything.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `2000`  | HTTP port the server listens on |

## Security Notes

This app is designed for a **trusted LAN**. It is not hardened for the public internet:

- Admin auth is a single shared password over plain HTTP
- No rate limiting or per-player authentication
- Chat, nominations, and nicknames are length-capped but not heavily sanitized on display

Don't expose it directly to the internet — if remote players need access, put it behind a VPN or a reverse proxy with TLS + auth.

## License

No license specified — all rights reserved by the author. Add a license file if you want to open-source it.

## Credits

Built for the Caulfield LAN Party.
