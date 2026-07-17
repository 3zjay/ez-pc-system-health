<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Version-1.0.0-purple?style=for-the-badge" />
</p>

<h1 align="center">🖥️ EZ PC System Health</h1>
<h3 align="center">System Diagnostics & Telemetry Dashboard</h3>

<p align="center">
  A premium, real-time system health monitoring dashboard that runs locally in your browser.<br/>
  Built with Node.js + Express on the backend and vanilla HTML/CSS/JS on the frontend.<br/>
  <strong>No frameworks. No cloud. No telemetry sent anywhere.</strong>
</p>

---

## ✨ What Is EZ PC System Health?

**EZ PC System Health** is a cross-platform desktop system monitoring tool inspired by the clean aesthetics of macOS and the deep diagnostics of tools like HWiNFO and Activity Monitor. It runs entirely on your local machine and opens a beautiful dashboard at `http://localhost:4000` automatically.

Everything is self-contained — no accounts, no subscriptions, no internet required after install.

---

## 🧩 Features

### 📊 Overview Dashboard
- **Live CPU Ring + Sparkline** — Real-time CPU load % with a 30-point history graph
- **Memory Usage Ring + Sparkline** — Active RAM usage with history trend
- **iPhone-style Segmented Storage Bar** — Color-coded disk breakdown (Media, Apps, Docs, System, Other)
- **Ranked Largest Folders** — Top 6 home directories by size with relative mini-bars and one-click deep scan
- **Battery Status Card** — Charge %, charging state, cycle count (macOS/laptops)
- **Network Stats** — Live upload/download speeds
- **System Uptime & Hostname** — Always visible in the header
- **Global Health Score** — Aggregate rating based on CPU, RAM, disk, and temperature

### ⚙️ Process Manager
- Full list of running processes sorted by CPU or RAM
- **Kill Process** — Terminate any process by PID directly from the dashboard
- Auto-refreshes every 2 seconds

### 📋 Event Logs
- Comprehensive system event report pulled from OS-level logs
- Filter by severity level: Info, Warning, Error, Critical
- Full-text search across all events
- Color-coded severity badges

### 🗂️ Storage Prism
- Interactive treemap visualization of your disk usage
- Scan any directory at configurable depth (1–5)
- File type category breakdown: Media, Docs, Apps, System, Other
- One-click file deletion with built-in system path protection
- Breadcrumb navigation + back/up button support

### 🔬 HW Sensors
- Real-time hardware sensor readings
- CPU die temperature, GPU temperature, fan speeds
- Uses macOS `powermetrics` + `system_profiler` or Linux `sysfs`
- Sensor health badges: Normal / Warm / Hot

### 🤖 AI Advisor
- Built-in diagnostics assistant — **no API key required** for basic use
- Optional Gemini API key for more powerful cloud responses
- Analyzes your live system snapshot and answers questions about errors, performance, and health
- Chat-style interface with full conversation history

