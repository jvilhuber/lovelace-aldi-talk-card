/**
 * aldi-talk-card
 * Single-source card for the Aldi Talk data panels.
 *
 * Usage:
 *   type: custom:aldi-talk-card
 *   name: <label>            # optional label shown as the title
 *   entity: sensor.<line>_…  # the line's "remaining data percentage" sensor
 *
 * Optional appearance keys (all have sensible defaults):
 *   show_title: false        # hide the "{name} – Data Remaining" line
 *   show_used: false         # hide the "X / Y GB used" caption part
 *   show_renews: false       # hide the "renews <date>" caption part
 *   show_days: false         # hide the "N days left" caption part
 *   severity:                # gauge color thresholds for the remaining %
 *     green: 50              #   green ≥ 50 (default)
 *     yellow: 20             #   amber 20–50, red < 20 (defaults)
 *
 * From `entity` the card finds the other three sensors (total, remaining,
 * end_date) by looking up the aldi_talk sensors on the same device via their
 * translation_key. This is language-independent: the integration localizes the
 * entity_id (German, English, …) but keeps platform and translation_key stable.
 *
 * Legacy: `base: sensor.<prefix>` is still accepted and derives the four
 * sensors by appending the English suffixes. Only works for English entity_ids.
 *
 * Renders a gauge (remaining %) with green/amber/red severity bands plus a
 * caption ("X / Y GB used · renews <date> · N days left"), localized to the HA
 * UI language (see STRINGS).
 *
 * Self-contained: no HACS card dependencies. The caption is drawn by injecting
 * a small scoped stylesheet into the built-in gauge card's shadow root and
 * driving an `ha-card::after` pseudo-element from a data attribute. That
 * shadow-injection idea is borrowed from card-mod by Thomas Lovén
 * (https://github.com/thomasloven/lovelace-card-mod) — credit to that project;
 * this card only replicates the minimal part it needs, so card-mod is not
 * required at runtime.
 */
// The integration tags every sensor with a language-independent platform and
// translation_key, while the entity_id itself is localized (German, English,
// …). Match on these stable keys, never on the entity_id text.
const ALDI_PLATFORM = "aldi_talk";
const TK = {
  pct: "remaining_data_percentage",
  total: "total_data_volume",
  remaining: "remaining_data_volume",
  end: "end_date",
};

// Display strings per UI language. Placeholders: {name} {used} {total} {date}
// {days}. English is the fallback for any language not listed. The date itself
// is formatted by Intl using the same language, so only the surrounding words
// live here.
const STRINGS = {
  en: {
    remaining: "{name} – Data Remaining",
    used: "{used} / {total} GB used",
    renews: "renews {date}",
    daysLeft: "{days}d left",
  },
  de: {
    remaining: "{name} – Verbleibende Daten",
    used: "{used} / {total} GB verbraucht",
    renews: "verlängert {date}",
    daysLeft: "noch {days} Tage",
  },
};

class AldiTalkCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity && !config.base) {
      throw new Error(
        "aldi-talk-card: pick an Aldi Talk line (sets 'entity'), or set 'base'."
      );
    }
    this._config = config;
    // Tear down any previously built card so a reconfigure rebuilds cleanly
    // instead of stacking another gauge on top of the old one.
    if (this._card) {
      this._card.remove();
      this._card = null;
      this._haCard = null;
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (this._card) {
      this._card.hass = hass;
      this._updateCaption();
      return;
    }
    this._build();
  }

  // Resolve the four sensors for one line into a map keyed by TK.* values.
  //
  // Preferred path: the config stores `entity` (the percentage sensor). Find its
  // device, then collect every aldi_talk sensor on that device by translation_key
  // — language-independent, so it works regardless of the entity_id locale.
  //
  // Legacy path: older configs store `base` (an entity-id prefix) and English
  // suffixes are appended. Kept so existing YAML keeps working.
  _resolveEntities(cfg) {
    if (cfg.entity) {
      const reg = this._hass && this._hass.entities;
      const pctEntry = reg && reg[cfg.entity];
      if (pctEntry && pctEntry.device_id) {
        const wanted = new Set([TK.pct, TK.total, TK.remaining, TK.end]);
        const out = {};
        for (const id of Object.keys(reg)) {
          const e = reg[id];
          if (
            e.platform === ALDI_PLATFORM &&
            e.device_id === pctEntry.device_id &&
            wanted.has(e.translation_key)
          ) {
            out[e.translation_key] = id;
          }
        }
        // Always trust the user's explicit pick for the percentage sensor.
        out[TK.pct] = cfg.entity;
        return out;
      }
    }
    if (cfg.base) {
      return {
        [TK.pct]: `${cfg.base}_remaining_data_percentage`,
        [TK.total]: `${cfg.base}_total_data_volume`,
        [TK.remaining]: `${cfg.base}_remaining_data_volume`,
        [TK.end]: `${cfg.base}_end_date`,
      };
    }
    return {};
  }

  _defaultName(cfg, ids) {
    if (cfg.name) return cfg.name;
    const states = this._hass && this._hass.states;
    const pctId = ids[TK.pct];
    const st = states && pctId ? states[pctId] : null;
    const fn = st && st.attributes && st.attributes.friendly_name;
    // Friendly name is e.g. "Ursula Verbleibendes Datenvolumen in Prozent";
    // keep just the line name (first word) when available.
    if (fn) return fn.split(" ")[0];
    if (cfg.base) return cfg.base.replace(/^[a-z_]+\./, "");
    return pctId ? pctId.replace(/^[a-z_]+\./, "") : "Aldi Talk";
  }

  // Base language tag of the HA UI ("de-CH" -> "de"), English when unknown.
  _lang() {
    const full = (this._hass && this._hass.language) || "en";
    return full.split("-")[0];
  }

  // Look up a display string for the current language (English fallback) and
  // substitute {placeholders} from `vars`.
  _t(key, vars) {
    const lang = this._lang();
    const table = STRINGS[lang] || STRINGS.en;
    const template = table[key] || STRINGS.en[key] || "";
    return template.replace(/\{(\w+)\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(vars || {}, k) ? vars[k] : m
    );
  }

  // Gauge color thresholds for the remaining %. Defaults: green ≥ 50, amber
  // 20–50, red < 20. Users may override green/yellow via `severity:`; the red
  // band always starts at 0 (it is the lowest band the gauge can show).
  _severity(cfg) {
    const s = (cfg && cfg.severity) || {};
    const green = Number.isFinite(s.green) ? s.green : 50;
    const yellow = Number.isFinite(s.yellow) ? s.yellow : 20;
    return { green, yellow, red: 0 };
  }

  _gaugeConfig(cfg) {
    const ids = this._resolveEntities(cfg);
    const name = this._defaultName(cfg, ids);
    const g = {
      type: "gauge",
      entity: ids[TK.pct],
      min: 0,
      max: 100,
      needle: false,
      severity: this._severity(cfg),
    };
    // `show_title: false` drops the "{name} – Data Remaining" line entirely;
    // the gauge renders titleless. Defaults to shown.
    if (cfg.show_title !== false) g.name = this._t("remaining", { name });
    return g;
  }

  // Caption is computed client-side, localized to the HA UI language. The date
  // is formatted by Intl in that language; the surrounding words come from
  // STRINGS via _t().
  _captionText(cfg) {
    const states = this._hass && this._hass.states;
    if (!states) return "";
    const ids = this._resolveEntities(cfg);
    const num = (id) => {
      const e = id ? states[id] : null;
      const v = e ? parseFloat(e.state) : NaN;
      return Number.isNaN(v) ? null : v;
    };
    const total = num(ids[TK.total]);
    const rem = num(ids[TK.remaining]);
    const endEntity = ids[TK.end] ? states[ids[TK.end]] : null;
    // Each caption part is opt-out via `show_*: false`; all shown by default.
    const parts = [];
    if (cfg.show_used !== false && total != null && rem != null) {
      parts.push(
        this._t("used", {
          used: (total - rem).toFixed(1),
          total: total.toFixed(1),
        })
      );
    }
    // Renewal date and days-left both come from the end-date sensor; only parse
    // it when at least one of them is enabled.
    if (
      (cfg.show_renews !== false || cfg.show_days !== false) &&
      endEntity &&
      endEntity.state
    ) {
      const d = new Date(endEntity.state);
      if (!Number.isNaN(d.getTime())) {
        if (cfg.show_renews !== false) {
          const date = new Intl.DateTimeFormat(this._hass.language || "en", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(d);
          parts.push(this._t("renews", { date }));
        }
        if (cfg.show_days !== false) {
          const days = Math.round((d.getTime() - Date.now()) / 86400000);
          parts.push(this._t("daysLeft", { days }));
        }
      }
    }
    return parts.join(" · ");
  }

  _updateCaption() {
    if (this._haCard) {
      this._haCard.setAttribute("data-aldi-caption", this._captionText(this._config));
    }
  }

  async _build() {
    if (this._building) return;
    this._building = true;
    const builtFor = this._config;
    try {
      const helpers = await window.loadCardHelpers();
      // Config may have changed (or a card may already exist) during the await.
      if (this._config !== builtFor || this._card) return;
      const gauge = helpers.createCardElement(this._gaugeConfig(builtFor));
      gauge.hass = this._hass;
      this._card = gauge;
      this.appendChild(gauge);
      await this._decorate(gauge);
      this._updateCaption();
    } finally {
      this._building = false;
    }
  }

  // Replicates the minimal part of card-mod we need: inject a scoped stylesheet
  // into the gauge card's shadow root so an `ha-card::after` pseudo-element
  // shows our caption, fed by the `data-aldi-caption` attribute. Pseudo-elements
  // and unknown attributes survive the gauge card's Lit re-renders, whereas
  // appended child nodes would get reconciled away.
  async _decorate(gauge) {
    if (gauge.updateComplete) {
      try { await gauge.updateComplete; } catch (e) { /* ignore */ }
    }
    let root = gauge.shadowRoot;
    for (let i = 0; i < 10 && (!root || !root.querySelector("ha-card")); i++) {
      await new Promise((r) => requestAnimationFrame(r));
      root = gauge.shadowRoot;
    }
    if (!root || this._card !== gauge) return; // gone or superseded during await
    const haCard = root.querySelector("ha-card");
    if (!haCard) return;

    const css =
      "ha-card { overflow: visible; padding-bottom: 8px; }" +
      " ha-card::after { content: attr(data-aldi-caption); display: block;" +
      " text-align: center; font-size: 12px; font-weight: 400; opacity: 0.7;" +
      " padding: 0 8px 10px; white-space: normal; }";
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } catch (e) {
      const style = document.createElement("style");
      style.textContent = css;
      root.appendChild(style);
    }
    this._haCard = haCard;
  }

  getCardSize() {
    return 3;
  }

  // --- Visual editor support ---
  static getConfigElement() {
    return document.createElement("aldi-talk-card-editor");
  }

  static getStubConfig(hass) {
    const ids = aldiPercentageEntities(hass);
    if (ids.length) return { name: "", entity: ids[0] };
    return { name: "", entity: "" };
  }
}

