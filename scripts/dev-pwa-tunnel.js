const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');

const DEFAULT_PORT = 3000;
const stateFilePath = path.resolve(__dirname, '..', 'tmp', 'dev-pwa-tunnel.json');
const cloudflaredDirPath = path.resolve(__dirname, '..', 'tmp', 'cloudflared');
const cloudflaredBinaryPath = path.join(cloudflaredDirPath, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const cloudflaredDownloadUrl = process.platform === 'win32' && process.arch === 'x64'
  ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  : '';

function readArgValue(flagName) {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const current = String(args[index] || '').trim();
    if (current === flagName) {
      return String(args[index + 1] || '').trim();
    }
    if (current.startsWith(`${flagName}=`)) {
      return current.slice(flagName.length + 1).trim();
    }
  }
  return '';
}

function resolvePort() {
  const candidates = [
    readArgValue('--port'),
    process.env.DEV_PWA_PORT,
    process.env.PORT,
    process.env.APP_PORT,
    String(DEFAULT_PORT)
  ];

  for (const candidate of candidates) {
    const port = Number(String(candidate || '').trim());
    if (Number.isInteger(port) && port > 0 && port <= 65535) {
      return port;
    }
  }

  return DEFAULT_PORT;
}

function resolveLocalHost() {
  return String(process.env.DEV_PWA_LOCAL_HOST || readArgValue('--local-host') || '127.0.0.1').trim() || '127.0.0.1';
}

function resolveProviderPreference() {
  return String(process.env.DEV_PWA_TUNNEL_PROVIDER || readArgValue('--provider') || 'cloudflared').trim().toLowerCase();
}

function ensureTmpDir() {
  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
}

function writeStateFile(payload) {
  ensureTmpDir();
  fs.writeFileSync(
    stateFilePath,
    JSON.stringify(
      {
        public_url: payload.public_url,
        port: payload.port,
        pid: process.pid,
        provider: payload.provider,
        host: payload.host || null,
        local_host: payload.local_host || null,
        subdomain: payload.subdomain || null,
        created_at: new Date().toISOString()
      },
      null,
      2
    )
  );
}

function clearStateFile() {
  try {
    if (!fs.existsSync(stateFilePath)) return;
    let payload = null;
    try {
      payload = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    } catch (_) {
      payload = null;
    }
    const ownerPid = Number(payload && payload.pid);
    if (ownerPid && ownerPid !== process.pid) return;
    fs.unlinkSync(stateFilePath);
  } catch (_) {}
}

function waitForever() {
  return new Promise(() => {});
}

