# kygger

Type-safe API types generator and client factory for OpenAPI built on top of [Ky](https://github.com/sindresorhus/ky).

## Installation

```bash
npm install kygger ky
```

## CLI Usage

Generate TypeScript types and Zod schemas directly from an OpenAPI 3.0 specification file or URL:

```bash
# Generate types and zod schemas with custom paths
npx kygger <openapi-spec-url-or-file> --types ./src/api.types.ts --zod ./src/api.zod.ts

# Short flags
npx kygger https://api.example.com/openapi.json -t ./src/api.types.ts -z ./src/api.zod.ts

# Generate only types
npx kygger ./swagger.json -t ./src/api.types.ts
```

### CLI Flags

| Flag      | Short | Description                                     | Default          |
| --------- | ----- | ----------------------------------------------- | ---------------- |
| `--types` | `-t`  | Output path for generated TypeScript types file | `./api.types.ts` |
| `--zod`   | `-z`  | Output path for generated Zod schemas file      | `./api.zod.ts`   |

---

## Client Usage

`kygger` creates a strongly-typed client wrapper around a Ky instance while retaining full access to standard `Response` and Ky methods.

```typescript
import ky from "ky";
import { createApiClient } from "kygger";
import type { KyggerTree } from "./api.types";

const baseClient = ky.create({
  prefixUrl: "https://api.example.com",
});

export const apiClient = createApiClient<KyggerTree>(baseClient);

// Strongly typed path, params, query, and request body
const response = await apiClient.get({
  path: "/users/{id}",
  params: { id: "usr_123" },
  query: { includePosts: true },
});

// Awaiting .json() returns the strongly-typed DTO for that endpoint
const user = await response.json();

// Full access to native fetch / Ky Response properties and methods remains intact!
console.log(response.status); // 200
console.log(response.headers);
const blob = await response.blob();
const clonedResponse = response.clone();
```

---

## Utility Types

`kygger` exports convenient helper generics to extract specific parameter or response types for any endpoint in your `KyggerTree`:

```typescript
import type { Query, Params, Request, Response, Endpoint } from "kygger";
import type { KyggerTree } from "./api.types";

// Extract query parameters for an endpoint
type UserQueryParams = Query<KyggerTree, "get", "/users">;

// Extract path parameters for an endpoint
type UserPathParams = Params<KyggerTree, "get", "/users/{id}">;

// Extract request body options for an endpoint
type CreateUserReq = Request<KyggerTree, "post", "/users">;

// Extract response type for an endpoint
type UserResponse = Response<KyggerTree, "get", "/users/{id}">;

// Extract full endpoint schema object
type UserEndpointSchema = Endpoint<KyggerTree, "get", "/users/{id}">;
```

---

## Features

- **End-to-End Type Safety**: Strongly-typed paths, path parameters (`params`), query parameters (`query`), and request bodies (`json` or `FormData`).
- **Unrestricted `Response` Access**: Method return types are wrapped in `KyResponse<T>`, giving you strongly typed `.json()` while preserving `.blob()`, `.text()`, `.clone()`, `.formData()`, `.body`, `.status`, etc.
- **CLI Options**: Custom `--types`/`-t` and `--zod`/`-z` output paths.
- **Helper Generics**: Exported `Query`, `Params`, `Request`, `Response`, and `Endpoint` helper types for clean integration in React Query or custom state handlers.
