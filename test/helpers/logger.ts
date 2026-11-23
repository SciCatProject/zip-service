// No-op replacement for @user-office-software/duo-logger.
export const logger = {
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  logException: jest.fn(),
};

export class ConsoleLogger {}
export class GrayLogLogger {}
export const setLogger = jest.fn();
