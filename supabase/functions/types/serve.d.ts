/**
 * Stub type declarations for https://deno.land/std@0.177.0/http/server.ts
 * Matches the serve() signature used by Supabase Edge Functions.
 */

type ServeHandler = (request: Request) => Response | Promise<Response>;

interface ServeOptions {
  port?: number;
  hostname?: string;
  signal?: AbortSignal;
  onError?: (error: unknown) => Response | Promise<Response>;
  onListen?: (params: { hostname: string; port: number }) => void;
}

export declare function serve(
  handler: ServeHandler,
  options?: ServeOptions,
): void;
