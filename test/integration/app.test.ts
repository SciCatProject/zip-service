import request from "supertest";
import { loadApp } from "../helpers/app";
import { baseConfig, createTestEnv, TestEnv } from "../helpers/fixtures";

let env: TestEnv;
beforeAll(() => {
  env = createTestEnv();
});
afterAll(() => env.cleanup());

describe("CORS", () => {
  const origin = "https://portal.example.org";

  it("allows the configured origins", async () => {
    const app = loadApp(baseConfig(env, { allowedOrigins: [origin] }));
    const res = await request(app).get("/").set("Origin", origin);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("does not allow other origins", async () => {
    const app = loadApp(baseConfig(env, { allowedOrigins: [origin] }));
    const res = await request(app)
      .get("/")
      .set("Origin", "https://evil.example.org");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it.each([undefined, [], "https://portal.example.org"])(
    "allows no origin when allowedOrigins is %p",
    async (allowedOrigins) => {
      const app = loadApp(baseConfig(env, { allowedOrigins }));
      const res = await request(app).get("/").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    },
  );

  it("answers preflight requests", async () => {
    const app = loadApp(baseConfig(env, { allowedOrigins: [origin] }));
    const res = await request(app)
      .options("/file")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("exposes the headers needed for ranged downloads", async () => {
    const app = loadApp(baseConfig(env, { allowedOrigins: [origin] }));
    const res = await request(app).get("/").set("Origin", origin);
    expect(res.headers["access-control-expose-headers"]).toBe(
      "Accept-Ranges,Content-Disposition,Content-Length,Content-Range",
    );
  });
});

describe("static files and sessions", () => {
  it("serves the public directory", async () => {
    const app = loadApp(baseConfig(env));
    const res = await request(app).get("/css/index.css");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/css");
  });

  it("starts a session named zip-service.sid", async () => {
    const app = loadApp(baseConfig(env));
    const res = await request(app).get("/");
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^zip-service\.sid=/);
  });

  it("answers 404 for unknown routes", async () => {
    const app = loadApp(baseConfig(env));
    expect((await request(app).get("/nope")).status).toBe(404);
  });
});
