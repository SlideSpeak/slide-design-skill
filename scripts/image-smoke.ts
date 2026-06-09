// Smoke-test the image subsystem without making real API calls.
// Validates wiring + decision-logic + brand-guard at the API-layer.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkill } from "../engine/index.ts";
import {
  FederatedImageResolver,
  type FederatedImageResolverDeps,
} from "../engine/image-providers.ts";
import type { ResolvedImage } from "../engine/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(__dirname, "../skills");

// Mock providers — return predictable URLs so we can assert routing.
const mockFal = {
  async generate(opts: { prompt: string; width: number; height: number }): Promise<ResolvedImage> {
    return {
      url: `mock://fal/${encodeURIComponent(opts.prompt)}`,
      source: "fal",
      width: opts.width,
      height: opts.height,
    };
  },
};

const mockUnsplash = {
  async search(opts: { query: string; width: number; height: number }): Promise<ResolvedImage> {
    return {
      url: `mock://unsplash/${encodeURIComponent(opts.query)}`,
      source: "unsplash",
      attribution: "Mock attribution",
      width: opts.width,
      height: opts.height,
    };
  },
};

async function main() {
  const skill = await loadSkill(resolve(skillsRoot, "consulting"));

  const deps: FederatedImageResolverDeps = {
    imageStyle: skill.imageStyle,
    providers: { fal: mockFal as any, unsplash: mockUnsplash as any },
    decide: async () => "stock",
  };
  const resolver = new FederatedImageResolver(deps);

  const cases = [
    { name: "gradient → AI", req: { subject: "warm gray gradient", category: "gradient" } },
    { name: "background → AI", req: { subject: "soft paper texture", category: "background" } },
    { name: "person → stock (via decide)", req: { subject: "researcher at desk", category: "person" } },
    { name: "blocked brand → reject", req: { subject: "McKinsey office interior", category: "background" } },
    { name: "blocked term logo → reject", req: { subject: "company logo on building", category: "background" } },
  ];

  for (const c of cases) {
    try {
      const r = await resolver.resolve(c.req as any);
      console.log(`OK  ${c.name.padEnd(40)} → ${r.source.padEnd(8)} ${r.url}`);
    } catch (e: any) {
      console.log(`REJ ${c.name.padEnd(40)} → ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
