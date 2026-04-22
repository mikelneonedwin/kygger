# kygger

API types generator and client factory for OpenAPI.

## Installation

```bash
npm install kygger
```

## Usage

### Generate Types and Zod Schemas

```bash
npx kygger <openapi-spec-url-or-file> [output-folder]
```

By default, it writes to `api.types.ts` and `api.zod.ts` in the current directory or the specified `output-folder`.

You can also configure the output paths in your `package.json`:

```json
{
  "kygger": {
    "types": "src/api.types.ts",
    "zod": "src/api.zod.ts"
  }
}
```

Or just specify a folder:

```json
{
  "kygger": "src/generated"
}
```

Example:

```bash
npx kygger https://api.example.com/docs-json src/api
```

### Create Client

```typescript
import { createApiClient } from "kygger";
import type { KyggerTree } from "./api.types";
import ky from "ky";

const baseClient = ky.create({ prefixUrl: "https://api.example.com" });
export const apiClient = createApiClient<KyggerTree>(baseClient);

// Usage
const response = await apiClient.get({
  path: "/users",
  query: { limit: 10 },
});
const data = await response.json();
```

## Features

- Generates TypeScript types from OpenAPI 3.0 specs.
- Generates Zod schemas using `openapi-zod-client`.
- Creates a type-safe `apiClient` using `ky`.
- Supports Path parameters, Query parameters, and JSON/Multipart request bodies.
- Lightweight and fast.
- Integrated linting and git hooks support.
