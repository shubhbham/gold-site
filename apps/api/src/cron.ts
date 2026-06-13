import { runDailyFetch } from "./services/fetcher";

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: unknown,
): Promise<void> {
  try {
    await runDailyFetch(env, controller.scheduledTime);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "scheduled fetch failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}