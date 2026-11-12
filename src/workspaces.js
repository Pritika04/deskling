'use strict';

function configureWorkspaces(window, platform = process.platform) {
  if (platform === 'darwin') {
    // The app already hides its Dock icon. Avoid transforming the process again
    // for each of the buddy, menu and effects windows.
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
}
module.exports = { configureWorkspaces };
