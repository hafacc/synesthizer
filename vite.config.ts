import process from "node:process";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// set when the site is served from a subfolder, e.g. "/synesthizer"
const base = (process.env.BASE_PATH ?? "") as "" | `/${string}`;

export default defineConfig({
  // only the worker imports these, so vite finds them late and reloads the
  // page on the first conversion unless told up front
  optimizeDeps: { include: ["core-js/actual/iterator", "uuid"] },
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter(),
      paths: { base },
    }),
  ],
});
