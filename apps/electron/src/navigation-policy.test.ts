import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEV_APP_ORIGIN,
  UNTRUSTED_FRAME_MESSAGE,
  appNavigationTarget,
  assertAppFrame,
  decideNavigation,
} from "./navigation-policy";

const dev = appNavigationTarget({ isDev: true, appDir: join(tmpdir(), "unused") });
const packaged = appNavigationTarget({ isDev: false, appDir: join(tmpdir(), "koloda-app") });
const indexPath = packaged.kind === "file" ? packaged.indexPath : "";

function indexHref(hash = ""): string {
  const url = pathToFileURL(indexPath);
  if (hash !== "") url.hash = hash;
  return url.href;
}

describe("decideNavigation", () => {
  it("allows the dev app origin, including a hash route", () => {
    expect(decideNavigation(DEV_APP_ORIGIN, dev)).toEqual({ action: "allow" });
    expect(decideNavigation(`${DEV_APP_ORIGIN}/#/decks`, dev)).toEqual({ action: "allow" });
    expect(decideNavigation(`${DEV_APP_ORIGIN}/index.html?x=1`, dev)).toEqual({ action: "allow" });
  });

  it("sends other http(s) urls to the system browser", () => {
    expect(decideNavigation("https://evil.example/a?b=1", dev)).toEqual({
      action: "open-external",
      url: "https://evil.example/a?b=1",
    });
    expect(decideNavigation("HTTPS://evil.example/a", dev)).toEqual({
      action: "open-external",
      url: "https://evil.example/a",
    });
    expect(decideNavigation("http://127.0.0.1:3000/", dev)).toEqual({
      action: "open-external",
      url: "http://127.0.0.1:3000/",
    });
    expect(decideNavigation("http://localhost:3001/x", dev)).toEqual({
      action: "open-external",
      url: "http://localhost:3001/x",
    });
  });

  it("drops non-http urls", () => {
    expect(decideNavigation("javascript:alert(1)", dev)).toEqual({ action: "deny" });
    expect(decideNavigation("file:///tmp/secret.html", dev)).toEqual({ action: "deny" });
    expect(decideNavigation("not a url", dev)).toEqual({ action: "deny" });
    expect(decideNavigation("http://localhost:3000.evil.com/", dev)).toEqual({ action: "deny" });
  });

  it("allows only the packaged index file", () => {
    expect(decideNavigation(indexHref(), packaged)).toEqual({ action: "allow" });
    expect(decideNavigation(indexHref("#/decks"), packaged)).toEqual({ action: "allow" });
    expect(decideNavigation(pathToFileURL(join(dirname(indexPath), "other.html")).href, packaged)).toEqual({
      action: "deny",
    });
    expect(decideNavigation(pathToFileURL(join(dirname(indexPath), "..", "secret.txt")).href, packaged)).toEqual({
      action: "deny",
    });
    expect(decideNavigation(`${DEV_APP_ORIGIN}/`, packaged)).toEqual({
      action: "open-external",
      url: `${DEV_APP_ORIGIN}/`,
    });
  });

  it("compares the packaged index case-insensitively on Windows", () => {
    const href = pathToFileURL(indexPath).href.replace("index.html", "INDEX.HTML");
    const decision = decideNavigation(href, packaged);
    expect(decision.action).toBe(process.platform === "win32" ? "allow" : "deny");
  });
});

describe("assertAppFrame", () => {
  it("accepts the app frame and rejects every other sender", () => {
    expect(() => assertAppFrame(`${DEV_APP_ORIGIN}/#/`, dev)).not.toThrow();
    expect(() => assertAppFrame(undefined, dev)).toThrow(UNTRUSTED_FRAME_MESSAGE);
    expect(() => assertAppFrame("https://evil.example/", dev)).toThrow(UNTRUSTED_FRAME_MESSAGE);
    expect(() => assertAppFrame(indexHref("#/decks"), packaged)).not.toThrow();
    expect(() => assertAppFrame(`${DEV_APP_ORIGIN}/`, packaged)).toThrow(UNTRUSTED_FRAME_MESSAGE);
  });
});
