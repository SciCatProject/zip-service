const mockConfiguration = jest.fn();
const mockDatasetsApi = jest.fn();

jest.mock("@scicatproject/scicat-sdk-ts-fetch", () => ({
  Configuration: mockConfiguration,
  DatasetsV4Api: mockDatasetsApi,
}));

// The module keeps the client in a module-level variable, so each test loads
// a fresh copy. The config helper is loaded in the same isolated registry so
// that the copy sees the values.
function load(values: Record<string, unknown>) {
  let module!: typeof import("../../src/common/scicatAPI");
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    require("../helpers/config").setConfig(values);
    module = require("../../src/common/scicatAPI");
    /* eslint-enable @typescript-eslint/no-var-requires */
  });
  return module;
}

const validConfig = {
  scicatApiBasePath: "https://scicat.example/api",
  scicatApiAccessToken: "token",
};

describe("scicatDataSetAPI", () => {
  it.each([
    ["base path", { scicatApiAccessToken: "token" }],
    ["access token", { scicatApiBasePath: "https://scicat.example/api" }],
  ])("throws when the %s is missing", (_name, values) => {
    expect(() => load(values).scicatDataSetAPI()).toThrow(
      "SciCat API configuration is missing",
    );
  });

  it("builds the client from the configuration", () => {
    const api = load(validConfig).scicatDataSetAPI();

    expect(mockConfiguration).toHaveBeenCalledWith({
      basePath: "https://scicat.example/api",
      accessToken: "token",
    });
    expect(mockDatasetsApi).toHaveBeenCalledTimes(1);
    expect(api).toBeInstanceOf(mockDatasetsApi);
  });

  it("creates the client once and reuses it", () => {
    const { scicatDataSetAPI } = load(validConfig);

    expect(scicatDataSetAPI()).toBe(scicatDataSetAPI());
    expect(mockDatasetsApi).toHaveBeenCalledTimes(1);
  });
});
