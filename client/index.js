// State caches
const cpuHistory = [];
const ramHistory = [];
let cleanupData = null;
let currentTab = 'tab-overview';
let telemetryIntervalId = null;
let activeDirectoryTree = null;
let activeDirectoryPath = '';
let scanHistoryStack = [];
const chatHistory = [];

// Configs
const HISTORY_LIMIT = 30;
const CIRCLE_CIRCUMFERENCE = 251.2;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupSidebarNavigation();
  setupSettingsModal();
  setupProcessManager();
  setupLogSearch();
  setupCleanup();
  setupSpaceSniffer();
  setupAiAdvisor();
  setupHWInfoSensors();
  
  // Initial telemetry loads
  fetchTelemetry();
  fetchNetwork();
  fetchProcesses();
  updateKeyStatusBadge();
  
  // Start polling
  telemetryIntervalId = setInterval(() => {
    fetchTelemetry();
    fetchNetwork();
    
    // Auto refresh process list if active
    if (currentTab === 'tab-processes') {
      fetchProcesses();
    } else if (currentTab === 'tab-hwinfo') {
      fetchHWInfoSensors();
    }
  }, 2000);
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg class="btn-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg class="btn-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
  } else {
    iconSvg = `<svg class="btn-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;
  }

  toast.innerHTML = `${iconSvg} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Sparkline graph drawing
function updateSparkline(lineId, areaId, data) {
  const line = document.getElementById(lineId);
  const area = document.getElementById(areaId);
  if (!line || !area) return;

  const width = 300;
  const height = 80;
  
  const points = [...data];
  while (points.length < HISTORY_LIMIT) {
    points.unshift(0);
  }
  
  const stepX = width / (HISTORY_LIMIT - 1);
  let linePath = '';
  let areaPath = '';

  points.forEach((val, idx) => {
    const x = idx * stepX;
    const y = height - (val / 100) * (height - 8) - 4;
    
    if (idx === 0) {
      linePath += `M ${x} ${y}`;
      areaPath += `M ${x} ${height} L ${x} ${y}`;
    } else {
      linePath += ` L ${x} ${y}`;
      areaPath += ` L ${x} ${y}`;
    }
  });

  areaPath += ` L ${width} ${height} Z`;

  line.setAttribute('d', linePath);
  area.setAttribute('d', areaPath);
}

// Update circular progress ring
function setRingProgress(ringId, textId, percent) {
  const ring = document.getElementById(ringId);
  const text = document.getElementById(textId);
  if (!ring || !text) return;

  const offset = CIRCLE_CIRCUMFERENCE - (percent / 100) * CIRCLE_CIRCUMFERENCE;
  ring.style.strokeDashoffset = offset;
  text.textContent = Math.round(percent);
}

// Setup Sidebar Navigation
function setupSidebarNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const viewTitle = document.getElementById('view-title');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      currentTab = tabId;
      
      // Update nav highlights
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // Update view title
      viewTitle.textContent = item.textContent.trim();
      
      // Update panel visibility
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');

      // Auto trigger loads on navigation
      if (tabId === 'tab-processes') {
        fetchProcesses();
      } else if (tabId === 'tab-cleanup' && !cleanupData) {
        scanCleanup();
      } else if (tabId === 'tab-hwinfo') {
        fetchHWInfoSensors();
      }
    });
  });
}

// Setup Gemini Settings Modal
function setupSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const openBtn = document.getElementById('sidebar-settings-btn');
  const closeBtn = document.getElementById('settings-close-btn');
  const cancelBtn = document.getElementById('settings-cancel-btn');
  const saveBtn = document.getElementById('settings-save-btn');
  const keyInput = document.getElementById('settings-key-input');

  openBtn.addEventListener('click', () => {
    // Fill existing key
    keyInput.value = localStorage.getItem('gemini_api_key') || '';
    modal.classList.add('active');
  });

  const closeModal = () => modal.classList.remove('active');
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  saveBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      showToast('Gemini API Key saved successfully.', 'success');
    } else {
      localStorage.removeItem('gemini_api_key');
      showToast('Gemini API Key removed.', 'info');
    }
    updateKeyStatusBadge();
    closeModal();
  });
}

async function updateKeyStatusBadge() {
  const key = localStorage.getItem('gemini_api_key');
  const badge = document.getElementById('sidebar-key-status');
  const chatInput = document.getElementById('ai-chat-input');
  const chatSend = document.getElementById('ai-chat-send');

  if (chatInput) chatInput.disabled = false;
  if (chatSend) chatSend.disabled = false;

  if (key) {
    badge.innerHTML = `<span class="status-dot pulsing" style="background-color: var(--accent-green); box-shadow: 0 0 6px var(--accent-green)"></span> Gemini Cloud AI`;
    badge.style.color = 'var(--text-main)';
  } else {
    // Check if Ollama is active locally
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          badge.innerHTML = `<span class="status-dot pulsing" style="background-color: var(--accent-purple); box-shadow: 0 0 6px var(--accent-purple)"></span> Ollama Local AI`;
          badge.style.color = 'var(--text-main)';
          return;
        }
      }
    } catch (e) {
      // Ollama is offline
    }
    badge.innerHTML = `<span class="status-dot pulsing" style="background-color: var(--accent-orange); box-shadow: 0 0 6px var(--accent-orange)"></span> Heuristic Engine`;
    badge.style.color = 'var(--text-muted)';
  }
}

// Telemetry operations
async function fetchTelemetry() {
  try {
    const response = await fetch('/api/system-status');
    const data = await response.json();
    
    if (data.error) throw new Error(data.error);

    // Update Header
    document.getElementById('header-hostname').textContent = data.os.hostname;
    document.getElementById('header-uptime').textContent = data.os.uptimeFormatted;

    // CPU Brand & Stats
    document.getElementById('cpu-brand').textContent = data.cpu.brand;
    document.getElementById('cpu-cores-val').textContent = `${data.cpu.physicalCores} Cores / ${data.cpu.cores} Threads`;
    document.getElementById('cpu-speed-val').textContent = `${data.cpu.speed} GHz`;
    
    const tempVal = document.getElementById('cpu-temp-val');
    if (data.cpu.temperature !== null) {
      tempVal.textContent = `${Math.round(data.cpu.temperature)} °C`;
      if (data.cpu.temperature > 80) tempVal.style.color = 'var(--accent-red)';
      else if (data.cpu.temperature > 65) tempVal.style.color = 'var(--accent-orange)';
      else tempVal.style.color = 'var(--accent-green)';
    } else {
      tempVal.textContent = 'N/A';
      tempVal.style.color = 'var(--text-muted)';
    }

    // CPU ring & sparkline
    setRingProgress('cpu-ring', 'cpu-load-val', data.cpu.loadPercentage);
    cpuHistory.push(data.cpu.loadPercentage);
    if (cpuHistory.length > HISTORY_LIMIT) cpuHistory.shift();
    updateSparkline('cpu-chart-line', 'cpu-chart-area', cpuHistory);

    // Memory Card
    const totalGB = (data.memory.total / (1024 * 1024 * 1024)).toFixed(1);
    const usedGB = (data.memory.used / (1024 * 1024 * 1024)).toFixed(1);
    const freeGB = (data.memory.free / (1024 * 1024 * 1024)).toFixed(1);
    
    document.getElementById('ram-used-val').textContent = `${usedGB} GB`;
    document.getElementById('ram-free-val').textContent = `${freeGB} GB`;
    document.getElementById('ram-total-val').textContent = `${totalGB} GB`;

    setRingProgress('ram-ring', 'ram-load-val', data.memory.usePercentage);
    ramHistory.push(data.memory.usePercentage);
    if (ramHistory.length > HISTORY_LIMIT) ramHistory.shift();
    updateSparkline('ram-chart-line', 'ram-chart-area', ramHistory);

    // Pre-compute storage breakdown from server-provided home usage data
    // so renderStorage() can build the segmented bar on every tick
    cacheStorageBreakdownFromTelemetry(data.homeUsage, data.disks);

    // Storage disks (reads the cached breakdown above)
    renderStorage(data.disks, data.heaviestFolder);

    // Global Health assessment
    updateGlobalHealthRating(data);

    // Battery status
    const batteryCard = document.getElementById('card-battery');
    if (data.battery.hasBattery) {
      batteryCard.style.display = 'block';
      document.getElementById('battery-status-lbl').textContent = data.battery.isCharging ? 'Charging' : 'On Battery Power';
      
      const fill = document.getElementById('battery-fill');
      fill.style.width = `${data.battery.percent}%`;
      
      if (data.battery.percent <= 15) {
        fill.style.background = 'linear-gradient(90deg, var(--accent-red), #ff4d4d)';
      } else if (data.battery.percent <= 30) {
        fill.style.background = 'linear-gradient(90deg, var(--accent-orange), #ffaa44)';
      } else {
        fill.style.background = 'linear-gradient(90deg, var(--accent-green), #34d399)';
      }
      
      document.getElementById('battery-text').textContent = `${data.battery.percent}%`;
      
      let stateText = data.battery.isCharging ? 'Charging' : 'Discharging';
      if (data.battery.percent === 100 && data.battery.acConnected) {
        stateText = 'Full (AC Powered)';
      }
      document.getElementById('battery-state').textContent = stateText;
      document.getElementById('battery-cycles').textContent = data.battery.cycleCount || 'N/A';
    } else {
      document.getElementById('battery-status-lbl').textContent = 'AC Power Only';
      const fill = document.getElementById('battery-fill');
      fill.style.width = `100%`;
      fill.style.background = 'linear-gradient(90deg, var(--accent-blue), #3b82f6)';
      document.getElementById('battery-text').textContent = '100%';
      document.getElementById('battery-state').textContent = 'Stationary Desktop';
      document.getElementById('battery-cycles').textContent = 'N/A';
    }

  } catch (err) {
    console.error('Failed to query telemetry status:', err.message);
  }
}

