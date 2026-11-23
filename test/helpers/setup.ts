// Runs before every test file.
//
// `src/common/config.ts` reads config/config.json (a deployment template) at
// import time, so every test gets a mutable in-memory config instead.
// The logger is replaced by no-ops to keep the test output readable.
jest.mock("../../src/common/config", () => require("./config"));
jest.mock("@user-office-software/duo-logger", () => require("./logger"));
jest.mock("@user-office-software/duo-logger/lib/logger", () =>
  require("./logger"),
);

jest.setTimeout(15000);
