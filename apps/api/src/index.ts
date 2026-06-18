import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiResponse } from "@gold-site/shared";
import { handleScheduled } from "./cron";
import { getCitiesHandler } from "./routes/cities";
import { getGoldHandler, patchGoldHandler, postAdminFetchHandler } from "./routes/gold";
import { getHealthHandler } from "./routes/health";
import { getHistoryHandler } from "./routes/history";
import { getRatesHandler } from "./routes/rates";
import { getSummaryHandler } from "./routes/summary";

export type AppEnv = {
	Bindings: Env;
};

export const app = new Hono<AppEnv>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PATCH", "OPTIONS"] }));

app.get("/", (c) => {
	const payload: ApiResponse<{ service: string; status: string }> = {
		data: { service: "gold-api-worker", status: "ok" },
		error: null,
		cached: false,
	};
	return c.json(payload);
});

app.get("/api/gold", getGoldHandler);
app.get("/api/summary", getSummaryHandler);
app.get("/api/history/:city", getHistoryHandler);
app.get("/api/cities", getCitiesHandler);
app.get("/api/rates", getRatesHandler);
app.get("/api/health", getHealthHandler);
app.post("/api/admin/fetch", postAdminFetchHandler);
app.patch("/api/gold", patchGoldHandler);

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx);
	},
	scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		return handleScheduled(controller, env, ctx);
	},
} satisfies ExportedHandler<Env>;
