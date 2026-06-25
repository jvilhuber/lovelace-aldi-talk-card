/**
 * aldi-talk-card
 * Single-source card for the Aldi Talk data panels.
 *
 * Usage:
 *   type: custom:aldi-talk-card
 *   name: <label>            # label shown as the title
 *   base: sensor.<prefix>    # entity prefix; the card derives:
 *                            #   <base>_remaining_data_percentage
 *                            #   <base>_total_data_volume
 *                            #   <base>_remaining_data_volume
 *                            #   <base>_end_date
 *
 * Renders a gauge (remaining %) with green/amber/red severity bands plus a
 * caption ("X / Y GB used · renews DD.MM.YYYY · Nd left").
 *
 * Self-contained: no HACS card dependencies. The caption is drawn by injecting
 * a small scoped stylesheet into the built-in gauge card's shadow root and
 * driving an `ha-card::after` pseudo-element from a data attribute. That
 * shadow-injection idea is borrowed from card-mod by Thomas Lovén
 * (https://github.com/thomasloven/lovelace-card-mod) — credit to that project;
 * this card only replicates the minimal part it needs, so card-mod is not
 * required at runtime.
 */
class AldiTalkCard extends HTMLElement {
  setConfig(config) {
    if (!config.base) {
      throw new Error("aldi-talk-card: 'base' is required, e.g. base: sensor.jan");
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

  _gaugeConfig(cfg) {
    const base = cfg.base;
    const name = cfg.name || base.replace(/^[a-z_]+\./, "");
    return {
      type: "gauge",
      entity: `${base}_remaining_data_percentage`,
      name: `${name} – Data Remaining`,
      min: 0,
      max: 100,
      needle: false,
      severity: { green: 50, yellow: 20, red: 0 },
    };
  }

  // Caption is computed client-side (this is what the Jinja template used to do
  // server-side). Kept locale-explicit so "%d.%m.%Y" zero-padding is preserved.
  _captionText(cfg) {
    const states = this._hass && this._hass.states;
    if (!states) return "";
    const num = (id) => {
      const e = states[id];
      const v = e ? parseFloat(e.state) : NaN;
      return Number.isNaN(v) ? null : v;
    };
    const total = num(`${cfg.base}_total_data_volume`);
    const rem = num(`${cfg.base}_remaining_data_volume`);
    const endEntity = states[`${cfg.base}_end_date`];
    const parts = [];
    if (total != null && rem != null) {
      parts.push(`${(total - rem).toFixed(1)} / ${Math.round(total)} GB used`);
    }
    if (endEntity && endEntity.state) {
      const d = new Date(endEntity.state);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, "0");
        const ds = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
        const days = Math.round((d.getTime() - Date.now()) / 86400000);
        parts.push(`renews ${ds}`);
        parts.push(`${days}d left`);
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
    let base = "sensor.";
    if (hass) {
      const id = Object.keys(hass.states).find(
        (e) => e.startsWith("sensor.") && e.endsWith(PCT_SUFFIX)
      );
      if (id) base = id.slice(0, -PCT_SUFFIX.length);
    }
    return { name: "", base };
  }
}

customElements.define("aldi-talk-card", AldiTalkCard);

// The card stores `base` (the entity prefix). The editor lets the user pick the
// line's "Remaining data percentage" sensor instead of typing the prefix, then
// derives `base` by stripping this suffix.
const PCT_SUFFIX = "_remaining_data_percentage";

/**
 * Visual config editor for aldi-talk-card.
 * Built on the frontend's <ha-form>, which is always available inside the
 * Lovelace card-editor dialog, so there are no load-order concerns here.
 */
class AldiTalkCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._ensureForm();
    // Map stored `base` back onto the picker (selects the percentage sensor).
    this._form.data = {
      name: config.name || "",
      entity: config.base ? config.base + PCT_SUFFIX : undefined,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureForm();
    this._form.hass = hass;
    // Restrict the picker to every line's "Remaining data percentage" sensor.
    // Recompute live on each hass, but only reassign the schema when the set of
    // matching sensors actually changes — avoids re-rendering the form (and
    // disrupting typing) on every unrelated state update.
    const include = Object.keys(hass.states)
      .filter((id) => id.startsWith("sensor.") && id.endsWith(PCT_SUFFIX))
      .sort();
    const sig = include.join(",");
    if (sig !== this._includeSig) {
      this._includeSig = sig;
      this._form.schema = [
        { name: "name", selector: { text: {} } },
        {
          name: "entity",
          required: true,
          selector: { entity: { include_entities: include } },
        },
      ];
    }
  }

  _ensureForm() {
    if (this._form) return;
    this._form = document.createElement("ha-form");
    // Initial schema (empty picker) until hass arrives and we can list sensors.
    this._form.schema = [
      { name: "name", selector: { text: {} } },
      { name: "entity", required: true, selector: { entity: { include_entities: [] } } },
    ];
    this._form.computeLabel = (s) =>
      ({ name: "Name (label)", entity: "Aldi Talk line" }[s.name] || s.name);
    this._form.computeHelper = (s) =>
      s.name === "entity"
        ? "Pick the line's “Remaining data percentage” sensor — total, remaining and end-date are derived from it."
        : "";
    this._form.addEventListener("value-changed", (ev) => this._valueChanged(ev));
    this.appendChild(this._form);
  }

  _valueChanged(ev) {
    const value = ev.detail.value || {};
    const newConfig = { ...this._config };

    if (value.name) newConfig.name = value.name;
    else delete newConfig.name;

    if (value.entity && value.entity.endsWith(PCT_SUFFIX)) {
      newConfig.base = value.entity.slice(0, -PCT_SUFFIX.length);
    } else if (value.entity) {
      newConfig.base = value.entity;
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
