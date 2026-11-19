import { config } from "./config";

export function getRouteBasePath(): string {
  const configured = config.routeBasePath;
  if (typeof configured !== "string" || !configured || configured === "/") {
    return "";
  }

  const prefixedPath = configured.startsWith("/")
    ? configured
    : `/${configured}`;

  return prefixedPath.endsWith("/") ? prefixedPath.slice(0, -1) : prefixedPath;
}

export function getPublicOrigin(): string | null {
  const configured = config.publicOrigin;
  if (typeof configured !== "string" || !configured) {
    return null;
  }

  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}
