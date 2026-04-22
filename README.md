# LAN-party-voting-machine
A voting machine for lan parties

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

Images are built for both `linux/amd64` and `linux/arm64`.

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
docker build -t lan-vote .
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
Logs**) — you should see:

```
🎮  Caulfield LAN Party Vote Server
════════════════════════════════════════
  Admin   → http://localhost:3000/admin.html
  Clients → http://<lan-ip>:3000/
  Display → http://<lan-ip>:3000/display.html
════════════════════════════════════════
```

### 8. First-time setup

- Open the **Admin** URL and log in with password `admin`
- Change the admin password from the panel immediately
- Open the **Display** URL on your TV / projector
- Have players scan the QR code shown in the admin panel

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
