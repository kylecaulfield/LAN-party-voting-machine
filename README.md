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
- **Version display** — admin header shows the running build's git SHA and links to the matching GitHub commit, with a live check for updates
- **Persistence** — game list, history, presets, password, and settings saved to `data.json`

## Project Structure

```
.
├── server.js              # Express + Socket.IO server and phase state machine
├── package.json
├── Dockerfile             # Production container image
├── .github/workflows/
│   └── docker.yml         # CI: build + push to ghcr.io on push to main
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

- Node.js 18+ (anything with modern Express/Socket.IO support)
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

If `PORT` is not set, the server defaults to **3000**.

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

## Docker

A production-ready container image is published to GitHub Container Registry
on every push to `main`:

```
ghcr.io/kylecaulfield/lan-party-voting-machine:latest
```

Tags published by the CI workflow:

| Tag                   | When |
|-----------------------|------|
| `latest`              | Every push to `main` |
| `main`                | Every push to `main` |
| `sha-<short-sha>`     | Every push (pin a specific build) |
| `vX.Y.Z`, `vX.Y`      | Tagged releases (`v*.*.*`) |

Images are built for both `linux/amd64` and `linux/arm64`. The build also
bakes the git SHA, ref, and build time into the image as environment
variables and OCI labels, so the admin page can show which commit is
running and compare it against the latest on `main`.

### Quick run (any Docker host)

```bash
# Create a host file for persistence (first time only)
mkdir -p /srv/lan-vote
touch    /srv/lan-vote/data.json

docker run -d \
  --name lan-vote \
  --network host \
  -e PORT=3000 \
  -v /srv/lan-vote/data.json:/app/data.json \
  --restart unless-stopped \
  ghcr.io/kylecaulfield/lan-party-voting-machine:latest
```

> **Why `--network host`?** The app generates a QR code from the container's
> first non-loopback IPv4 address. With Docker's default bridge network this
> becomes an internal address (e.g. `172.17.0.2`) that phones on your LAN
> cannot reach. Host networking exposes the LAN IP directly so the QR code
> works out of the box. If you must use bridge mode, you'll need to hand out
> the host IP to players manually.

Then open:

- `http://<host-ip>:3000/admin.html` — admin panel (default password: `admin`)
- `http://<host-ip>:3000/` — player view (or scan the QR code in the admin panel)
- `http://<host-ip>:3000/display.html` — big-screen view

### Build locally

```bash
docker build \
  --build-arg GIT_SHA=$(git rev-parse HEAD) \
  --build-arg GIT_REF=$(git rev-parse --abbrev-ref HEAD) \
  -t lan-vote .
docker run --rm -p 3000:3000 lan-vote
```

---

## Hosting on Unraid

The following walks through adding the container via Unraid's built-in Docker
manager. No Community Applications template is required — everything is
configured by hand from the published GHCR image.

### 1. Prepare a persistent data file

Unraid convention is to keep container state under `/mnt/user/appdata/`.
Open a terminal (**Tools → Terminal** from the Unraid webUI) and run:

```bash
mkdir -p /mnt/user/appdata/lan-vote
touch    /mnt/user/appdata/lan-vote/data.json
chown -R 1001:1001 /mnt/user/appdata/lan-vote
chmod 664          /mnt/user/appdata/lan-vote/data.json
```

The `chown` matches the non-root `nodejs` user baked into the image (UID/GID
`1001`). Without it the container will be unable to write the file and state
(game list, history, presets, admin password) will not persist across
restarts.

### 2. Add the container

1. In the Unraid webUI go to the **Docker** tab and click **Add Container**.
2. Switch the **Template** selector to **none** (top of the dropdown) so you
   can fill the fields manually.
3. Fill in the fields as below:

| Field | Value |
|-------|-------|
| **Name** | `lan-vote` |
| **Repository** | `ghcr.io/kylecaulfield/lan-party-voting-machine:latest` |
| **Network Type** | `Host` *(recommended — see note in the Docker section above)* |
| **Console shell command** | `Shell` |
| **Privileged** | `Off` |
| **Icon URL** *(optional)* | any 256×256 PNG you like |

