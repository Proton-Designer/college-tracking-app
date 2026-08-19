// Metro-in-a-monorepo: without this, Metro can't resolve symlinked workspace packages
// (@collegeos/core, @collegeos/api, @collegeos/design) that npm workspaces link into
// node_modules. See https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits inside packages/* trigger a Fast Refresh.
config.watchFolders = [workspaceRoot];

// Let Metro find modules hoisted to the workspace root, in addition to this app's own
// node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
