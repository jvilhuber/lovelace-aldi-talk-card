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

| Option | Required | Description |
|--------|----------|-------------|
| `entity` | yes | The line's *"Remaining data percentage"* sensor. The other three sensors are found automatically on the same device. |
| `name` | no  | Label shown in the title. Defaults to the line's name. |

A **visual editor** is included: pick the line's *"Remaining data percentage"* sensor and the
rest are resolved automatically.

The card identifies the integration's sensors by their `platform` (`aldi_talk`) and
`translation_key`, **not** by the entity ID. This matters because the integration localizes
entity IDs to the Home Assistant language — e.g. German installs produce
`sensor.<line>_verbleibendes_datenvolumen_in_prozent` rather than
`sensor.<line>_remaining_data_percentage`. Matching on the stable keys keeps the card and its
picker working in any language.

### Legacy `base` option

Older configs that set `base: sensor.<prefix>` still work. The card derives the four sensors by
appending the English suffixes (`_remaining_data_percentage`, `_total_data_volume`,
`_remaining_data_volume`, `_end_date`). This only matches English entity IDs; prefer `entity`.

## Notes

- Labels follow the Home Assistant UI language (English and German are built in; English is the
  fallback for any other language). The caption date is formatted by `Intl.DateTimeFormat` in that
  language. To add a language or change wording, edit the `STRINGS` table in `aldi-talk-card.js`.
- Gauge thresholds: green ≥ 50 %, amber 20–50 %, red < 20 % (`_gaugeConfig`).

## Credits

The technique of injecting a scoped stylesheet into a card's shadow root to drive an
`ha-card::after` caption is borrowed from
[**card-mod** by Thomas Lovén](https://github.com/thomasloven/lovelace-card-mod).
This card only replicates the minimal part it needs, so card-mod itself is not a dependency.

## License

MIT — see [LICENSE](LICENSE).
