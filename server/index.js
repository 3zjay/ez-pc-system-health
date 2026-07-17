import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import fs from 'fs';
import { exec } from 'child_process';
import {
  getSystemTelemetry,
  getNetworkTelemetry,
  getProcesses,
  killProcess,
  getSystemEvents,
  getTempStorageStatus,
  cleanTempStorage,
  scanDirectory,
  callGemini,
  getHWInfoSensors,
  callLocalOrCloudAI
} from './systemInfo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// Enable JSON parse middleware
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../client')));

// Telemetry API Endpoints
app.get('/api/system-status', async (req, res) => {
  try {
    const data = await getSystemTelemetry();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/network-status', async (req, res) => {
  try {
    const data = await getNetworkTelemetry();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/processes', async (req, res) => {
  try {
    const sortBy = req.query.sortBy || 'cpu';
    const limit = parseInt(req.query.limit, 10) || 20;
    const data = await getProcesses(sortBy, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/terminate-process', async (req, res) => {
  try {
    const { pid } = req.body;
    if (!pid) {
      return res.status(400).json({ error: 'PID is required' });
    }
    const result = await killProcess(pid);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const query = req.query.query || '';
    const level = req.query.level || 'all';
    const limit = parseInt(req.query.limit, 10) || 50;
    const data = await getSystemEvents(query, level, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/temp-storage', async (req, res) => {
  try {
    const data = await getTempStorageStatus();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clean-temp', async (req, res) => {
  try {
    const data = await cleanTempStorage();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scan-disk', async (req, res) => {
  try {
    const dirPath = req.query.path || '~';
    const depth = parseInt(req.query.depth, 10) || 3;
    const data = await scanDirectory(dirPath, depth);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/diagnose', async (req, res) => {
  try {
    const { apiKey, contents, systemSnapshot } = req.body;
    if (!contents) {
      return res.status(400).json({ error: 'Payload contents are required.' });
    }
    const data = await callLocalOrCloudAI(apiKey, contents, systemSnapshot);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hwinfo-sensors', async (req, res) => {
  try {
    const data = await getHWInfoSensors();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secure file deletion endpoint (only allows files within workspace or user home to prevent system damage)
app.post('/api/delete-file', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath parameter is required' });
  }

  const normalized = path.normalize(filePath);
  if (normalized.startsWith('/System') || normalized.startsWith('/usr') || normalized.startsWith('/bin') || normalized.startsWith('/sbin') || normalized.startsWith('/etc') || normalized === '/' || normalized.includes('..')) {
    return res.status(403).json({ error: 'Access denied: Cannot delete system level files.' });
  }

  try {
    const stats = await fs.promises.stat(normalized);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }
    await fs.promises.unlink(normalized);
    res.json({ success: true, message: `Deleted ${path.basename(normalized)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to index.html for single page layout routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Start Express Server with automatic port fallback if port is in use
function startServer(port) {
  const server = app.listen(port, '127.0.0.1', async () => {
    const localUrl = `http://localhost:${port}`;
    console.log(`==================================================`);
    console.log(`   PC Health Monitor Server started successfully   `);
    console.log(`   Dashboard: ${localUrl}                         `);
    console.log(`==================================================`);

    // Automatically open browser, unless disabled by environment
    if (process.env.NODE_ENV !== 'test') {
      const startCmds = {
        win32: `start "" "${localUrl}"`,
        darwin: `open "${localUrl}"`,
        linux: `xdg-open "${localUrl}"`
      };
      const cmd = startCmds[process.platform];
      if (cmd) {
        exec(cmd, (error) => {
          if (error) {
            console.log('Native browser launch failed, trying open library...');
            open(localUrl).catch(() => {
              console.log('Could not open browser automatically. Please open it manually.');
            });
          }
        });
      } else {
        open(localUrl).catch(() => {
          console.log('Could not open browser automatically. Please open it manually.');
        });
      }
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use. Trying next port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
