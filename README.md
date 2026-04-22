# kygger

API types generator and client factory for OpenAPI.

## Installation

```bash
npm install kygger
```

## Usage

### Generate Types

```bash
npx kygger <openapi-spec-url-or-file> [output-path]
```

Example:

```bash
npx kygger https://api.example.com/docs-json src/api.types.ts
```

### Create Client

```typescript
import { createApiClient } from 'kygger';
import ky from 'ky';

const baseClient = ky.create({ prefixUrl: 'https://api.example.com' });
export const apiClient = createApiClient(baseClient);

// Usage
const response = await apiClient.get({ path: '/users', query: { limit: 10 } });
const data = await response.json();
```

## Features

- Generates TypeScript types from OpenAPI 3.0 specs.
- Creates a type-safe `apiClient` using `ky`.
- Supports Path parameters, Query parameters, and JSON/Multipart request bodies.
- Lightweight and fast.
