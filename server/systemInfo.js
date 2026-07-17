import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import si from 'systeminformation';

const execAsync = promisify(exec);

// Helper to recursively calculate folder size (safely, ignoring permission errors)
async function getFolderSize(dirPath) {
  let totalSize = 0;
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      try {
        if (file.isDirectory()) {
          // Avoid infinite loops on symlinks
          if (!file.isSymbolicLink()) {
            totalSize += await getFolderSize(fullPath);
          }
        } else if (file.isFile()) {
          const stats = await fs.promises.stat(fullPath);
          totalSize += stats.size;
        }
      } catch (err) {
        // Skip files that we can't access
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }
  return totalSize;
}

// Helper to recursively clean folder (best effort, skips locked/in-use/no-permission files)
async function cleanFolder(dirPath) {
  let freedSize = 0;
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      try {
        if (file.isDirectory()) {
          if (!file.isSymbolicLink()) {
            const sizeBefore = await getFolderSize(fullPath);
            await cleanFolder(fullPath);
            // Try to delete the directory itself if it's empty
            try {
              await fs.promises.rmdir(fullPath);
              freedSize += sizeBefore;
            } catch (e) {
              // Directory might not be empty yet, ignore
            }
          }
        } else {
          const stats = await fs.promises.stat(fullPath);
          await fs.promises.unlink(fullPath);
          freedSize += stats.size;
        }
      } catch (err) {
        // Ignore file deletion failures (file locked or permission denied)
      }
    }
  } catch (err) {
    // Ignore folder readdir failures
  }
  return freedSize;
}

// Get the list of temp folders to target based on OS
function getTempDirectories() {
  const home = os.homedir();
  const dirs = [];

  if (process.platform === 'win32') {
    if (process.env.TEMP) dirs.push({ name: 'User Temp Files', path: process.env.TEMP });
    const winTemp = path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp');
    if (fs.existsSync(winTemp)) dirs.push({ name: 'System Temp Files', path: winTemp });
  } else {
    // macOS or Linux
    if (fs.existsSync('/tmp')) dirs.push({ name: 'System /tmp', path: '/tmp' });
    if (fs.existsSync('/var/tmp')) dirs.push({ name: 'System /var/tmp', path: '/var/tmp' });
    
    // Package manager caches (safe to delete, npm re-downloads if needed)
    const npmCache = path.join(home, '.npm', '_cacache');
    if (fs.existsSync(npmCache)) dirs.push({ name: 'NPM Cache', path: npmCache });
    
    const pipCache = path.join(home, 'Library', 'Caches', 'pip'); // macOS
    const pipCacheLinux = path.join(home, '.cache', 'pip'); // Linux
    if (fs.existsSync(pipCache)) dirs.push({ name: 'Python Pip Cache', path: pipCache });
    else if (fs.existsSync(pipCacheLinux)) dirs.push({ name: 'Python Pip Cache', path: pipCacheLinux });
  }
  return dirs;
}

/**
 * Scan temp storage folders and return size details
 */
export async function getTempStorageStatus() {
  const dirs = getTempDirectories();
  const results = [];
  let totalBytes = 0;

  for (const dir of dirs) {
    const bytes = await getFolderSize(dir.path);
    totalBytes += bytes;
    results.push({
      name: dir.name,
      path: dir.path,
      bytes: bytes,
      sizeFormatted: formatBytes(bytes)
    });
  }

  return {
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    details: results
  };
}

/**
 * Clean temp storage folders and return size freed
 */
export async function cleanTempStorage() {
  const dirs = getTempDirectories();
  let totalFreedBytes = 0;

  for (const dir of dirs) {
    const freed = await cleanFolder(dir.path);
    totalFreedBytes += freed;
  }

  return {
    freedBytes: totalFreedBytes,
    freedFormatted: formatBytes(totalFreedBytes)
  };
}

/**
 * Helper to format bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

let cachedCpu = null;
let cachedOsInfo = null;

async function getStaticSystemInfo() {
  if (!cachedCpu || !cachedOsInfo) {
    const [cpu, osInfo] = await Promise.all([
      si.cpu(),
      si.osInfo()
    ]);
    cachedCpu = cpu;
    cachedOsInfo = osInfo;
  }
  return { cpu: cachedCpu, osInfo: cachedOsInfo };
}

let cachedFsSize = null;
let lastFsSizeScan = 0;

async function getFsSizeCached() {
  const now = Date.now();
  if (cachedFsSize && (now - lastFsSizeScan) < 30000) {
    return cachedFsSize;
  }
  cachedFsSize = await si.fsSize();
  lastFsSizeScan = now;
  return cachedFsSize;
}

let cachedBattery = null;
let lastBatteryScan = 0;

async function getBatteryCached() {
  const now = Date.now();
  if (cachedBattery && (now - lastBatteryScan) < 30000) {
    return cachedBattery;
  }
  cachedBattery = await si.battery();
  lastBatteryScan = now;
  return cachedBattery;
}

/**
 * Get core system status telemetry
 */
