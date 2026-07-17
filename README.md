<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Version-1.0.0-purple?style=for-the-badge" />
</p>

<h1 align="center">🖥️ HealthOS — System Diagnostics & Telemetry Dashboard</h1>

<p align="center">
  A premium, real-time system health monitoring dashboard that runs locally in your browser.<br/>
  Built with Node.js + Express on the backend and vanilla HTML/CSS/JS on the frontend — no frameworks, no cloud, no telemetry sent anywhere.
</p>

---

## ✨ What Is HealthOS?

**HealthOS** is a cross-platform desktop system monitoring tool inspired by the clean aesthetics of macOS and the deep diagnostics of tools like HWiNFO and Activity Monitor. It runs entirely on your local machine and exposes a beautiful dashboard at `http://localhost:4000`.

Everything is self-contained — no accounts, no subscriptions, no internet required after install.

---

## 🧩 Features

### 📊 Overview Dashboard
- **Live CPU Ring + Sparkline** — Real-time CPU load % with a 30-point history graph
- **Memory Usage Ring + Sparkline** — Active RAM usage with history trend
- **iPhone-style Segmented Storage Bar** — Color-coded breakdown of disk usage (Media, Apps, Docs, System, Other)
- **Ranked Largest Folders** — Top 6 home directories by size with relative mini-bars and one-click deep scan
- **Battery Status Card** — Charge %, charging state, cycle count (macOS)
- **Network Stats** — Live upload/download speeds
- **System Uptime & Hostname** — Always visible in the header
- **Global Health Rating** — Aggregate score based on CPU, RAM, disk, and temperature

### ⚙️ Process Manager
- Full list of running processes sorted by CPU or RAM
- **Kill Process** — Terminate any process by PID directly from the dashboard
- Live refresh every 2 seconds

### 📋 Event Logs
- Comprehensive system event report pulled from OS-level logs
- Filter by severity level (Info, Warning, Error, Critical)
- Full-text search across all events
- Color-coded severity badges

### 🗂️ Storage Prism *(formerly Space Sniffer)*
- Interactive treemap visualization of disk usage
- Scan any directory at configurable depth (1–5)
- File type category breakdown (Media, Docs, Apps, System, Other)
- One-click file deletion with system path protection
- Breadcrumb navigation and back/up button support

### 🔬 HW Sensors
- Real-time hardware sensor readings using macOS `powermetrics` + `system_profiler`
- CPU die temperature, GPU temperature, fan speeds
- Fused `sysfs`/`powermetrics` data for maximum accuracy
- Sensor health badges (Normal / Warm / Hot)

### 🤖 AI Advisor
- Built-in diagnostics assistant powered by a free local AI (no API key required for basic use)
- Optional Gemini API key support for cloud-powered responses
- Analyzes your live system snapshot and answers questions about errors, performance, and health
- Chat-style interface with message history

### 🧹 Temp Cleanup
- Scans your system's temporary files and caches
- Shows size breakdown before deletion
- One-click clean with a confirmation dialog
- Safe: only targets OS-designated temp directories

---

## 🖼️ Screenshots

> The dashboard automatically opens in your browser on `http://localhost:4000` after running `npm start`.

