'use strict';
const semver = require('semver');

class UpdateManager {
  constructor({ updater = null, version, onChange = () => {}, beforeInstall = () => {}, now = Date.now }) {
    this.updater = updater; this.onChange = onChange; this.beforeInstall = beforeInstall;
    this.currentVersion = version; this.dismissedVersion = null; this.ready = false; this.disposed = false;
    this.now = now; this.lastCheckAt = -Infinity;
    this.state = { supported: !!updater, stage: updater ? 'idle' : 'unsupported', currentVersion: version, version: null, percent: 0, attention: false, message: '' };
    this.listeners = [];
    if (!updater) return;
    updater.autoDownload = false; updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false; updater.allowDowngrade = false;
    updater.disableWebInstaller = true; updater.autoRunAppAfterInstall = true;
    const listen = (event, handler) => { updater.on(event, handler); this.listeners.push([event, handler]); };
    listen('update-available', info => {
      if (!semver.valid(info.version) || semver.prerelease(info.version) || !semver.gt(info.version, version)) {
        this.set({ stage: 'up-to-date', version: null, attention: false, message: '' }); return;
      }
      this.ready = false;
      this.set({ stage: 'available', version: info.version, percent: 0, attention: info.version !== this.dismissedVersion, message: '' });
    });
    listen('update-not-available', () => { this.ready = false; this.set({ stage: 'up-to-date', version: null, attention: false, message: '' }); });
    listen('download-progress', progress => {
      if (this.state.stage === 'downloading') this.set({ percent: Math.min(100, Math.max(0, Math.round(progress.percent || 0))) });
    });
    listen('update-downloaded', info => {
      if (this.state.stage !== 'downloading' || info.version !== this.state.version) return;
      this.ready = true;
      this.set({ stage: 'downloaded', percent: 100, attention: true, message: '' });
    });
    listen('error', error => this.fail(error));
  }
  snapshot() { return { ...this.state }; }
  set(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; this.onChange(this.snapshot());
  }
  fail(error) {
    const detail = `${error?.code || ''} ${error?.message || ''}`;
    const missing = /ERR_UPDATER_NO_PUBLISHED_VERSIONS|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|No published versions on GitHub|404/i.test(detail);
    const channelMissing = /ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/.test(detail);
    const installing = this.state.stage === 'installing';
    if (installing) this.ready = false;
    let message = this.state.stage === 'downloading' ? 'Could not download the update. Check your connection and try again later.' : 'Could not check for updates. Check your connection and try again later.';
    if (channelMissing) message = 'Updates are not available for this release yet. You can keep using Deskling.';
    else if (missing) message = 'No published updates yet. You can keep using Deskling.';
    else if (/CHECKSUM|SIGNATURE|sha512/i.test(`${error?.code || ''} ${error?.message || ''}`)) message = 'The update download could not be verified. Please try again later.';
    else if (installing) message = 'Could not install the update. Please try again.';
    this.set({ stage: this.ready ? 'downloaded' : this.state.version ? 'available' : missing || channelMissing ? 'unavailable' : 'error', percent: this.ready ? 100 : 0,
      message });
  }
  async check() {
    if (!this.updater || this.disposed || ['checking', 'downloading', 'downloaded', 'installing'].includes(this.state.stage)) return this.snapshot();
    this.lastCheckAt = this.now();
    this.set({ stage: 'checking', message: '' });
    try {
      const result = await this.updater.checkForUpdates();
      if (!result && this.state.stage === 'checking') this.set({ stage: 'idle' });
    } catch (error) { this.fail(error); }
    return this.snapshot();
  }
  async download() {
    if (!this.updater || this.disposed || this.state.stage !== 'available') return this.snapshot();
    this.dismissedVersion = null;
    this.set({ stage: 'downloading', percent: 0, attention: false, message: '' });
    try { await this.updater.downloadUpdate(); }
    catch (error) { this.fail(error); }
    return this.snapshot();
  }
  install() {
    if (!this.updater || this.disposed || !this.ready || this.state.stage !== 'downloaded') return false;
    try { this.beforeInstall(); }
    catch { this.set({ message: 'Could not save your latest changes. Please try again before restarting.' }); return false; }
    try {
      this.set({ stage: 'installing', attention: false, message: '' });
      this.updater.quitAndInstall(true, true);
      return this.state.stage === 'installing';
    } catch (error) { this.fail(error); return false; }
  }
  later() {
    this.dismissedVersion = this.state.version;
    this.set({ attention: false }); return this.snapshot();
  }
  checkWhenDue(cooldown = 5 * 60 * 1000) {
    if (!this.state.supported || this.disposed || this.now() - this.lastCheckAt < cooldown) return Promise.resolve(this.snapshot());
    return this.check();
  }
  start({ delay = 5000, interval = 15 * 60 * 1000 } = {}) {
    if (!this.state.supported || this.disposed || this.initialTimer) return;
    this.initialTimer = setTimeout(() => this.checkWhenDue(), delay);
    this.repeatTimer = setInterval(() => this.checkWhenDue(), interval);
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.initialTimer); clearInterval(this.repeatTimer);
    for (const [event, handler] of this.listeners) this.updater.removeListener(event, handler);
  }
}

const DOWNLOAD_PAGE = 'https://deskling-bjwf.vercel.app/#downloads';
const RELEASE_API = 'https://api.github.com/repos/Pritika04/deskling/releases/latest';

// macOS only checks release metadata. Downloads and installation stay in the user's hands.
class ManualUpdateManager extends UpdateManager {
  constructor({ version, arch = process.arch, fetchRelease = globalThis.fetch, openDownloadPage, onChange, now }) {
    super({ version, onChange, now });
    this.arch = arch; this.fetchRelease = fetchRelease; this.openDownloadPage = openDownloadPage;
    this.state = { ...this.state, supported: true, manual: true, stage: 'idle' };
  }
  async check() {
    if (this.disposed || this.state.stage === 'checking') return this.snapshot();
    this.lastCheckAt = this.now();
    this.set({ stage: 'checking', message: '' });
    try {
      const response = await this.fetchRelease(RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        credentials: 'omit', signal: AbortSignal.timeout(15000),
      });
      if (response.status === 404) throw new Error('404');
      if (!response.ok) throw new Error('Release check failed');
      const release = await response.json();
      const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
      if (!semver.valid(version) || semver.prerelease(version) || release.draft || release.prerelease) throw new Error('Invalid stable release');
      if (!semver.gt(version, this.currentVersion)) {
        this.set({ stage: 'up-to-date', version: null, attention: false, message: '' });
      } else if (!Array.isArray(release.assets) || !release.assets.some(asset => asset.name === `Deskling-${version}-mac-${this.arch}.dmg` && asset.state === 'uploaded')) {
        this.set({ stage: 'unavailable', version: null, attention: false, message: 'The next Mac download is not available yet. You can keep using Deskling.' });
      } else {
        this.set({ stage: 'available', version, attention: version !== this.dismissedVersion, message: '' });
      }
    } catch (error) { this.fail(error); }
    return this.snapshot();
  }
  async download() {
    if (this.disposed || this.state.stage !== 'available') return this.snapshot();
    try {
      await this.openDownloadPage(DOWNLOAD_PAGE);
      this.dismissedVersion = this.state.version;
      this.set({ attention: false, message: '' });
    } catch {
      this.set({ message: 'Could not open the website. Please visit deskling-bjwf.vercel.app to download the update.' });
    }
    return this.snapshot();
  }
}
module.exports = { UpdateManager, ManualUpdateManager, DOWNLOAD_PAGE };
