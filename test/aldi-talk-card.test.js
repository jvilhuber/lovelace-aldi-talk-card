// Headless smoke test for aldi-talk-card logic — no browser required.
//
// Run:  node test/aldi-talk-card.test.js
//
// It stubs the few browser globals the module touches at load time, then
// exercises the pure logic: entity resolution, default name/title, gauge
// severity thresholds, and the opt-out caption parts. Rendering (the gauge
// element, shadow-root caption, visual editor) still needs a real browser.
const fs = require("fs");
const path = require("path");

// Stub the browser globals referenced while the module loads.
global.HTMLElement = class {};
global.customElements = { define() {} };
global.window = {};

let src = fs.readFileSync(path.join(__dirname, "..", "aldi-talk-card.js"), "utf8");
// Capture the (otherwise eval-scoped) class so we can instantiate it.
src += "\nglobal.__AldiTalkCard = AldiTalkCard;";
eval(src);
const AldiTalkCard = global.__AldiTalkCard;

// --- Mock hass: one line "Jan", 42% remaining, 4.2/10 GB left, renews soon ---
const endDate = new Date(Date.now() + 15 * 86400000); // ~15 days out
const hass = {
  language: "en",
  entities: {
    "sensor.jan_remaining_data_percentage": { platform: "aldi_talk", device_id: "dev1", translation_key: "remaining_data_percentage" },
    "sensor.jan_total_data_volume":        { platform: "aldi_talk", device_id: "dev1", translation_key: "total_data_volume" },
    "sensor.jan_remaining_data_volume":    { platform: "aldi_talk", device_id: "dev1", translation_key: "remaining_data_volume" },
    "sensor.jan_end_date":                 { platform: "aldi_talk", device_id: "dev1", translation_key: "end_date" },
  },
  states: {
    "sensor.jan_remaining_data_percentage": { state: "42", attributes: { friendly_name: "Jan Remaining data percentage" } },
    "sensor.jan_total_data_volume":        { state: "10" },
    "sensor.jan_remaining_data_volume":    { state: "4.2" },
    "sensor.jan_end_date":                 { state: endDate.toISOString() },
  },
};

function card() {
  const c = new AldiTalkCard();
  c._hass = hass;
  return c;
}

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { pass++; console.log("  ok  ", label); }
  else { fail++; console.log("  FAIL", label, "->", JSON.stringify(got)); }
}

const E = "sensor.jan_remaining_data_percentage";

// 1. Defaults: title shown, default severity, full caption
{
  const c = card();
  const g = c._gaugeConfig({ entity: E });
  const cap = c._captionText({ entity: E });
  check("default title present", g.name === "Jan – Data Remaining", g.name);
  check("default severity", JSON.stringify(g.severity) === JSON.stringify({ green: 50, yellow: 20, red: 0 }), g.severity);
  check("caption has used", cap.includes("5.8 / 10.0 GB used"), cap);
  check("caption has renews", cap.includes("renews"), cap);
  check("caption has days left", /\d+d left/.test(cap), cap);
}

// 2. show_title: false -> gauge has no name
{
  const g = card()._gaugeConfig({ entity: E, show_title: false });
  check("title hidden", g.name === undefined, g.name);
}

// 3. Custom severity thresholds
{
  const g = card()._gaugeConfig({ entity: E, severity: { green: 60, yellow: 30 } });
  check("custom severity", JSON.stringify(g.severity) === JSON.stringify({ green: 60, yellow: 30, red: 0 }), g.severity);
}

// 4. Caption: only data-used + days-left (renews off)
{
  const cap = card()._captionText({ entity: E, show_renews: false });
  check("renews removed", !cap.includes("renews"), cap);
  check("used still present", cap.includes("GB used"), cap);
  check("days still present", /\d+d left/.test(cap), cap);
}

// 5. Caption: only days-left
{
  const cap = card()._captionText({ entity: E, show_used: false, show_renews: false });
  check("only days left", /^\d+d left$/.test(cap), cap);
}

// 6. All caption parts off -> empty caption
{
  const cap = card()._captionText({ entity: E, show_used: false, show_renews: false, show_days: false });
  check("empty caption", cap === "", cap);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