// Global Uptime Health Rating logic
function updateGlobalHealthRating(telemetry) {
  const headerStatus = document.getElementById('header-status');
  if (!headerStatus) return;

  let score = 100;
  
  if (telemetry.cpu.loadPercentage > 85) score -= 25;
  if (telemetry.cpu.temperature && telemetry.cpu.temperature > 80) score -= 30;
  if (telemetry.memory.usePercentage > 90) score -= 20;

  // Check storage usage
  const heavyDisk = telemetry.disks.find(d => d.usePercentage > 90);
  if (heavyDisk) score -= 15;

  let statusText = 'Excellent';
  let color = 'var(--accent-green)';
  
  if (score < 50) {
    statusText = 'Critical';
    color = 'var(--accent-red)';
  } else if (score < 75) {
    statusText = 'Warning';
    color = 'var(--accent-orange)';
  } else if (score < 90) {
    statusText = 'Good';
    color = 'var(--accent-blue)';
  }

  headerStatus.innerHTML = `<span class="status-dot pulsing" style="background-color: ${color}; box-shadow: 0 0 6px ${color}"></span> ${statusText}`;
  headerStatus.style.color = color;
}

// Fetch network speeds
async function fetchNetwork() {
  try {
    const response = await fetch('/api/network-status');
    const data = await response.json();

    if (data.error) throw new Error(data.error);

    if (data.length > 0) {
      const primary = data[0];
      document.getElementById('net-interface-lbl').textContent = `Interface: ${primary.interface} (${primary.type})`;
      document.getElementById('net-down-val').textContent = primary.rxFormatted;
      document.getElementById('net-up-val').textContent = primary.txFormatted;
      document.getElementById('net-ip').textContent = primary.ip4;
      document.getElementById('net-mac').textContent = primary.mac;
    } else {
      document.getElementById('net-interface-lbl').textContent = 'Disconnected';
      document.getElementById('net-down-val').textContent = '0 Bytes/s';
      document.getElementById('net-up-val').textContent = '0 Bytes/s';
      document.getElementById('net-ip').textContent = 'N/A';
      document.getElementById('net-mac').textContent = 'N/A';
    }
  } catch (err) {
    console.error('Failed to query network status:', err.message);
  }
}

// Render storage partition rows
// Render storage partition rows with a human-friendly hero volume card and cleanable cache widgets
let cachedTempSizeText = null;

async function fetchTempStorageOverview(callback) {
  if (cachedTempSizeText) {
    if (callback) callback(cachedTempSizeText);
    return;
  }
  try {
    const res = await fetch('/api/temp-storage');
    const data = await res.json();
    if (data.totalFormatted) {
      cachedTempSizeText = data.totalFormatted;
      if (callback) callback(cachedTempSizeText);
    }
  } catch (err) {
    console.warn('Failed to query temp storage for overview:', err.message);
  }
}

