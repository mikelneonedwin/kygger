import type { Diagnostic } from "./types";

interface SchemaLike {
  type?: string | string[];
  properties?: Record<string, SchemaLike>;
  additionalProperties?: boolean | SchemaLike;
  items?: SchemaLike;
  $ref?: string;
  required?: string[];
  oneOf?: SchemaLike[];
  allOf?: SchemaLike[];
  anyOf?: SchemaLike[];
}

interface ParameterLike {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: SchemaLike;
}

interface ResponseLike {
  description?: string;
  content?: Record<string, { schema?: SchemaLike }>;
}

interface OperationLike {
  operationId?: string;
  summary?: string;
  parameters?: ParameterLike[];
  requestBody?: {
    content?: Record<string, { schema?: SchemaLike }>;
  };
  responses?: Record<string, ResponseLike>;
}

interface PathItemLike {
  parameters?: ParameterLike[];
  [method: string]: OperationLike | ParameterLike[] | unknown;
}

export interface SpecLike {
  openapi?: string;
  paths?: Record<string, PathItemLike>;
  components?: {
    schemas?: Record<string, SchemaLike>;
  };
}

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
] as const;

export function runDiagnostics(spec: SpecLike): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const paths = spec.paths ?? {};
  const schemas = spec.components?.schemas ?? {};
  const knownSchemaNames = new Set(Object.keys(schemas));

  // Helper to collect all $ref in a schema
  function collectRefs(schema: SchemaLike, acc: Set<string>): void {
    if (schema.$ref) {
      acc.add(schema.$ref);
    }
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        collectRefs(prop, acc);
      }
    }
    if (schema.items) {
      collectRefs(schema.items, acc);
    }
    for (const sub of schema.oneOf ?? []) {
      collectRefs(sub, acc);
    }
    for (const sub of schema.anyOf ?? []) {
      collectRefs(sub, acc);
    }
    for (const sub of schema.allOf ?? []) {
      collectRefs(sub, acc);
    }
  }

  // Check 1: Empty Object Schemas in components.schemas
  for (const [name, schema] of Object.entries(schemas)) {
    const hasProps =
      schema.properties && Object.keys(schema.properties).length > 0;
    const hasAddProps = schema.additionalProperties !== undefined;
    const hasCompositions =
      (schema.oneOf?.length ?? 0) > 0 ||
      (schema.anyOf?.length ?? 0) > 0 ||
      (schema.allOf?.length ?? 0) > 0;

    if (
      schema.type === "object" &&
      !hasProps &&
      !hasAddProps &&
      !hasCompositions
    ) {
      diagnostics.push({
        ruleId: "empty-object-schema",
        category: "type-safety",
        severity: "warning",
        specPath: `components.schemas.${name}`,
        message: `Schema '${name}' is defined as type 'object' with no properties.`,
        recommendation: `Kygger will generate 'Record<string, unknown>', resulting in untyped frontend code. Ensure backend DTO fields have Swagger decorators (e.g. @ApiProperty in NestJS or Pydantic fields in FastAPI).`,
      });
    }

    // Check $ref inside schemas
    const refs = new Set<string>();
    collectRefs(schema, refs);
    for (const ref of refs) {
      if (ref.startsWith("#/components/schemas/")) {
        const target = ref.replace("#/components/schemas/", "");
        if (!knownSchemaNames.has(target)) {
          diagnostics.push({
            ruleId: "broken-ref",
            category: "spec-integrity",
            severity: "error",
            specPath: `components.schemas.${name}.$ref`,
            message: `Broken reference: '${ref}' does not exist in components.schemas.`,
            recommendation: `Target schema '${target}' is missing from the OpenAPI spec. Generated TypeScript will fail compilation with TS2304.`,
            docUrl: "https://spec.openapis.org/oas/v3.0.3#reference-object",
          });
        }
      }
    }
  }

  // Iterate routes and operations
  for (const [route, pathItem] of Object.entries(paths)) {
    const pathLevelParams = Array.isArray(pathItem.parameters)
      ? (pathItem.parameters as ParameterLike[])
      : [];

    // Path template matches
    const templateMatches = [...route.matchAll(/\{([^}]+)\}/g)].map(
      (m) => m[1],
    );

    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as OperationLike | undefined;
      if (!op || typeof op !== "object") continue;

      const endpoint = { method: method.toUpperCase(), path: route };
      const opLevelParams = Array.isArray(op.parameters) ? op.parameters : [];

      // Merge parameters (operation overrides path-level)
      const mergedParamsMap = new Map<string, ParameterLike>();
      for (const p of pathLevelParams) {
        if (p?.name && p?.in) mergedParamsMap.set(`${p.in}:${p.name}`, p);
      }
      for (const p of opLevelParams) {
        if (p?.name && p?.in) mergedParamsMap.set(`${p.in}:${p.name}`, p);
      }

      // Check 2: Missing Path Parameters or required: false
      for (const paramName of templateMatches) {
        const paramDef = mergedParamsMap.get(`path:${paramName}`);
        if (!paramDef) {
          diagnostics.push({
            ruleId: "missing-path-parameter",
            category: "spec-integrity",
            severity: "error",
            endpoint,
            specPath: `paths['${route}'].${method}.parameters`,
            message: `Path parameter '{${paramName}}' in route '${route}' is missing from the parameters declaration.`,
            recommendation: `OpenAPI 3.0.3 §4.8.12 requires all path parameters in route templates to be defined in 'parameters' with 'in: "path"' and 'required: true'.`,
            docUrl: "https://spec.openapis.org/oas/v3.0.3#parameter-object",
          });
        } else if (paramDef.required !== true) {
          diagnostics.push({
            ruleId: "missing-path-parameter",
            category: "spec-integrity",
            severity: "error",
            endpoint,
            specPath: `paths['${route}'].${method}.parameters['${paramName}'].required`,
            message: `Path parameter '{${paramName}}' has required: ${paramDef.required}, but path parameters MUST be required.`,
            recommendation: `Set 'required: true' on parameter '${paramName}'. In HTTP URLs, path parameters cannot be omitted.`,
            docUrl: "https://spec.openapis.org/oas/v3.0.3#parameter-object",
          });
        }
      }

      // Check 3: GET/DELETE with Request Body
      if (
        (method === "get" || method === "delete" || method === "head") &&
        op.requestBody
      ) {
        diagnostics.push({
          ruleId: "get-with-request-body",
          category: "http-semantics",
          severity: "warning",
          endpoint,
          specPath: `paths['${route}'].${method}.requestBody`,
          message: `HTTP ${method.toUpperCase()} endpoint defines a requestBody.`,
          recommendation: `RFC 9110 §9.3.1 states GET payloads have no defined semantics. Fetch, Ky, proxies, and CDNs frequently strip or reject bodies on GET/DELETE. Move fields to query parameters ('in: "query"') or change method to POST.`,
          docUrl: "https://www.rfc-editor.org/rfc/rfc9110#section-9.3.1",
        });
      }

      // Check 4: Destructive action on GET
      if (method === "get") {
        const lowerRoute = route.toLowerCase();
        const lowerSummary = (op.summary ?? "").toLowerCase();
        const lowerOpId = (op.operationId ?? "").toLowerCase();
        const isDestructive =
          /\/(?:delete|destroy|remove|purge|cancel)(?:\/|$)/.test(lowerRoute) ||
          lowerSummary.startsWith("delete") ||
          lowerOpId.startsWith("delete");

        if (isDestructive) {
          diagnostics.push({
            ruleId: "destructive-get",
            category: "best-practice",
            severity: "warning",
            endpoint,
            specPath: `paths['${route}'].get`,
            message: `Destructive or state-changing action detected on HTTP GET endpoint '${route}'.`,
            recommendation: `RFC 9110 §9.2.1 mandates that GET must be a safe, read-only method. Browser pre-fetching, link indexers, and proxy caching can trigger unintended deletions. Use HTTP DELETE or POST instead.`,
            docUrl: "https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1",
          });
        }
      }

      // Responses inspection
      const responses = op.responses ?? {};

      // Check 5: 204 with body
      if (
        responses["204"]?.content &&
        Object.keys(responses["204"].content).length > 0
      ) {
        diagnostics.push({
          ruleId: "content-on-204",
          category: "http-semantics",
          severity: "error",
          endpoint,
          specPath: `paths['${route}'].${method}.responses['204'].content`,
          message: `HTTP 204 (No Content) defines a response body schema.`,
          recommendation: `RFC 9110 §15.3.5 prohibits 204 responses from containing a message body. Clients calling response.json() will crash at runtime with 'SyntaxError: Unexpected end of JSON input'. Remove the content block on 204, or use 200 OK if returning data.`,
          docUrl: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.5",
        });
      }

      // Check 6: Empty 200 response with no content/schema
      const resp200 = responses["200"];
      if (resp200) {
        const contentKeys = Object.keys(resp200.content ?? {});
        const hasJsonSchema =
          resp200.content?.["application/json"]?.schema !== undefined;

        if (
          contentKeys.length === 0 ||
          (!hasJsonSchema && contentKeys.includes("application/json"))
        ) {
          diagnostics.push({
            ruleId: "empty-200-response",
            category: "http-semantics",
            severity: "warning",
            endpoint,
            specPath: `paths['${route}'].${method}.responses['200']`,
            message: `Returns HTTP 200 OK without a response schema or content definition.`,
            recommendation: `If this endpoint returns no payload, use HTTP 204 (No Content) [RFC 9110 §15.3.5]. If it creates a resource, use HTTP 201 (Created) [RFC 9110 §15.3.2] with a schema or Location header. If returning JSON, declare content['application/json'].schema.`,
            docUrl: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.5",
          });
        }
      }

      // Check $ref inside responses and requestBody
      for (const [code, resp] of Object.entries(responses)) {
        if (resp.content) {
          for (const media of Object.values(resp.content)) {
            if (media.schema) {
              const refs = new Set<string>();
              collectRefs(media.schema, refs);
              for (const ref of refs) {
                if (ref.startsWith("#/components/schemas/")) {
                  const target = ref.replace("#/components/schemas/", "");
                  if (!knownSchemaNames.has(target)) {
                    diagnostics.push({
                      ruleId: "broken-ref",
                      category: "spec-integrity",
                      severity: "error",
                      endpoint,
                      specPath: `paths['${route}'].${method}.responses['${code}']`,
                      message: `Broken reference: '${ref}' does not exist in components.schemas.`,
                      recommendation: `Target schema '${target}' is missing from components.schemas. Generated TypeScript will fail compilation with TS2304.`,
                      docUrl:
                        "https://spec.openapis.org/oas/v3.0.3#reference-object",
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return diagnostics;
}
