'use strict';
const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');

const repository = 'Pritika04/deskling';
const empty = () => ({ Windows: 0, macOS: 0, Linux: 0 });

function summarizeDownloads(releases) {
  const platforms = empty(), versions = [];
  for (const release of releases) {
    const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
    if (release.draft || release.prerelease || !semver.valid(version) || semver.prerelease(version)) continue;
    const row = { version, platforms: empty(), total: 0, files: [] };
    for (const asset of release.assets || []) {
      const match = /^Deskling-(\d+\.\d+\.\d+)-(win|mac|linux)-(x64|x86_64|arm64)\.(exe|dmg|zip|AppImage|tar\.gz)$/.exec(asset.name || '');
      if (!match || match[1] !== version) continue;
      const [, , os, arch, format] = match;
      if (!(os === 'win' && format === 'exe' || os === 'mac' && ['dmg', 'zip'].includes(format) || os === 'linux' && ['AppImage', 'tar.gz'].includes(format))) continue;
      if (!Number.isSafeInteger(asset.download_count) || asset.download_count < 0) throw new Error('Invalid download count for ' + asset.name);
      const platform = { win: 'Windows', mac: 'macOS', linux: 'Linux' }[os];
      platforms[platform] += asset.download_count;
      row.platforms[platform] += asset.download_count;
      row.total += asset.download_count;
      row.files.push({ name: asset.name, platform, arch, format, downloads: asset.download_count });
    }
    versions.push(row);
  }
  versions.sort((a, b) => semver.rcompare(a.version, b.version));
  return { repository, platforms, total: Object.values(platforms).reduce((sum, value) => sum + value, 0), versions };
}

async function fetchReleases(fetcher = globalThis.fetch) {
  const releases = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetcher(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Deskling-download-report' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}. Try again later; no report was refreshed.`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub response; no report was refreshed.');
    releases.push(...batch);
    if (batch.length < 100) return releases;
  }
  throw new Error('Release pagination limit reached; refusing to report an incomplete total.');
}

function renderReport(report) {
  const escape = text => String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Deskling download report</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f8f6ef;color:#344936;font:15px/1.7 'Segoe UI',Arial,sans-serif}main{max-width:920px;margin:60px auto;padding:0 24px}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:44px;line-height:1.2;margin:12px 0}h2{font-size:27px;margin-top:36px}.muted{color:#73806c;font-size:13px}.total{background:#e8eddf;border:1px solid #d7dfcc;border-radius:22px;padding:26px;margin:28px 0 18px}.total strong{display:block;font:58px Georgia,serif}.platforms{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.platforms div{padding:18px;background:#efeee4;border-radius:17px}.platforms strong{display:block;font:29px Georgia,serif}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:right;border-bottom:1px solid #dce0d2;padding:12px 8px}th:first-child,td:first-child{text-align:left}a{color:#587244}details{margin-top:20px}summary{cursor:pointer}.table-wrap{overflow-x:auto}footer{margin:35px 0;color:#73806c;font-size:12px}@media(max-width:500px){main{margin-top:32px}h1{font-size:34px}.platforms{gap:8px}.platforms div{padding:12px}th,td{padding:10px 6px}}
  </style></head><body><main><span class="muted">DESKLING · GITHUB RELEASE DOWNLOADS</span><h1>Downloads at a glance.</h1><p class="muted">Snapshot: ${escape(report.generatedAt)} · Stable releases only</p><div class="total"><strong>${report.total}</strong>installer and app-file downloads</div><div class="platforms">${Object.entries(report.platforms).map(([name, count]) => `<div>${name}<strong>${count}</strong></div>`).join('')}</div><p class="muted">These are file download counts, not unique people or confirmed installations. Re-downloads, your own testing, automated downloads, and Windows app updates can be included. Update metadata, blockmaps, and checksum files are excluded.</p><h2>By release</h2><div class="table-wrap"><table><thead><tr><th>Version</th><th>Windows</th><th>macOS</th><th>Linux</th><th>Total</th></tr></thead><tbody>${report.versions.map(row => `<tr><td><a href="https://github.com/${repository}/releases/tag/v${row.version}">v${row.version}</a></td><td>${row.platforms.Windows}</td><td>${row.platforms.macOS}</td><td>${row.platforms.Linux}</td><td>${row.total}</td></tr>`).join('')}</tbody></table></div><details><summary>Counts for each file</summary>${report.versions.map(row => `<h2>v${row.version}</h2><div class="table-wrap"><table><tbody>${row.files.map(file => `<tr><td>${escape(file.name)}</td><td>${file.downloads}</td></tr>`).join('')}</tbody></table></div>`).join('')}</details><footer>This report is saved locally; it does not add app telemetry or a public website counter. Refresh with <code>npm run metrics:downloads</code>. GitHub supplies cumulative totals; this report does not infer daily downloads or active users.</footer></main></body></html>`;
}

async function main() {
  const report = { ...summarizeDownloads(await fetchReleases()), generatedAt: new Date().toISOString() };
  const directory = path.join(__dirname, '..', '.npm');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'download-metrics.json'), JSON.stringify(report, null, 2) + '\n');
  const html = path.join(directory, 'download-metrics.html');
  fs.writeFileSync(html, renderReport(report));
  console.log('Deskling stable-release app-file downloads (not unique users)');
  console.table(report.platforms);
  console.log('Total:', report.total);
  console.table(report.versions.map(row => ({ Version: row.version, ...row.platforms, Total: row.total })));
  console.log('Report:', html);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { summarizeDownloads, fetchReleases, renderReport };
