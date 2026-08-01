import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi.js";
import { renderOpenApiPage } from "./openapi-page.js";

/**
 * The contract, as a page someone can open without running anything.
 *
 * It is generated from the same document the runtime validates against, for
 * the same reason the JSON is: a contract written by hand beside the code is
 * a contract that drifts. And it is **self-contained** — a documentation page
 * that pulls a script from a CDN is a third party in the delivery.
 */

const html = renderOpenApiPage(buildOpenApiDocument());

describe("the OpenAPI page", () => {
  it("lists every operation of the document", () => {
    const document = buildOpenApiDocument();

    for (const path of Object.keys(document.paths ?? {})) {
      expect(html).toContain(path);
    }
    expect(html).toContain("POST");
    expect(html).toContain("GET");
  });

  it("names the schemas the operations answer with", () => {
    expect(html).toContain("Dossier");
    expect(html).toContain("Classification");
  });

  it("loads nothing from anywhere else", () => {
    // No CDN, no font, no analytics: the page is one file or it is not
    // documentation of a system that refuses third parties everywhere else.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href="https?:/i);
    expect(html).not.toMatch(/@import\s+url/i);
  });

  it("carries no branding of whoever built it", () => {
    expect(html.toLowerCase()).not.toContain("panella");
  });

  it("says plainly that the application is not deployed", () => {
    // The page can be published; the system cannot. Someone finding this page
    // must not read it as the address of a running service.
    expect(html).toContain("P-1");
    expect(html.toLowerCase()).toContain("não está publicada");
  });

  it("escapes what it interpolates", () => {
    const page = renderOpenApiPage({
      openapi: "3.1.0",
      info: { title: "<script>alert(1)</script>", version: "1.0.0" },
      paths: {},
    });

    expect(page).not.toContain("<script>alert(1)</script>");
    expect(page).toContain("&lt;script&gt;");
  });
});