function renderStorage(disks, heaviestFolder) {
  window.lastDisksData = disks;
  const container = document.getElementById('storage-container');
  if (!container) return;

  if (disks.length === 0) {
    container.innerHTML = '<div class="text-center">No disks detected.</div>';
    return;
  }

  const primaryDisk = disks.find(d => d.mount === '/' || d.mount.toLowerCase().includes('c:')) || disks[0];

  const totalGB = (primaryDisk.total / (1024 * 1024 * 1024)).toFixed(1);
  const freeGB = (primaryDisk.available / (1024 * 1024 * 1024)).toFixed(1);
  const usedBytes = primaryDisk.total - primaryDisk.available;
  const usedPct = ((usedBytes / primaryDisk.total) * 100).toFixed(1);

  // Build segmented bar — use pre-computed breakdown if ready, else show plain used bar
  let barHtml = '';
  let legendHtml = '';

  if (window.lastStorageBreakdown && window.lastStorageBreakdownTotal > 0) {
    const bd = window.lastStorageBreakdown;
    const total = primaryDisk.total;

    const mediaPct   = Math.min(100, (bd.media  / total) * 100).toFixed(1);
    const appsPct    = Math.min(100, (bd.apps   / total) * 100).toFixed(1);
    const docsPct    = Math.min(100, (bd.docs   / total) * 100).toFixed(1);
    const systemPct  = Math.min(100, (bd.system / total) * 100).toFixed(1);
    const otherPct   = Math.min(100, (bd.other  / total) * 100).toFixed(1);

    barHtml = `
      <div class="iphone-segment media"  style="width:${mediaPct}%;"  title="Media: ${formatBytes(bd.media)}"></div>
      <div class="iphone-segment apps"   style="width:${appsPct}%;"   title="Apps & Archives: ${formatBytes(bd.apps)}"></div>
      <div class="iphone-segment docs"   style="width:${docsPct}%;"   title="Documents: ${formatBytes(bd.docs)}"></div>
      <div class="iphone-segment system" style="width:${systemPct}%;" title="System & Code: ${formatBytes(bd.system)}"></div>
      <div class="iphone-segment other"  style="width:${otherPct}%;"  title="Other Used Space: ${formatBytes(bd.other)}"></div>
    `;
    legendHtml = `
      <div class="iphone-legend-item"><span class="iphone-legend-dot" style="background:#f43f5e;"></span><span>Media (${formatBytes(bd.media)})</span></div>
      <div class="iphone-legend-item"><span class="iphone-legend-dot" style="background:#a855f7;"></span><span>Apps (${formatBytes(bd.apps)})</span></div>
      <div class="iphone-legend-item"><span class="iphone-legend-dot" style="background:#f97316;"></span><span>Docs (${formatBytes(bd.docs)})</span></div>
      <div class="iphone-legend-item"><span class="iphone-legend-dot" style="background:#0084ff;"></span><span>System (${formatBytes(bd.system)})</span></div>
      <div class="iphone-legend-item"><span class="iphone-legend-dot" style="background:#6b7280;"></span><span>Other (${formatBytes(bd.other)})</span></div>
    `;
  } else {
    barHtml = `<div class="iphone-segment other" style="width:${usedPct}%; background: rgba(0,132,255,0.65);"></div>`;
    legendHtml = `
      <div class="iphone-legend-item">
        <span class="iphone-legend-dot" style="background:rgba(0,132,255,0.65);"></span>
        <span>Calculating breakdown…</span>
      </div>
    `;
  }

  // Build space hog section — use the cached homeUsage list if available
  let spaceHogHtml = '';
  const topFolders = window.lastHomeUsageCache;
  if (topFolders && topFolders.length > 0) {
    const maxVal = topFolders[0].value;
    const rows = topFolders.slice(0, 6).map((f, i) => {
      const barW = ((f.value / maxVal) * 100).toFixed(1);
      const rankColor = i === 0 ? '#f43f5e' : i === 1 ? '#f97316' : '#a855f7';
      return `
        <div style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0; border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="font-size:0.7rem; font-weight:800; color:${rankColor}; min-width:16px;">#${i+1}</span>
          <div style="flex:1; overflow:hidden;">
            <div style="font-size:0.78rem; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.name}</div>
            <div style="height:3px; background:rgba(255,255,255,0.07); border-radius:2px; margin-top:3px;">
              <div style="height:3px; border-radius:2px; background:${rankColor}; width:${barW}%;"></div>
            </div>
          </div>
          <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted); white-space:nowrap;">${f.valueFormatted}</span>
          <button style="background:none; border:1px solid rgba(255,255,255,0.12); border-radius:4px; color:var(--text-muted); font-size:0.65rem; padding:2px 6px; cursor:pointer;"
            onclick="analyzeHeaviestFolderPrism('${f.path.replace(/'/g, "\\'")}')">Scan</button>
        </div>
      `;
    }).join('');
    spaceHogHtml = `
      <div style="margin-top:0.5rem;">
        <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:0.4rem;">Largest Folders</div>
        ${rows}
      </div>
    `;
  } else if (heaviestFolder) {
    spaceHogHtml = `
      <div style="background:rgba(0,132,255,0.04); border:1px solid rgba(0,132,255,0.15); padding:0.8rem; border-radius:8px; font-size:0.8rem; margin-top:0.5rem;">
        <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; color:var(--text-muted);">Largest Folder</div>
        <div style="font-weight:700; color:#fff; margin-top:0.3rem;">${heaviestFolder.name}</div>
        <div style="color:var(--accent-blue); font-size:0.75rem;">${heaviestFolder.valueFormatted}</div>
        <button class="btn btn-primary btn-small" style="margin-top:0.5rem; width:100%;"
          onclick="analyzeHeaviestFolderPrism('${heaviestFolder.path.replace(/'/g, "\\'")}')">Scan in Storage Prism</button>
      </div>
    `;
  } else {
    spaceHogHtml = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; margin-top:0.5rem; padding:0.5rem;">Scanning folders…</div>`;
  }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:0.6rem; padding:0.3rem 0;">
      <div style="font-size:1.6rem; font-weight:800; color:#fff; text-align:center;">
        ${freeGB} GB <span style="font-size:0.85rem; font-weight:600; color:var(--text-muted);">free of ${totalGB} GB</span>
      </div>

      <div class="iphone-storage-bar" id="iphone-storage-bar">${barHtml}</div>
      <div id="iphone-legend-container" class="iphone-legend">${legendHtml}</div>

      ${spaceHogHtml}
    </div>
  `;
}

function analyzeHeaviestFolderPrism(path) {
  switchTab('tab-sniffer');
  const pathInput = document.getElementById('sniffer-path');
  if (pathInput) {
    pathInput.value = path;
  }
  scanDirectorySniffer(path, 3);
}
window.analyzeHeaviestFolderPrism = analyzeHeaviestFolderPrism;

// Setup and operations for Processes Manager
function setupProcessManager() {
  const searchInput = document.getElementById('proc-search');
  const sortSelect = document.getElementById('proc-sort');
  const refreshBtn = document.getElementById('proc-refresh-btn');

  searchInput.addEventListener('input', () => {
    filterProcessesLocally();
  });

  sortSelect.addEventListener('change', () => {
    fetchProcesses();
  });

  refreshBtn.addEventListener('click', () => {
    fetchProcesses();
  });
}

let cachedProcesses = [];

async function fetchProcesses() {
  const sortBy = document.getElementById('proc-sort').value;
  try {
    const response = await fetch(`/api/processes?sortBy=${sortBy}&limit=40`);
    const data = await response.json();
    
    if (data.error) throw new Error(data.error);

    cachedProcesses = data;
    filterProcessesLocally();
  } catch (err) {
    console.error('Failed to fetch processes:', err.message);
  }
}

function filterProcessesLocally() {
  const searchVal = document.getElementById('proc-search').value.toLowerCase().trim();
  const body = document.getElementById('processes-body');
  if (!body) return;

  const filtered = cachedProcesses.filter(proc => {
    return proc.name.toLowerCase().includes(searchVal) || proc.pid.toString().includes(searchVal);
  });

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="text-center">No matching processes found.</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach(proc => {
    html += `
      <tr>
        <td style="font-family: monospace; font-weight: 600;">${proc.pid}</td>
        <td style="font-weight: 500;">${proc.name}</td>
        <td>${proc.cpu}%</td>
        <td>${proc.mem}%</td>
        <td class="actions-col">
          <button class="btn-kill" onclick="terminateProcess(${proc.pid}, '${proc.name.replace(/'/g, "\\'")}')">End Task</button>
        </td>
      </tr>
    `;
  });
  body.innerHTML = html;
}

async function terminateProcess(pid, name) {
  if (!confirm(`Are you sure you want to end task for "${name}" (PID: ${pid})?`)) {
    return;
  }

  try {
    const response = await fetch('/api/terminate-process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pid })
    });
    
    const result = await response.json();

    if (result.error) {
      showToast(result.error, 'error');
    } else {
      showToast(`Terminated "${name}" (PID: ${pid})`, 'success');
      fetchProcesses();
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}
window.terminateProcess = terminateProcess;

// Event Log Search Manager
function setupLogSearch() {
  const searchBtn = document.getElementById('log-search-btn');
  searchBtn.addEventListener('click', () => {
    fetchLogs();
  });
  
  document.getElementById('log-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      fetchLogs();
    }
  });
}

function getLogDiagnosis(log) {
  const msg = log.message.toLowerCase();
  let explanation = 'System diagnostic warning/event log.';
  let fixCmd = '';

  if (msg.includes('launchd') || msg.includes('launchservices') || msg.includes('xpc')) {
    explanation = 'macOS background service manager (launchd) service initialization warning.';
    fixCmd = `launchctl list | grep -i "${log.source.substring(0, 15)}"`;
  } else if (msg.includes('windowserver') || msg.includes('display') || msg.includes('graphics') || msg.includes('metal') || msg.includes('quartz')) {
    explanation = 'macOS WindowServer compositor frame refresh lag or display delay.';
    fixCmd = 'sudo killall -HUP WindowServer';
  } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('dns') || msg.includes('socket') || msg.includes('mdnsresponder') || msg.includes('wifi')) {
    explanation = 'Network connection timeout or DNS resolution delay occurred.';
    fixCmd = 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder';
  } else if (msg.includes('permission') || msg.includes('denied') || msg.includes('eacces') || msg.includes('eperm')) {
    explanation = 'Application permission block. File write/read operation denied.';
    fixCmd = 'ls -la; verify Full Disk Access permissions in macOS Settings';
  } else if (msg.includes('crash') || msg.includes('abort') || msg.includes('segfault') || msg.includes('terminated')) {
    explanation = 'Process thread crashed or terminated unexpectedly.';
    fixCmd = `killall "${log.source}"`;
  } else if (msg.includes('disk') || msg.includes('storage') || msg.includes('file') || msg.includes('write')) {
    explanation = 'Storage I/O threshold reached or filesystem read-only lock.';
    fixCmd = 'df -h; check disk write access';
  }

  return { explanation, fixCmd };
}

async function fetchLogs() {
  const query = document.getElementById('log-search').value.trim();
  const level = document.getElementById('log-level').value;
  const limit = document.getElementById('log-limit').value;
  const body = document.getElementById('logs-body');
  const summaryCard = document.getElementById('log-summary-card');

  body.innerHTML = `
    <tr>
      <td colspan="4" class="text-center">
        <div class="spinner" style="margin: 0 auto 0.5rem;"></div>
        Searching system logs...
      </td>
    </tr>
  `;

  try {
    const url = `/api/events?query=${encodeURIComponent(query)}&level=${level}&limit=${limit}`;
    const response = await fetch(url);
    const logs = await response.json();

    if (logs.error) throw new Error(logs.error);

    if (logs.length === 0) {
      body.innerHTML = '<tr><td colspan="4" class="text-center">No log events found. Try another search.</td></tr>';
      summaryCard.style.display = 'none';
      return;
    }

    let errors = 0;
    let warnings = 0;
    let info = 0;
    const incidents = [];

    logs.forEach(log => {
      if (log.level === 'error') {
        errors++;
        const diag = getLogDiagnosis(log);
        if (diag.fixCmd && incidents.length < 3) {
          incidents.push({ source: log.source, level: log.level, ...diag });
        }
      } else if (log.level === 'warning') {
        warnings++;
        const diag = getLogDiagnosis(log);
        if (diag.fixCmd && incidents.length < 3) {
          incidents.push({ source: log.source, level: log.level, ...diag });
        }
      } else {
        info++;
      }
    });

    summaryCard.style.display = 'flex';
    document.getElementById('log-stat-errors').textContent = errors;
    document.getElementById('log-stat-warnings').textContent = warnings;
    document.getElementById('log-stat-info').textContent = info;

    const statusBadge = document.getElementById('log-status-badge');
    if (errors > 5) {
      statusBadge.textContent = 'Critical Errors';
      statusBadge.className = 'badge badge-critical';
      statusBadge.style.backgroundColor = 'var(--accent-red)';
    } else if (errors > 0 || warnings > 5) {
      statusBadge.textContent = 'Warnings Active';
      statusBadge.className = 'badge badge-warning';
      statusBadge.style.backgroundColor = 'var(--accent-orange)';
    } else {
      statusBadge.textContent = 'Healthy';
      statusBadge.className = 'badge badge-normal';
      statusBadge.style.backgroundColor = 'var(--accent-green)';
    }

    const incidentsList = document.getElementById('log-incidents-list');
    if (incidents.length === 0) {
      incidentsList.innerHTML = '<div class="text-center" style="padding: 1rem 0; color: var(--text-muted); font-size: 0.8rem;">No critical service failures detected in this log slice.</div>';
    } else {
      let incHtml = '';
      incidents.forEach(inc => {
        incHtml += `
          <div class="incident-item ${inc.level === 'error' ? '' : 'warning'}">
            <span class="incident-title"><strong>${inc.source}</strong>: ${inc.explanation}</span>
            <div class="incident-fix">
              <span>Suggested Fix: <code>${inc.fixCmd}</code></span>
              <button class="btn btn-secondary btn-small" onclick="navigator.clipboard.writeText('${inc.fixCmd}'); showToast('Command copied!', 'success')">Copy Command</button>
            </div>
          </div>
        `;
      });
      incidentsList.innerHTML = incHtml;
    }

    let html = '';
    logs.forEach((log, idx) => {
      const date = new Date(log.timestamp);
      const dateFormatted = date.toLocaleString();
      const diag = getLogDiagnosis(log);
      
      html += `
        <tr class="log-row" data-index="${idx}">
          <td style="font-family: monospace; white-space: nowrap;">${dateFormatted}</td>
          <td><span class="level-badge ${log.level}">${log.level}</span></td>
          <td><span class="log-source" title="${log.source}">${log.source}</span></td>
          <td class="log-msg"><div style="max-height: 120px; overflow-y: auto;">${escapeHtml(log.message)}</div></td>
        </tr>
        <tr class="log-detail-row" id="log-detail-${idx}" style="display: none;">
          <td colspan="4">
            <div class="log-explanation-box">
              <div><strong>System Diagnosis:</strong> ${diag.explanation}</div>
              <div><strong>Log Entry Details:</strong> <code>${escapeHtml(log.message)}</code></div>
              ${diag.fixCmd ? `
              <div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem;">
                <strong>Troubleshooting CLI Command:</strong>
                <code>${diag.fixCmd}</code>
                <button class="btn btn-secondary btn-small copy-btn" onclick="navigator.clipboard.writeText('${diag.fixCmd}'); showToast('Command copied!', 'success')">Copy Command</button>
              </div>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    });

    body.innerHTML = html;

    const rows = body.querySelectorAll('.log-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const idx = row.getAttribute('data-index');
        const detailRow = document.getElementById(`log-detail-${idx}`);
        if (detailRow.style.display === 'none') {
          detailRow.style.display = 'table-row';
        } else {
          detailRow.style.display = 'none';
        }
      });
    });

    showToast(`Found ${logs.length} event log entries.`, 'success');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="text-center" style="color: var(--accent-red);">Search failed: ${err.message}</td></tr>`;
    showToast(`Log search failed: ${err.message}`, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Clean-up Optimizer
function setupCleanup() {
  const scanBtn = document.getElementById('cleanup-scan-btn');
  const cleanBtn = document.getElementById('cleanup-clean-btn');

  scanBtn.addEventListener('click', () => scanCleanup());
  cleanBtn.addEventListener('click', () => executeCleanup());
}

async function scanCleanup() {
  const listContainer = document.getElementById('cleanup-dirs-list');
  const summaryCard = document.getElementById('cleanup-summary-card');
  const cleanBtn = document.getElementById('cleanup-clean-btn');

  listContainer.innerHTML = `
    <div class="loading-spinner-container">
      <div class="spinner"></div>
      <span>Calculating temporary sizes...</span>
    </div>
  `;
  summaryCard.style.display = 'none';
  cleanBtn.disabled = true;

  try {
    const response = await fetch('/api/temp-storage');
    const data = await response.json();

    if (data.error) throw new Error(data.error);

    cleanupData = data;
    
    let html = '';
    data.details.forEach(item => {
      html += `
        <div class="dir-item">
          <div class="dir-item-meta">
            <span class="dir-name">${item.name}</span>
            <span class="dir-path" title="${item.path}">${item.path}</span>
          </div>
          <span class="dir-size">${item.sizeFormatted}</span>
        </div>
      `;
    });

    listContainer.innerHTML = html;
    document.getElementById('cleanup-total-size').textContent = data.totalFormatted;
    summaryCard.style.display = 'flex';
    
    if (data.totalBytes > 0) {
      cleanBtn.disabled = false;
    }
    
    showToast(`Scan complete. Found ${data.totalFormatted} of temp cache storage.`, 'success');
  } catch (err) {
    listContainer.innerHTML = `<div class="text-center" style="color: var(--accent-red);">Scan failed: ${err.message}</div>`;
    showToast(`Scan failed: ${err.message}`, 'error');
  }
}

async function executeCleanup() {
  if (!confirm(`Are you sure you want to delete temporary storage files?`)) {
    return;
  }

  const cleanBtn = document.getElementById('cleanup-clean-btn');
  cleanBtn.disabled = true;

  const originalBtnText = cleanBtn.innerHTML;
  cleanBtn.innerHTML = `Cleaning...`;

  try {
    const response = await fetch('/api/clean-temp', { method: 'POST' });
    const result = await response.json();

    if (result.error) throw new Error(result.error);

    showToast(`Successfully cleared ${result.freedFormatted} of temp cache storage!`, 'success');
    cleanupData = null;
    await scanCleanup();
  } catch (err) {
    showToast(`Clean-up failed: ${err.message}`, 'error');
    cleanBtn.disabled = false;
  } finally {
    cleanBtn.innerHTML = originalBtnText;
  }
}

// ----------------------------------------------------
// Space Sniffer Treemap Module
// ----------------------------------------------------
function setupSpaceSniffer() {
  const scanBtn = document.getElementById('sniffer-scan-btn');
  const upBtn = document.getElementById('sniffer-up-btn');
  const pathInput = document.getElementById('sniffer-path');

  // Load default value (~)
  pathInput.value = '~';

  // Trigger initial scan of user's home folder on startup so visual map starts populated
  setTimeout(() => {
    scanDirectorySniffer('~', 1);
  }, 100);

  scanBtn.addEventListener('click', () => {
    const pathVal = pathInput.value.trim();
    if (pathVal) {
      scanDirectorySniffer(pathVal, 3);
    }
  });

  upBtn.addEventListener('click', () => {
    if (scanHistoryStack.length > 1) {
      scanHistoryStack.pop(); // Pop current
      const parentPath = scanHistoryStack.pop(); // Get parent
      scanDirectorySniffer(parentPath, 3);
    }
  });

  // Enter to scan
  pathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      scanDirectorySniffer(pathInput.value.trim(), 3);
    }
  });
}

