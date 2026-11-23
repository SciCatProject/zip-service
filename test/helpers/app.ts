import type { Express } from "express";
import type { setConfig } from "./config";

/**
 * Loads the real `src/app.ts` with the given configuration.
 *
 * The app reads its configuration while it is being imported, so each call
 * starts from an empty module registry: routers, link stores and the session
 * middleware are fresh every time. (`jest.resetModules` rather than
 * `jest.isolateModules`: some dependencies, such as readable-stream used by
 * archiver, require modules lazily after the import has finished, which
 * isolateModules would resolve against a different registry.)
 *
 * The zip-cleanup `setInterval` is stubbed so no timer keeps the test process
 * alive.
 */
export function loadApp(values: Record<string, unknown>): Express {
  jest.resetModules();
  const intervalSpy = jest
    .spyOn(global, "setInterval")
    .mockImplementation((() => 0) as unknown as typeof setInterval);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const freshConfig = require("./config") as { setConfig: typeof setConfig };
    freshConfig.setConfig(values);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../../src/app").default as Express;
  } finally {
    intervalSpy.mockRestore();
  }
}