customElements.define("aldi-talk-card", AldiTalkCard);

// Every line's "remaining data percentage" sensor, found by stable platform +
// translation_key (not by entity_id, which is localized). Sorted for a stable
// picker order and change-detection signature.
function aldiPercentageEntities(hass) {
  const reg = hass && hass.entities;
  if (!reg) return [];
  return Object.keys(reg)
    .filter((id) => {
      const e = reg[id];
      return e.platform === ALDI_PLATFORM && e.translation_key === TK.pct;
    })
    .sort();
}

/**
 * Visual config editor for aldi-talk-card.
 * Built on the frontend's <ha-form>, which is always available inside the
 * Lovelace card-editor dialog, so there are no load-order concerns here.
 */
class AldiTalkCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._ensureForm();
    // Legacy `base` configs map back onto the picker as the percentage sensor.
    const entity =
      config.entity || (config.base ? `${config.base}_remaining_data_percentage` : undefined);
    const sev = config.severity || {};
    // Booleans default to true (shown) so the toggles render "on" for a config
    // that has not opted out. Thresholds fall back to the card's own defaults.
    this._form.data = {
      name: config.name || "",
      entity,
      show_title: config.show_title !== false,
      show_used: config.show_used !== false,
      show_renews: config.show_renews !== false,
      show_days: config.show_days !== false,
      green: Number.isFinite(sev.green) ? sev.green : 50,
      yellow: Number.isFinite(sev.yellow) ? sev.yellow : 20,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureForm();
    this._form.hass = hass;
    // Restrict the picker to every line's percentage sensor. Recompute live on
    // each hass, but only reassign the schema when the matching set actually
    // changes — avoids re-rendering the form (and disrupting typing) on every
    // unrelated state update.
    const include = aldiPercentageEntities(hass);
    const sig = include.join(",");
    if (sig !== this._includeSig) {
      this._includeSig = sig;
      this._form.schema = this._schema(include);
    }
  }

  // Full editor schema. `include` restricts the line picker to the percentage
  // sensors; pass [] before hass arrives. The caption toggles and color
  // thresholds are static and live in the two expandable sections.
  _schema(include) {
    return [
      { name: "name", selector: { text: {} } },
      {
        name: "entity",
        required: true,
        selector: { entity: { include_entities: include } },
      },
      { name: "show_title", selector: { boolean: {} } },
      {
        type: "expandable",
        name: "",
        title: "Caption",
        schema: [
          { name: "show_used", selector: { boolean: {} } },
          { name: "show_renews", selector: { boolean: {} } },
          { name: "show_days", selector: { boolean: {} } },
        ],
      },
      {
        type: "expandable",
        name: "",
        title: "Gauge colors",
        schema: [
          {
            type: "grid",
            name: "",
            schema: [
              {
                name: "green",
                selector: {
                  number: { min: 0, max: 100, mode: "box", unit_of_measurement: "%" },
                },
              },
              {
                name: "yellow",
                selector: {
                  number: { min: 0, max: 100, mode: "box", unit_of_measurement: "%" },
                },
              },
            ],
          },
        ],
      },
    ];
  }

  _ensureForm() {
    if (this._form) return;
    this._form = document.createElement("ha-form");
    // Initial schema (empty picker) until hass arrives and we can list sensors.
    this._form.schema = this._schema([]);
    this._form.computeLabel = (s) =>
      ({
        name: "Name (label)",
        entity: "Aldi Talk line",
        show_title: "Show title",
        show_used: "Show data used",
        show_renews: "Show renewal date",
        show_days: "Show days left",
        green: "Green from",
        yellow: "Amber from",
      }[s.name] || s.name);
    this._form.computeHelper = (s) =>
      ({
        entity:
          "Pick the line's “Remaining data percentage” sensor — total, remaining and end-date are derived from it.",
        green: "Gauge is green at or above this remaining %.",
        yellow: "Gauge is amber down to this %, and red below it.",
      }[s.name] || "");
    this._form.addEventListener("value-changed", (ev) => this._valueChanged(ev));
    this.appendChild(this._form);
  }

  _valueChanged(ev) {
    const value = ev.detail.value || {};
    const newConfig = { ...this._config };

    if (value.name) newConfig.name = value.name;
    else delete newConfig.name;

    if (value.entity) {
      newConfig.entity = value.entity;
      // A fresh pick supersedes any legacy prefix config.
      delete newConfig.base;
    }

    // Toggles default to true (shown), so only persist the explicit "off" and
    // keep the stored config minimal otherwise.
    for (const key of ["show_title", "show_used", "show_renews", "show_days"]) {
      if (value[key] === false) newConfig[key] = false;
      else delete newConfig[key];
    }

    // Persist `severity` only when a threshold differs from the defaults
    // (green 50 / amber 20); otherwise drop it so default configs stay clean.
    const green = Number(value.green);
    const yellow = Number(value.yellow);
    const greenSet = Number.isFinite(green) && green !== 50;
    const yellowSet = Number.isFinite(yellow) && yellow !== 20;
    if (greenSet || yellowSet) {
      newConfig.severity = {
        green: Number.isFinite(green) ? green : 50,
        yellow: Number.isFinite(yellow) ? yellow : 20,
      };
    } else {
      delete newConfig.severity;
    }

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: newConfig },
        bubbles: true,
        composed: true,
      })
    );
  }
}

customElements.define("aldi-talk-card-editor", AldiTalkCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "aldi-talk-card",
  name: "Aldi Talk Card",
  description: "Aldi Talk data gauge with renewal info (single source for all panels)",
  preview: true,
  documentationURL: "https://github.com/jvilhuber/lovelace-aldi-talk-card",
});