| Overview | Storage | Process Manager |
|----------|---------|-----------------|
| CPU, RAM, Disk, Battery at a glance | iPhone-style segmented storage bar | Kill processes in real time |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES Modules) |
| **System Telemetry** | [`systeminformation`](https://github.com/sebhildebrandt/systeminformation) |
| **Fonts** | Plus Jakarta Sans, JetBrains Mono (Google Fonts) |
| **AI** | Local fallback + optional Gemini API |
| **OS APIs** | `powermetrics` (macOS), `sysfs` (Linux), WMI (Windows) |

---

## 📋 Requirements

### All Platforms
| Requirement | Version |
|-------------|---------|
| **Node.js** | `18.0.0` or higher |
| **npm** | `8.0.0` or higher (comes with Node.js) |
| **RAM** | 256 MB minimum free |
| **Disk** | ~50 MB for the app + node_modules |
| **Browser** | Chrome 90+, Edge 90+, Firefox 88+, Safari 14+ |

---

## 🚀 Installation & Running

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/healthos.git
cd healthos
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the App

```bash
npm start
```

The dashboard will automatically open at **`http://localhost:4000`** in your default browser.

---

## 💻 Platform-Specific Notes

### 🍎 macOS

- **Full Disk Access** is recommended for complete storage scanning.
  - Go to: `System Settings → Privacy & Security → Full Disk Access`
  - Add **Terminal** (or your terminal app of choice)
- **CPU Temperature** requires `powermetrics`, which needs `sudo` — if temps show N/A, run with `sudo npm start`
- Battery info, fan speed, and GPU temp are all native via `powermetrics`

```bash
# For full sensor access (optional)
sudo npm start
```

### 🪟 Windows

- Run **Command Prompt or PowerShell as Administrator** for full sensor access
- `systeminformation` uses WMI for hardware data — ensure WMI service is running
- If temperature shows N/A, install [OpenHardwareMonitor](https://openhardwaremonitor.org/) and run it alongside HealthOS
- Windows Firewall may prompt you to allow Node.js on port 4000 — click **Allow**

```cmd
# Run as Administrator for full access
npm start
```

### 🐧 Linux

- **`lm-sensors`** must be installed for CPU temperature readings:
  ```bash
  # Ubuntu/Debian
  sudo apt install lm-sensors
  sudo sensors-detect

  # Fedora/RHEL
  sudo dnf install lm_sensors

  # Arch
  sudo pacman -S lm_sensors
  ```
- For full disk scanning, run with appropriate permissions or add your user to the `disk` group
- Some distributions may need `smartmontools` for drive health data:
  ```bash
  sudo apt install smartmontools   # Ubuntu/Debian
  ```

```bash
npm start
```

---

## ⚙️ Configuration

### Changing the Port

By default the app runs on port **4000**. To change it:

```bash
PORT=8080 npm start        # macOS / Linux
set PORT=8080 && npm start # Windows CMD
$env:PORT=8080; npm start  # Windows PowerShell
```

### AI Advisor — Gemini API Key (Optional)

The AI Advisor works out of the box with a free built-in local model. For more powerful responses, you can add a **Gemini API key**:

1. Get a free key at [Google AI Studio](https://aistudio.google.com/)
2. Open the dashboard → click the **⚙️ Settings** icon in the sidebar
3. Paste your API key and click Save

> Your key is stored **only in your browser's localStorage** — never sent to any server other than Google's Gemini API.

---

## 📁 Project Structure

```
healthos/
├── client/
│   ├── index.html      # Single-page app shell + all tab panels
│   ├── index.css       # Full design system (dark theme, animations, components)
│   └── index.js        # All frontend logic (telemetry, charts, storage, AI chat)
├── server/
│   ├── index.js        # Express server + API route definitions
│   └── systemInfo.js   # All OS data collection (CPU, RAM, disk, sensors, AI)
├── package.json
├── .gitignore
└── README.md
```

---

## 🔌 API Endpoints

All endpoints are local to your machine (`http://localhost:4000`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/system-status` | CPU, RAM, disk, battery, uptime, home folder usage |
| `GET` | `/api/network-status` | Upload/download speeds, interface info |
| `GET` | `/api/processes` | Running processes, sortable by CPU or RAM |
| `POST` | `/api/terminate-process` | Kill a process by PID |
| `GET` | `/api/events` | System event logs with filter support |
| `GET` | `/api/temp-storage` | Temp directory size scan |
| `POST` | `/api/clean-temp` | Clear temp/cache directories |
| `GET` | `/api/scan-disk` | Recursive directory tree scan |
| `POST` | `/api/diagnose` | AI Advisor — analyze system snapshot |
| `GET` | `/api/hwinfo-sensors` | Hardware sensor readings |
| `POST` | `/api/delete-file` | Securely delete a scanned file |

---

## 🔒 Privacy & Security

- ✅ **100% Local** — All data stays on your machine
- ✅ **No telemetry** — Nothing is tracked or sent anywhere
- ✅ **No accounts** — No sign-up required
- ✅ **File deletion guard** — The delete endpoint blocks system-level paths (`/System`, `/usr`, `/bin`, `/etc`, etc.)
- ✅ **Localhost only** — Server binds to `127.0.0.1` only, not accessible from other devices on the network

---

## 🐛 Troubleshooting

**App won't start / port in use**
> The server auto-retries on the next available port (4001, 4002, etc.). Check the terminal for the actual URL.

**Browser doesn't open automatically**
> Navigate manually to `http://localhost:4000`

**Temperature shows N/A**
> macOS: run with `sudo`. Windows: run as Administrator or install OpenHardwareMonitor. Linux: install `lm-sensors`.

**Storage bar stays solid blue**
> The server needs to finish scanning your home directory (~10–30 seconds on first load). The bar will update automatically.

**Disk scan is slow or times out**
> Try scanning a subdirectory instead of the full home folder. Use `depth=1` for a fast overview.

---

## 📜 License

MIT License — free to use, modify, and distribute.

---

<p align="center">Built with ❤️ — runs entirely on your machine.</p>
