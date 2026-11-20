(function () {
  "use strict";

  var DATA = window.RADAR;
  if (!DATA) return;

  var app = document.getElementById("app");
  var state = {
    q: "",
    category: "all",
    chain: "all",
    watchOnly: false,
    tab: "pre",
    sort: "rank",
    desc: false,
    selected: null,
  };

  var detail = document.createElement("aside");
  detail.className = "detail";
  detail.id = "detail";
  detail.hidden = true;
  var backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.hidden = true;
  backdrop.addEventListener("click", function () { closeDetail(); });

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = String(value);
        else if (key === "hidden") node.hidden = Boolean(value);
        else if (key.indexOf("on") === 0 && typeof value === "function") node.addEventListener(key.slice(2), value);
        else if (key === "value") node.value = value;
        else if (key === "selected") node.selected = Boolean(value);
        else node.setAttribute(key, String(value));
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (item) { if (item) node.appendChild(item); });
      else if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function fmtUsd(value) {
    if (value === null || value === undefined || !isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1e9) return "$" + (value / 1e9).toFixed(2) + "B";
    if (Math.abs(value) >= 1e6) return "$" + (value / 1e6).toFixed(1) + "M";
    if (Math.abs(value) >= 1e3) return "$" + Math.round(value / 1e3) + "K";
    return "$" + Math.round(value);
  }

  function fmtPct(value) {
    if (value === null || value === undefined || !isFinite(value)) return "n/a";
    return (value > 0 ? "+" : "") + Number(value).toFixed(2) + "%";
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return "unknown";
    if (days >= 365) return (days / 365).toFixed(1) + "y";
    return Math.max(0, Math.round(days)) + "d";
  }

  function fmtMult(value) {
    return Number(value).toFixed(2) + "x";
  }

  function categoryTilt(category) {
    var value = (category || "").toLowerCase();
    if (value.indexOf("dex") >= 0 || value.indexOf("lending") >= 0 || value.indexOf("cdp") >= 0 || value.indexOf("yield") >= 0) return 1.1;
    if (value.indexOf("allocator") >= 0 || value.indexOf("curator") >= 0) return 1.06;
    if (value.indexOf("chain") >= 0 || value.indexOf("oracle") >= 0 || value.indexOf("infrastructure") >= 0) return 1.08;
    if (value.indexOf("rwa") >= 0 || value.indexOf("stable") >= 0 || value.indexOf("prediction") >= 0) return 1.04;
    return 1;
  }

  function recompute(row) {
    var value = row.tvl_usd * DATA.model.base_multiple * row.growth_multiplier * row.tenure_multiplier * row.chain_multiplier * categoryTilt(row.category);
    return Math.max(1, Math.round(value));
  }

  function readHash() {
    var raw = window.location.hash.replace(/^#/, "");
    if (raw.charAt(0) === "?") raw = raw.slice(1);
    var params = new URLSearchParams(raw);
    if (params.has("q")) state.q = params.get("q") || "";
    if (params.has("category")) state.category = params.get("category") || "all";
    if (params.has("chain")) state.chain = params.get("chain") || "all";
    if (params.has("watch")) state.watchOnly = params.get("watch") === "1";
    if (params.has("tab")) state.tab = params.get("tab") === "live" ? "live" : "pre";
    if (params.has("p")) state.selected = params.get("p");
    if (params.has("sort")) state.sort = params.get("sort") || "rank";
    if (params.has("dir")) state.desc = params.get("dir") === "desc";
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.category !== "all") params.set("category", state.category);
    if (state.chain !== "all") params.set("chain", state.chain);
    if (state.watchOnly) params.set("watch", "1");
    if (state.tab === "live") params.set("tab", "live");
    if (state.selected) params.set("p", state.selected);
    if (state.sort !== "rank") params.set("sort", state.sort);
    if (state.desc) params.set("dir", "desc");
    var encoded = params.toString();
    if (encoded) window.history.replaceState(null, "", "#?" + encoded);
    else window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  function categories() {
    return Array.from(new Set(DATA.rows.map(function (row) { return row.category || "Other"; }))).sort();
  }

  function chains() {
    var counts = new Map();
    DATA.rows.forEach(function (row) {
      (row.chains || []).forEach(function (chain) { counts.set(chain, (counts.get(chain) || 0) + 1); });
    });
    return Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).map(function (entry) { return entry[0]; }).slice(0, 18);
  }

  function filteredRows() {
    var query = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (row) {
      if (state.category !== "all" && (row.category || "Other") !== state.category) return false;
      if (state.chain !== "all" && (row.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !row.watchlisted) return false;
      if (!query) return true;
      var haystack = [row.name, row.slug, row.category, (row.chains || []).join(" ")].join(" ").toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
  }

  function sortedRows(rows) {
    var key = state.sort;
    return rows.slice().sort(function (a, b) {
      var left;
      var right;
      if (key === "name") { left = a.name.toLowerCase(); right = b.name.toLowerCase(); }
      else if (key === "tvl") { left = a.tvl_usd; right = b.tvl_usd; }
      else if (key === "growth") { left = a.growth_pct; right = b.growth_pct; }
      else if (key === "age") { left = a.age_days === null ? -1 : a.age_days; right = b.age_days === null ? -1 : b.age_days; }
      else if (key === "value") { left = a.implied_value_usd; right = b.implied_value_usd; }
      else { left = a.rank; right = b.rank; }
      if (left < right) return state.desc ? 1 : -1;
      if (left > right) return state.desc ? -1 : 1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el("header", { class: "top" },
      el("div", { class: "brand" },
        el("span", { class: "mark", "aria-hidden": "true" }),
        el("span", null,
          el("span", { class: "brand-name", text: "make.fun · program entry" }),
          el("div", { class: "brand-title", text: "Token Launch Radar" })
        )
      ),
      el("div", { class: "meta" },
        el("span", null, "snapshot ", el("b", { text: DATA.as_of })),
        el("span", null, "input ", el("b", { text: String(DATA.floor_usd / 1e6) + "M floor" })),
        el("span", null, "model ", el("b", { text: DATA.model_version }))
      )
    );
  }

  function hero() {
    return el("section", { class: "hero" },
      el("div", null,
        el("h1", null, "Find the protocol ", el("em", { text: "before" }), " the ticker exists."),
        el("p", { class: "lede", text: "A ranked radar over the sealed protocol index. Every row below records no token in the snapshot, is not a wrapped, staked or bridged product of one that trades, and carries a farm plan with real costs and time. Implied value is our own claim from the data, not a forecast or a price." }),
        el("span", { class: "note", text: "The watchlist is the floor, never the ceiling" })
      ),
      el("div", { class: "stats" },
        el("div", { class: "stat hot" }, el("b", { text: String(DATA.board_size) }), el("span", { text: "pre-token protocols ranked" })),
        el("div", { class: "stat" }, el("b", { text: String(DATA.watchlist_size) }), el("span", { text: "watchlist slugs covered" })),
        el("div", { class: "stat" }, el("b", { text: String(DATA.early_size) }), el("span", { text: "early finds below the floor" })),
        el("div", { class: "stat" }, el("b", { text: String(DATA.live_size) }), el("span", { text: "live-token protocols set aside" }))
      )
    );
  }

  function controls() {
    var search = el("input", { type: "search", id: "q", placeholder: "Search protocol, chain or category", value: state.q, "aria-label": "Search the board" });
    search.addEventListener("input", function () { state.q = search.value; writeHash(); render(); });

    var category = el("select", { id: "category", "aria-label": "Filter by category" },
      el("option", { value: "all", text: "All categories", selected: state.category === "all" }),
      categories().map(function (value) { return el("option", { value: value, text: value, selected: value === state.category }); })
    );
    category.addEventListener("change", function () { state.category = category.value; writeHash(); render(); });

    var chain = el("select", { id: "chain", "aria-label": "Filter by chain" },
      el("option", { value: "all", text: "All chains", selected: state.chain === "all" }),
      chains().map(function (value) { return el("option", { value: value, text: value, selected: value === state.chain }); })
    );
    chain.addEventListener("change", function () { state.chain = chain.value; writeHash(); render(); });

    var watch = el("button", { type: "button", class: "toggle", "aria-pressed": state.watchOnly ? "true" : "false", text: "Watchlist only" });
    watch.addEventListener("click", function () { state.watchOnly = !state.watchOnly; writeHash(); render(); });

    var pre = el("button", { type: "button", text: "Pre-token", "aria-pressed": state.tab === "pre" ? "true" : "false" });
    pre.addEventListener("click", function () { state.tab = "pre"; writeHash(); render(); });
    var live = el("button", { type: "button", text: "Live token", "aria-pressed": state.tab === "live" ? "true" : "false" });
    live.addEventListener("click", function () { state.tab = "live"; writeHash(); render(); });

    return el("div", { class: "controls" },
      el("div", { class: "field" }, el("label", { for: "q", text: "Search" }), search),
      el("div", { class: "field" }, el("label", { for: "category", text: "Category" }), category),
      el("div", { class: "field" }, el("label", { for: "chain", text: "Chain" }), chain),
      el("div", { class: "field" }, el("label", { text: "Coverage" }), watch),
      el("div", { class: "field" }, el("label", { text: "Token status" }), el("div", { class: "tabs" }, pre, live)),
      el("span", { class: "count", text: (state.tab === "pre" ? filteredRows().length + " board rows" : DATA.live.length + " live rows") })
    );
  }

  function sortHeader(key, label) {
    var arrow = state.sort === key ? (state.desc ? " ↓" : " ↑") : "";
    var button = el("button", { type: "button" }, label + arrow);
    button.addEventListener("click", function () {
      if (state.sort === key) state.desc = !state.desc;
      else { state.sort = key; state.desc = key !== "rank" && key !== "name"; }
      writeHash();
      render();
    });
    return el("th", { scope: "col" }, button);
  }

  function boardTable() {
    var rows = sortedRows(filteredRows());
    if (rows.length === 0) {
      return el("div", { class: "panel" },
        el("div", { class: "empty" },
          el("h2", { text: "No protocol matches that filter" }),
          el("p", { text: "Clear the search or choose another category and chain." }),
          el("button", {
            class: "reset", type: "button", text: "Reset filters",
            onclick: function () { state.q = ""; state.category = "all"; state.chain = "all"; state.watchOnly = false; writeHash(); render(); },
          })
        )
      );
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var body = el("tbody");
    rows.forEach(function (row) {
      var growthClass = row.growth_pct >= 0 ? "pos" : "neg";
      var tr = el("tr", {
        tabindex: "0",
        onclick: function () { openDetail(row.slug); },
        onkeydown: function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(row.slug); } },
      },
        el("td", null, el("span", { class: "rank" + (row.rank <= 3 ? " top" : ""), text: String(row.rank) })),
        el("td", null,
          el("div", { class: "name" },
            el("b", { text: row.name }),
            el("span", { class: "sub", text: (row.category || "Other") + " · " + (row.chains || []).slice(0, 3).join(", ") })
          )
        ),
        el("td", { class: "num", text: fmtUsd(row.implied_value_usd) }),
        el("td", { class: "num", text: fmtUsd(row.tvl_usd) }),
        el("td", { class: "num " + growthClass, text: fmtPct(row.growth_pct) }),
        el("td", { class: "num", text: fmtAge(row.age_days) }),
        el("td", null,
          el("div", { class: "value" },
            el("div", { class: "bar", "aria-hidden": "true" }, el("i", { style: "width:" + Math.max(3, Math.round(row.implied_value_usd / max * 100)) + "%" })),
            el("div", { class: "signals" },
              el("span", { class: "pill " + (row.watchlisted ? "good" : "warm"), text: row.watchlisted ? "watchlist" : "early" }),
              row.signals.filter(function (signal) { return signal !== "Watchlist floor" && signal !== "Early find"; }).slice(0, 1).map(function (signal) { return el("span", { class: "pill", text: signal }); })
            )
          )
        )
      );
      body.appendChild(tr);
    });
    return el("div", { class: "panel" },
      el("div", { class: "table-wrap" },
        el("table", null,
          el("caption", { text: "Every row records no token in the sealed snapshot. Rank is our implied-value claim; select a row for its factors and farm plan." }),
          el("thead", null, el("tr", null,
            sortHeader("rank", "Rank"),
            sortHeader("name", "Protocol"),
            sortHeader("value", "Implied value"),
            sortHeader("tvl", "TVL"),
            sortHeader("growth", "7d"),
            sortHeader("age", "Runway"),
            el("th", { scope: "col", text: "Signal" })
          )),
          body
        )
      )
    );
  }

  function liveTable() {
    var query = state.q.trim().toLowerCase();
    var rows = DATA.live.filter(function (row) {
      if (!query) return true;
      return [row.name, row.slug, row.category, (row.chains || []).join(" ")].join(" ").toLowerCase().indexOf(query) >= 0;
    });
    var body = el("tbody");
    rows.forEach(function (row) {
      body.appendChild(el("tr", null,
        el("td", null, el("span", { class: "pill good", text: "live" })),
        el("td", null, el("div", { class: "name" }, el("b", { text: row.name }), el("span", { class: "sub", text: (row.category || "Other") + " · " + (row.chains || []).slice(0, 3).join(", ") }))),
        el("td", { class: "num", text: fmtUsd(row.tvl_usd) }),
        el("td", { class: "num " + (row.change_7d >= 0 ? "pos" : "neg"), text: fmtPct(row.change_7d) }),
        el("td", { class: "num", text: fmtUsd(row.mcap_usd) })
      ));
    });
    return el("div", { class: "panel" },
      el("div", { class: "table-wrap" },
        el("table", null,
          el("caption", { text: "These protocols already trade. Their market cap is a fact from the snapshot, so they are set aside from the pre-token board." }),
          el("thead", null, el("tr", null,
            el("th", { scope: "col", text: "Status" }),
            el("th", { scope: "col", text: "Protocol" }),
            el("th", { scope: "col", text: "TVL" }),
            el("th", { scope: "col", text: "7d" }),
            el("th", { scope: "col", text: "Market cap" })
          )),
          body
        )
      )
    );
  }

  function modelPanel() {
    return el("section", { class: "panel model" },
      el("div", null,
        el("h2", { text: "How implied value is assigned" }),
        el("p", { text: "One function scores every row from the snapshot. No protocol name is special-cased and no name is hand-picked. A live token is never given an implied value; it appears in its own view with the market's own market cap." }),
        el("div", { class: "formula", text: "round( TVL x 0.22 x (1 + clamp(7d, -40, 60) x 1.2 / 100) x (0.55 + min(runway, 1460) / 1460 x 0.45) x (1 + min(chains, 6) x 0.03) x category tilt )" })
      ),
      el("div", { class: "checklist" },
        el("div", { text: "TVL and seven-day change come straight from the sealed input." }),
        el("div", { text: "Runway is the time since the protocol was first listed; unknown runway uses 180 days." }),
        el("div", { text: "Wrapped, staked, bridged, versioned and exchange products are excluded." }),
        el("div", { text: "Each farm plan names an action, capital, gas, weekly work and a holding window." })
      )
    );
  }

  function factor(label, value, width, display) {
    return el("div", { class: "factor" },
      el("span", { text: label }),
      el("div", { class: "bar", "aria-hidden": "true" }, el("i", { style: "width:" + Math.max(2, Math.min(100, Math.round(width * 100))) + "%" })),
      el("b", { text: display })
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (item) { return item.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var checked = recompute(row);
    detail.textContent = "";
    detail.appendChild(el("div", { class: "detail-head" },
      el("div", null,
        el("span", { class: "brand-name", text: "Rank " + row.rank + " of " + DATA.board_size }),
        el("h2", { text: row.name }),
        el("p", { class: "sub", text: (row.category || "Other") + " · " + (row.chains || []).join(", ") })
      ),
      el("button", { class: "close", type: "button", text: "Close", onclick: function () { closeDetail(); } })
    ));
    detail.appendChild(el("div", { class: "detail-hero" },
      el("div", { class: "big", text: fmtUsd(row.implied_value_usd) }),
      el("div", { class: "caption", text: "Implied value if the record stays as it is — our claim, not a price or a forecast." }),
      el("div", { class: "badge", text: checked === row.implied_value_usd ? "Page recomputes the board value exactly" : "Value check differs from the board" })
    ));
    detail.appendChild(el("section", { class: "section" },
      el("h3", { text: "Why this value" }),
      factor("TVL base", row.tvl_usd, row.tvl_usd / (DATA.rows[0].tvl_usd || 1), fmtUsd(row.tvl_usd * DATA.model.base_multiple)),
      factor("Seven-day change", row.growth_multiplier, row.growth_multiplier / 1.72, fmtMult(row.growth_multiplier)),
      factor("No-token runway", row.tenure_multiplier, row.tenure_multiplier, fmtAge(row.age_days) + " · " + fmtMult(row.tenure_multiplier)),
      factor("Chain breadth", row.chain_multiplier, (row.chain_multiplier - 1) / 0.18, fmtMult(row.chain_multiplier)),
      factor("Category tilt", row.category_tilt, (row.category_tilt - 1) / 0.1, fmtMult(row.category_tilt))
    ));
    detail.appendChild(el("section", { class: "section" },
      el("h3", { text: "Farm plan" }),
      el("ol", { class: "steps" }, row.farm_steps.map(function (step) {
        var at = step.indexOf(" Cost: ");
        var action = at >= 0 ? step.slice(0, at) : step;
        var tail = at >= 0 ? step.slice(at + 7) : "";
        var timeAt = tail.indexOf(". Time: ");
        var cost = timeAt >= 0 ? tail.slice(0, timeAt) : tail;
        var time = timeAt >= 0 ? tail.slice(timeAt + 8) : "";
        return el("li", null, el("b", { text: action }), el("span", { text: cost + (time ? " · " + time : "") }));
      }))
    ));
    detail.appendChild(el("section", { class: "section" },
      el("h3", { text: "Selection" }),
      el("p", { class: "sub", text: (row.watchlisted ? "On the house watchlist, so the floor is covered. " : "An early find below the watchlist floor. ") + "The index records no token for this protocol, and the plan starts from its own category, chains, TVL and runway." }),
      el("div", { class: "signals" }, row.signals.map(function (signal) { return el("span", { class: "pill good", text: signal }); }))
    ));
    detail.hidden = false;
    backdrop.hidden = false;
    detail.scrollTop = 0;
  }

  function closeDetail() {
    state.selected = null;
    detail.hidden = true;
    backdrop.hidden = true;
    writeHash();
  }

  function render() {
    app.textContent = "";
    var shell = el("div", { class: "shell" },
      header(),
      hero(),
      controls(),
      state.tab === "pre" ? boardTable() : liveTable(),
      state.tab === "pre" ? modelPanel() : null,
      el("div", { class: "footer", text: "Static page · no network · all figures from the sealed snapshot" })
    );
    app.appendChild(shell);
    app.appendChild(backdrop);
    app.appendChild(detail);
    app.setAttribute("aria-busy", "false");
    if (state.selected) openDetail(state.selected);
  }

  window.addEventListener("hashchange", function () {
    readHash();
    render();
  });

  readHash();
  render();
})();
