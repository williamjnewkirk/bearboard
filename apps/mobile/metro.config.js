// Metro config for BearBoard mobile in an npm-workspaces monorepo.
// Without this, Metro only resolves from apps/mobile/node_modules, but npm
// hoists nearly every dependency to the repo-root node_modules. We point Metro
// at both and let it watch the whole workspace (so @bearboard/shared and
// hoisted deps like expo-auth-session resolve).
// See: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
