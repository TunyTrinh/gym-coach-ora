const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
const cssInteropRoot = path.dirname(require.resolve("react-native-css-interop/package.json"));
const cssInteropCache = path.join(cssInteropRoot, ".cache");
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), cssInteropCache]));

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