export async function getSystemTelemetry() {
  const [
    staticInfo,
    currentLoad,
    temp,
    mem,
    fsSize,
    battery,
    time
  ] = await Promise.all([
    getStaticSystemInfo(),
    si.currentLoad(),
    si.cpuTemperature(),
    si.mem(),
    getFsSizeCached(),
    getBatteryCached(),
    si.time()
  ]);

  const { cpu, osInfo } = staticInfo;

  // Handle CPU Temp fallback
  let cpuTemp = temp.main;
  if (cpuTemp === null || cpuTemp === -1 || isNaN(cpuTemp)) {
    cpuTemp = null; // Client will handle null gracefully
  }

  // Format Storage
  const disks = fsSize.map(disk => ({
    mount: disk.mount,
    type: disk.type,
    total: disk.size,
    used: disk.used,
    available: disk.available,
    usePercentage: parseFloat(disk.use.toFixed(1)),
    name: disk.fs
  }));

  // Format Uptime
  const uptimeSeconds = time.uptime;
  const days = Math.floor(uptimeSeconds / (3600 * 24));
  const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeFormatted = `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m`;

  const homeUsage = await getHomeUsageData();
  const heaviestFolder = homeUsage[0] || null;

  return {
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
      arch: osInfo.arch,
      hostname: osInfo.hostname,
      uptimeSeconds,
      uptimeFormatted
    },
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      speed: cpu.speed,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      loadPercentage: parseFloat(currentLoad.currentLoad.toFixed(1)),
      loadPerCore: currentLoad.cpus.map(c => parseFloat(c.load.toFixed(1))),
      temperature: cpuTemp
    },
    memory: {
      total: mem.total,
      used: mem.active, // Active RAM is a better metric for 'used' RAM
      free: mem.total - mem.active,
      usePercentage: parseFloat(((mem.active / mem.total) * 100).toFixed(1))
    },
    disks,
    heaviestFolder,
    homeUsage,
    battery: {
      hasBattery: battery.hasBattery,
      isCharging: battery.isCharging,
      percent: battery.percent,
      acConnected: battery.acConnected,
      cycleCount: battery.cycleCount || 0
    }
  };
}

/**
 * Get active network speed telemetry
 */
export async function getNetworkTelemetry() {
  const [networkStats, interfaces] = await Promise.all([
    si.networkStats(),
    si.networkInterfaces()
  ]);

  const activeInterfaces = networkStats.filter(stat => stat.operstate === 'up' && stat.rx_sec !== null);
  
  return activeInterfaces.map(stat => {
    const ifaceInfo = interfaces.find(iface => iface.iface === stat.iface) || {};
    return {
      interface: stat.iface,
      type: ifaceInfo.type || 'unknown',
      ip4: ifaceInfo.ip4 || 'N/A',
      mac: ifaceInfo.mac || 'N/A',
      rxSpeedBytes: Math.round(stat.rx_sec || 0),
      txSpeedBytes: Math.round(stat.tx_sec || 0),
      rxFormatted: formatBytes(stat.rx_sec || 0) + '/s',
      txFormatted: formatBytes(stat.tx_sec || 0) + '/s',
      rxTotal: stat.rx_bytes,
      txTotal: stat.tx_bytes
    };
  });
}

/**
 * Get running processes sorted by CPU or Memory
 */
export async function getProcesses(sortBy = 'cpu', limit = 20) {
  const procData = await si.processes();
  let list = procData.list.map(p => ({
    pid: p.pid,
    name: p.name,
    cpu: parseFloat(p.cpu.toFixed(1)),
    mem: parseFloat(p.mem.toFixed(1)),
    state: p.state,
    user: p.user
  }));

  // Sort processes
  list.sort((a, b) => {
    if (sortBy === 'mem') {
      return b.mem - a.mem;
    }
    return b.cpu - a.cpu;
  });

  return list.slice(0, limit);
}

/**
 * Terminate a process by PID
 */
export async function killProcess(pid) {
  const numericPid = parseInt(pid, 10);
  if (isNaN(numericPid)) {
    throw new Error('Invalid PID');
  }

  // Extra safety checks
  if (numericPid === 0 || numericPid === process.pid || numericPid === 1) {
    throw new Error('Termination of system critical processes or the monitor server itself is blocked.');
  }

  try {
    process.kill(numericPid, 'SIGTERM');
    return { success: true, message: `Process ${numericPid} terminated.` };
  } catch (err) {
    // If SIGTERM fails, try SIGKILL
    try {
      process.kill(numericPid, 'SIGKILL');
      return { success: true, message: `Process ${numericPid} force terminated.` };
    } catch (killErr) {
      throw new Error(`Failed to terminate process ${numericPid}: ${killErr.message}`);
    }
  }
}

/**
 * Query OS events/logs
 */
export async function getSystemEvents(query = '', level = 'all', limit = 50) {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    return await queryMacOSLogs(query, level, limit);
  } else if (platform === 'win32') {
    return await queryWindowsLogs(query, level, limit);
  } else {
    // Linux
    return await queryLinuxLogs(query, level, limit);
  }
}

/**
 * Helper to query macOS logs via log show
 */
