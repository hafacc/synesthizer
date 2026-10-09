import { version } from "$app/env";
import { assets, immutable, prerendered } from "$app/manifest";
import { self } from "$app/service-worker";

const shell = `app-${version}`;
// the piano sounds rarely change, so their cache outlives app versions; the
// number goes up whenever the sound files are regenerated
const sounds = "sounds-2";

function absolute(path: string): string {
  return new URL(path.replace(/^\//, ""), self.registration.scope).href;
}

// everything but the sounds is fetched up front; the sounds are kept as the
// page asks for them, which it does for all of them on first load
const precached = new Set<string>(
  [...immutable, ...prerendered, ...assets]
    .map(({ path }) => absolute(path))
    .filter((url) => !url.endsWith(".mp3")),
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(shell).then((cache) => cache.addAll([...precached])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== shell && key !== sounds)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

async function respond(request: Request): Promise<Response> {
  const [url] = request.url.split(/[?#]/);
  const name = precached.has(url)
    ? shell
    : url.endsWith(".mp3")
      ? sounds
      : null;
  if (name === null) {
    return fetch(request);
  } else {
    const cache = await caches.open(name);
    const hit = await cache.match(url);
    if (hit) {
      return hit;
    } else {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(url, response.clone());
      }
      return response;
    }
  }
}

self.addEventListener("fetch", (event) => {
  const { method, url } = event.request;
  if (method === "GET" && url.startsWith(self.registration.scope)) {
    event.respondWith(respond(event.request));
  }
});
