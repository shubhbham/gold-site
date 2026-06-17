import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  adapter: cloudflare({ mode: "directory", functionPerRoute: false }),
  integrations: [react()],
  output: "server",
  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ["node:async_hooks"] },
  },
});