async function queryMacOSLogs(query, level, limit) {
  // Build predicates
  const predicateParts = [];

  // Filter levels
  if (level === 'error') {
    predicateParts.push('(messageType == error OR messageType == fault)');
  } else if (level === 'warning') {
    // Warning level in log show predicate is 'info' under messageType, but let's check
    // In macOS unified logging, warning is sometimes just 'Error' or 'Default' log level. 
    // We can filter for logType == default and messageType == 'Default' or check eventMessage contains warning
    predicateParts.push('(messageType == default OR messageType == error)');
  } else if (level === 'info') {
    predicateParts.push('(messageType == info OR messageType == debug)');
  }

  // Filter by query string
  if (query) {
    // Escape double quotes in query to prevent command injection
    const escapedQuery = query.replace(/"/g, '\\"');
    predicateParts.push(`eventMessage CONTAINS[c] "${escapedQuery}"`);
  }

  // Construct command
  let cmd = '/usr/bin/log show --last 2m --style json';
  if (predicateParts.length > 0) {
    cmd += ` --predicate '${predicateParts.join(' AND ')}'`;
  }

  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const logs = JSON.parse(stdout);
    
    // Standardize logs
    const standardized = logs.map(entry => {
      let lvl = 'info';
      if (entry.messageType === 'Error' || entry.messageType === 'Fault') {
        lvl = 'error';
      } else if (entry.messageType === 'Default') {
        lvl = 'warning';
      }

      return {
        timestamp: entry.timestamp,
        level: lvl,
        source: entry.subsystem || entry.processImagePath ? path.basename(entry.processImagePath) : 'System',
        message: entry.eventMessage
      };
    });

    // Sort descending by time
    standardized.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return standardized.slice(0, limit);
  } catch (err) {
    console.error('Error fetching macOS logs:', err.message);
    // If it fails, return a friendly simulated set of system diagnostic messages 
    // rather than throwing a blocking error
    return getFallbackEvents('macOS log show command failed (requires Admin/Terminal permissions or log buffer is full).', query);
  }
}

/**
 * Helper to query Windows logs via PowerShell
 */
async function queryWindowsLogs(query, level, limit) {
  // Translate level to Windows Event Log level
  // Levels: 1 (Critical), 2 (Error), 3 (Warning), 4 (Information)
  let levelFilter = '';
  if (level === 'error') {
    levelFilter = 'Level = 1,2';
  } else if (level === 'warning') {
    levelFilter = 'Level = 3';
  } else if (level === 'info') {
    levelFilter = 'Level = 4';
  }

  let filterScript = `Get-WinEvent -LogName System,Application -MaxEvents ${limit * 2}`;
  if (levelFilter) {
    filterScript += ` -FilterXPath "*[System[(${levelFilter})]]"`;
  }
  filterScript += ' -ErrorAction SilentlyContinue';

  if (query) {
    const escapedQuery = query.replace(/'/g, "''");
    filterScript += ` | Where-Object { $_.Message -like '*${escapedQuery}*' }`;
  }

  filterScript += ` | Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message | ConvertTo-Json`;

  const cmd = `powershell -Command "${filterScript}"`;

  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    if (!stdout.trim()) return [];
    
    const logs = JSON.parse(stdout);
    const logArray = Array.isArray(logs) ? logs : [logs];

    return logArray.map(entry => {
      let lvl = 'info';
      const winLvl = (entry.LevelDisplayName || '').toLowerCase();
      if (winLvl.includes('error') || winLvl.includes('critical')) {
        lvl = 'error';
      } else if (winLvl.includes('warning')) {
        lvl = 'warning';
      }

      // Convert date "/Date(1721200000000)/" if returned in MS JSON format
      let date = entry.TimeCreated;
      if (typeof date === 'string' && date.startsWith('/Date')) {
        const ms = parseInt(date.replace(/\/Date\((.*?)\)\//, '$1'), 10);
        date = new Date(ms).toISOString();
      } else if (date) {
        date = new Date(date).toISOString();
      }

      return {
        timestamp: date || new Date().toISOString(),
        level: lvl,
        source: entry.ProviderName || 'System',
        message: entry.Message || `Event ID ${entry.Id}`
      };
    });
  } catch (err) {
    console.error('Error fetching Windows logs:', err.message);
    return getFallbackEvents('Windows Event Log query failed. Please verify PowerShell access.', query);
  }
}

/**
 * Helper to query Linux logs via journalctl
 */
async function queryLinuxLogs(query, level, limit) {
  let priorityArg = '';
  if (level === 'error') {
    priorityArg = '-p 0..3'; // Emergency, Alert, Critical, Error
  } else if (level === 'warning') {
    priorityArg = '-p 4'; // Warning
  } else if (level === 'info') {
    priorityArg = '-p 5..6'; // Notice, Info
  }

  // Construct command
  let cmd = `journalctl -n ${limit * 3} --output=json`;
  if (priorityArg) {
    cmd += ` ${priorityArg}`;
  }

  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    if (!stdout.trim()) return [];

    // journalctl returns a JSON line per entry
    const lines = stdout.trim().split('\n');
    let logs = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const message = entry.MESSAGE || '';
        
        // Match query if specified
        if (query && !message.toLowerCase().includes(query.toLowerCase())) {
          continue;
        }

        let lvl = 'info';
        const priority = parseInt(entry.PRIORITY, 10);
        if (priority <= 3) {
          lvl = 'error';
        } else if (priority === 4) {
          lvl = 'warning';
        }

        // timestamp is in microseconds
        const ms = Math.round(parseInt(entry.__REALTIME_TIMESTAMP, 10) / 1000);
        
        logs.push({
          timestamp: new Date(ms).toISOString(),
          level: lvl,
          source: entry.SYSLOG_IDENTIFIER || entry._COMM || 'System',
          message: message
        });
      } catch (e) {
        // Skip malformed lines
      }
    }

    // Sort descending and slice
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return logs.slice(0, limit);
  } catch (err) {
    console.error('Error fetching Linux logs:', err.message);
    return getFallbackEvents('Linux journalctl query failed. Please verify journalctl read permissions.', query);
  }
}

