// Smoke-test the renderer correctness + security fixes from the 2026-06-14 review:
//  - formatNum keeps legitimate compound units, drops descriptive unit-lines
//  - maxDecimals honors pipe-separated data (matches parseNums)
//  - safeBgImageSrc accepts trusted base64 data-URIs, rejects attribute breakout
//  - parseDirectiveArgs drops injection-bearing color args, keeps real colors
import { formatNum, maxDecimals, safeBgImageSrc, parseDirectiveArgs } from "../engine/renderer.ts";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`OK  ${label}`); pass++; }
  else { console.log(`FAIL ${label}${detail ? " — " + detail : ""}`); fail++; }
}

// formatNum: legitimate compound units survive (the regression dropped these)
check("formatNum keeps $M ARR", formatNum(5.2, "$M ARR") === "$5.2M ARR", formatNum(5.2, "$M ARR"));
check("formatNum keeps EUR bn", formatNum(8, "EUR bn").includes("EUR bn"), formatNum(8, "EUR bn"));
check("formatNum keeps USD/ton", formatNum(40, "USD/ton").includes("USD/ton"), formatNum(40, "USD/ton"));
check("formatNum keeps kg CO2e", formatNum(12, "kg CO2e").includes("kg CO2e"), formatNum(12, "kg CO2e"));
check("formatNum keeps bps", formatNum(35, "bps").includes("bps"), formatNum(35, "bps"));
// descriptive unit-LINES are still dropped (they belong in the caption band)
check("formatNum drops 'EUR per parcel'", formatNum(5, "EUR per parcel") === "5", formatNum(5, "EUR per parcel"));
check("formatNum drops 'share of the gap'", formatNum(5, "share of the gap") === "5", formatNum(5, "share of the gap"));
check("formatNum drops long phrase", formatNum(5, "euros saved each delivery") === "5", formatNum(5, "euros saved each delivery"));
// percent + plain still work
check("formatNum percent", formatNum(4.2, "%") === "4.2%", formatNum(4.2, "%"));

// maxDecimals: pipe-separated data (previously rounded to 0 decimals)
check("maxDecimals pipe", maxDecimals("1.25|2.50|3.75") === 2, String(maxDecimals("1.25|2.50|3.75")));
check("maxDecimals comma", maxDecimals("1.2, 3.45") === 2, String(maxDecimals("1.2, 3.45")));
check("maxDecimals whitespace", maxDecimals("6.10 6.1") === 2, String(maxDecimals("6.10 6.1")));
check("maxDecimals none", maxDecimals("40|80|120") === 0, String(maxDecimals("40|80|120")));

// safeBgImageSrc: trusted base64 in, attribute-breakout out
const bigB64 = "data:image/png;base64," + "A".repeat(200000);
check("bg accepts big base64", safeBgImageSrc(bigB64) === bigB64);
check("bg accepts https", safeBgImageSrc("https://cdn.example.com/a.png") === "https://cdn.example.com/a.png");
check("bg rejects breakout", safeBgImageSrc('data:image/png,"><img src=x onerror=alert(1)>') === null);
check("bg rejects javascript:", safeBgImageSrc("javascript:alert(1)") === null);
check("bg rejects non-image data", safeBgImageSrc("data:text/html;base64,PHNjcmlwdD4=") === null);
check("bg rejects quote in url", safeBgImageSrc('https://x.com/a.png" onerror="x') === null);

// parseDirectiveArgs: color args sanitized
const a1 = parseDirectiveArgs('type=bar accent=#FF6A13 base=var(--color-ink)');
check("color hex kept", a1.accent === "#FF6A13");
check("color var() kept", a1.base === "var(--color-ink)");
const a2 = parseDirectiveArgs('type=bar accent="><script>alert(1)</script>');
check("color breakout dropped", a2.accent === undefined, JSON.stringify(a2));
const a3 = parseDirectiveArgs('type=bar fill=url(javascript:alert(1))');
check("color url() payload dropped", a3.fill === undefined, JSON.stringify(a3));
// non-color args are never touched
check("non-color arg untouched", parseDirectiveArgs('data=ex1-data labels=ex1-labels').data === "ex1-data");

console.log(`\nrenderer-fix: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
