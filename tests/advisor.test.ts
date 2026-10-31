import { describe, expect, it } from "bun:test";
import { formatDiagnostics, runDiagnostics } from "../src/advisor";

describe("OpenAPI Diagnostics Advisor Rules", () => {
  it("detects empty object schemas (Rule 1)", () => {
    const spec = {
      openapi: "3.0.3",
      paths: {},
      components: {
        schemas: {
          EmptyDto: {
            type: "object",
          },
          ValidDto: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
      },
    };

    const diagnostics = runDiagnostics(spec);
    const rule1 = diagnostics.filter((d) => d.ruleId === "empty-object-schema");
    expect(rule1).toHaveLength(1);
    expect(rule1[0].specPath).toBe("components.schemas.EmptyDto");
    expect(rule1[0].severity).toBe("warning");
  });

  it("detects missing and optional path parameters (Rule 2)", () => {
    const spec = {
      openapi: "3.0.3",
      paths: {
        "/users/{orgId}/{userId}": {
          parameters: [
            {
              name: "userId",
              in: "path" as const,
              required: false,
              schema: { type: "string" },
            },
          ],
          get: {
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    const diagnostics = runDiagnostics(spec);
    const rule2 = diagnostics.filter(
      (d) => d.ruleId === "missing-path-parameter",
    );
    expect(rule2).toHaveLength(2);

    const missingOrgId = rule2.find((d) => d.message.includes("{orgId}"));
    expect(missingOrgId).toBeDefined();
    expect(missingOrgId?.severity).toBe("error");

    const optionalUserId = rule2.find((d) =>
      d.message.includes("required: false"),
    );
    expect(optionalUserId).toBeDefined();
    expect(optionalUserId?.severity).toBe("error");
  });

  it("detects GET/DELETE with request body (Rule 3)", () => {
    const spec = {
      openapi: "3.0.3",
      paths: {
        "/search": {
          get: {
            requestBody: {
              content: { "application/json": { schema: { type: "object" } } },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    const diagnostics = runDiagnostics(spec);
    const rule3 = diagnostics.filter(
      (d) => d.ruleId === "get-with-request-body",
    );
    expect(rule3).toHaveLength(1);
    expect(rule3[0].severity).toBe("warning");
    expect(rule3[0].endpoint?.method).toBe("GET");
  });

  it("detects destructive actions over GET (Rule 4)", () => {
    const spec = {
      openapi: "3.0.3",
      paths: {
        "/posts/{id}/delete": {
          parameters: [{ name: "id", in: "path" as const, required: true }],
          get: {
            summary: "delete post",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    const diagnostics = runDiagnostics(spec);
    const rule4 = diagnostics.filter((d) => d.ruleId === "destructive-get");
    expect(rule4).toHaveLength(1);
    expect(rule4[0].severity).toBe("warning");
    expect(rule4[0].endpoint?.path).toBe("/posts/{id}/delete");
  });

  it("detects response body defined on 204 No Content (Rule 5)", () => {
    const spec = {
      openapi: "3.0.3",
      paths: {
        "/items/{id}": {
          parameters: [{ name: "id", in: "path" as const, required: true }],
          delete: {
            responses: {
              "204": {
                description: "No Content",
                content: { "application/json": { schema: { type: "string" } } },
              },
            },
          },
        },
      },
    };

    const diagnostics = runDiagnostics(spec);
    const rule5 = diagnostics.filter((d) => d.ruleId === "content-on-204");
    expect(rule5).toHaveLength(1);
    expect(rule5[0].severity).toBe("error");
  });

  it("detects empty 200 response without schema (Rule 6)", () => {
    const spec = {
      openapi: "3.0.3",
      paths: {
        "/status": {
          get: {
            responses: {
              "200": {
                description: "Success with no content definition",
              },
            },
          },
        },
      },
    };

    const diagnostics = runDiagnostics(spec);
    const rule6 = diagnostics.filter((d) => d.ruleId === "empty-200-response");
    expect(rule6).toHaveLength(1);
    expect(rule6[0].severity).toBe("warning");
  });

  it("detects broken $ref pointers across schemas, responses, requestBody and params (Rule 7)", () => {
    const spec = {
      openapi: "3.0.3",
      paths: {
        "/test/{id}": {
          parameters: [
            {
              name: "id",
              in: "path" as const,
              required: true,
              schema: { $ref: "#/components/schemas/MissingParamSchema" },
            },
          ],
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MissingReqBodySchema" },
                },
              },
            },
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/MissingResponseSchema",
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          BrokenSchema: {
            type: "object",
            properties: {
              child: { $ref: "#/components/schemas/MissingChildSchema" },
            },
          },
        },
      },
    };

    const diagnostics = runDiagnostics(spec);
    const brokenRefs = diagnostics.filter((d) => d.ruleId === "broken-ref");
    expect(brokenRefs).toHaveLength(4);

    const refTargets = brokenRefs.map((d) => d.message);
    expect(refTargets.some((m) => m.includes("MissingChildSchema"))).toBe(true);
    expect(refTargets.some((m) => m.includes("MissingParamSchema"))).toBe(true);
    expect(refTargets.some((m) => m.includes("MissingReqBodySchema"))).toBe(
      true,
    );
    expect(refTargets.some((m) => m.includes("MissingResponseSchema"))).toBe(
      true,
    );
  });
});

describe("Reporter Formats", () => {
  const sampleDiagnostics = [
    {
      ruleId: "empty-object-schema",
      category: "type-safety" as const,
      severity: "warning" as const,
      specPath: "components.schemas.UserDto",
      message: "Schema is empty",
      recommendation: "Add fields",
    },
    {
      ruleId: "content-on-204",
      category: "http-semantics" as const,
      severity: "error" as const,
      endpoint: { method: "DELETE", path: "/users/{id}" },
      specPath: "paths['/users/{id}'].delete.responses['204'].content",
      message: "204 cannot have content",
      recommendation: "Remove content",
      docUrl: "https://www.rfc-editor.org/rfc/rfc9110",
    },
  ];

  it("formats json properly", () => {
    const jsonOutput = formatDiagnostics(sampleDiagnostics, "json");
    const parsed = JSON.parse(jsonOutput);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].ruleId).toBe("empty-object-schema");
  });

  it("formats markdown properly with markdown table", () => {
    const mdOutput = formatDiagnostics(sampleDiagnostics, "markdown");
    expect(mdOutput).toContain("# Kygger OpenAPI Diagnostic Report");
    expect(mdOutput).toContain(
      "| Severity | Category | Target | Issue | Recommendation |",
    );
    expect(mdOutput).toContain("DELETE /users/{id}");
  });

  it("formats prompt for AI remediation instructions", () => {
    const promptOutput = formatDiagnostics(sampleDiagnostics, "prompt");
    expect(promptOutput).toContain(
      "# OpenAPI Specification Remediation Instructions",
    );
    expect(promptOutput).toContain(
      "Please update our backend route decorators",
    );
    expect(promptOutput).toContain("Route `DELETE /users/{id}`");
  });

  it("formats console output with tags", () => {
    const consoleOutput = formatDiagnostics(sampleDiagnostics, "console");
    expect(consoleOutput).toContain("Kygger Spec Diagnostics (2 issues found");
    expect(consoleOutput).toContain("[ERROR]");
    expect(consoleOutput).toContain("[WARN]");
  });

  it("handles empty diagnostics cleanly", () => {
    expect(formatDiagnostics([], "json")).toBe("[]");
    expect(formatDiagnostics([], "console")).toBe("");
    expect(formatDiagnostics([], "markdown")).toContain("No issues detected");
  });
});
