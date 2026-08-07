import { describe, it, expect } from "vitest";
import { decodeBasicAuth, safeEqual, basicAuthMatches } from "../src/lib/basic-auth";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
const header = (s: string) => `Basic ${b64(s)}`;

describe("decodeBasicAuth", () => {
  it("liest Benutzer und Passwort", () => {
    expect(decodeBasicAuth(header("admin:geheim"))).toEqual({
      user: "admin",
      password: "geheim",
    });
  });

  it("trennt nur am ERSTEN Doppelpunkt – Passwörter dürfen ':' enthalten", () => {
    expect(decodeBasicAuth(header("admin:pa:ss:wort"))).toEqual({
      user: "admin",
      password: "pa:ss:wort",
    });
  });

  it("dekodiert UTF-8 (Umlaute im Passwort bleiben erhalten)", () => {
    expect(decodeBasicAuth(header("admin:schlüssel-öäüß"))?.password).toBe("schlüssel-öäüß");
  });

  it("wirft nicht bei kaputtem Base64, sondern liefert null", () => {
    expect(() => decodeBasicAuth("Basic ###nicht-base64###")).not.toThrow();
    expect(decodeBasicAuth("Basic ###nicht-base64###")).toBeNull();
  });

  it("weist fehlende, fremde und unvollständige Header ab", () => {
    expect(decodeBasicAuth(null)).toBeNull();
    expect(decodeBasicAuth(undefined)).toBeNull();
    expect(decodeBasicAuth("")).toBeNull();
    expect(decodeBasicAuth("Bearer abc")).toBeNull();
    expect(decodeBasicAuth("Basic")).toBeNull();
    // gültiges Base64, aber ohne Doppelpunkt
    expect(decodeBasicAuth(header("nurbenutzer"))).toBeNull();
  });

  it("akzeptiert das Schema unabhängig von der Groß-/Kleinschreibung", () => {
    expect(decodeBasicAuth(`basic ${b64("admin:x")}`)).toEqual({ user: "admin", password: "x" });
  });
});

describe("safeEqual", () => {
  it("vergleicht Werte korrekt", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("x", "")).toBe(false);
    expect(safeEqual("öäü", "öäü")).toBe(true);
  });
});

describe("basicAuthMatches", () => {
  it("lässt korrekte Zugangsdaten durch", () => {
    expect(basicAuthMatches(header("admin:geheim"), "admin", "geheim")).toBe(true);
  });

  it("lehnt falsches Passwort und falschen Benutzer ab", () => {
    expect(basicAuthMatches(header("admin:falsch"), "admin", "geheim")).toBe(false);
    expect(basicAuthMatches(header("root:geheim"), "admin", "geheim")).toBe(false);
  });

  it("lehnt kaputte Header ab, statt zu werfen", () => {
    expect(basicAuthMatches("Basic %%%", "admin", "geheim")).toBe(false);
    expect(basicAuthMatches(null, "admin", "geheim")).toBe(false);
  });

  it("funktioniert mit Doppelpunkt im konfigurierten Passwort", () => {
    expect(basicAuthMatches(header("admin:a:b"), "admin", "a:b")).toBe(true);
    expect(basicAuthMatches(header("admin:a"), "admin", "a:b")).toBe(false);
  });
});
