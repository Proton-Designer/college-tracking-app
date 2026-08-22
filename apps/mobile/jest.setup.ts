jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return { __esModule: true, ...mock.default };
});

// Reanimated's real entry point boots the native worklets module, which doesn't exist under
// jest's node environment -- the library ships this mock specifically for that gap.
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
