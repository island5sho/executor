				import worker, * as OTHER_EXPORTS from "/home/rhys/assistant/v2/packages/runtime-cloudflare-worker-loader/worker/src/index.ts";
				import * as __MIDDLEWARE_0__ from "/home/rhys/assistant/v2/node_modules/.bun/wrangler@4.69.0+43cd165320f4af71/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts";
import * as __MIDDLEWARE_1__ from "/home/rhys/assistant/v2/node_modules/.bun/wrangler@4.69.0+43cd165320f4af71/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts";

				export * from "/home/rhys/assistant/v2/packages/runtime-cloudflare-worker-loader/worker/src/index.ts";
				const MIDDLEWARE_TEST_INJECT = "__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__";
				export const __INTERNAL_WRANGLER_MIDDLEWARE__ = [
					
					__MIDDLEWARE_0__.default,__MIDDLEWARE_1__.default
				]
				export default worker;