async function scanDirectorySniffer(targetPath, depth = 3) {
  const container = document.getElementById('treemap-container');
  const upBtn = document.getElementById('sniffer-up-btn');
  const pathInput = document.getElementById('sniffer-path');

  container.innerHTML = `
    <div class="loading-spinner-container" style="position: absolute; top:50%; left:50%; transform: translate(-50%, -50%)">
      <div class="spinner"></div>
      <span>Scanning directories...</span>
    </div>
  `;

  try {
    const response = await fetch(`/api/scan-disk?path=${encodeURIComponent(targetPath)}&depth=${depth}`);
    const data = await response.json();

    if (data.error) throw new Error(data.error);

    activeDirectoryTree = data;
    activeDirectoryPath = data.path;
    pathInput.value = data.path;

    // Track history stack
    if (scanHistoryStack.length === 0 || scanHistoryStack[scanHistoryStack.length - 1] !== data.path) {
      scanHistoryStack.push(data.path);
    }
    upBtn.disabled = scanHistoryStack.length <= 1;

    // Render elements
    renderTreemap();
    renderHeavyItemsList();
    renderBreadcrumbs();
    renderTypeBreakdown();
    
    showToast(`Successfully scanned: ${data.name}`, 'success');
  } catch (err) {
    container.innerHTML = `
      <div class="text-center" style="position: absolute; top:50%; left:50%; transform: translate(-50%, -50%); color: var(--accent-red)">
        Scan failed: ${err.message}
      </div>
    `;
    showToast(`Scan failed: ${err.message}`, 'error');
  }
}

