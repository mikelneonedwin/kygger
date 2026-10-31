# kygger

> **Zero-drift, end-to-end type-safe API client for OpenAPI and Ky.**  
> Turn any OpenAPI (Swagger) specification into a strongly-typed [Ky](https://github.com/sindresorhus/ky) client with full autocomplete for routes, path parameters, query strings, request bodies, and responses.

[![npm version](https://img.shields.io/npm/v/kygger.svg)](https://www.npmjs.com/package/kygger)
[![license](https://img.shields.io/npm/l/kygger.svg)](https://github.com/mikelneonedwin/kygger)

---

## Why Kygger?

### The Problem: Type Drift & False Confidence

Modern web apps constantly suffer from **API type drift**:

1. **Manual Types Drift Silently**: You write `interface UserDto { ... }` on the frontend. When the backend renames a field or changes an ID from `string` to `number`, your TypeScript compiles without warnings, until production crashes with `undefined is not a function`.
2. **String URLs & Manual Formatting**: Constructing URLs like `/api/v1/users/${id}?filter=${encodeURIComponent(query)}` is error-prone. One typo in a query parameter or path segment breaks your request.
3. **Manual Generics Are Unenforced**: Calling `ky.get('/users').json<MyDto>()` doesn't verify that `/users` actually returns `MyDto`. The generic is just a blind type assertion (`as MyDto`).
4. **Heavy SDK Generators Are Bloated**: Traditional OpenAPI generators produce hundreds of messy class files, opinionated wrappers, and bloated bundles that obscure the underlying HTTP response.

### The Solution: Type Safety Meets Native Ky

`kygger` bridges the gap between your OpenAPI contract and your HTTP client:

- **Single Source of Truth**: Generates a single, compact `api.types.ts` tree directly from your OpenAPI specification.
- **100% Autocompleted & Verified**: Route paths, path parameters (`params`), query parameters (`query`), and request bodies (`json` or `FormData`) are verified at compile time.
- **Preserves Native Ky & Fetch Powers**: You are never locked into an opaque SDK. Kygger returns a real `KyResponse`, giving you direct access to `.blob()`, `.text()`, `.formData()`, `.headers`, `.status`, `.clone()`, and Ky's hook and retry architecture.
- **Zero Runtime Bloat**: The generator only outputs TypeScript types. The client runtime is an ultra-lightweight (~1 KB) wrapper around Ky.

---

## Before & After

### Without Kygger (Manual, Fragile, Blind Assertions)

```typescript
// ❌ No route verification (typo compiles silently)
// ❌ Manual path string concatenation
// ❌ Manual query parameter assembly
// ❌ Unverified return type assertion (false sense of safety)
const res = await ky.get(
  `https://api.example.com/users/${userId}?includePosts=true`,
);
const user = await res.json<UserDto>();
```

### With Kygger (Autocomplete, Type-Checked, Contract-Verified)

```typescript
// ✅ Route path autocompleted from OpenAPI spec
// ✅ 'id' path parameter required and strongly typed
// ✅ 'includePosts' query parameter autocompleted and type-checked
// ✅ Return type inferred automatically from the API spec
const res = await apiClient.get({
  path: "/users/{id}",
  params: { id: "usr_123" },
  query: { includePosts: true },
});

const user = await res.json(); // Inferred as UserDto!
```

---

## Installation

```bash
# Using bun (recommended)
bun add kygger ky

# Using pnpm
pnpm add kygger ky

# Using npm
npm install kygger ky
```

---

## Quick Start (3 Steps)

### 1. Generate Types from Your OpenAPI Spec

Run `kygger` against your local spec file (JSON or YAML) or live API endpoint:

```bash
# From a remote URL (JSON or YAML)
npx kygger https://api.example.com/openapi.yaml -t ./src/api.types.ts

# From a local specification file
npx kygger ./swagger.yaml -t ./src/api.types.ts
```

### 2. Create Your API Client

Initialize a Ky instance and wrap it with `createApiClient`:

```typescript
// src/api.ts
import ky from "ky";
import { createApiClient } from "kygger";
import type { KyggerTree } from "./api.types";

const baseClient = ky.create({
  prefix: "https://api.example.com",
  timeout: 10000,
});

export const api = createApiClient<KyggerTree>(baseClient);
```

### 3. Make Type-Safe API Calls

Enjoy complete autocompletion and compile-time contract enforcement:

```typescript
import { api } from "./api";

// 1. GET with path and query parameters
const userResponse = await api.get({
  path: "/organizations/{orgId}/users/{userId}",
  params: { orgId: "org_1", userId: "usr_2" },
  query: { detailed: true },
});
const user = await userResponse.json(); // Strongly-typed DTO

// 2. POST with JSON body
const createResponse = await api.post({
  path: "/posts",
  json: {
    title: "Introducing Kygger",
    content: "Type-safe API client for Ky",
  },
});
const newPost = await createResponse.json();

// 3. Multi-Status Discrimination:
const courseRes = await api.post({
  path: "/courses",
  json: { title: "TypeScript Mastery" },
});

if (courseRes.status === 201) {
  // TypeScript narrows .json() to CreatedCourseDto
  const created = await courseRes.json();
} else if (courseRes.status === 200) {
  // TypeScript narrows .json() to ExistingCourseDto
  const existing = await courseRes.json();
}

// 4. POST with Multipart / FormData upload
const uploadResponse = await api.post({
  path: "/users/{id}/avatar",
  params: { id: "usr_2" },
  body: new FormData(),
});

// 5. Full native Response access remains intact!
console.log(userResponse.status); // 200
console.log(userResponse.headers.get("x-request-id"));
const avatarBlob = await uploadResponse.blob();
const textBody = await userResponse.text();
```

---

## OpenAPI Diagnostics & Best Practice Advisor

Kygger includes an opt-in advisor that audits your OpenAPI specification during generation to prevent silent runtime errors and guarantee end-to-end type safety:

- **Empty 200 Responses**: Flags endpoints returning 200 without a response schema, suggesting `204 No Content` or `201 Created`.
- **204 With Body**: Catches RFC 9110 violations where 204 responses define a body schema (which causes runtime JSON parse failures).
- **GET/DELETE With Request Body**: Warns when read operations carry a body that will be stripped by browsers, CDNs, or proxies.
- **Path Parameter Mismatches**: Detects template variables (`{id}`) missing from `parameters` or marked `required: false`.
- **Empty Object DTOs**: Detects backend models generated without fields (e.g. missing `@ApiProperty()` in NestJS).
- **Broken References**: Catches dangling `$ref` pointers before they cause TypeScript compiler errors.
- **Destructive GETs**: Identifies destructive actions exposed over GET requests.

### Opt-In Diagnostics, AI Prompts & CI Reports

Diagnostics is opt-in, keeping standard generation silent and focused. Enable diagnostics using `--diagnostics` (or `-d` / `--advisor` / `-a`), or by specifying a report format or strict mode:

```bash
# Run generation with OpenAPI diagnostics enabled in console
npx kygger ./swagger.json --diagnostics

# Export AI-ready remediation prompt
npx kygger ./swagger.json --report prompt --report-file audit-prompt.md

# CI strict mode (fails with exit code 1 if errors or warnings exist)
npx kygger ./swagger.json --strict
```

---

## Integration with React Query / TanStack Query

Kygger exports utility generics (`Query`, `Params`, `Request`, `Response`, `Endpoint`) so you can cleanly extract DTOs and parameter shapes anywhere in your app:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "./api";
import type { Query, Params, Request, Response } from "kygger";
import type { KyggerTree } from "./api.types";

// Extract query parameters and response types for an endpoint
type UserListQuery = Query<KyggerTree, "get", "/users">;
type UserListResponse = Response<KyggerTree, "get", "/users">;
type CreateUserPayload = Request<KyggerTree, "post", "/users">;

export function useUsers(queryFilters: UserListQuery) {
  return useQuery({
    queryKey: ["users", queryFilters],
    queryFn: async () => {
      const res = await api.get({
        path: "/users",
        query: queryFilters,
      });
      return await res.json();
    },
  });
}
```

---

## CLI Reference

```bash
npx kygger <openapi-spec-url-or-file> [options]
```

### CLI Flags

| Flag            | Short | Description                                                            | Default          |
| :-------------- | :---- | :--------------------------------------------------------------------- | :--------------- |
| `--types`       | `-t`  | Output path for generated TypeScript types file                        | `./api.types.ts` |
| `--diagnostics` | `-d`  | Enable OpenAPI diagnostics and advisor checks (opt-in)                 | `false`          |
| `--advisor`     | `-a`  | Alias for `--diagnostics`                                              | `false`          |
| `--quiet`       | `-q`  | Suppress diagnostic messages and warnings (or set `KYGGER_QUIET=true`) | `false`          |
| `--strict`      |       | Exit with non-zero exit code if warnings or errors are found           | `false`          |
| `--report`      |       | Diagnostic output format (`console`, `markdown`, `json`, `prompt`)     | `console`        |
| `--report-file` |       | Path to export the diagnostic report to                                | `undefined`      |

---

## How It Compares

| Feature                        | Raw `fetch` / `ky`       | Heavy SDK Generators       | `openapi-typescript` alone   | **Kygger**                        |
| :----------------------------- | :----------------------- | :------------------------- | :--------------------------- | :-------------------------------- |
| **End-to-End Autocomplete**    | ❌ None                  | ✅ Yes                     | ⚠️ Types only, manual client | ✅ **Full client autocomplete**   |
| **Path Params Interpolation**  | ❌ Manual string concat  | ⚠️ Opaque methods          | ❌ Manual string concat      | ✅ **Typed `params` object**      |
| **Query Params Serialization** | ⚠️ Manual `searchParams` | ⚠️ Method parameters       | ❌ Manual assembly           | ✅ **Typed `query` object**       |
| **Native `Response` Access**   | ✅ Yes                   | ❌ Stripped / hidden       | ✅ Yes                       | ✅ **Full `KyResponse` access**   |
| **Bundle Footprint**           | ✅ Minimal               | ❌ Heavy generated classes | ✅ Zero runtime              | ✅ **~1 KB lightweight wrapper**  |
| **Ky Ecosystem (Hooks/Retry)** | ✅ Full                  | ❌ Not supported           | ⚠️ Manual wiring             | ✅ **First-class Ky integration** |

---

## License

MIT © [Winner Edwin](https://github.com/mikelneonedwin)