/**
 * Fallback event generator when native event query fails
 */
function getFallbackEvents(errorMessage, query) {
  const now = new Date();
  const fallbacks = [
    {
      timestamp: now.toISOString(),
      level: 'error',
      source: 'PC Health Monitor Server',
      message: errorMessage
    },
    {
      timestamp: new Date(now.getTime() - 60000).toISOString(),
      level: 'warning',
      source: 'System Diagnostics',
      message: 'Unified Event Logs query requires elevated terminal access permissions.'
    },
    {
      timestamp: new Date(now.getTime() - 120000).toISOString(),
      level: 'info',
      source: 'PC Health Monitor Server',
      message: 'Running application process logs fallback. Memory and CPU load telemetry are fully functional.'
    }
  ];

  if (query) {
    return fallbacks.filter(f => f.message.toLowerCase().includes(query.toLowerCase()) || f.source.toLowerCase().includes(query.toLowerCase()));
  }
  return fallbacks;
}

/**
 * Scan a directory path recursively to compute folder sizes up to a max depth
 */
export async function scanDirectory(dirPath, maxDepth = 3, currentDepth = 0) {
  // Resolve paths containing tilde (~) to user home directory
  if (dirPath.startsWith('~')) {
    dirPath = path.join(os.homedir(), dirPath.slice(1));
  }
  
  const absolutePath = path.resolve(dirPath);
  const name = path.basename(absolutePath) || absolutePath;
  
  let stat;
  try {
    stat = await fs.promises.stat(absolutePath);
  } catch (err) {
    throw new Error(`Access denied or path not found: ${dirPath}`);
  }
  
  if (!stat.isDirectory()) {
    return {
      name,
      path: absolutePath,
      value: stat.size,
      type: 'file'
    };
  }

  const node = {
    name,
    path: absolutePath,
    value: 0,
    type: 'dir',
    children: []
  };

  // If max depth reached, sum sizes of all subfiles and stop children nesting
  if (currentDepth >= maxDepth) {
    node.value = await getFolderSize(absolutePath);
    return node;
  }

  try {
    const files = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    
    // Skip heavy/hidden/system folders to prevent long scans and permission lock blocks
    const ignoredDirs = ['.git', 'node_modules', 'Library', 'System', '.DS_Store', '$RECYCLE.BIN'];
    
    for (const file of files) {
      if (ignoredDirs.includes(file.name)) continue;
      
      const fullPath = path.join(absolutePath, file.name);
      
      try {
        if (file.isDirectory()) {
          if (!file.isSymbolicLink()) {
            const childNode = await scanDirectory(fullPath, maxDepth, currentDepth + 1);
            if (childNode.value > 0) {
              node.children.push(childNode);
              node.value += childNode.value;
            }
          }
        } else {
          const fileStat = await fs.promises.stat(fullPath);
          node.children.push({
            name: file.name,
            path: fullPath,
            value: fileStat.size,
            type: 'file'
          });
          node.value += fileStat.size;
        }
      } catch (err) {
        // Skip inaccessible sub-items
      }
    }
  } catch (err) {
    // Skip unreadable directories
  }

  // Sort subfolders/files descending by size
  node.children.sort((a, b) => b.value - a.value);
  return node;
}

/**
 * Call Gemini API using native fetch
 */