function renderTreemap() {
  const container = document.getElementById('treemap-container');
  if (!container || !activeDirectoryTree) return;

  container.innerHTML = '';
  
  const w = container.clientWidth;
  const h = container.clientHeight || 450; // fallback if clientHeight is 0

  // Start slice-and-dice layout
  if (activeDirectoryTree.children && activeDirectoryTree.children.length > 0) {
    computeSliceAndDice(activeDirectoryTree.children, 0, 0, w, h, container);
  } else {
    // Single file or empty folder
    renderTreemapNode(activeDirectoryTree, container, 0, 0, w, h);
  }
}

function renderTreemapNode(node, container, x, y, w, h) {
  if (w < 8 || h < 8) return;

  const tile = document.createElement('div');
  tile.className = 'treemap-node';
  
  let sizeClass = 'node-tiny';
  if (node.value > 1024 * 1024 * 1024) sizeClass = 'node-huge';       // > 1GB
  else if (node.value > 100 * 1024 * 1024) sizeClass = 'node-large';  // > 100MB
  else if (node.value > 10 * 1024 * 1024) sizeClass = 'node-medium';  // > 10MB
  else if (node.value > 1024 * 1024) sizeClass = 'node-small';        // > 1MB
  
  tile.classList.add(sizeClass);
  tile.classList.add(node.type === 'dir' ? 'dir' : 'file');

  tile.style.left = `${x}px`;
  tile.style.top = `${y}px`;
  tile.style.width = `${w}px`;
  tile.style.height = `${h}px`;
  
  const formattedSize = formatBytes(node.value);

  // Render text inside tile if size permits
  if (w > 55 && h > 35) {
    tile.innerHTML = `
      <span class="node-name" style="font-weight: 700;">${node.name}</span>
      <span class="node-size">${formattedSize}</span>
    `;
  }

  tile.title = `${node.path} (${formattedSize})`;

  // Hover effect and drill-down click
  tile.addEventListener('click', (e) => {
    e.stopPropagation();
    if (node.type === 'dir') {
      scanDirectorySniffer(node.path);
    } else {
      showToast(`Selected file: ${node.name} (${formattedSize})`, 'info');
    }
  });

  container.appendChild(tile);
}

function computeSliceAndDice(children, x, y, w, h, container) {
  if (!children || children.length === 0) return;

  const totalValue = children.reduce((sum, c) => sum + c.value, 0);
  if (totalValue === 0) return;

  let currentX = x;
  let currentY = y;
  const sliceVertical = w > h;

  children.forEach(child => {
    const ratio = child.value / totalValue;
    
    if (sliceVertical) {
      const childW = w * ratio;
      renderTreemapNode(child, container, currentX, currentY, childW, h);
      
      // If folder has children and size is substantial, nest slice-and-dice inside it
      if (child.type === 'dir' && child.children && child.children.length > 0 && childW > 80 && h > 80) {
        // Inner slice dice (leaving padding margins)
        const pad = 4;
        const innerX = currentX + pad;
        const innerY = currentY + pad;
        const innerW = childW - (pad * 2);
        const innerH = h - (pad * 2);
        
        // Remove text elements from parent node by deleting HTML if children are loaded inside it
        const tileNode = container.lastChild;
        if (tileNode && tileNode.classList.contains('treemap-node')) {
          tileNode.innerHTML = `<span class="node-name" style="opacity: 0.6; font-size: 0.65rem;">${child.name}</span>`;
        }
        computeSliceAndDice(child.children, innerX, innerY, innerW, innerH, container);
      }
      
      currentX += childW;
    } else {
      const childH = h * ratio;
      renderTreemapNode(child, container, currentX, currentY, w, childH);
      
      if (child.type === 'dir' && child.children && child.children.length > 0 && w > 80 && childH > 80) {
        const pad = 4;
        const innerX = currentX + pad;
        const innerY = currentY + pad;
        const innerW = w - (pad * 2);
        const innerH = childH - (pad * 2);
        
        const tileNode = container.lastChild;
        if (tileNode && tileNode.classList.contains('treemap-node')) {
          tileNode.innerHTML = `<span class="node-name" style="opacity: 0.6; font-size: 0.65rem;">${child.name}</span>`;
        }
        computeSliceAndDice(child.children, innerX, innerY, innerW, innerH, container);
      }
      
      currentY += childH;
    }
  });
}

function renderHeavyItemsList() {
  const sidebar = document.getElementById('sniffer-heavy-list');
  if (!sidebar || !activeDirectoryTree) return;

  sidebar.innerHTML = '';

  const items = [...activeDirectoryTree.children];
  if (items.length === 0) {
    sidebar.innerHTML = '<div class="text-center" style="padding: 1rem 0; color: var(--text-muted); font-size: 0.8rem;">Folder is empty</div>';
    return;
  }

  const topItems = items.slice(0, 12);
  let html = '';
  
  topItems.forEach(item => {
    const formatted = formatBytes(item.value);
    const isFile = item.type === 'file';
    
    html += `
      <div class="heavy-item" onclick="handleHeavyItemClick('${item.path.replace(/'/g, "\\'")}', '${item.type}')">
        <div class="meta" style="flex: 1; max-width: 60%;">
          <span class="name" title="${item.name}">${item.name}</span>
          <span class="type">${item.type}</span>
        </div>
        <span class="size" style="margin-right: 0.5rem;">${formatted}</span>
        ${isFile ? `
        <button class="heavy-item-delete-btn" title="Permanently Delete File" onclick="deleteFilePrism(event, '${item.path.replace(/'/g, "\\'")}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
        ` : '<div style="width: 26px;"></div>'}
      </div>
    `;
  });

  sidebar.innerHTML = html;
}

function handleHeavyItemClick(itemPath, type) {
  if (type === 'dir') {
    scanDirectorySniffer(itemPath);
  } else {
    showToast(`File path: ${itemPath}`, 'info');
  }
}
window.handleHeavyItemClick = handleHeavyItemClick;

function computeTypeBreakdown(node, breakdown) {
  if (node.type === 'file') {
    classifySize(node.name, node.path, node.value, breakdown);
    return;
  }
  
  if (node.type === 'dir') {
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => computeTypeBreakdown(child, breakdown));
    } else {
      classifySize(node.name, node.path, node.value, breakdown);
    }
  }
}

function classifySize(name, pathStr, size, breakdown) {
  const nameLower = name.toLowerCase();
  const pathLower = pathStr.toLowerCase();
  const ext = '.' + nameLower.split('.').pop();

  if (name.includes('.')) {
    if (['.mp4', '.mkv', '.avi', '.mp3', '.wav', '.png', '.jpg', '.jpeg', '.gif', '.mov', '.flac', '.heic', '.webp'].includes(ext)) {
      breakdown.media += size;
      return;
    }
    if (['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.pages', '.key', '.numbers', '.rtf'].includes(ext)) {
      breakdown.docs += size;
      return;
    }
    if (['.zip', '.tar', '.gz', '.rar', '.7z', '.app', '.dmg', '.exe', '.pkg', '.ipa', '.apk'].includes(ext)) {
      breakdown.apps += size;
      return;
    }
    if (['.sys', '.dll', '.js', '.py', '.json', '.html', '.css', '.cpp', '.h', '.c', '.go', '.sh', '.md'].includes(ext)) {
      breakdown.system += size;
      return;
    }
  }

  if (pathLower.includes('/pictures') || pathLower.includes('/movies') || pathLower.includes('/music') || pathLower.includes('/photos') || pathLower.includes('/videos') || nameLower.includes('pic') || nameLower.includes('img') || nameLower.includes('video') || nameLower.includes('media') || nameLower.includes('dmc')) {
    breakdown.media += size;
  } else if (pathLower.includes('/documents') || pathLower.includes('/desktop') || nameLower.includes('doc') || nameLower.includes('work') || nameLower.includes('book') || nameLower.includes('pdf')) {
    breakdown.docs += size;
  } else if (pathLower.includes('/downloads') || pathLower.includes('/applications') || nameLower.includes('app') || nameLower.includes('bin') || nameLower.includes('archive') || nameLower.includes('download')) {
    breakdown.apps += size;
  } else if (pathLower.includes('/library') || pathLower.includes('/system') || nameLower.includes('code') || nameLower.includes('git') || nameLower.includes('node_modules') || nameLower.includes('src')) {
    breakdown.system += size;
  } else {
    breakdown.other += size;
  }
}

