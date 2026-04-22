#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { parseKyggerConfig, resolveOutputPaths } from "./config.js";

export function ensureDirExists(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getTextContent(input: string): Promise<string> {
  if (isUrl(input)) {
    const res = await fetch(input);

    if (!res.ok) {
      throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
    }

    return await res.text();
  }

  if (input.startsWith("file://")) {
    input = fileURLToPath(input);
  }

  const absolutePath = resolve(input);
  return readFileSync(absolutePath, "utf-8");
}

interface OpenApiSpec {
  openapi: string;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

interface PathItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [method: string]: OperationObject | any;
}

interface OperationObject {
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
}

interface ParameterObject {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: SchemaObject;
}

interface RequestBodyObject {
  content: {
    [contentType: string]: MediaTypeObject;
  };
}

interface ResponseObject {
  description: string;
  content?: {
    [contentType: string]: MediaTypeObject;
  };
}

interface MediaTypeObject {
  schema?: SchemaObject;
}

interface SchemaObject {
  type?: string | string[];
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  $ref?: string;
  required?: string[];
  enum?: string[];
  oneOf?: SchemaObject[];
  allOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  nullable?: boolean;
}

function toPascalCase(str: string): string {
  return str.replace(/(^\w|[_-]\w)/g, (match) =>
    match.replace(/[_-]/, "").toUpperCase(),
  );
}

function parseSchema(schema: SchemaObject, rootSpec: OpenApiSpec): string {
  const withNullable = (typeStr: string) => {
    return schema.nullable ? `${typeStr} | null` : typeStr;
  };

  if (schema.$ref) {
    const refName = schema.$ref.split("/").pop();
    return withNullable(refName ? toPascalCase(refName) : "unknown");
  }

  if (schema.oneOf) {
    const union = schema.oneOf.map((s) => parseSchema(s, rootSpec)).join(" | ");
    return withNullable(union);
  }

  if (schema.anyOf) {
    const union = schema.anyOf.map((s) => parseSchema(s, rootSpec)).join(" | ");
    return withNullable(union);
  }

  if (schema.allOf) {
    const intersection = schema.allOf
      .map((s) => parseSchema(s, rootSpec))
      .join(" & ");
    return withNullable(intersection);
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.map((t) =>
      parseSchema({ ...schema, type: t }, rootSpec),
    );
    return types.join(" | ");
  }

  switch (schema.type) {
    case "string":
      if (schema.enum) {
        return withNullable(schema.enum.map((e) => `"${e}"`).join(" | "));
      }
      return withNullable("string");

    case "integer":
    case "number":
      return withNullable("number");

    case "boolean":
      return withNullable("boolean");

    case "null":
      return "null";

    case "array":
      return withNullable(`(${parseSchema(schema.items || {}, rootSpec)})[]`);

    case "object": {
      if (!schema.properties) return withNullable("Record<string, unknown>");

      const props = Object.entries(schema.properties).map(([key, value]) => {
        const isRequired = schema.required?.includes(key);
        return `${key}${isRequired ? "" : "?"}: ${parseSchema(value, rootSpec)};`;
      });
      return withNullable(`{\n${props.join("\n")}\n}`);
    }

    default:
      if (schema.properties) {
        const props = Object.entries(schema.properties).map(([key, value]) => {
          const isRequired = schema.required?.includes(key);
          return `${key}${isRequired ? "" : "?"}: ${parseSchema(value, rootSpec)};`;
        });
        return withNullable(`{\n${props.join("\n")}\n}`);
      }
      return withNullable("unknown");
  }
}

function generatePathParamsType(
  urlPath: string,
  parameters: ParameterObject[] = [],
): string {
  const regex = /\{([^}]+)\}/g;
  const matches = [...urlPath.matchAll(regex)].map((m) => m[1]);

  if (matches.length === 0) {
    return "undefined";
  }

  const props = matches.map((paramName) => {
    const paramDef = parameters.find(
      (p) => p.name === paramName && p.in === "path",
    );
    const schemaType = paramDef?.schema?.type;
    const type =
      schemaType === "integer" || schemaType === "number" ? "number" : "string";

    return `${paramName}: ${type};`;
  });

  return `{\n${props.join("\n")}\n}`;
}

function generateQueryParamsType(
  parameters: ParameterObject[] = [],
  rootSpec: OpenApiSpec,
): string {
  const queryParams = parameters.filter((p) => p.in === "query");

  if (queryParams.length === 0) {
    return "undefined";
  }

  const props = queryParams.map((param) => {
    const isRequired = param.required;
    const schemaType = param.schema
      ? parseSchema(param.schema, rootSpec)
      : "string";
    return `"${param.name}"${isRequired ? "" : "?"}: ${schemaType};`;
  });

  return `{\n${props.join("\n")}\n}`;
}

