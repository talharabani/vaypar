const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Disable worker process spawning for compatibility with Windows Node v24
config.maxWorkers = 0;

// Add 'wasm' to resolver asset extensions to support expo-sqlite web compilation
config.resolver.assetExts.push('wasm');

// Exclude temporary npm/expo folders in node_modules from watcher
config.resolver.blockList = [
  /node_modules\/.*\.expo-.*$/,
  /node_modules\/.*\.npm-.*$/
];

module.exports = withNativeWind(config, { input: './src/global.css' });