### 🧹 Temp Cleanup
- Scans your system's temporary files and caches
- Shows size breakdown before deletion
- One-click clean with confirmation dialog
- Safe: only targets OS-designated temp directories

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES Modules) |
| **System Data** | [`systeminformation`](https://github.com/sebhildebrandt/systeminformation) |
| **Fonts** | Plus Jakarta Sans, JetBrains Mono (Google Fonts) |
| **AI** | Local fallback + optional Gemini API |
| **OS APIs** | `powermetrics` (macOS), `sysfs` (Linux), WMI (Windows) |

---

## 📋 Requirements

### All Platforms
| Requirement | Version |
|-------------|---------|
| **Node.js** | `18.0.0` or higher |
| **npm** | `8.0.0` or higher (bundled with Node.js) |
| **RAM** | 256 MB minimum free |
| **Disk** | ~50 MB for app + node_modules |
| **Browser** | Chrome 90+, Edge 90+, Firefox 88+, Safari 14+ |

---

## 🚀 Quick Start (All Platforms)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/ez-pc-system-health.git
cd ez-pc-system-health
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the App

```bash
npm start
```

> The dashboard opens automatically at **`http://localhost:4000`**

---

## 💻 Platform-Specific Setup

### 🍎 macOS

Works out of the box. For full sensor access (CPU temp, fan speed, GPU temp):

```bash
# Run with elevated permissions for temperature sensors
sudo npm start
```

**Full Disk Access (for complete storage scanning):**
1. Open `System Settings → Privacy & Security → Full Disk Access`
2. Add your **Terminal** app (Terminal.app or iTerm2)

---

### 🪟 Windows

**The easiest way — one script does everything:**

> ✅ Checks for Node.js, installs it if missing (via winget)  
> ✅ Refreshes PATH automatically — no need to close and reopen the terminal  
> ✅ Checks for Git, installs it if missing  
> ✅ Runs `npm install` automatically  
> ✅ Launches the app and opens your browser  

**Option A — Double-click (simplest):**
1. Download / clone the repo
2. Double-click **`setup.bat`**
3. Done — the dashboard opens at `http://localhost:4000`

**Option B — PowerShell:**
1. Right-click **`setup.ps1`** → **Run with PowerShell**
   *(If blocked, open PowerShell and run:)*
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\setup.ps1
   ```

> Both scripts use **winget** (Windows Package Manager — built into Windows 10 21H1+ and all of Windows 11) to auto-install Node.js and Git.

**Option C — Manual install (PowerShell / CMD):**

If you prefer to install manually or the scripts don't work for you:

```powershell
# 1. Install Node.js LTS (skip if already installed)
winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements

# 2. Open a NEW PowerShell/CMD window so Node.js is on your PATH, then:
cd C:\path\to\ez-pc-system-health

# 3. Install dependencies
npm install

# 4. Launch the app
npm start
```

> **Important — PATH refresh:** After winget installs Node.js, the **current terminal session** won't see `node` or `npm` on the PATH yet.  
> The setup scripts handle this automatically by re-reading the PATH from the Windows registry.  
> If you are running commands manually, simply **open a new terminal window** after installation and run `npm install` / `npm start` from there.

**Running the app in future sessions:**
```powershell
# Open PowerShell in the project folder, then:
npm start
# Dashboard opens at http://localhost:4000
```

**If temperature sensors show N/A:**
- Download and run [OpenHardwareMonitor](https://openhardwaremonitor.org/) *before* launching EZ PC System Health — it exposes sensor data that the app can read
- Keep OpenHardwareMonitor running in the background

**Windows Firewall:**
- If prompted, click **Allow** to let Node.js use port 4000

---

### 🐧 Linux

Install `lm-sensors` for CPU temperature:

```bash
# Ubuntu / Debian
sudo apt install lm-sensors
sudo sensors-detect

# Fedora / RHEL
sudo dnf install lm_sensors

# Arch Linux
sudo pacman -S lm_sensors
```

Then run:
```bash
npm start
```

For drive health data (optional):
```bash
sudo apt install smartmontools
```

---

## ⚙️ Configuration

### Change the Port

Default port is **4000**. To use a different port:

```bash
# macOS / Linux
PORT=8080 npm start

# Windows CMD
set PORT=8080 && npm start

# Windows PowerShell
$env:PORT=8080; npm start
```

### AI Advisor — Optional Gemini API Key

The AI Advisor works out of the box with a built-in local model. To enable more powerful responses:

1. Get a **free** key at [Google AI Studio](https://aistudio.google.com/)
2. Open the dashboard → click **⚙️ Settings** in the sidebar
3. Paste your API key and click Save

> Your key is stored **only in your browser's localStorage** — never sent anywhere except Google's Gemini API.

---

## 📁 Project Structure

```
ez-pc-system-health/
├── client/
│   ├── index.html      # Single-page app — all tab panels
│   ├── index.css       # Design system (dark theme, animations, components)
│   └── index.js        # Frontend logic (telemetry, charts, storage, AI chat)
├── server/
│   ├── index.js        # Express server + all API route definitions
│   └── systemInfo.js   # OS data collection (CPU, RAM, disk, sensors, AI)
├── package.json
├── .gitignore
└── README.md
```

---

## 🔌 API Reference

All endpoints are local only (`http://localhost:4000`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/system-status` | CPU, RAM, disk, battery, uptime, home folder sizes |
| `GET` | `/api/network-status` | Upload/download speeds, interface info |
| `GET` | `/api/processes` | Running processes, sortable by CPU or RAM |
| `POST` | `/api/terminate-process` | Kill a process by PID |
| `GET` | `/api/events` | System event logs with search + level filter |
| `GET` | `/api/temp-storage` | Temp directory size scan |
| `POST` | `/api/clean-temp` | Clear temp/cache directories |
| `GET` | `/api/scan-disk` | Recursive directory tree scan |
| `POST` | `/api/diagnose` | AI Advisor — analyze system snapshot |
| `GET` | `/api/hwinfo-sensors` | Hardware sensor readings |
| `POST` | `/api/delete-file` | Securely delete a scanned file |

---

## 🔒 Privacy & Security

| | |
|--|--|
| ✅ **100% Local** | All data stays on your machine |
| ✅ **No telemetry** | Nothing tracked or sent anywhere |
| ✅ **No accounts** | No sign-up required |
| ✅ **File delete guard** | Blocks system paths (`/System`, `/usr`, `/bin`, `/etc`, etc.) |
| ✅ **Localhost only** | Server binds to `127.0.0.1` — not exposed to your network |

---

## 🐛 Troubleshooting

**App won't start / port already in use**
> The server auto-retries on the next port (4001, 4002…). Check the terminal for the actual URL.

**Browser doesn't open automatically**
> Navigate manually to `http://localhost:4000`

**Temperature shows N/A**
> macOS: use `sudo npm start`. Windows: run as Administrator or install OpenHardwareMonitor. Linux: install `lm-sensors`.

**Storage bar stays solid blue on load**
> The server scans your home directory on first startup (10–30 seconds). The segmented bar updates automatically once scanning completes.

**Directory scan is slow**
> Try scanning a subdirectory instead of your full home folder, or reduce scan depth in the Storage Prism settings.

---

## 📜 License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<p align="center">
  <strong>EZ PC System Health</strong> — runs entirely on your machine. No cloud. No nonsense.
</p>
