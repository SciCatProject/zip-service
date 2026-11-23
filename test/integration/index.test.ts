import request from "supertest";
import { loadApp } from "../helpers/app";
import { baseConfig, createTestEnv, TestEnv } from "../helpers/fixtures";

let env: TestEnv;
beforeAll(() => {
  env = createTestEnv();
});
afterAll(() => env.cleanup());

describe("GET /", () => {
  it("links to both forms by default", async () => {
    const res = await request(loadApp(baseConfig(env))).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/zip"');
    expect(res.text).toContain('href="/file"');
  });

  it("prefixes the links with the route base path", async () => {
    const res = await request(
      loadApp(baseConfig(env, { routeBasePath: "/zip-service" })),
    ).get("/");
    expect(res.text).toContain('href="/zip-service/zip"');
    expect(res.text).toContain('href="/zip-service/file"');
    expect(res.text).toContain("/zip-service/css/index.css");
  });

  it.each([
    ["zip", 'href="/zip"', 'href="/file"'],
    ["file", 'href="/file"', 'href="/zip"'],
  ])("hides the link to the disabled %s form", async (form, hidden, shown) => {
    const res = await request(
      loadApp(baseConfig(env, { formViewsEnabled: { [form]: false } })),
    ).get("/");
    expect(res.text).not.toContain(hidden);
    expect(res.text).toContain(shown);
  });

  it("is a 404 when the index view is disabled", async () => {
    const res = await request(
      loadApp(baseConfig(env, { formViewsEnabled: { index: false } })),
    ).get("/");
    expect(res.status).toBe(404);
    expect(res.text).toContain("Not found");
  });
});
