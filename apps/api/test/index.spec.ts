import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("gold api worker", () => {
	it("responds with service metadata", async () => {
		const request = new IncomingRequest("http://example.com/");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as { data: { service: string; status: string } };
		expect(payload.data.service).toBe("gold-api-worker");
	});

	it("exposes a health endpoint", async () => {
		const response = await SELF.fetch("https://example.com/api/health");
		expect([200, 503]).toContain(response.status);
	});
});
