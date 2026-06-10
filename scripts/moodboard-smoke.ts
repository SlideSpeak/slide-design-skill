// Smoke-test the moodboard step (engine/moodboard.ts): rotated prompts are
// deterministic, axis-diverse, text/logo-free; the direction block makes an
// approved board's palette binding for the generator brief.

import { composeMoodboardPrompts, moodboardDirectionBlock, ROTATION_AXES } from "../engine/moodboard.ts";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`OK  ${label}`); pass++; }
  else { console.log(`FAIL ${label}${detail ? " — " + detail : ""}`); fail++; }
}

const SUBJECT = "a specialty single-origin chocolate maker";

// 1. two boards, different axes, both carry the subject
{
  const boards = composeMoodboardPrompts(SUBJECT, 2);
  check("two boards", boards.length === 2);
  check("axes differ", boards[0].axis !== boards[1].axis, JSON.stringify(boards.map((b) => b.axis)));
  check("subject present", boards.every((b) => b.prompt.includes(SUBJECT)));
}

// 2. rotation upstream: every prompt names its colour axis explicitly
{
  const boards = composeMoodboardPrompts(SUBJECT, 3);
  check("axis named in prompt", boards.every((b) => b.prompt.includes(b.axis)));
  check("axes from the rotation set", boards.every((b) => (ROTATION_AXES as readonly string[]).includes(b.axis)));
}

// 3. deterministic: same subject → same boards; different subject → different walk
{
  const a1 = composeMoodboardPrompts(SUBJECT, 2);
  const a2 = composeMoodboardPrompts(SUBJECT, 2);
  const b = composeMoodboardPrompts("a nordic night-train operator", 2);
  check("same subject reproducible", JSON.stringify(a1) === JSON.stringify(a2));
  check("different subject differs", JSON.stringify(a1) !== JSON.stringify(b));
}

// 4. image-model hygiene: no legible text, no logos, no people
{
  const [b] = composeMoodboardPrompts(SUBJECT, 1);
  check("text/logo/people negatives present", /no legible text, no logos, no people/.test(b.prompt));
}

// 5. count clamps to the axis pool
{
  const boards = composeMoodboardPrompts(SUBJECT, 99);
  check("count clamped", boards.length === ROTATION_AXES.length);
  check("min one board", composeMoodboardPrompts(SUBJECT, 0).length === 1);
}

// 6. direction block formats all fields and is binding-worded
{
  const block = moodboardDirectionBlock({
    palette: ["#F2EFE9 porcelain ground", "#3B2419 espresso ink"],
    typeMood: "letterpress specimen cards, typewriter labels",
    world: "tactile paper flat lays, soft studio light",
    layoutInstinct: "pinned specimen grids, calm ground",
  });
  check("block names approval", /APPROVED A MOODBOARD/.test(block));
  check("block carries palette", block.includes("#3B2419"));
  check("block carries layout instinct", /pinned specimen grids/.test(block));
  const noLayout = moodboardDirectionBlock({ palette: ["#111"], typeMood: "x", world: "y" });
  check("layout line optional", !/Layout instinct/.test(noLayout));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
