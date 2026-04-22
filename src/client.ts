import type { KyInstance } from "ky";

/**
 * Creates a type-safe API client based on a generated ApiTree.
 * 
 * @param client The Ky instance to use for requests
 * @returns An object with get, post, put, delete, patch methods
 */
export function createApiClient<K>(client: KyInstance): K {
  function apiMethod(method: string) {
    return function (options: any) {
      // Remove leading slash if present for prefixUrl compatibility
      let url = options.path.toString();
      if (url.startsWith("/")) {
        url = url.slice(1);
      }

      // Handle path parameters
      if (
        "params" in options &&
        typeof options.params === "object" &&
        options.params !== null
      ) {
        for (const [key, value] of Object.entries(options.params)) {
          url = url.replace(`{${key}}`, String(value));
        }
      }

      // Handle query parameters
      if (
        "query" in options &&
        typeof options.query === "object" &&
        options.query !== null
      ) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(options.query)) {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        }
        const queryString = searchParams.toString();
        if (queryString) {
          url += (url.includes("?") ? "&" : "?") + queryString;
        }
      }

      // Handle request body
      const requestOptions: any = {};
      if ("json" in options) {
        requestOptions.json = options.json;
      } else if ("body" in options) {
        requestOptions.body = options.body;
      }

      return (client as any)[method](url, requestOptions);
    };
  }

  return {
    get: apiMethod("get"),
    delete: apiMethod("delete"),
    post: apiMethod("post"),
    patch: apiMethod("patch"),
    put: apiMethod("put"),
  } as K;
}