export async function generate(
  src: string,
  outputFolder?: string,
): Promise<void> {
  const cwd = process.cwd();
  let typesPath: string | null = null;
  let zodPath: string | null = null;

  if (outputFolder) {
    typesPath = join(outputFolder, "api.types.ts");
    zodPath = join(outputFolder, "api.zod.ts");
  } else {
    try {
      const pkgPath = resolve(cwd, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.kygger) {
          const config = parseKyggerConfig(pkg.kygger);
          const { typesPath: tp, zodPath: zp } = resolveOutputPaths(
            config,
            cwd,
          );
          typesPath = tp;
          zodPath = zp;
        }
      }
    } catch (e) {
      const error = e as Error;
      if (
        e instanceof Error &&
        error.message.startsWith("Invalid kygger configuration")
      ) {
        console.error(error.message);
        process.exit(1);
      }
    }
  }

  if (!typesPath && !zodPath) {
    typesPath = join(cwd, "api.types.ts");
    zodPath = join(cwd, "api.zod.ts");
  }

  const jsonText = await getTextContent(src);
  const spec: OpenApiSpec = JSON.parse(jsonText);
  const buffer: string[] = [];

  buffer.push(`/* eslint-disable */`);
  buffer.push(`// --- Generated Types from OpenAPI Spec --- \n`);

  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      const typeName = toPascalCase(name);
      buffer.push(`export type ${typeName} = ${parseSchema(schema, spec)};\n`);
    }
  }

  const paths = Object.keys(spec.paths);
  const pathsString = paths.map((p) => `"${p}"`).join(" | \n  ");
  buffer.push(`export type Paths = \n  ${pathsString};\n`);

  buffer.push(`export interface KyggerTree {`);

  const methods = ["get", "post", "put", "delete", "patch"] as const;

  for (const method of methods) {
    const pathsWithMethod = Object.entries(spec.paths).filter(
      ([, pathItem]) => !!pathItem[method],
    );

    if (pathsWithMethod.length === 0) continue;

    buffer.push(`  "${method}": {`);

    for (const [route, pathItem] of pathsWithMethod) {
      const op = pathItem[method] as OperationObject;

      buffer.push(`    "${route}": {`);
      buffer.push(`      pathname: "${route}";`);

      const pathParamsType = generatePathParamsType(
        route,
        pathItem.parameters as ParameterObject[],
      );
      if (pathParamsType !== "undefined") {
        buffer.push(`      params: ${pathParamsType};`);
      }

      if (op.parameters) {
        const queryType = generateQueryParamsType(op.parameters, spec);
        if (queryType !== "undefined") {
          buffer.push(`      query: ${queryType};`);
        }
      }

      const successKey = Object.keys(op.responses || {}).find((k) =>
        k.startsWith("2"),
      );
      if (successKey && op.responses) {
        const successResponse = op.responses[successKey];
        if (
          successResponse?.content &&
          successResponse.content["application/json"]?.schema
        ) {
          const returnType = parseSchema(
            successResponse.content["application/json"].schema,
            spec,
          );
          buffer.push(`      response: {`);
          buffer.push(`        json: () => Promise<${returnType}>;`);
          buffer.push(`      };`);
        }
      }

      if (op.requestBody && op.requestBody.content) {
        buffer.push(`      request:`);
        const content = op.requestBody.content;
        const requestOptions: string[] = [];

        if (content["application/json"]?.schema) {
          const bodyType = parseSchema(
            content["application/json"].schema,
            spec,
          );
          requestOptions.push(`{ json: ${bodyType}; }`);
        }

        if (content["multipart/form-data"]) {
          requestOptions.push(`{ body: FormData; }`);
        }

        if (requestOptions.length > 0) {
          buffer.push(requestOptions.join(" | ") + ";");
        } else {
          buffer.push(" never;");
        }
      }

      buffer.push(`    };`);
    }

    buffer.push(`  };`);
  }

  buffer.push(`}`);
  buffer.push("");

  const code = buffer.join("\n");
  const formatted = await prettier.format(code, { parser: "typescript" });

  if (typesPath) {
    ensureDirExists(typesPath);
    writeFileSync(typesPath, formatted);
    console.info(`Successfully generated ${typesPath}`);
  }

  if (zodPath) {
    ensureDirExists(zodPath);
    try {
      spawnSync("npx", ["openapi-zod-client", src, "-o", zodPath], {
        stdio: "inherit",
      });
      console.info(`Successfully generated ${zodPath}`);
    } catch (e) {
      console.error(`Failed to generate zod schema: ${e}`);
      process.exit(1);
    }
  }
}

async function main() {
  const src = process.argv[2];
  const outputFolder = process.argv[3];

  if (!src) {
    console.error("Usage: kygger <source-url-or-file> [output-folder]");
    process.exit(1);
  }

  await generate(src, outputFolder);
}

const isMain =
  process.argv[1]?.endsWith("generator.ts") ||
  process.argv[1]?.endsWith("kygger");

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