function createDownloadRequest(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const tempPath = `${destinationPath}.download`;
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(createDownloadRequest(response.headers.location, destinationPath));
      }

      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Download failed with status ${response.statusCode}`));
      }

      const file = fs.createWriteStream(tempPath);
      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          try {
            if (fs.existsSync(destinationPath)) {
              fs.unlinkSync(destinationPath);
            }
            fs.renameSync(tempPath, destinationPath);
            resolve(destinationPath);
          } catch (error) {
            reject(error);
          }
        });
      });

      file.on('error', (error) => {
        try { fs.unlinkSync(tempPath); } catch (_) {}
        reject(error);
      });
    });

    request.on('error', reject);
  });
}

async function ensureCloudflaredBinary() {
  if (fs.existsSync(cloudflaredBinaryPath)) {
    return cloudflaredBinaryPath;
  }

  if (!cloudflaredDownloadUrl) {
    throw new Error(`Automatic cloudflared download is not configured for ${process.platform}/${process.arch}.`);
  }

  fs.mkdirSync(cloudflaredDirPath, { recursive: true });
  console.log('[dev-pwa-tunnel] cloudflared not found, downloading official binary...');
  await createDownloadRequest(cloudflaredDownloadUrl, cloudflaredBinaryPath);
  return cloudflaredBinaryPath;
}

let activeTunnel = null;
let isShuttingDown = false;

async function shutdown(exitCode) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  clearStateFile();

  if (activeTunnel) {
    if (typeof activeTunnel.close === 'function') {
      try {
        await Promise.resolve(activeTunnel.close());
      } catch (_) {}
    }
    if (activeTunnel.child && !activeTunnel.child.killed) {
      try {
        activeTunnel.child.kill();
      } catch (_) {}
    }
  }

  process.exit(exitCode);
}

async function startCloudflaredTunnel({ port, localHost }) {
  const binaryPath = await ensureCloudflaredBinary();
  const localUrl = `http://${localHost}:${port}`;
  const args = ['tunnel', '--url', localUrl, '--no-autoupdate'];
  const child = spawn(binaryPath, args, {
    cwd: path.dirname(binaryPath),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let resolved = false;
  const urlPattern = /(https:\/\/[-a-z0-9.]+trycloudflare\.com)/i;

  const result = await new Promise((resolve, reject) => {
    const startupTimer = setTimeout(() => {
      reject(new Error('Timed out while waiting for cloudflared tunnel URL.'));
    }, 30_000);

    function onData(chunk) {
      const text = String(chunk || '');
      process.stdout.write(text);
      const match = text.match(urlPattern);
      if (!match || resolved) return;
      resolved = true;
      clearTimeout(startupTimer);
      resolve({
        public_url: String(match[1] || '').trim(),
        provider: 'cloudflared',
        host: 'https://trycloudflare.com',
        local_host: localHost,
        port,
        child
      });
    }

    function onErrorData(chunk) {
      const text = String(chunk || '');
      process.stderr.write(text);
      const match = text.match(urlPattern);
      if (!match || resolved) return;
      resolved = true;
      clearTimeout(startupTimer);
      resolve({
        public_url: String(match[1] || '').trim(),
        provider: 'cloudflared',
        host: 'https://trycloudflare.com',
        local_host: localHost,
        port,
        child
      });
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', onErrorData);
    child.on('error', (error) => {
      clearTimeout(startupTimer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      if (resolved || isShuttingDown) return;
      clearTimeout(startupTimer);
      reject(new Error(`cloudflared exited before startup (code: ${code}, signal: ${signal || 'none'}).`));
    });
  });

  activeTunnel = {
    provider: 'cloudflared',
    child,
    close() {
      if (child.killed) return;
      child.kill();
    }
  };

  child.on('exit', () => {
    if (isShuttingDown) return;
    clearStateFile();
    process.exit(0);
  });

  return result;
}

function buildLocaltunnelOptions(port, localHost) {
  const options = { port };
  const subdomain = String(process.env.DEV_PWA_TUNNEL_SUBDOMAIN || readArgValue('--subdomain') || '').trim();
  const host = String(process.env.DEV_PWA_TUNNEL_HOST || readArgValue('--host') || '').trim();

  if (subdomain) options.subdomain = subdomain;
  if (host) options.host = host;
  if (localHost) options.local_host = localHost;

  return options;
}

async function startLocaltunnelTunnel({ port, localHost }) {
  const options = buildLocaltunnelOptions(port, localHost);
  const tunnel = await localtunnel(options);
  const tunnelUrl = String(tunnel && tunnel.url || '').trim();
  if (!/^https:\/\//i.test(tunnelUrl)) {
    throw new Error('Tunnel did not return an HTTPS URL.');
  }

  activeTunnel = tunnel;
  tunnel.on('close', () => {
    if (isShuttingDown) return;
    clearStateFile();
    process.exit(0);
  });
  tunnel.on('error', (error) => {
    if (isShuttingDown) return;
    console.error('[dev-pwa-tunnel] tunnel error:', error && error.message ? error.message : error);
    void shutdown(1);
  });

  return {
    public_url: tunnelUrl,
    provider: 'localtunnel',
    host: String(options.host || '').trim() || 'https://localtunnel.me',
    local_host: localHost,
    subdomain: String(options.subdomain || '').trim() || null,
    port
  };
}

async function startPreferredTunnel({ provider, port, localHost }) {
  if (provider === 'localtunnel') {
    return startLocaltunnelTunnel({ port, localHost });
  }

  try {
    return await startCloudflaredTunnel({ port, localHost });
  } catch (error) {
    console.warn('[dev-pwa-tunnel] cloudflared failed, falling back to localtunnel:', error && error.message ? error.message : error);
    return startLocaltunnelTunnel({ port, localHost });
  }
}

async function main() {
  const port = resolvePort();
  const localHost = resolveLocalHost();
  const provider = resolveProviderPreference();
  const tunnel = await startPreferredTunnel({ provider, port, localHost });

  writeStateFile(tunnel);

  console.log(`[dev-pwa-tunnel] provider: ${tunnel.provider}`);
  console.log(`[dev-pwa-tunnel] local port: ${port}`);
  console.log(`[dev-pwa-tunnel] local host: ${localHost}`);
  console.log(`[dev-pwa-tunnel] public URL: ${tunnel.public_url}`);
  console.log('[dev-pwa-tunnel] Reload tenant UI and choose "HTTPS tunnel" in DEV QR.');
  console.log('[dev-pwa-tunnel] Press Ctrl+C to stop the tunnel.');

  await waitForever();
}

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

process.on('uncaughtException', (error) => {
  console.error('[dev-pwa-tunnel] uncaught exception:', error && error.stack ? error.stack : error);
  void shutdown(1);
});

process.on('unhandledRejection', (error) => {
  console.error('[dev-pwa-tunnel] unhandled rejection:', error && error.stack ? error.stack : error);
  void shutdown(1);
});

main().catch((error) => {
  console.error('[dev-pwa-tunnel] failed to start:', error && error.stack ? error.stack : error);
  clearStateFile();
  process.exit(1);
});
