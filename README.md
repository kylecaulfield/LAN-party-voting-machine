# LAN Party Voting Machine

A self-hosted, real-time voting web application designed for LAN parties. Players connect from any device on the local network to cast votes on what to play next, which map to load, team compositions, pizza toppings, or anything else a group of gamers needs to decide quickly and fairly.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Detailed Hosting Instructions](#detailed-hosting-instructions)
  - [Option 1: Local Host Machine (recommended for most LAN parties)](#option-1-local-host-machine-recommended-for-most-lan-parties)
  - [Option 2: Docker Container](#option-2-docker-container)
  - [Option 3: Raspberry Pi / Dedicated Mini-Server](#option-3-raspberry-pi--dedicated-mini-server)
  - [Option 4: Cloud / VPS Deployment](#option-4-cloud--vps-deployment)
- [Network Configuration](#network-configuration)
- [Configuration Reference](#configuration-reference)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The LAN Party Voting Machine solves a problem every LAN party host knows: the endless argument over what to play next. Instead of shouting across the room, players open a link on their laptop or phone and vote in seconds. The host sees results in real time on a projector or shared screen, and the winning option is announced as soon as voting closes.

The app is built to run entirely on a local network. No internet access is required once installed — which makes it ideal for basements, garages, hotel ballrooms, or any venue where Wi-Fi is flaky but the LAN switch is rock solid.

### Typical use cases

- Choosing the next game (Counter-Strike, Rocket League, StarCraft, etc.)
- Picking maps, modes, or rulesets
- Drafting or randomizing teams
- Voting on tournament brackets and seeding
- Deciding on food orders, break times, and music
- Running silly side polls ("Who's the MVP?", "Who owes everyone pizza?")

---

## Features

- **Real-time results** — votes appear instantly via WebSockets
- **Zero-install for players** — any device with a browser can vote
- **Host dashboard** — create polls, open/close voting, display results full-screen
- **Multiple poll types** — single choice, multi-select, ranked-choice, approval voting
- **Anonymous or named voting** — configurable per poll
- **One-vote-per-device** enforcement (cookie + IP based, configurable)
- **QR code join flow** — players scan a code on the host screen to get to the voting page
- **Poll history** — past results are saved and can be exported as CSV or JSON
- **Dark mode** — for late-night sessions
- **Offline-first** — works entirely on a LAN with no external dependencies

---

## Architecture

```
┌─────────────────┐        ┌──────────────────────┐
│  Player device  │◄──────►│                      │
│  (browser)      │  HTTP  │                      │
└─────────────────┘  /WS   │   Host machine       │
                           │                      │
┌─────────────────┐        │  ┌────────────────┐  │
│  Player device  │◄──────►│  │ Node.js server │  │
│  (browser)      │        │  │ (Express + WS) │  │
└─────────────────┘        │  └───────┬────────┘  │
                           │          │           │
┌─────────────────┐        │  ┌───────▼────────┐  │
│  Host dashboard │◄──────►│  │  SQLite DB     │  │
│  (browser)      │        │  └────────────────┘  │
└─────────────────┘        └──────────────────────┘
```

- **Backend**: Node.js with Express and a WebSocket layer (`ws` or `socket.io`) for live updates.
- **Database**: SQLite — a single file, no separate service to run.
- **Frontend**: Static HTML/CSS/JS served directly by the backend; no build step required for players.
- **Auth**: Host dashboard is protected by a single passphrase set at startup. Player pages are open to anyone on the LAN.

---

## Requirements

| Component | Minimum |
|-----------|---------|
| OS        | Linux, macOS, or Windows 10+ |
| Node.js   | 18 LTS or newer |
| RAM       | 256 MB free |
| Disk      | 100 MB |
| Network   | Wired or Wi-Fi LAN; all players on the same subnet |
| Browser   | Any modern browser on the client side (Chrome, Firefox, Safari, Edge) |

---

## Quick Start

```bash
git clone https://github.com/kylecaulfield/lan-party-voting-machine.git
cd lan-party-voting-machine
npm install
npm start
```

The server prints something like:

```
LAN Party Voting Machine running!
  Host dashboard:  http://192.168.1.20:3000/host
  Player join URL: http://192.168.1.20:3000
  Admin passphrase: hunter2
```

Share the player URL (or the QR code on the host screen) and start voting.

---

## Detailed Hosting Instructions

### Option 1: Local Host Machine (recommended for most LAN parties)

Run the app on the same machine you're using to host games, on a spare laptop, or on whichever box is already on the LAN.

**1. Install Node.js 18+**

- **Windows**: Download the LTS installer from [nodejs.org](https://nodejs.org) and run it. Reboot the terminal afterward.
- **macOS**: `brew install node@18` (or use the installer from nodejs.org).
- **Linux (Debian/Ubuntu)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

**2. Clone the repository**

```bash
git clone https://github.com/kylecaulfield/lan-party-voting-machine.git
cd lan-party-voting-machine
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure** (optional)

Copy the example environment file and edit to taste:

```bash
cp .env.example .env
```

Key variables:

```ini
PORT=3000
HOST=0.0.0.0              # must be 0.0.0.0 to accept LAN connections
ADMIN_PASSPHRASE=changeme # set before starting
DB_PATH=./data/votes.sqlite
```

**5. Start the server**

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

**6. Find your LAN IP**

- **Windows**: `ipconfig` — look for "IPv4 Address" on your active adapter.
- **macOS**: `ipconfig getifaddr en0` (or `en1` for Wi-Fi on older Macs).
- **Linux**: `hostname -I` or `ip -4 addr show`.

Share `http://<that-ip>:3000` with players.

**7. Keep it running**

Minimize the terminal window, or use a process manager:

```bash
npm install -g pm2
pm2 start npm --name "voting" -- start
pm2 save
pm2 startup   # follow printed instructions to launch on boot
```

---

### Option 2: Docker Container

If you prefer not to install Node.js directly:

**1. Install Docker**

- [Docker Desktop](https://www.docker.com/products/docker-desktop) for Windows/macOS
- On Linux: `curl -fsSL https://get.docker.com | sh`

**2. Build and run**

```bash
git clone https://github.com/kylecaulfield/lan-party-voting-machine.git
cd lan-party-voting-machine
docker build -t lan-voting .
docker run -d \
  --name lan-voting \
  -p 3000:3000 \
  -e ADMIN_PASSPHRASE=changeme \
  -v "$(pwd)/data:/app/data" \
  --restart unless-stopped \
  lan-voting
```

**3. Or use docker-compose**

```yaml
# docker-compose.yml
services:
  voting:
    build: .
    ports:
      - "3000:3000"
    environment:
      ADMIN_PASSPHRASE: changeme
      PORT: 3000
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

```bash
docker compose up -d
```

**4. Logs and management**

```bash
docker logs -f lan-voting
docker stop lan-voting
docker start lan-voting
```

---

### Option 3: Raspberry Pi / Dedicated Mini-Server

A Raspberry Pi 3 or newer makes an excellent always-on LAN voting server.

**1. Flash Raspberry Pi OS Lite** to an SD card using [Raspberry Pi Imager](https://www.raspberrypi.com/software/). Enable SSH during setup.

**2. SSH in and install Node.js**

```bash
ssh pi@raspberrypi.local
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

**3. Clone and install**

```bash
git clone https://github.com/kylecaulfield/lan-party-voting-machine.git
cd lan-party-voting-machine
npm install --omit=dev
```

**4. Create a systemd service**

```bash
sudo tee /etc/systemd/system/lan-voting.service > /dev/null <<'EOF'
[Unit]
Description=LAN Party Voting Machine
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/lan-party-voting-machine
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=ADMIN_PASSPHRASE=changeme
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now lan-voting
sudo systemctl status lan-voting
```

**5. Optional: reserve a static IP** on your router for the Pi, so the player URL is stable between parties.

---

### Option 4: Cloud / VPS Deployment

Only use this if your LAN party is distributed (remote friends joining over the internet). For a single-venue LAN party, local hosting is always faster and more private.

**1. Pick a provider** (DigitalOcean, Hetzner, Fly.io, Linode, etc.) and spin up the smallest Ubuntu droplet.

**2. Install and run**

```bash
ssh root@your-vps-ip
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs git nginx
git clone https://github.com/kylecaulfield/lan-party-voting-machine.git /opt/voting
cd /opt/voting
npm install --omit=dev
```

**3. Set up nginx as a reverse proxy with HTTPS**

```nginx
# /etc/nginx/sites-available/voting
server {
    listen 80;
    server_name vote.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/voting /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d vote.example.com
```

**4. Run the app as a systemd service** (same unit file as Option 3, adjusted for `/opt/voting`).

**5. Firewall** — allow 80 and 443 only; block 3000 from the public internet.

---

## Network Configuration

### Same subnet is required

Every player device must be able to reach the host machine's IP. On most home routers this is automatic, but note:

- **Guest Wi-Fi is often isolated** — devices on the guest network can't see devices on the main network. Put everyone on the same SSID.
- **AP isolation / client isolation** on some routers blocks device-to-device traffic. Disable it in router settings if players can see the page but can't submit votes.
- **Wired + wireless mixed networks** work fine as long as they share a subnet.

### Firewall rules

Allow inbound TCP on the configured port (default 3000) on the host machine.

- **Windows**:
  ```powershell
  New-NetFirewallRule -DisplayName "LAN Voting" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
  ```
- **macOS**: System Settings → Network → Firewall → allow incoming connections for Node.
- **Linux (ufw)**: `sudo ufw allow 3000/tcp`

### Finding the server easily

Options for making the URL memorable:

1. **Print the QR code** shown on the host dashboard and stick it on the wall.
2. **Use mDNS**: if Bonjour/Avahi is running, `http://hostname.local:3000` works on most devices.
3. **Assign a static DHCP lease** and announce a short URL like `http://10.0.0.10:3000`.

---

## Configuration Reference

All configuration is via environment variables (or `.env` file):

| Variable            | Default              | Description |
|---------------------|----------------------|-------------|
| `PORT`              | `3000`               | TCP port to listen on |
| `HOST`              | `0.0.0.0`            | Bind address; `0.0.0.0` exposes on LAN |
| `ADMIN_PASSPHRASE`  | *(required)*         | Passphrase for the host dashboard |
| `DB_PATH`           | `./data/votes.sqlite`| SQLite database file |
| `SESSION_SECRET`    | *(auto-generated)*   | Cookie signing secret |
| `ONE_VOTE_PER`      | `device`             | `device`, `ip`, or `none` |
| `MAX_POLL_OPTIONS`  | `20`                 | Safety limit per poll |
| `LOG_LEVEL`         | `info`               | `debug`, `info`, `warn`, `error` |

---

## Usage

1. **Open the host dashboard** at `/host` and enter the admin passphrase.
2. **Create a poll** — pick the question, add options, choose voting type.
3. **Open voting** — players see the poll appear on their devices immediately.
4. **Watch the live tally** on the host screen (great on a projector).
5. **Close voting** — results lock in and the winner is announced.
6. **Export** results as CSV or JSON from the history page.

---

## Troubleshooting

**Players can't reach the site**
- Confirm they're on the same Wi-Fi/LAN as the host.
- Check the host firewall allows port 3000.
- Disable AP isolation on the router.
- Try the host IP from the host machine's own browser first to confirm the server is up.

**Votes aren't updating live**
- WebSocket upgrade may be blocked. If behind a reverse proxy, ensure `Upgrade` and `Connection` headers are forwarded.
- Corporate/guest networks sometimes strip WebSocket traffic — switch SSIDs.

**"Port 3000 already in use"**
- Set `PORT=3001` (or any free port) in `.env` and restart.

**Forgot the admin passphrase**
- Stop the server, change `ADMIN_PASSPHRASE` in `.env`, restart.

**Database locked**
- Only one server process should run against a given `DB_PATH`. Stop duplicates.

---

## Contributing

Pull requests and issues are welcome. Please:

1. Fork and branch from `master`.
2. Run `npm test` and `npm run lint` before opening a PR.
3. Describe your change and, for UI work, include a screenshot.

---

## License

MIT — see [LICENSE](LICENSE) for details.
