# Aldi Talk Card

A compact Lovelace card for [Aldi Talk](https://www.alditalk.de/) prepaid lines in Home Assistant.
It shows a gauge of the **remaining data percentage** (green / amber / red) plus a caption with
**used / total GB**, the **renewal date**, and **days left** — derived from a single entity prefix.

![Aldi Talk Card](images/screenshot.png)

## Requirements

- The [homeassistant-AldiTalk](https://github.com/JonasJoKuJonas/homeassistant-AldiTalk) custom
  integration (HA domain `aldi_talk`), or any integration that creates the sensors below.
  For each line it must provide:
  - `<base>_remaining_data_percentage`
  - `<base>_total_data_volume`
  - `<base>_remaining_data_volume`
  - `<base>_end_date`

No other custom cards are required — this card is **self-contained** (it uses Home Assistant's
built-in gauge card and does its own styling). In particular it does **not** require `card-mod`.

## Installation

### HACS (recommended)

1. HACS → **⋮** → **Custom repositories**.
2. Add `https://github.com/jvilhuber/lovelace-aldi-talk-card`, category **Dashboard**.
3. Install **Aldi Talk Card**. HACS registers the resource automatically.
4. Hard-refresh your browser (Ctrl/Cmd + Shift + R).

### Manual

1. Copy `aldi-talk-card.js` to `<config>/www/`.
2. **Settings → Dashboards → ⋮ → Resources → Add resource**
   URL `/local/aldi-talk-card.js`, type **JavaScript Module**.
3. Hard-refresh your browser.

## Usage

```yaml
type: custom:aldi-talk-card
name: Ursula
entity: sensor.ursula_verbleibendes_datenvolumen_in_prozent
```

Pick the line's **"Remaining data percentage"** sensor; the other three sensors (total, remaining,
end-date) are found automatically from the same device — language-independently, so it works
regardless of the entity-id locale.

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `entity` | yes | — | The line's *"Remaining data percentage"* sensor. |
| `name` | no | line's name | Label shown in the title. |
| `show_title` | no | `true` | Show the *"{name} – Data Remaining"* title line. Set `false` to hide it. |
| `show_used` | no | `true` | Show the *"X / Y GB used"* caption part. |
| `show_renews` | no | `true` | Show the *"renews &lt;date&gt;"* caption part. |
| `show_days` | no | `true` | Show the *"N days left"* caption part. |
| `severity` | no | `{green: 50, yellow: 20}` | Gauge color thresholds for the remaining %. `green` ≥ green, amber between, red below `yellow`. |

A **visual editor** is included: pick the line's *"Remaining data percentage"* sensor, toggle the
title and each caption part, and set the two color thresholds. Defaults are kept out of the stored
config, so an unmodified card stays a two-line `type` + `entity`.

The card identifies the integration's sensors by their `platform` (`aldi_talk`) and
`translation_key`, **not** by the entity ID. This matters because the integration localizes
entity IDs to the Home Assistant language — e.g. German installs produce
`sensor.<line>_verbleibendes_datenvolumen_in_prozent` rather than
`sensor.<line>_remaining_data_percentage`. Matching on the stable keys keeps the card and its
picker working in any language.

### Example — minimal caption, custom colors

```yaml
type: custom:aldi-talk-card
entity: sensor.jan_remaining_data_percentage
show_title: false      # no title, just the gauge
show_renews: false     # caption shows only "X / Y GB used · N days left"
severity:
  green: 60            # green ≥ 60 %, amber 30–60 %, red < 30 %
  yellow: 30
```

### Legacy `base` option

Older configs that set `base: sensor.<prefix>` still work. The card derives the four sensors by
appending the English suffixes (`_remaining_data_percentage`, `_total_data_volume`,
`_remaining_data_volume`, `_end_date`). This only matches English entity IDs; prefer `entity`.

## Notes

- Labels follow the Home Assistant UI language (English and German are built in; English is the
  fallback for any other language). The caption date is formatted by `Intl.DateTimeFormat` in that
  language. To add a language or change wording, edit the `STRINGS` table in `aldi-talk-card.js`.
- Default gauge thresholds: green ≥ 50 %, amber 20–50 %, red < 20 % — override per-card with
  `severity` (`_gaugeConfig`).

## Credits

The technique of injecting a scoped stylesheet into a card's shadow root to drive an
`ha-card::after` caption is borrowed from
[**card-mod** by Thomas Lovén](https://github.com/thomasloven/lovelace-card-mod).
This card only replicates the minimal part it needs, so card-mod itself is not a dependency.

## License

MIT — see [LICENSE](LICENSE).
