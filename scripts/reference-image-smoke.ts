// Smoke test for the reference-image path in FalProvider/FalBackgroundProvider.
// Stubs global fetch; no API calls. Run: npx tsx scripts/reference-image-smoke.ts

import { FalProvider, FalBackgroundProvider } from "../engine/image-providers.ts";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`OK  ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}
const calls: CapturedCall[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://fal.run/")) {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ images: [{ url: "https://img.example/x.jpg" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url === "https://img.example/x.jpg") {
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;

try {
  const fal = new FalProvider({ apiKey: "test", model: "fal-ai/flux/dev" });

  // 1. default path: no references -> FLUX with pixel dimensions
  await fal.generate({ prompt: "dawn mist", negative: "logos", width: 1920, height: 1080 });
  let c = calls.at(-1)!;
  ok("no refs routes to flux model", c.url === "https://fal.run/fal-ai/flux/dev");
  ok("flux body uses image_size", JSON.stringify(c.body.image_size) === JSON.stringify({ width: 1920, height: 1080 }));
  ok("flux body keeps negative_prompt", c.body.negative_prompt === "logos");
  ok("flux/dev runs 28 steps", c.body.num_inference_steps === 28);

  // 2. reference path: routes to nano-banana edit with image_urls
  await fal.generate({
    prompt: "dawn mist",
    negative: "logos",
    width: 1920,
    height: 1080,
    referenceImages: ["https://ref.example/moodboard.jpg"],
  });
  c = calls.at(-1)!;
  ok("refs route to nano-banana edit", c.url === "https://fal.run/fal-ai/nano-banana/edit");
  ok("refs carry image_urls", JSON.stringify(c.body.image_urls) === JSON.stringify(["https://ref.example/moodboard.jpg"]));
  ok("16:9 aspect ratio derived from 1920x1080", c.body.aspect_ratio === "16:9");
  ok("negative folded into prompt", c.body.prompt === "dawn mist. Avoid: logos");
  ok("no pixel image_size on reference path", !("image_size" in c.body));
  ok("no negative_prompt param on reference path", !("negative_prompt" in c.body));

  // 3. square request maps to 1:1; odd ratio falls back to auto
  await fal.generate({ prompt: "x", width: 800, height: 800, referenceImages: ["r"] });
  ok("1:1 derived from square", calls.at(-1)!.body.aspect_ratio === "1:1");
  await fal.generate({ prompt: "x", width: 1000, height: 137, referenceImages: ["r"] });
  ok("extreme ratio falls back to auto", calls.at(-1)!.body.aspect_ratio === "auto");

  // 4. custom reference model override
  const fal2 = new FalProvider({ apiKey: "test", referenceModel: "fal-ai/gemini-3-pro-image-preview/edit" });
  await fal2.generate({ prompt: "x", width: 1920, height: 1080, referenceImages: ["r"] });
  ok("referenceModel override respected", calls.at(-1)!.url === "https://fal.run/fal-ai/gemini-3-pro-image-preview/edit");

  // 5. empty references array stays on the default model
  await fal.generate({ prompt: "x", width: 1920, height: 1080, referenceImages: [] });
  ok("empty refs stay on flux", calls.at(-1)!.url === "https://fal.run/fal-ai/flux/dev");

  // 6. background provider passes references through and inlines a data-URI
  const bg = new FalBackgroundProvider(fal);
  const uri = await bg.generate("dusk field", 1920, 1080, {
    negative: "text",
    referenceImages: ["https://ref.example/board.png"],
  });
  c = calls.at(-1)!;
  ok("background passes refs through", JSON.stringify(c.body.image_urls) === JSON.stringify(["https://ref.example/board.png"]));
  ok("background returns data-URI", uri.startsWith("data:image/jpeg;base64,"));
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
