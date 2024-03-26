import {
  ConsoleLogger,
  GrayLogLogger,
  setLogger,
} from "@user-office-software/duo-logger";

export function configureLogger(
  graylogEnabled: boolean,
  graylogServer: string,
  graylogPort: string,
  environment: string,
  serviceName = "zip-service"
): void {
  if (graylogEnabled) {
    if (graylogServer && graylogPort) {
      const env = process.env.NODE_ENV || environment || "unset";
      setLogger([
        new ConsoleLogger(), // Log to console
        new GrayLogLogger( // Log to Graylog
          graylogServer,
          parseInt(graylogPort),
          { facility: "DMSC", environment: env, service: serviceName },
          ["QueryName", "UserID"]
        ),
      ]);
    } else {
      throw new Error(
        "Graylog is enabled but GRAYLOG_SERVER and GRAYLOG_PORT are missing"
      );
    }
  } else {
    setLogger(new ConsoleLogger()); // Log to console
  }
}
