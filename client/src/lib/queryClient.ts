import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    // Try to parse JSON error response with validation details
    try {
      const errorData = JSON.parse(text);
      if (errorData.details && Array.isArray(errorData.details)) {
        // Format validation errors in a readable way
        const errorMessages = errorData.details
          .slice(0, 10) // Limit to first 10 errors
          .map((detail: any) => `Question ${detail.path}: ${detail.message}`)
          .join('\n');

        const remainingCount = errorData.details.length - 10;
        const suffix = remainingCount > 0
          ? `\n...and ${remainingCount} more validation errors`
          : '';

        throw new Error(`Validation failed:\n${errorMessages}${suffix}`);
      } else if (errorData.error) {
        throw new Error(errorData.error);
      }
    } catch (e) {
      // If not JSON or parsing failed, use original text
      if (e instanceof Error && e.message.startsWith('Validation failed:')) {
        throw e; // Re-throw our formatted error
      }
    }

    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
