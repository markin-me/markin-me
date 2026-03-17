require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { domainToASCII } = require('url');

function getArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg === `--${name}`);
  if (direct) return true;
  const withValue = process.argv.find((arg) => arg.startsWith(prefix));
  return withValue ? withValue.slice(prefix.length) : '';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  fs.unlinkSync(targetPath);
  return true;
}

function buildHttpConfig({ domain, includeWww, upstream, acmeWebroot, clientMaxBodySize }) {
  const names = includeWww ? `${domain} www.${domain}` : domain;
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${names};

    client_max_body_size ${clientMaxBodySize};

    location ^~ /.well-known/acme-challenge/ {
        root ${acmeWebroot};
        try_files $uri =404;
    }

    location / {
        proxy_pass ${upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-Domain-Managed 1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;
}

function buildHttpsConfig({
  domain,
  includeWww,
  upstream,
  acmeWebroot,
  clientMaxBodySize,
  sslOptionsPath,
  sslDhParamPath
}) {
  const names = includeWww ? `${domain} www.${domain}` : domain;
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${names};

    location ^~ /.well-known/acme-challenge/ {
        root ${acmeWebroot};
        try_files $uri =404;
    }

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${names};

    client_max_body_size ${clientMaxBodySize};

    location / {
        proxy_pass ${upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-Domain-Managed 1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    include ${sslOptionsPath};
    ssl_dhparam ${sslDhParamPath};
}
`;
}

function main() {
  const rawDomain = String(getArg('domain') || '').trim();
  if (!rawDomain) {
    throw new Error('DOMAIN_REQUIRED');
  }

  const domain = String(domainToASCII(rawDomain) || '').trim().toLowerCase();
  if (!domain) {
    throw new Error('INVALID_DOMAIN');
  }

  const includeWww = getArg('include-www') === true || process.env.TENANT_DOMAIN_AUTOCONNECT_INCLUDE_WWW === '1';
  const upstream = process.env.TENANT_DOMAIN_AUTOCONNECT_UPSTREAM || 'http://127.0.0.1:3000';
  const sitesAvailableDir = process.env.TENANT_DOMAIN_AUTOCONNECT_SITES_AVAILABLE_DIR || '/etc/nginx/sites-available';
  const sitesEnabledDir = process.env.TENANT_DOMAIN_AUTOCONNECT_SITES_ENABLED_DIR || '/etc/nginx/sites-enabled';
  const sitePrefix = process.env.TENANT_DOMAIN_AUTOCONNECT_SITE_PREFIX || 'tenant-domain-';
  const acmeWebroot = process.env.TENANT_DOMAIN_AUTOCONNECT_ACME_WEBROOT || '/var/www/certbot';
  const clientMaxBodySize = process.env.TENANT_DOMAIN_AUTOCONNECT_CLIENT_MAX_BODY_SIZE || '20M';
  const certbotBin = process.env.TENANT_DOMAIN_AUTOCONNECT_CERTBOT_BIN || 'certbot';
  const nginxBin = process.env.TENANT_DOMAIN_AUTOCONNECT_NGINX_BIN || 'nginx';
  const reloadCommand = (process.env.TENANT_DOMAIN_AUTOCONNECT_RELOAD_COMMAND || 'systemctl reload nginx').trim();
  const sslOptionsPath = process.env.TENANT_DOMAIN_AUTOCONNECT_SSL_OPTIONS_PATH || '/etc/letsencrypt/options-ssl-nginx.conf';
  const sslDhParamPath = process.env.TENANT_DOMAIN_AUTOCONNECT_SSL_DHPARAM_PATH || '/etc/letsencrypt/ssl-dhparams.pem';
  const certbotEmail = String(process.env.TENANT_DOMAIN_AUTOCONNECT_CERTBOT_EMAIL || '').trim();
  const disconnectOnly = getArg('disconnect') === true;

  ensureDir(sitesAvailableDir);
  ensureDir(sitesEnabledDir);
  ensureDir(acmeWebroot);
  ensureDir(path.join(acmeWebroot, '.well-known', 'acme-challenge'));

  const confPath = path.join(sitesAvailableDir, `${sitePrefix}${domain}.conf`);
  const enabledPath = path.join(sitesEnabledDir, `${sitePrefix}${domain}.conf`);

  if (disconnectOnly) {
    const removedEnabled = removeIfExists(enabledPath);
    const removedConf = removeIfExists(confPath);
    run(nginxBin, ['-t']);
    execFileSync('sh', ['-lc', reloadCommand], { stdio: 'inherit' });
    process.stdout.write(
      JSON.stringify({
        ok: true,
        domain,
        disconnected: true,
        removed_enabled: removedEnabled,
        removed_conf: removedConf
      })
    );
    return;
  }

  fs.writeFileSync(
    confPath,
    buildHttpConfig({ domain, includeWww, upstream, acmeWebroot, clientMaxBodySize }),
    'utf8'
  );

  if (!fs.existsSync(enabledPath)) {
    fs.symlinkSync(confPath, enabledPath);
  }

  run(nginxBin, ['-t']);
  execFileSync('sh', ['-lc', reloadCommand], { stdio: 'inherit' });

  const certbotArgs = [
    'certonly',
    '--non-interactive',
    '--agree-tos',
    '--webroot',
    '-w',
    acmeWebroot,
    '--cert-name',
    domain,
    '-d',
    domain
  ];
  if (includeWww) {
    certbotArgs.push('-d', `www.${domain}`);
  }
  if (certbotEmail) {
    certbotArgs.push('--email', certbotEmail);
  } else {
    certbotArgs.push('--register-unsafely-without-email');
  }
  run(certbotBin, certbotArgs);

  fs.writeFileSync(
    confPath,
    buildHttpsConfig({
      domain,
      includeWww,
      upstream,
      acmeWebroot,
      clientMaxBodySize,
      sslOptionsPath,
      sslDhParamPath
    }),
    'utf8'
  );

  run(nginxBin, ['-t']);
  execFileSync('sh', ['-lc', reloadCommand], { stdio: 'inherit' });

  process.stdout.write(
    JSON.stringify({
      ok: true,
      domain,
      include_www: includeWww,
      conf_path: confPath
    })
  );
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
