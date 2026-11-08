'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Keep storage and OS identity stable across the public rename.
const APP_ID = 'com.habitbuddy.desktop';
const DATA_DIRECTORY = 'habit-buddy';
const DATA_FILE = 'habit-buddy.json';

function configureAppIdentity(app, { isolated = false } = {}) {
  app.setName('Deskling');
  const root = app.getPath(isolated ? 'temp' : 'appData');
  app.setPath('userData', path.join(root, isolated ? `deskling-smoke-${randomUUID()}` : DATA_DIRECTORY));
}

module.exports = { configureAppIdentity, APP_ID, DATA_DIRECTORY, DATA_FILE };
