/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "bun:test";
import { createApiClient } from "../src/client";
import { handler } from "../src/handler";

describe("Runtime Client and Handler Integration", () => {
  it("interpolates path parameters correctly in URL", async () => {
    let capturedUrl = "";
    const mockClient = {
      get: (url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });
      },
    } as any;

    const fn = handler("get", mockClient);
    await fn({
      path: "/orgs/{orgId}/users/{userId}",
      params: { orgId: "acme", userId: "usr_42" },
    });

    expect(capturedUrl).toBe("orgs/acme/users/usr_42");
  });

  it("merges query parameters and serializes search string", async () => {
    let capturedUrl = "";
    const mockClient = {
      get: (url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });
      },
    } as any;

    const fn = handler("get", mockClient);
    await fn({
      path: "/items",
      query: { filter: "active", limit: 25, offset: 0 },
    });

    expect(capturedUrl).toBe("items?filter=active&limit=25&offset=0");
  });

  it("handles path parameters with hyphens and special chars", async () => {
    let capturedUrl = "";
    const mockClient = {
      get: (url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });
      },
    } as any;

    const fn = handler("get", mockClient);
    await fn({
      path: "/tags/{tag-name}",
      params: { "tag-name": "architecture-lead" },
    });

    expect(capturedUrl).toBe("tags/architecture-lead");
  });

  it("preserves response status and parses JSON body", async () => {
    const mockClient = {
      post: () => {
        return {
          status: 201,
          json: () => Promise.resolve({ id: "course_1", title: "Clean Code" }),
        };
      },
    } as any;

    const api = createApiClient(mockClient);
    const res = await (api as any).post({
      path: "/courses",
      json: { title: "Clean Code" },
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("course_1");
    expect(data.title).toBe("Clean Code");
  });

  it("handles FormData request bodies", async () => {
    let capturedBody: any;
    const mockClient = {
      post: (_url: string, opts: any) => {
        capturedBody = opts.body;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ uploaded: true }),
        });
      },
    } as any;

    const fn = handler("post", mockClient);
    const formData = new FormData();
    formData.append("file", "dummy-content");

    await fn({
      path: "/upload",
      body: formData,
    });

    expect(capturedBody).toBe(formData);
  });
});