### 3. Add a port mapping

Only needed if you selected a bridge-style network instead of **Host**.
Click **Add another Path, Port, Variable, Label or Device** and choose
**Port**:

| Field | Value |
|-------|-------|
| Config Type | `Port` |
| Name | `WebUI` |
| Container Port | `3000` |
| Host Port | `3000` |
| Connection Type | `TCP` |

With **Host** networking the container listens on `3000` directly and no
mapping is required.

### 4. Add the persistence path

Click **Add another Path, Port, Variable, Label or Device** and choose
**Path**:

| Field | Value |
|-------|-------|
| Config Type | `Path` |
| Name | `Data file` |
| Container Path | `/app/data.json` |
| Host Path | `/mnt/user/appdata/lan-vote/data.json` |
| Access Mode | `Read/Write` |

### 5. Add environment variables

Click **Add another Path, Port, Variable, Label or Device** and choose
**Variable**:

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `3000` | Port the Node process listens on |
| `NODE_ENV` | `production` | Optional; already set in the image |

### 6. Set the WebUI link

Scroll down and set **WebUI** to:

```
http://[IP]:[PORT:3000]/admin.html
```

This makes the "WebUI" link on the Docker tab open the admin panel directly.

### 7. Apply

Click **Apply**. Unraid will pull the image from GHCR and start the
container. On first start, watch the logs (**Docker tab → lan-vote →
Logs**).

### 8. First-time setup

- Open the **Admin** URL and log in with password `admin`
- Change the admin password from the panel immediately
- Open the **Display** URL on your TV / projector
- Have players scan the QR code shown in the admin panel
- The admin header shows the running build's version + git SHA, with a
  **✓ latest** or **↑ update available** indicator next to it

### Updating

Unraid's **Docker → Check for updates** will detect new `latest` pushes from
the CI pipeline. Click **update ready** on the container row to pull and
restart. State in `/mnt/user/appdata/lan-vote/data.json` is preserved.

To pin a specific build instead of `latest`, edit the container and replace
the tag with a `sha-<short-sha>` or `vX.Y.Z` tag from the
[Packages page](https://github.com/kylecaulfield/LAN-party-voting-machine/pkgs/container/lan-party-voting-machine).

### Troubleshooting

- **QR code points to `172.x.x.x` or `localhost`** — you are not using host
  networking. Either switch the container to **Host** network mode or
  distribute the Unraid server's LAN IP to players manually.
- **Permission denied writing `data.json`** — the host file isn't owned by
  UID 1001. Re-run the `chown` command from step 1.
- **Port 3000 already in use** — change the `PORT` environment variable and
  (in bridge mode) the host port mapping to something free like `3030`.
- **`latest` image not updating** — Unraid caches image digests; click
  **Force Update** on the container or run `docker pull
  ghcr.io/kylecaulfield/lan-party-voting-machine:latest` from a terminal.

---

## Configuration & Persistence

State is written to `data.json` in the project root (`/app/data.json` inside
the container) and reloaded on startup. If the file does not exist at boot
the server creates it with defaults.

Persisted fields:

- `history` — last 100 round results
- `presets` — saved game-list presets
- `adminPassword` — current admin password
- `settings.defaultTimer`, `settings.minVoters`
- `games` — current game list (name, emoji, played flag)

`data.json` is gitignored. Delete it to reset everything.

## Environment Variables

| Variable     | Default        | Description |
|--------------|----------------|-------------|
| `PORT`       | `3000`         | HTTP port the server listens on |
| `NODE_ENV`   | `production`   | Standard Node env flag |
| `GIT_SHA`    | *(unset)*      | Set by Docker build; shown on the admin page and linked to GitHub |
| `GIT_REF`    | *(unset)*      | Set by Docker build; the branch or tag the image was built from |
| `BUILD_TIME` | *(unset)*      | Set by Docker build; ISO-8601 build timestamp |
| `REPO_URL`   | repo URL       | Used to build the commit link shown on the admin page |

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
