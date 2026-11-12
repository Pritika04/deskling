export const releaseVersion = "0.1.7";
const base = `https://github.com/Pritika04/deskling/releases/download/v${releaseVersion}`;
export const downloads = {
  windows: `${base}/Deskling-${releaseVersion}-win-x64.exe`,
  macArm: `${base}/Deskling-${releaseVersion}-mac-arm64.dmg`,
  macIntel: `${base}/Deskling-${releaseVersion}-mac-x64.dmg`,
  linux: `${base}/Deskling-${releaseVersion}-linux-x86_64.AppImage`,
  linuxArchive: `${base}/Deskling-${releaseVersion}-linux-x64.tar.gz`,
};
export const releasePage = `https://github.com/Pritika04/deskling/releases/tag/v${releaseVersion}`;
