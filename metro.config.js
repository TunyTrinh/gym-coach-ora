const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

try {
  const cssInteropRoot = path.dirname(require.resolve("react-native-css-interop/package.json"));
  const cssInteropCache = path.join(cssInteropRoot, ".cache");
  config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), cssInteropCache]));
} catch (e) {
  // Fallback if not resolvable
}

module.exports = withNativeWind(config, {
  input: "./global.css",
  forceWriteFileSystem: false,
});
