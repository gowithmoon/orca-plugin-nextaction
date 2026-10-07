import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type FakeOrcaHost,
  installFakeOrcaHost,
} from "../tests/fake-orca-host";

const pluginName = "orca-plugin-nextaction";
let host: FakeOrcaHost;

beforeEach(() => {
  host = installFakeOrcaHost({ pluginName });
});

afterEach(() => {
  host.uninstall();
});

describe("production entry", () => {
  it("exports only load and unload", async () => {
    const entry = await import("./main");

    expect(Object.keys(entry).sort()).toEqual(["load", "unload"]);
  });

  it("loads and unloads without leaving anything on the host", async () => {
    const { load, unload } = await import("./main");

    await load(pluginName);
    await unload();

    expect(host.leftovers()).toEqual([]);
    expect(host.notifications).toEqual([]);
  });
});