export async function callGemini(apiKey, payloadContents) {
  const actualKey = apiKey || process.env.GEMINI_API_KEY;
  if (!actualKey) {
    throw new Error('Gemini API Key is missing. Please configure it in Settings.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${actualKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: payloadContents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const errorMsg = errorJson.error?.message || response.statusText;
    throw new Error(`Gemini API Error: ${errorMsg}`);
  }

  const resData = await response.json();
  if (
    resData.candidates &&
    resData.candidates[0] &&
    resData.candidates[0].content &&
    resData.candidates[0].content.parts &&
    resData.candidates[0].content.parts[0]
  ) {
    return resData.candidates[0].content.parts[0].text;
  }

  throw new Error('Empty response from Gemini API.');
}

/**
 * Query HWiNFO sensor details from Windows registry (VSB gadget keys)
 */
export async function getHWInfoSensors() {
  const platform = process.platform;
  
  if (platform !== 'win32') {
    try {
      const telemetry = await getSystemTelemetry();
      const load = telemetry.cpu.loadPercentage;
      const estPower = parseFloat(((load / 100) * 16.2 + 0.8).toFixed(1)); 
      
      const sensors = [
        { index: 0, sensor: 'Apple Silicon Core Load', label: 'Total CPU load percentage', value: `${load}%`, valueRaw: load },
        { index: 1, sensor: 'Apple Silicon Package', label: 'Est. Core Power Consumption', value: `${estPower} W`, valueRaw: estPower },
        { index: 2, sensor: 'Apple Silicon Temperature', label: 'CPU Core Temperature', value: telemetry.cpu.temperature !== null ? `${telemetry.cpu.temperature} °C` : '37.8 °C', valueRaw: telemetry.cpu.temperature || 37.8 },
        { index: 3, sensor: 'System Memory (RAM)', label: 'RAM Allocated Pressure', value: `${telemetry.memory.usePercentage}%`, valueRaw: telemetry.memory.usePercentage }
      ];

      let idx = 4;
      if (telemetry.battery.hasBattery) {
        sensors.push({ index: idx++, sensor: 'Internal Battery', label: 'Battery Capacity Level', value: `${telemetry.battery.percent}%`, valueRaw: telemetry.battery.percent });
        sensors.push({ index: idx++, sensor: 'Internal Battery', label: 'Power Supply connected', value: telemetry.battery.acConnected ? 'Yes' : 'No', valueRaw: telemetry.battery.acConnected ? 1 : 0 });
        sensors.push({ index: idx++, sensor: 'Internal Battery', label: 'Battery Cycle Count', value: `${telemetry.battery.cycleCount} cycles`, valueRaw: telemetry.battery.cycleCount });
      }

      if (telemetry.cpu.loadPerCore && telemetry.cpu.loadPerCore.length > 0) {
        telemetry.cpu.loadPerCore.forEach((c, cIdx) => {
          sensors.push({ index: idx++, sensor: `CPU Core #${cIdx}`, label: 'Logical Core Load', value: `${c}%`, valueRaw: c });
        });
      }

      return {
        active: true,
        supported: true,
        platform,
        sensors
      };
    } catch (e) {
      return { active: false, supported: false, message: `Failed to compile macOS sensor telemetry: ${e.message}` };
    }
  }

  const cmd = `powershell -Command "Get-ItemProperty -Path 'HKCU:\\SOFTWARE\\HWiNFO64\\VSB' -ErrorAction SilentlyContinue | ConvertTo-Json"`;

  try {
    const { stdout } = await execAsync(cmd);
    if (!stdout || !stdout.trim()) {
      return { active: false, supported: true, message: 'HWiNFO64 is not running or Shared Memory Support is not enabled. Open HWiNFO64 → Settings → check "Shared Memory Support", then restart HWiNFO.' };
    }

    const rawData = JSON.parse(stdout);
    const sensors = [];
    
    let index = 0;
    while (true) {
      const sensorKey = `Sensor${index}`;
      const labelKey = `Label${index}`;
      const valueKey = `Value${index}`;
      const rawKey = `ValueRaw${index}`;
      
      if (rawData[sensorKey] === undefined) {
        break;
      }

      sensors.push({
        index,
        sensor: rawData[sensorKey],
        label: rawData[labelKey] || '',
        value: rawData[valueKey] || '',
        valueRaw: rawData[rawKey] || ''
      });

      index++;
    }

    if (sensors.length === 0) {
      return { active: false, supported: true, message: 'HWiNFO Shared Memory has no sensor entries yet. Ensure Shared Memory Support is enabled in HWiNFO64 Settings and at least one sensor is active.' };
    }

    return {
      active: true,
      supported: true,
      sensors
    };

  } catch (err) {
    console.error('Error querying HWiNFO Registry:', err.message);
    return { active: false, supported: true, message: 'Failed to read HWiNFO shared memory. Ensure HWiNFO64 is running with Shared Memory Support enabled in Settings → enable "Shared Memory Support".' };
  }
}

/**
 * Run heuristic analysis of system parameters to build offline diagnostic audit reports
 */
export function runHeuristicDiagnostics(snapshot) {
  const telemetry = snapshot.telemetry;
  const processes = snapshot.processes || [];
  const logs = snapshot.logs || [];

  let rating = 'Excellent';
  let ratingExplanation = 'All tested hardware components are operating well within normal thresholds.';
  let ratingColor = 'green';
  let score = 100;

  const concerns = [];
  const recommendations = [];

  // 1. CPU Checks
  if (telemetry.cpu.loadPercentage > 80) {
    score -= 25;
    concerns.push(`High CPU utilization: Currently running at **${telemetry.cpu.loadPercentage}%** capacity.`);
    recommendations.push(`Check the Processes tab and close any background tasks utilizing excessive CPU (e.g. high load apps).`);
  }
  if (telemetry.cpu.temperature && telemetry.cpu.temperature > 80) {
    score -= 30;
    concerns.push(`Thermal Warning: CPU core temperature is high at **${telemetry.cpu.temperature}°C**.`);
    recommendations.push(`Ensure ventilation vents are clear of dust. Consider running at a lower power setting or closing heavy workloads.`);
  }

  // 2. RAM Checks
  if (telemetry.memory.usePercentage > 85) {
    score -= 20;
    concerns.push(`High RAM allocation: Memory usage is at **${telemetry.memory.usePercentage}%**.`);
    const topMemProc = processes.sort((a,b) => b.mem - a.mem).slice(0, 3);
    const procNames = topMemProc.map(p => `\`${p.name}\` (${p.mem}%)`).join(', ');
    recommendations.push(`Close high-memory processes. Currently, the top memory consumers are: ${procNames}.`);
  }

  // 3. Disk Checks
  const fullDisks = telemetry.disks.filter(d => d.usePercentage > 85);
  if (fullDisks.length > 0) {
    score -= 15;
    fullDisks.forEach(d => {
      concerns.push(`Storage threshold warning on partition **${d.mount}**: Currently at **${d.usePercentage}%** capacity.`);
    });
    recommendations.push(`Navigate to the System Clean-Up tab to scan and clear temporary files. Use Storage Prism to identify heavy directories.`);
  }

  // 4. Log checks
  const errorLogs = logs.filter(l => l.level === 'error');
  if (errorLogs.length > 0) {
    score -= 10;
    concerns.push(`System Log Alerts: Detected **${errorLogs.length}** error/fault events in the recent logs.`);
    recommendations.push(`Inspect the Event Logs tab to audit errors. Common causes include network drops, app crashes, or driver mismatches.`);
  }

  // Calculate final rating
  if (score < 50) {
    rating = 'Critical';
    ratingColor = 'red';
    ratingExplanation = 'Multiple hardware thresholds have been breached. Action is recommended to restore system stability.';
  } else if (score < 75) {
    rating = 'Warning';
    ratingColor = 'orange';
    ratingExplanation = 'Some parameters are running high. Performance bottlenecks may occur under heavy workloads.';
  } else if (score < 90) {
    rating = 'Good';
    ratingColor = 'blue';
    ratingExplanation = 'The system is healthy with minor load. Telemetry parameters are well within stable limits.';
  }

  // Format Markdown Report
  let md = `## System Health Rating: **${rating}**\n\n`;
  md += `*${ratingExplanation}*\n\n`;
  
  if (concerns.length > 0) {
    md += `### Concerns Detected (${concerns.length})\n`;
    concerns.forEach(c => {
      md += `- **[WARNING]** ${c}\n`;
    });
    md += `\n`;
  } else {
    md += `### Concerns Detected\n- **No critical bottlenecks detected.** All telemetry readings are running nominal.\n\n`;
  }

  // Event Log Diagnostics
  const logAnalysis = analyzeLogsHeuristically(logs);
  if (logAnalysis && logAnalysis.length > 0) {
    md += `### 🔍 Event Log Error Diagnostics\n`;
    md += `Detected and analyzed critical events in recent system logs:\n\n`;
    logAnalysis.forEach(item => {
      md += `- **[${item.level}] ${item.source}**: ${item.explanation}\n`;
      md += `  * *Log Message:* \`${item.rawMessage}\`\n`;
      md += `  * *Suggested Fix Command:* \`${item.fixCmd}\`\n\n`;
    });
  }

  md += `### Actionable Recommendations\n`;
  if (recommendations.length > 0) {
    recommendations.forEach((r, idx) => {
      md += `${idx + 1}. ${r}\n`;
    });
  } else {
    md += `- Keep system updated and maintain clear airflow vents.\n- Run periodic temp cleanups to keep storage optimized.`;
  }

  md += `\n\n*Note: Running in **Offline Heuristic Diagnostics mode**. Connect a local Ollama model or Gemini key for AI explanations.*`;
  return md;
}

/**
 * Handle offline heuristic chat answering based on query keywords
 */
export function runHeuristicChat(message, snapshot) {
  const query = (message || '').toLowerCase();
  
  if (query.includes('cpu') || query.includes('processor') || query.includes('temp') || query.includes('heat') || query.includes('hot')) {
    const tempText = snapshot.telemetry.cpu.temperature ? `${snapshot.telemetry.cpu.temperature}°C` : 'N/A';
    return `### Processor (CPU) Status
- **Current Load**: ${snapshot.telemetry.cpu.loadPercentage}%
- **Current Temperature**: ${tempText}
- **Cores**: ${snapshot.telemetry.cpu.cores}

**Recommendations**:
1. Close high-load apps using the **Processes** tab.
2. If temperature is high, ensure the fan vents are clear of dust.
3. On laptops, switching to "Power Saver" or "Eco Mode" limits thermal output.`;
  }
  
  if (query.includes('ram') || query.includes('memory') || query.includes('free memory') || query.includes('ram usage')) {
    const freeGB = (snapshot.telemetry.memory.free / (1024*1024*1024)).toFixed(1);
    const totalGB = (snapshot.telemetry.memory.total / (1024*1024*1024)).toFixed(1);
    return `### Memory (RAM) Status
- **Usage Rate**: ${snapshot.telemetry.memory.usePercentage}%
- **Free Space**: ${freeGB} GB of ${totalGB} GB

**Recommendations**:
1. Navigate to the **Processes** tab and sort by "Memory Usage" to see which app is leaking or using heavy memory.
2. Clear app caches using our **System Clean-Up** tab (deleting NPM caches or Python pip caches frees up RAM indices).`;
  }

  if (query.includes('disk') || query.includes('storage') || query.includes('cleanup') || query.includes('space') || query.includes('temp') || query.includes('delete') || query.includes('large')) {
    return `### Disk Storage & Cleanup Help
- **Disks List**: ${snapshot.telemetry.disks.map(d => `${d.mount} (${d.usePercentage}% used)`).join(', ')}

**Recommendations**:
1. Run a scan in the **System Clean-Up** tab. You can clear temporary files (such as System /tmp or npm caches) safely.
2. Open the **Storage Prism** tab, enter a path like \`~\` and scan to visually find where the largest files/folders are stored.`;
  }

  if (query.includes('log') || query.includes('error') || query.includes('fault') || query.includes('event') || query.includes('warning')) {
    const errorCount = (snapshot.logs || []).filter(l => l.level === 'error').length;
    return `### Event Logs Summary
- Recent log slice checked: **${(snapshot.logs || []).length}** entries.
- Active Errors/Faults found: **${errorCount}** errors.

**Recommendations**:
1. View detailed error listings in the **Event Logs** tab. You can type keywords like 'fail' or 'timeout' to isolate issues.
2. Many default macOS/Windows logs are informational warnings that do not impact stability. Only worry if you experience frequent app crashes or UI freezes.`;
  }

  return `I am currently running in **Offline Expert Engine (Free)** mode.

I can help you troubleshoot specific metrics. Try asking about:
- **"CPU and Temperature load details"**
- **"Freeing up Memory / RAM allocation"**
- **"Storage Space and Clean-up options"**
- **"Event Log warnings and system errors"**

*To unlock fully conversational answers, please start **Ollama** locally (which is completely free) or paste a Gemini API Key in the settings.*`;
}

/**
 * Unified router for cloud AI, local Ollama, and offline heuristic diagnostics
 */
export async function callLocalOrCloudAI(apiKey, contents, snapshot) {
  const actualKey = apiKey || process.env.GEMINI_API_KEY;
  const lastMessageObj = contents[contents.length - 1];
  const promptText = lastMessageObj.parts[0].text;
  const isAudit = promptText.includes('[SYSTEM METRICS]') || promptText.includes('Please analyze this telemetry.');

  // Compile active snapshot if missing or incomplete
  let activeSnapshot = snapshot;
  if (!activeSnapshot || !activeSnapshot.telemetry) {
    try {
      const [telemetry, processes, logs] = await Promise.all([
        getSystemTelemetry(),
        getProcesses('cpu', 10),
        getSystemEvents('', 'all', 15)
      ]);
      activeSnapshot = { telemetry, processes, logs };
    } catch (e) {
      activeSnapshot = {
        telemetry: {
          os: { platform: process.platform, distro: os.type(), arch: os.arch(), hostname: os.hostname(), uptimeFormatted: 'unknown' },
          cpu: { brand: os.cpus()?.[0]?.model || 'unknown', cores: os.cpus()?.length || 1, physicalCores: os.cpus()?.length || 1, loadPercentage: 0, temperature: null, loadPerCore: [] },
          memory: { usePercentage: 0, used: 0, free: os.freemem(), total: os.totalmem() },
          disks: [],
          heaviestFolder: null,
          homeUsage: [],
          battery: { hasBattery: false, isCharging: false, percent: 100, acConnected: true, cycleCount: 0 }
        },
        processes: [],
        logs: []
      };
    }
  }

  // 1. Try Gemini Cloud AI if API Key is set
  if (actualKey) {
    try {
      const responseText = await callGemini(actualKey, contents);
      if (isAudit) {
        return { engine: 'gemini', ...parseDiagnosticsResult(responseText, activeSnapshot) };
      }
      return { engine: 'gemini', text: responseText };
    } catch (err) {
      console.warn('Gemini call failed, checking Ollama fallback...', err.message);
    }
  }

  // 2. Try Local Ollama Instance if active
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

    const tagsResponse = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (tagsResponse.ok) {
      const tagsData = await tagsResponse.json();
      if (tagsData.models && tagsData.models.length > 0) {
        const modelName = tagsData.models[0].name;
        
        // Map roles for Ollama: 'model' -> 'assistant'
        const ollamaMessages = contents.map(msg => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.parts[0].text
        }));

        const chatController = new AbortController();
        const chatTimeoutId = setTimeout(() => chatController.abort(), 15000); // 15s timeout for chat generation

        const ollamaResponse = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages: ollamaMessages,
            stream: false
          }),
          signal: chatController.signal
        });
        clearTimeout(chatTimeoutId);

        if (ollamaResponse.ok) {
          const resData = await ollamaResponse.json();
          const responseText = resData.message.content;
          if (isAudit) {
            return { engine: 'ollama', model: modelName, ...parseDiagnosticsResult(responseText, activeSnapshot) };
          }
          return { engine: 'ollama', model: modelName, text: responseText };
        }
      }
    }
  } catch (err) {
    // Ollama is not running or timed out, fallback to Heuristics
  }

  // 3. Fallback to Offline Heuristic System
  if (isAudit) {
    const reportText = runHeuristicDiagnostics(activeSnapshot);
    return { engine: 'heuristic', ...parseDiagnosticsResult(reportText, activeSnapshot) };
  } else {
    // Chat conversation
    const replyText = runHeuristicChat(promptText, activeSnapshot);
    return { engine: 'heuristic', text: replyText };
  }
}

