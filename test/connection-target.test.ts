import { describe, expect, test } from "vitest";
import {
  normalizeDaemonHost,
  resolveConnectionTarget,
  resolveDaemonHosts,
  resolvePaseoHome,
} from "../src/paseo/connection-target";
import { buildDaemonEnv } from "../src/paseo/daemon-manager";

describe("connection-target", () => {
  test("normalizes daemon host values", () => {
    expect(normalizeDaemonHost("6767")).toBe("127.0.0.1:6767");
    expect(normalizeDaemonHost("localhost:7777")).toBe("localhost:7777");
    expect(normalizeDaemonHost("/tmp/paseo.sock")).toBe("unix:///tmp/paseo.sock");
    expect(normalizeDaemonHost("C:\\tmp\\paseo.sock")).toBeNull();
  });

  test("resolves websocket targets", () => {
    expect(resolveConnectionTarget("localhost:6767")).toMatchObject({
      url: "ws://localhost:6767/ws",
    });
    expect(resolveConnectionTarget("tcp://example.com:6767?ssl=true&password=secret")).toMatchObject({
      url: "wss://example.com:6767/ws",
      password: "secret",
    });
    expect(resolveConnectionTarget("unix:///tmp/paseo.sock")).toMatchObject({
      socketPath: "/tmp/paseo.sock",
    });
  });

  test("prefers configured host before environment and default host", () => {
    const env = {
      PASEO_HOME: "/tmp/paseo-vscode-test-home",
      PASEO_HOST: "127.0.0.1:7000",
    } as NodeJS.ProcessEnv;
    expect(resolveDaemonHosts({ configuredHost: "127.0.0.1:8000", env })).toEqual([
      "127.0.0.1:8000",
      "127.0.0.1:7000",
      "localhost:6767",
    ]);
  });

  test("daemon env disables online features by default", () => {
    const env = buildDaemonEnv({
      env: { PASEO_HOME: "/tmp/paseo-home" },
      listen: "127.0.0.1:6767",
    });
    expect(resolvePaseoHome(env)).toBe("/tmp/paseo-home");
    expect(env.PASEO_RELAY_ENABLED).toBe("0");
    expect(env.PASEO_DICTATION_ENABLED).toBe("0");
    expect(env.PASEO_VOICE_MODE_ENABLED).toBe("0");
    expect(env.PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD).toBe("0");
    expect(env.PASEO_LISTEN).toBe("127.0.0.1:6767");
  });
});
