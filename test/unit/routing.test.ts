import { getPublicOrigin, getRouteBasePath } from "../../src/common/routing";
import { setConfig } from "../helpers/config";

describe("getRouteBasePath", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    ["/", ""],
    [42, ""],
    ["/zip-service", "/zip-service"],
    ["zip-service", "/zip-service"],
    ["/zip-service/", "/zip-service"],
    ["zip-service/", "/zip-service"],
    ["/a/b", "/a/b"],
  ])("normalises %p to %p", (configured, expected) => {
    setConfig({ routeBasePath: configured });
    expect(getRouteBasePath()).toBe(expected);
  });
});

describe("getPublicOrigin", () => {
  it.each([
    [undefined, null],
    ["", null],
    [42, null],
    ["https://example.org", "https://example.org"],
    ["https://example.org/", "https://example.org"],
  ])("normalises %p to %p", (configured, expected) => {
    setConfig({ publicOrigin: configured });
    expect(getPublicOrigin()).toBe(expected);
  });
});