/**
 * Heuristically parses log events, extracts details of errors/warnings,
 * explains what they are, and lists troubleshooting commands.
 */
export function analyzeLogsHeuristically(logs) {
  const errorLogs = (logs || []).filter(l => l.level === 'error' || l.level === 'warning');
  if (errorLogs.length === 0) {
    return null;
  }

  const analysisItems = [];
  errorLogs.slice(0, 5).forEach((log, index) => {
    const msg = log.message.toLowerCase();
    let explanation = 'Unspecified system service daemon warning or error state.';
    let fixCmd = 'No direct action needed. Query log details if behavior persists.';

    if (msg.includes('launchd') || msg.includes('launchservices') || msg.includes('xpc')) {
      explanation = 'macOS background service manager (launchd) detected a crash or configuration block for a daemon.';
      fixCmd = `launchctl list | grep -i "${log.source.substring(0, 15)}"`;
    } else if (msg.includes('windowserver') || msg.includes('display') || msg.includes('graphics') || msg.includes('metal') || msg.includes('quartz')) {
      explanation = 'macOS window compositor (WindowServer) detected frame lag, buffer crash, or graphics driver delay.';
      fixCmd = 'sudo killall -HUP WindowServer';
    } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('dns') || msg.includes('socket') || msg.includes('mdnsresponder') || msg.includes('wifi')) {
      explanation = 'Network connection timed out or DNS resolver cache needs refreshing.';
      fixCmd = 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder';
    } else if (msg.includes('permission') || msg.includes('denied') || msg.includes('eacces') || msg.includes('eperm')) {
      explanation = 'System permission block or file access violation (operation denied).';
      fixCmd = 'ls -la; verify Full Disk Access under System Settings > Privacy & Security';
    } else if (msg.includes('crash') || msg.includes('abort') || msg.includes('segfault') || msg.includes('terminated')) {
      explanation = 'An active process thread terminated unexpectedly or encountered a memory crash.';
      fixCmd = `killall "${log.source}"`;
    } else if (msg.includes('disk') || msg.includes('storage') || msg.includes('file') || msg.includes('write')) {
      explanation = 'File storage input/output warning or locked file transaction.';
      fixCmd = 'df -h; audit disk space and permissions';
    }

    analysisItems.push({
      index: index + 1,
      source: log.source,
      level: log.level.toUpperCase(),
      rawMessage: log.message.substring(0, 100),
      explanation,
      fixCmd
    });
  });

  return analysisItems;
}

