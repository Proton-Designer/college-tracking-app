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

// One React instance, and it is always this app's own copy.
//
// npm cannot hoist a single `react` for this workspace: apps/web pins 19.2.8 (what Next 16
// wants) and this app pins 19.1.0 (what Expo SDK 54 pins), so npm parks 19.2.8 at the
// workspace root and nests 19.1.0 under apps/mobile. `nodeModulesPaths` above fixes that
// only for source files *inside this directory* -- it does not change how a package that
// itself lives in the root node_modules resolves its own imports. react-native and
// expo-router are both hoisted to the root, so they load React 19.2.8 while everything
// under src/ loads 19.1.0.
//
// Two React copies in one bundle means the hook dispatcher one of them reads is null, which
// surfaces as "Invalid hook call" / "Cannot read property 'useEffect' of null" at the first
// hook the tree runs -- in practice RootLayout in src/app/_layout.tsx, long before anything
// hints that the cause is dependency resolution. Redirecting every React entry point to this
// app's copy collapses them back into one. `react/jsx-runtime` matters as much as `react`
// itself: the automatic JSX transform injects it into every file that renders anything.
//
// The Jest equivalent of this is the `moduleNameMapper` block in this app's package.json.
// If apps/web and apps/mobile are ever pinned to the same React version, both become
// unnecessary -- npm hoists one copy and there is nothing left to deduplicate.
const REACT_SINGLETONS = ["react", "react-dom"];

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isReactEntryPoint = REACT_SINGLETONS.some(
    (pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`),
  );

  if (isReactEntryPoint) {
    try {
      return {
        type: "sourceFile",
        filePath: require.resolve(moduleName, { paths: [projectRoot] }),
      };
    } catch {
      // A subpath this app's copy doesn't expose -- fall through to normal resolution
      // rather than turning a missing export into a hard bundler failure.
    }
  }

  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
