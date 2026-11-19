// Expo's default config already supports pnpm/yarn monorepos (watches the workspace root).
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