function renderTypeBreakdown() {
  const breakdownBox = document.getElementById('prism-categories');
  if (!breakdownBox || !activeDirectoryTree) return;

  const breakdown = { media: 0, docs: 0, apps: 0, system: 0, other: 0 };
  computeTypeBreakdown(activeDirectoryTree, breakdown);

  const totalBytes = breakdown.media + breakdown.docs + breakdown.apps + breakdown.system + breakdown.other;
  if (totalBytes === 0) {
    breakdownBox.innerHTML = '<div class="text-center-muted" style="font-size: 0.8rem; color: var(--text-muted); padding: 1rem 0;">No files found in directory tree.</div>';
    return;
  }

  const mediaPct = ((breakdown.media / totalBytes) * 100).toFixed(1);
  const docsPct = ((breakdown.docs / totalBytes) * 100).toFixed(1);
  const appsPct = ((breakdown.apps / totalBytes) * 100).toFixed(1);
  const systemPct = ((breakdown.system / totalBytes) * 100).toFixed(1);
  const otherPct = ((breakdown.other / totalBytes) * 100).toFixed(1);

  breakdownBox.innerHTML = `
    <div class="category-item">
      <div class="category-item-meta">
        <span class="cat-name">Media (Images/Video)</span>
        <span class="cat-size">${formatBytes(breakdown.media)} (${mediaPct}%)</span>
      </div>
      <div class="category-bar-outer">
        <div class="category-bar-fill" style="width: ${mediaPct}%; background: #f43f5e;"></div>
      </div>
    </div>
    <div class="category-item" style="margin-top: 0.4rem;">
      <div class="category-item-meta">
        <span class="cat-name">Apps & Archives</span>
        <span class="cat-size">${formatBytes(breakdown.apps)} (${appsPct}%)</span>
      </div>
      <div class="category-bar-outer">
        <div class="category-bar-fill" style="width: ${appsPct}%; background: #a855f7;"></div>
      </div>
    </div>
    <div class="category-item" style="margin-top: 0.4rem;">
      <div class="category-item-meta">
        <span class="cat-name">Documents</span>
        <span class="cat-size">${formatBytes(breakdown.docs)} (${docsPct}%)</span>
      </div>
      <div class="category-bar-outer">
        <div class="category-bar-fill" style="width: ${docsPct}%; background: #f97316;"></div>
      </div>
    </div>
    <div class="category-item" style="margin-top: 0.4rem;">
      <div class="category-item-meta">
        <span class="cat-name">System & Code</span>
        <span class="cat-size">${formatBytes(breakdown.system)} (${systemPct}%)</span>
      </div>
      <div class="category-bar-outer">
        <div class="category-bar-fill" style="width: ${systemPct}%; background: #0084ff;"></div>
      </div>
    </div>
    <div class="category-item" style="margin-top: 0.4rem;">
      <div class="category-item-meta">
        <span class="cat-name">Other Files</span>
        <span class="cat-size">${formatBytes(breakdown.other)} (${otherPct}%)</span>
      </div>
      <div class="category-bar-outer">
        <div class="category-bar-fill" style="width: ${otherPct}%; background: #6b7280;"></div>
      </div>
    </div>
  `;

  // Update the fused iPhone-style overview bar
  updateOverviewMultiBar();
}

function updateOverviewMultiBar() {
  const bar = document.getElementById('iphone-storage-bar');
  const legend = document.getElementById('iphone-legend-container');
  if (!bar || !legend || !activeDirectoryTree) return;

  const breakdown = { media: 0, docs: 0, apps: 0, system: 0, other: 0 };
  computeTypeBreakdown(activeDirectoryTree, breakdown);

  const totalBytes = breakdown.media + breakdown.docs + breakdown.apps + breakdown.system + breakdown.other;
  if (totalBytes === 0) return;

  let totalDiskBytes = 500 * 1024 * 1024 * 1024;
  let freeDiskBytes = 100 * 1024 * 1024 * 1024;

  if (window.lastDisksData && window.lastDisksData.length > 0) {
    const primary = window.lastDisksData.find(d => d.mount === '/' || d.mount.toLowerCase().includes('c:')) || window.lastDisksData[0];
    totalDiskBytes = primary.total;
    freeDiskBytes = primary.available;
  }

  const usedDiskBytes = totalDiskBytes - freeDiskBytes;
  const scannedUsedBytes = totalBytes;
  let remainingUsedBytes = usedDiskBytes - scannedUsedBytes;
  if (remainingUsedBytes < 0) remainingUsedBytes = 0;

  breakdown.other += remainingUsedBytes;

  const mediaPct = ((breakdown.media / totalDiskBytes) * 100).toFixed(1);
  const appsPct = ((breakdown.apps / totalDiskBytes) * 100).toFixed(1);
  const docsPct = ((breakdown.docs / totalDiskBytes) * 100).toFixed(1);
  const systemPct = ((breakdown.system / totalDiskBytes) * 100).toFixed(1);
  const otherPct = ((breakdown.other / totalDiskBytes) * 100).toFixed(1);

  bar.innerHTML = `
    <div class="iphone-segment media" style="width: ${mediaPct}%;" title="Media: ${formatBytes(breakdown.media)}"></div>
    <div class="iphone-segment apps" style="width: ${appsPct}%;" title="Apps & Archives: ${formatBytes(breakdown.apps)}"></div>
    <div class="iphone-segment docs" style="width: ${docsPct}%;" title="Documents: ${formatBytes(breakdown.docs)}"></div>
    <div class="iphone-segment system" style="width: ${systemPct}%;" title="System & Code: ${formatBytes(breakdown.system)}"></div>
    <div class="iphone-segment other" style="width: ${otherPct}%;" title="Other Used Space: ${formatBytes(breakdown.other)}"></div>
  `;

  legend.innerHTML = `
    <div class="iphone-legend-item">
      <span class="iphone-legend-dot" style="background: #f43f5e;"></span>
      <span>Media (${formatBytes(breakdown.media)})</span>
    </div>
    <div class="iphone-legend-item">
      <span class="iphone-legend-dot" style="background: #a855f7;"></span>
      <span>Apps (${formatBytes(breakdown.apps)})</span>
    </div>
    <div class="iphone-legend-item">
      <span class="iphone-legend-dot" style="background: #f97316;"></span>
      <span>Docs (${formatBytes(breakdown.docs)})</span>
    </div>
    <div class="iphone-legend-item">
      <span class="iphone-legend-dot" style="background: #0084ff;"></span>
      <span>System (${formatBytes(breakdown.system)})</span>
    </div>
    <div class="iphone-legend-item">
      <span class="iphone-legend-dot" style="background: #6b7280;"></span>
      <span>Other (${formatBytes(breakdown.other)})</span>
    </div>
  `;
}

// Computes and caches the breakdown from server-side home folder data.
// Called BEFORE renderStorage() so the cache is ready when renderStorage builds the bar.
function cacheStorageBreakdownFromTelemetry(homeUsage, disks) {
  if (!homeUsage || homeUsage.length === 0 || !disks || disks.length === 0) return;

  const primaryDisk = disks.find(d => d.mount === '/' || d.mount.toLowerCase().includes('c:')) || disks[0];
  const totalDiskBytes = primaryDisk.total;
  const freeDiskBytes = primaryDisk.available;
  const usedDiskBytes = totalDiskBytes - freeDiskBytes;

  const breakdown = { media: 0, docs: 0, apps: 0, system: 0, other: 0 };
  homeUsage.forEach(folder => {
    classifySize(folder.name, folder.path, folder.value, breakdown);
  });

  const totalBytes = breakdown.media + breakdown.docs + breakdown.apps + breakdown.system + breakdown.other;
  if (totalBytes === 0) return;

  let remainingUsedBytes = usedDiskBytes - totalBytes;
  if (remainingUsedBytes < 0) remainingUsedBytes = 0;
  breakdown.other += remainingUsedBytes;

  // Cache so renderStorage() reads this on the same tick
  window.lastStorageBreakdown = breakdown;
  window.lastStorageBreakdownTotal = usedDiskBytes;
  window.lastHomeUsageCache = homeUsage;   // ranked list for the folder display
}

// Legacy: kept for reference but no longer called in the main loop
function updateOverviewMultiBarFromTelemetry(homeUsage, disks) {
  cacheStorageBreakdownFromTelemetry(homeUsage, disks);
}

async function deleteFilePrism(event, filePath) {
  event.stopPropagation();
  
  const filename = filePath.split('/').pop();
  const confirmDelete = confirm(`Are you sure you want to permanently delete this file to free up storage?\n\nFile: ${filename}\nPath: ${filePath}`);
  if (!confirmDelete) return;

  try {
    const res = await fetch('/api/delete-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filePath })
    });
    const result = await res.json();
    
    if (result.error) throw new Error(result.error);
    
    showToast(result.message || 'File deleted successfully!', 'success');
    
    if (activeDirectoryPath) {
      scanDirectorySniffer(activeDirectoryPath);
    }
  } catch (err) {
    showToast(`Failed to delete file: ${err.message}`, 'error');
  }
}
window.deleteFilePrism = deleteFilePrism;