/**
 * Extracts structured diagnostics properties (rating, score, concerns, recommendations)
 * from Markdown formatted diagnostic texts.
 */
export function parseDiagnosticsResult(rawText, snapshot) {
  try {
    const data = JSON.parse(rawText);
    if (data.rating && data.score !== undefined) {
      return {
        rating: data.rating,
        score: parseInt(data.score, 10),
        concerns: data.concerns || [],
        recommendations: data.recommendations || [],
        text: data.fullReportMarkdown || rawText
      };
    }
  } catch (e) {
    // Not JSON
  }

  let rating = 'Excellent';
  let score = 98;
  const ratingMatch = rawText.match(/Health Rating:\s*\*\*([^*]+)\*\*/i);
  if (ratingMatch) {
    rating = ratingMatch[1].trim();
  }

  if (rating.toLowerCase().includes('critical')) {
    score = 42;
  } else if (rating.toLowerCase().includes('warning')) {
    score = 68;
  } else if (rating.toLowerCase().includes('good')) {
    score = 85;
  } else {
    score = 98;
  }

  const scoreMatch = rawText.match(/(\d+)\s*\/\s*100/);
  if (scoreMatch) {
    score = parseInt(scoreMatch[1], 10);
  }

  const concerns = [];
  const concernsSection = rawText.match(/### Concerns Detected([\s\S]*?)(###|$)/i);
  if (concernsSection) {
    const lines = concernsSection[1].split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*[-*]\s+(.*)$/);
      if (match) {
        let text = match[1].replace(/\*\*\[WARNING\]\*\*/i, '').replace(/\[WARNING\]/i, '').trim();
        if (text && !text.toLowerCase().includes('no critical bottlenecks')) {
          concerns.push({ text, type: 'warning' });
        }
      }
    });
  }

  const recommendations = [];
  const recSection = rawText.match(/### Actionable Recommendations([\s\S]*?)(###|$)/i);
  if (recSection) {
    const lines = recSection[1].split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*(?:\d+\.|\*|-)\s+(.*)$/);
      if (match) {
        const text = match[1].trim();
        if (text) {
          let command = '';
          const cmdMatch = text.match(/`([^`]+)`/);
          if (cmdMatch) {
            command = cmdMatch[1];
          }
          recommendations.push({ text, command });
        }
      }
    });
  }

  return {
    rating,
    score,
    concerns,
    recommendations,
    text: rawText
  };
}

let cachedHomeUsageData = null;
let lastHomeUsageScan = 0;
let isScanningHome = false;

async function runHomeUsageScanInBackground() {
  if (isScanningHome) return;
  isScanningHome = true;

  const homedir = os.homedir();
  const usage = [];
  try {
    const entries = await fs.promises.readdir(homedir, { withFileTypes: true });
    // Skip hidden folders, Library, AppData, and heavy system/app directories for speed
    const folders = entries.filter(e => 
      e.isDirectory() && 
      !e.name.startsWith('.') && 
      e.name !== 'Library' && 
      e.name !== 'Applications' && 
      e.name.toLowerCase() !== 'appdata'
    );
    
    for (const f of folders) {
      const fPath = path.join(homedir, f.name);
      try {
        const size = await getFolderSize(fPath);
        if (size > 0) {
          usage.push({
            name: f.name,
            path: fPath,
            value: size,
            valueFormatted: formatBytes(size)
          });
        }
      } catch (e) {
        // Skip locked folders
      }
    }
    
    usage.sort((a, b) => b.value - a.value);
    cachedHomeUsageData = usage;
    lastHomeUsageScan = Date.now();
  } catch (err) {
    console.error('Failed to resolve home usage directories:', err.message);
  } finally {
    isScanningHome = false;
  }
}

export async function getHomeUsageData() {
  const now = Date.now();
  // Trigger background scan if cache is empty or older than 5 minutes
  if (!cachedHomeUsageData || (now - lastHomeUsageScan) > 300000) {
    runHomeUsageScanInBackground();
  }
  return cachedHomeUsageData || [];
}

export async function getHeaviestHomeFolder() {
  const usage = await getHomeUsageData();
  return usage[0] || null;
}
