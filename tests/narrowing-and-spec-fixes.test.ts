import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { generate } from "../src/generator";

const jsonSpecPath = resolve(__dirname, "../sandbox/specs/valid-sample.json");
const yamlSpecPath = resolve(__dirname, "../sandbox/specs/valid-sample.yaml");
const outputDir = resolve(__dirname, "../sandbox/out-narrowing");

describe("Narrowing, Spec Fixes and YAML Generation", () => {
  beforeAll(() => {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("generates correct multi-status response union from JSON spec", async () => {
    const target = resolve(outputDir, "json-api.types.ts");
    await generate(jsonSpecPath, { typesPath: target });

    const content = readFileSync(target, "utf-8");
    // Verify multi-status response union for /courses POST
    expect(content).toContain("KyggerResponse<CourseCreatedDto, 201>");
    expect(content).toContain("KyggerResponse<CourseExistingDto, 200>");
    // Verify 204 response parses to void
    expect(content).toContain("response: KyggerResponse<void, 204>;");
    // Verify binary response parses to Blob
    expect(content).toContain("response: KyggerResponse<Blob, 200>;");
    // Verify text/csv response parses to string
    expect(content).toContain("response: KyggerResponse<string, 200>;");
    // Verify text/event-stream parses to ReadableStream
    expect(content).toContain("response: KyggerResponse<ReadableStream, 200>;");
    // Verify hyphenated parameter in params
    expect(content).toContain('"tag-name": string;');
    // Verify parameter merging on /orgs/{orgId}/departments/{deptId}
    expect(content).toContain("orgId: string;");
    expect(content).toContain("deptId: string;");
    expect(content).toContain("apiKey: string;");
    expect(content).toContain("limit?: number;");
    expect(content).toContain("offset?: number;");
  });

  it("generates matching types from YAML spec", async () => {
    const target = resolve(outputDir, "yaml-api.types.ts");
    await generate(yamlSpecPath, { typesPath: target });

    const content = readFileSync(target, "utf-8");
    expect(content).toContain("KyggerResponse<CourseCreatedDto, 201>");
    expect(content).toContain("KyggerResponse<CourseExistingDto, 200>");
    expect(content).toContain("response: KyggerResponse<void, 204>;");
  });

  it("verifies TypeScript type narrowing and contract checking compiles with tsc", async () => {
    const targetTypes = resolve(outputDir, "types-for-tsc.ts");
    await generate(jsonSpecPath, { typesPath: targetTypes });

    const typeTestConsumer = resolve(outputDir, "consumer.ts");
    const consumerCode = `
import ky from "ky";
import { createApiClient } from "${resolve(__dirname, "../src")}";
import type { KyggerTree, CourseCreatedDto, CourseExistingDto } from "./types-for-tsc";

const client = ky.create();
const api = createApiClient<KyggerTree>(client);

async function testNarrowing() {
  const res = await api.post({
    path: "/courses",
    json: { title: "Fullstack Architecture" },
  });

  // Type narrowing on status code
  if (res.status === 201) {
    const created: CourseCreatedDto = await res.json();
    console.log(created.id, created.createdAt);
  } else if (res.status === 200) {
    const existing: CourseExistingDto = await res.json();
    console.log(existing.id, existing.alreadyEnrolled);
  }

  // Without status check, union is returned
  const unionData: CourseCreatedDto | CourseExistingDto = await res.json();

  // Direct chaining returns union
  const directData: CourseCreatedDto | CourseExistingDto = await api.post({
    path: "/courses",
    json: { title: "Course 2" },
  }).json();

  // 204 void response
  const deleteRes = await api.delete({
    path: "/courses/{id}",
    params: { id: "123" },
  });
  const deleteVoid: void = await deleteRes.json();

  // Scoped path & query parameters
  const deptRes = await api.get({
    path: "/orgs/{orgId}/departments/{deptId}",
    params: { orgId: "org-1", deptId: "dept-2" },
    query: { apiKey: "secret-key", limit: 50 },
  });

  // Hyphenated path param
  const tagRes = await api.get({
    path: "/tags/{tag-name}",
    params: { "tag-name": "typescript" },
  });

  // Binary PDF download
  const reportRes = await api.get({
    path: "/reports/{reportId}/download",
    params: { reportId: "rep-1" },
  });
  const blob: Blob = await reportRes.blob();
}
`;
    writeFileSync(typeTestConsumer, consumerCode);

    // Run tsc on the consumer file to prove type soundness
    const proc = Bun.spawnSync([
      "bunx",
      "tsc",
      "--noEmit",
      "--target",
      "esnext",
      "--moduleResolution",
      "bundler",
      typeTestConsumer,
    ]);

    expect(proc.exitCode).toBe(0);
  }, 30000);
});