// Re-render treemap on window resizing
window.addEventListener('resize', () => {
  if (currentTab === 'tab-sniffer' && activeDirectoryTree) {
    renderTreemap();
  }
});

function renderBreadcrumbs() {
  const bar = document.getElementById('sniffer-breadcrumbs');
  if (!bar || !activeDirectoryPath) return;

  bar.innerHTML = '';
  
  // Split path
  const parts = activeDirectoryPath.split('/');
  let accumulatedPath = '';
  
  parts.forEach((part, index) => {
    if (index === 0 && part === '') {
      accumulatedPath += '/';
      // Root tag
      const rootSpan = document.createElement('span');
      rootSpan.className = 'breadcrumb-item';
      rootSpan.textContent = 'Root';
      rootSpan.dataset.path = '/';
      rootSpan.addEventListener('click', () => scanDirectorySniffer('/'));
      bar.appendChild(rootSpan);
      return;
    }

    if (part === '') return;

    if (accumulatedPath !== '/') accumulatedPath += '/';
    accumulatedPath += part;

    // separator
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-separator';
    sep.textContent = '>';
    bar.appendChild(sep);

    // item tag
    const itemSpan = document.createElement('span');
    itemSpan.className = 'breadcrumb-item';
    if (index === parts.length - 1) {
      itemSpan.classList.add('active');
    }
    itemSpan.textContent = part;
    
    const target = accumulatedPath; // Closure copy
    itemSpan.addEventListener('click', () => scanDirectorySniffer(target));
    
    bar.appendChild(itemSpan);
  });
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ----------------------------------------------------
// AI Diagnostics Advisor Module
// ----------------------------------------------------
function setupAiAdvisor() {
  const auditBtn = document.getElementById('ai-audit-btn');
  const chatInput = document.getElementById('ai-chat-input');
  const chatSend = document.getElementById('ai-chat-send');

  auditBtn.addEventListener('click', () => runDiagnosticsAudit());

  chatSend.addEventListener('click', () => sendChatMessage());
  
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
}
async function runDiagnosticsAudit() {
  const auditBtn = document.getElementById('ai-audit-btn');
  const reportBox = document.getElementById('ai-report-content');
  const apiKey = localStorage.getItem('gemini_api_key');

  auditBtn.disabled = true;
  reportBox.innerHTML = `
    <div class="loading-spinner-container" style="height: 100%; display: flex; justify-content: center; align-items: center;">
      <div class="spinner"></div>
      <span>System telemetry compiling... generating report...</span>
    </div>
  `;

  try {
    // 1. Gather all local state variables
    const telemetryRes = await fetch('/api/system-status');
    const telemetry = await telemetryRes.json();

    const processesRes = await fetch('/api/processes?sortBy=cpu&limit=10');
    const processes = await processesRes.json();

    const logsRes = await fetch('/api/events?limit=15');
    const logs = await logsRes.json();

    // 2. Format compile payload for prompt
    const diskSummary = telemetry.disks.map(d => `- Mount: ${d.mount} (${d.usePercentage}% used of ${formatBytes(d.total)})`).join('\n');
    const procSummary = processes.map(p => `- ${p.name} (PID: ${p.pid}, CPU: ${p.cpu}%, Mem: ${p.mem}%)`).join('\n');
    const logSummary = logs.map(l => `[${l.level.toUpperCase()}] ${l.source}: ${l.message.slice(0, 80)}`).join('\n');

    const promptText = `
You are an expert PC Diagnostics and Performance Tuning Assistant.
Below is the current telemetry state of the user's PC:

[SYSTEM METRICS]
OS Distro: ${telemetry.os.distro} (${telemetry.os.arch})
Hostname: ${telemetry.os.hostname}
Kernel: ${telemetry.os.kernel}
System Uptime: ${telemetry.os.uptimeFormatted}

[PROCESSOR (CPU)]
Brand: ${telemetry.cpu.brand}
Logical Cores: ${telemetry.cpu.cores} cores / physical: ${telemetry.cpu.physicalCores}
Current CPU Load: ${telemetry.cpu.loadPercentage}%
CPU Temp: ${telemetry.cpu.temperature !== null ? telemetry.cpu.temperature + ' °C' : 'N/A'}

[MEMORY (RAM)]
Usage Rate: ${telemetry.memory.usePercentage}%
Used RAM: ${formatBytes(telemetry.memory.used)}
Free RAM: ${formatBytes(telemetry.memory.free)}
Total RAM: ${formatBytes(telemetry.memory.total)}

[DISK VOLUME BREAKDOWN]
${diskSummary}

[TOP 10 PROCESSES CONSUMING CPU/RAM]
${procSummary}

[RECENT SYSTEM EVENTS]
${logSummary}

Please analyze this data and generate a detailed report:
1. **Health Rating Score** (Excellent, Good, Warning, or Critical) with a short 2-sentence rationale.
2. **System Anomalies / Concerns** (e.g. CPU temp flags, high memory thresholds, frequent warnings/errors in the logs).
3. **Actionable Suggestions** (list commands to execute, applications to terminate, caches to clean, or hardware tuning tips).

Write your response in clean Markdown with clear headings and bullet lists. Make the advice specific, technically accurate, and brief.
`;

    const contents = [
      {
        role: 'user',
        parts: [{ text: promptText }]
      }
    ];

    // 3. Request AI response
    const systemSnapshot = { telemetry, processes, logs };
    const diagnoseRes = await fetch('/api/diagnose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, contents, systemSnapshot })
    });

    const result = await diagnoseRes.json();
    if (result.error) throw new Error(result.error);

    // Save context to chat history for continuity
    chatHistory.push({ role: 'user', parts: [{ text: 'Please analyze my telemetry.' }] });
    chatHistory.push({ role: 'model', parts: [{ text: result.text }] });

    // Render premium dashboard UI using structured JSON parameters
    let ratingColor = 'var(--accent-green)';
    if (result.rating.toLowerCase().includes('critical')) ratingColor = 'var(--accent-red)';
    else if (result.rating.toLowerCase().includes('warning')) ratingColor = 'var(--accent-orange)';
    else if (result.rating.toLowerCase().includes('good')) ratingColor = 'var(--accent-blue)';

    const circumference = 251.2;
    const strokeDashoffset = circumference - (result.score / 100) * circumference;

    let dashboardHtml = `
      <div class="dashboard-grid">
        <!-- 1. Health Score Gauge Row -->
        <div class="gauge-row">
          <div class="ai-score-gauge">
            <svg width="130" height="130">
              <circle class="gauge-bg" cx="65" cy="65" r="40" stroke-width="8" fill="transparent"/>
              <circle class="gauge-fill" cx="65" cy="65" r="40" stroke-width="8" fill="transparent"
                stroke="${ratingColor}"
                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}; color: ${ratingColor};"
              />
            </svg>
            <div class="gauge-content">
              <span class="score-val">${result.score}</span>
              <span class="score-lbl">Health</span>
            </div>
          </div>
          <div class="gauge-desc">
            <h4>Rating: <span style="color: ${ratingColor}">${result.rating}</span></h4>
            <p>We ran automated diagnostic checks across processor loads, temperature thresholds, memory paging rates, storage capacities, and background daemon event logs.</p>
          </div>
        </div>
    `;

    // 2. Concerns cards
    if (result.concerns && result.concerns.length > 0) {
      dashboardHtml += `
        <div class="ai-alerts-section">
          <h4>Detected Concerns (${result.concerns.length})</h4>
      `;
      result.concerns.forEach(c => {
        const isCritical = c.text.toLowerCase().includes('critical') || c.text.toLowerCase().includes('fail') || result.rating.toLowerCase().includes('critical');
        dashboardHtml += `
          <div class="ai-alert-card ${isCritical ? 'critical' : ''}">
            <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <p class="alert-text">${c.text}</p>
          </div>
        `;
      });
      dashboardHtml += `</div>`;
    } else {
      dashboardHtml += `
        <div class="ai-alerts-section">
          <h4>Detected Concerns</h4>
          <div class="ai-alert-card" style="background: rgba(16, 185, 129, 0.04); border-color: rgba(16, 185, 129, 0.15);">
            <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--accent-green);">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="alert-text">No critical hardware thresholds or system performance bottlenecks detected.</p>
          </div>
        </div>
      `;
    }

    // 3. Recommendations timeline stepper
    if (result.recommendations && result.recommendations.length > 0) {
      dashboardHtml += `
        <div class="ai-stepper-section">
          <h4>Actionable Recommendations</h4>
          <div class="ai-stepper">
      `;
      result.recommendations.forEach(r => {
        dashboardHtml += `
          <div class="step-item">
            <div class="step-circle"></div>
            <div class="step-content">
              <div class="step-text">${r.text}</div>
              ${r.command ? `
              <div class="step-command-box">
                <span><code>${r.command}</code></span>
                <button class="btn btn-secondary btn-small copy-btn" onclick="navigator.clipboard.writeText('${r.command}'); showToast('Command copied!', 'success')">Copy Command</button>
              </div>
              ` : ''}
            </div>
          </div>
        `;
      });
      dashboardHtml += `</div></div>`;
    }

    // 4. Collapsible full details
    dashboardHtml += `
      <div class="report-collapsible">
        <button class="collapsible-trigger" id="ai-report-toggle-btn">
          <span>COLLAPSIBLE TECHNICAL REPORT DETAILS</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </button>
        <div class="collapsible-content" id="ai-report-collapsible-content" style="display: none;">
          ${parseMarkdown(result.text)}
        </div>
      </div>
    </div>
    `;

    reportBox.innerHTML = dashboardHtml;

    // Hook collapsible toggle button
    const toggleBtn = document.getElementById('ai-report-toggle-btn');
    const collapsibleContent = document.getElementById('ai-report-collapsible-content');
    toggleBtn.addEventListener('click', () => {
      if (collapsibleContent.style.display === 'none') {
        collapsibleContent.style.display = 'block';
        toggleBtn.querySelector('svg').style.transform = 'rotate(180deg)';
      } else {
        collapsibleContent.style.display = 'none';
        toggleBtn.querySelector('svg').style.transform = 'rotate(0)';
      }
    });

    updateKeyStatusBadge();
    showToast('Diagnostics audit generated successfully!', 'success');
  } catch (err) {
    reportBox.innerHTML = `
      <div class="text-center" style="color: var(--accent-red); padding-top: 4rem;">
        Diagnostic generation failed: ${err.message}
      </div>
    `;
    showToast(`Audit failed: ${err.message}`, 'error');
  } finally {
    auditBtn.disabled = false;
  }
}

function typewriterAppend(htmlText, bubbleElement, callback) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText;
  
  bubbleElement.innerHTML = '';
  let i = 0;
  const fullText = tempDiv.innerHTML;
  const speed = 6;
  let currentText = '';
  
  const timer = setInterval(() => {
    if (i >= fullText.length) {
      clearInterval(timer);
      if (callback) callback();
      return;
    }

    if (fullText[i] === '<') {
      const tagEnd = fullText.indexOf('>', i);
      if (tagEnd !== -1) {
        currentText += fullText.substring(i, tagEnd + 1);
        i = tagEnd + 1;
      } else {
        currentText += fullText[i];
        i++;
      }
    } else {
      currentText += fullText[i];
      i++;
    }
    
    bubbleElement.innerHTML = currentText;
    
    const thread = document.getElementById('ai-chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, speed);
}

async function sendChatMessage() {
  const chatInput = document.getElementById('ai-chat-input');
  const thread = document.getElementById('ai-chat-thread');
  const apiKey = localStorage.getItem('gemini_api_key');
  
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  chatInput.disabled = true;

  appendChatBubble(text, 'user');
  chatHistory.push({ role: 'user', parts: [{ text }] });

  const typingBubble = appendChatBubble('<div class="spinner" style="width:14px; height:14px; display:inline-block"></div> AI is analyzing...', 'system');

  try {
    let systemSnapshot = null;
    try {
      const [telemetryRes, processesRes, logsRes] = await Promise.all([
        fetch('/api/system-status'),
        fetch('/api/processes?sortBy=cpu&limit=10'),
        fetch('/api/events?limit=15')
      ]);
      const telemetry = await telemetryRes.json();
      const processes = await processesRes.json();
      const logs = await logsRes.json();
      systemSnapshot = { telemetry, processes, logs };
    } catch (e) {
      console.warn('Failed to compile snapshot for chat heuristics:', e.message);
    }

    const diagnoseRes = await fetch('/api/diagnose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, contents: chatHistory, systemSnapshot })
    });

    const result = await diagnoseRes.json();
    if (result.error) throw new Error(result.error);

    // Remove typing bubble container
    const parentMsg = typingBubble.closest('.chat-msg');
    if (parentMsg) parentMsg.remove();

    const bubble = appendChatBubble('', 'system');
    typewriterAppend(parseMarkdown(result.text), bubble, () => {
      chatHistory.push({ role: 'model', parts: [{ text: result.text }] });
    });

    updateKeyStatusBadge();
  } catch (err) {
    const parentMsg = typingBubble.closest('.chat-msg');
    if (parentMsg) parentMsg.remove();
    
    appendChatBubble(`Error: ${err.message}`, 'error-msg');
    showToast(`AI chat failed: ${err.message}`, 'error');
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
}

function appendChatBubble(htmlText, sender) {
  const thread = document.getElementById('ai-chat-thread');
  if (!thread) return null;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;
  msgDiv.innerHTML = `<div class="bubble">${htmlText}</div>`;
  thread.appendChild(msgDiv);
  
  thread.scrollTop = thread.scrollHeight;
  return msgDiv.querySelector('.bubble');
}

// Custom simple regex markdown parser
function parseMarkdown(md) {
  if (!md) return '';
  
  // Escape HTML to prevent XSS
  let escaped = escapeHtml(md);

  // Parse Headers
  escaped = escaped.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  escaped = escaped.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  escaped = escaped.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold Text
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Lists (- or *)
  escaped = escaped.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  
  // Code Blocks
  escaped = escaped.replace(/```(.*?)```/g, '<pre class="code-block">$1</pre>');
  
  // Convert double newlines to paragraph break, single to br
  escaped = escaped.replace(/\n\n/g, '<br><br>');
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}

// ----------------------------------------------------
// HWiNFO Sensors Module
// ----------------------------------------------------
let cachedHWInfoSensors = [];

function setupHWInfoSensors() {
  const searchInput = document.getElementById('hwinfo-search');
  const refreshBtn = document.getElementById('hwinfo-refresh-btn');

  searchInput.addEventListener('input', () => {
    filterHWInfoSensorsLocally();
  });

  refreshBtn.addEventListener('click', () => {
    fetchHWInfoSensors();
  });
}

async function fetchHWInfoSensors() {
  const activeView = document.getElementById('hwinfo-active-view');
  const setupView = document.getElementById('hwinfo-setup-view');
  const errorMsg = document.getElementById('hwinfo-error-msg');

  try {
    const response = await fetch('/api/hwinfo-sensors');
    const data = await response.json();

    if (data.error) throw new Error(data.error);

    if (data.active) {
      activeView.style.display = 'flex';
      setupView.style.display = 'none';
      cachedHWInfoSensors = data.sensors;
      filterHWInfoSensorsLocally();
    } else {
      activeView.style.display = 'none';
      setupView.style.display = 'flex';
      
      if (data.supported === false) {
        errorMsg.textContent = 'Detailed sensors are only supported on Windows (via HWiNFO) and macOS (via native fusion).';
        // Hide instructions steps since they are only relevant on Windows
        const steps = setupView.querySelector('.instructions-steps');
        if (steps) steps.style.display = 'none';
      } else {
        errorMsg.textContent = data.message || 'Registry Gadget Reporting is not running or has no reported sensors. Verify settings.';
        const steps = setupView.querySelector('.instructions-steps');
        if (steps) steps.style.display = 'block';
      }
    }
  } catch (err) {
    activeView.style.display = 'none';
    setupView.style.display = 'flex';
    errorMsg.textContent = `Error querying sensors API: ${err.message}`;
  }
}

function filterHWInfoSensorsLocally() {
  const searchVal = document.getElementById('hwinfo-search').value.toLowerCase().trim();
  const body = document.getElementById('hwinfo-body');
  if (!body) return;

  const filtered = cachedHWInfoSensors.filter(sensor => {
    return (
      sensor.sensor.toLowerCase().includes(searchVal) ||
      sensor.label.toLowerCase().includes(searchVal) ||
      sensor.value.toLowerCase().includes(searchVal)
    );
  });

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="text-center">No matching hardware sensors found.</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach(sensor => {
    html += `
      <tr>
        <td style="font-weight: 600;">${sensor.sensor}</td>
        <td style="color: var(--text-muted);">${sensor.label}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-blue);">${sensor.value}</td>
      </tr>
    `;
  });
  body.innerHTML = html;
}
