(() => {
  "use strict";

  const isa = "https://docs.riscv.org/reference/isa/v20260120/priv/";
  const spmp = "https://github.com/riscv/riscv-spmp";
  const sources = {
    machine: ["Machine-Level ISA 1.13", isa + "machine.html"],
    supervisor: ["Supervisor-Level ISA 1.13", isa + "supervisor.html"],
    hypervisor: ["Hypervisor Extension 1.0", isa + "hypervisor.html"],
    profile: ["RVA23 Profiles v1.0", "https://docs.riscv.org/reference/rva23/v1.0/rva23-profiles.html"],
    cfi: ["特权 ISA · Control-flow Integrity", isa + "priv-cfi.html"],
    smepmp: ["Smepmp 1.0", isa + "smepmp.html"],
    stateen: ["Smstateen / Ssstateen 1.0", isa + "smstateen.html"],
    pointer: ["Pointer Masking Extensions 1.0", isa + "zpm.html"],
    ssdbltrp: ["Ssdbltrp 1.0", isa + "ssdbltrp.html"],
    svadu: ["Svadu · Supervisor-Level ISA", isa + "supervisor.html"],
    svvptc: ["Svvptc · Supervisor-Level ISA", isa + "supervisor.html"],
    svpbmt: ["Svpbmt · Supervisor-Level ISA", isa + "supervisor.html"],
    ptebits: ["Svrsw60t59b · Supervisor-Level ISA", isa + "supervisor.html"],
    ratified: ["RISC-V International · 已批准扩展", "https://riscv.atlassian.net/wiki/spaces/HOME/pages/16154732/Ratified%2BExtensions"],
    debug: ["RISC-V Debug Specification 1.0", "https://docs.riscv.org/reference/debug/v1.0/"],
    iommu: ["RISC-V IOMMU · In-memory queue interface", "https://docs.riscv.org/reference/iommu/v20260222/iommu_in_memory_queues.html"],
    plic: ["RISC-V PLIC Specification 1.0.0", "https://docs.riscv.org/reference/plic/_attachments/riscv-plic.pdf"],
    spmp: ["SPMP v1.0 · 规范正文", spmp + "/blob/v1.0/sspmp/spmp_spec.adoc"],
    vspmp: ["SPMP for Hypervisor v0.6 · 草案", spmp + "/releases/tag/spmp-for-hyp-v0.6"],
    svukte: ["Svukte · 草案", "https://github.com/riscv/riscv-isa-manual/pull/1564/files"],
    smmpt: ["Supervisor Domain Access Protection · 草案", "https://github.com/riscv/riscv-smmtt"],
    mcfi: ["M / M+U / SPMP 影子栈 · 草案", "https://github.com/riscv/riscv-isa-manual/pull/3428"],
    pmpmt: ["Smpmpmt · 草案", "https://github.com/riscv/riscv-isa-manual/pull/3192"],
    worlds: ["RISC-V Worlds · 草案", "https://github.com/riscv/riscv-worlds/blob/main/src/machine.adoc"],
    mtag: ["RISC-V Memory Tagging · 草案", "https://github.com/riscv/riscv-memory-tagging"],
    cheri: ["CHERI · v0.9.10.1-ar20261013 草案", "https://riscv.github.io/riscv-cheri/0.9.10.1-ar20261013/riscv-cheri-full-0.9.10.1-ar20261013.html"],
    sdsec: ["RISC-V External Debug Security · 草案", "https://github.com/riscv-non-isa/riscv-external-debug-security"],
    iopmp: ["RISC-V IOPMP · 草案", "https://github.com/riscv-non-isa/riscv-iopmp"],
    cove: ["CoVE ABI · 草案", "https://github.com/riscv-non-isa/riscv-ap-tee"],
    coveio: ["CoVE-IO ABI · v0.4.0 草案", "https://github.com/riscv-non-isa/riscv-ap-tee-io/releases/tag/v0.4.0"],
    cmo: ["CMO Extensions 1.0.0", "https://docs.riscv.org/reference/isa/v20260120/unpriv/cmo.html"]
  };
  const labels = {
    standard: "已批准规范",
    platform: "平台或实现相关",
    draft: "公开提案",
    mandatory: "RVA23S64 强制",
    optional: "RVA23S64 可选",
    "u64-option": "RVA23U64 可选",
    "not-in-profile": "RVA23S64 未列入"
  };

  const shortLabels = {
    root: "RISC-V 陷阱", af: "访问故障", pf: "页故障", gpf: "客户页故障", mis: "地址未对齐",
    "mcause-swchk": "软件检查子码",
    ill: "非法与虚拟指令", bp: "断点与调试", sw: "软件检查与硬件错误",
    deleg: "委托与现场寄存器", eff: "有效特权与地址解释",
    ext: "设备与互连", irq: "异步中断与平台通知", custom: "定制同步异常",
    cheri: "CHERI 能力异常"
  };
  const branchTones = {
    mcause: "encoding", deleg: "encoding", irq: "encoding", custom: "encoding",
    af: "memory", pf: "memory", gpf: "memory", mis: "memory",
    ill: "execution", bp: "execution", sw: "execution", eff: "execution",
    ext: "platform", cheri: "platform"
  };
  const data = JSON.parse(document.getElementById("tree-data").textContent);
  const ui = {
    explorer: document.getElementById("explorer"),
    stage: document.getElementById("map-stage"),
    viewport: document.getElementById("tree-viewport"),
    world: document.getElementById("tree-world"),
    canvas: document.getElementById("map-wires"),
    map: document.getElementById("map-content"),
    path: document.getElementById("map-path"),
    panel: document.getElementById("detail"),
    jump: document.querySelector(".detail-jump"),
    form: document.getElementById("filters"),
    query: document.getElementById("query"),
    status: document.getElementById("status-filter"),
    profile: document.getElementById("profile-filter"),
    filterToggle: document.getElementById("filter-toggle"),
    count: document.getElementById("result-count"),
    empty: document.getElementById("empty"),
    clear: document.getElementById("clear"),
    expand: document.getElementById("expand-all"),
    collapse: document.getElementById("collapse-all"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomLevel: document.getElementById("zoom-level"),
    fit: document.getElementById("fit-tree"),
    resetZoom: document.getElementById("reset-zoom")
  };

  const nodeWidth = 204;
  const nodeHeight = 48;
  const columnStep = 266;
  const rowStep = 58;
  const padding = 26;
  const minZoom = .05;
  const maxZoom = 1.5;
  const entries = new Map();
  const buttons = new Map();
  const compact = matchMedia("(max-width: 940px)");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  let expanded = new Set(["root", "mcause"]);
  let filterExpanded = new Set();
  let hits = null;
  let visible = null;
  let active = "root";
  let selectionBeforeFilter = "root";
  let points = new Map();
  let layoutWidth = 0;
  let layoutHeight = 0;
  let zoom = 1;
  let paintFrame;
  let drag;

  function element(tag, options = {}) {
    return Object.assign(document.createElement(tag), options);
  }

  function normalize(text) {
    return String(text).normalize("NFKC").toLowerCase().replace(/\s*([=:])\s*/g, "$1");
  }

  function indexNode(node, parent = null) {
    const id = node.id;
    const tone = branchTones[id] || parent?.tone || "root";
    const search = normalize([
      id, node.label, node.detail, node.sub, node.codes?.join(" "),
      ...Object.values(node.official || {}), labels[node.status], labels[node.profile],
      ...(node.sources || []).map(source => sources[source][0])
    ].filter(Boolean).join(" "));
    const entry = { node, parent, tone, search, id };
    entries.set(id, entry);
    entry.children = (node.children || []).map(child => indexNode(child, entry));
    return entry;
  }

  function includesCode(code, number) {
    if (typeof code === "number") return code === number;
    if (code.startsWith("≥")) return number >= Number(code.slice(1));
    const [first, last] = code.split("–").map(Number);
    return first <= number && number <= last;
  }

  function matchesQuery(entry, query) {
    const numeric = query.match(/^(?:(cause|异常|interrupt|中断)\s*[:=]?\s*)?(0x[0-9a-f]+|\d+)$/);
    if (numeric) {
      const [, prefix, digits] = numeric;
      const isInterrupt = entry.node.kind === "interrupt";
      if (prefix && isInterrupt !== ["interrupt", "中断"].includes(prefix)) return false;
      return (entry.node.codes || []).some(code => includesCode(code, Number(digits)));
    }
    return query.split(/\s+/).every(term => entry.search.includes(term));
  }

  function ancestors(entry) {
    const trail = [];
    for (let item = entry; item; item = item.parent) trail.unshift(item);
    return trail;
  }

  function openBranches() {
    return hits ? filterExpanded : expanded;
  }

  function availableChildren(entry) {
    return visible ? entry.children.filter(child => visible.has(child.id)) : entry.children;
  }

  function layoutTree() {
    points = new Map();
    let nextRow = padding + nodeHeight / 2;
    let maxDepth = 0;
    function place(entry, depth) {
      maxDepth = Math.max(maxDepth, depth);
      const available = availableChildren(entry);
      const children = openBranches().has(entry.id) ? available.map(child => place(child, depth + 1)) : [];
      const y = children.length ? (children[0].y + children.at(-1).y) / 2 : nextRow;
      if (!children.length) nextRow += rowStep;
      const point = { entry, x: padding + depth * columnStep, y, children, expandable: available.length > 0 };
      points.set(entry.id, point);
      return point;
    }
    if (hits?.size !== 0) place(entries.get("root"), 0);
    layoutWidth = padding * 2 + maxDepth * columnStep + nodeWidth;
    layoutHeight = nextRow - rowStep + nodeHeight / 2 + padding;
  }

  function pathEntry(entry, current) {
    const label = shortLabels[entry.id] || entry.node.label;
    if (current) {
      const text = element("span", { textContent: label });
      text.setAttribute("aria-current", "location");
      return text;
    }
    const button = element("button", { type: "button", textContent: label });
    button.addEventListener("click", () => navigate(entry.id, { focus: true }));
    return button;
  }

  function renderPath() {
    const trail = ancestors(entries.get(active));
    const parts = trail.flatMap((entry, index) => {
      const part = pathEntry(entry, index === trail.length - 1);
      if (!index) return [part];
      const separator = element("span", { textContent: "›" });
      separator.setAttribute("aria-hidden", "true");
      return [separator, part];
    });
    ui.path.replaceChildren(...parts);
  }

  function nodeElement(point) {
    const { entry, expandable, children, x, y } = point;
    const { node, id } = entry;
    const title = shortLabels[id] || node.label;
    const card = element("div", { className: "tree-node" });
    card.dataset.tone = entry.tone;
    card.dataset.node = id;
    card.classList.toggle("is-match", Boolean(hits?.has(id)));
    card.style.left = x + "px";
    card.style.top = (y - nodeHeight / 2) + "px";

    const select = element("button", { type: "button", className: "node-select", title: node.label });
    select.setAttribute("aria-controls", "detail");
    select.append(element("span", { className: "node-label", textContent: title }));
    const meta = node.sub || node.codes?.join(" / ");
    if (meta) select.append(element("span", { className: "node-meta", textContent: meta }));
    select.addEventListener("click", () => {
      selectNode(id);
      if (compact.matches && !expandable) ui.panel.focus();
    });
    select.addEventListener("keydown", event => moveByKey(event, point));
    card.append(select);

    let toggle;
    if (expandable) {
      const open = children.length > 0;
      toggle = element("button", {
        type: "button",
        className: "node-toggle",
        textContent: open ? "−" : "+"
      });
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", (open ? "收起 " : "展开 ") + title);
      toggle.addEventListener("click", () => toggleNode(id, "toggle"));
      card.append(toggle);
    }
    buttons.set(id, { card, select, toggle });
    return card;
  }

  function moveByKey(event, point) {
    const { entry, expandable, children } = point;
    const siblingPoints = entry.parent ? points.get(entry.parent.id).children : [];
    const index = siblingPoints.indexOf(point);
    const targets = {
      ArrowLeft: entry.parent?.id,
      ArrowRight: children[0]?.entry.id,
      ArrowUp: siblingPoints[index - 1]?.entry.id,
      ArrowDown: siblingPoints[index + 1]?.entry.id
    };
    if (event.key === "ArrowRight" && expandable && !children.length) {
      event.preventDefault();
      toggleNode(entry.id);
    } else if (targets[event.key]) {
      event.preventDefault();
      focusNode(targets[event.key]);
    }
  }

  function sizeWorld() {
    ui.map.style.width = layoutWidth + "px";
    ui.map.style.height = Math.max(0, layoutHeight) + "px";
    ui.map.style.transform = `scale(${zoom})`;
    ui.world.style.width = Math.ceil(layoutWidth * zoom) + "px";
    ui.world.style.height = Math.ceil(Math.max(0, layoutHeight) * zoom) + "px";
    ui.zoomLevel.textContent = Math.round(zoom * 100) + "%";
    const empty = points.size === 0;
    ui.zoomOut.disabled = empty || zoom <= minZoom;
    ui.zoomIn.disabled = empty || zoom >= maxZoom;
    schedulePaint();
  }

  function renderTree(anchorId) {
    const old = points.get(anchorId);
    const previousY = old?.y;
    const previousScroll = ui.viewport.scrollTop;
    layoutTree();
    buttons.clear();
    ui.map.replaceChildren(...[...entries.keys()].filter(id => points.has(id)).map(id => nodeElement(points.get(id))));
    const empty = points.size === 0;
    ui.empty.hidden = !empty;
    ui.viewport.hidden = empty;
    ui.expand.disabled = empty;
    ui.collapse.disabled = empty;
    ui.fit.disabled = empty;
    ui.resetZoom.disabled = empty;
    ui.jump.hidden = empty;
    ui.count.textContent = hits ? `匹配 ${hits.size} 项` : `${points.size} / ${entries.size} 节点`;
    sizeWorld();
    const next = points.get(anchorId);
    if (next && previousY !== undefined) ui.viewport.scrollTop = previousScroll + (next.y - previousY) * zoom;
  }

  function drawWires() {
    const width = ui.viewport.clientWidth;
    const height = ui.viewport.clientHeight;
    if (!width || !height) {
      ui.canvas.width = 0;
      ui.canvas.height = 0;
      return;
    }
    const ratio = Math.min(devicePixelRatio || 1, 2);
    ui.canvas.style.width = width + "px";
    ui.canvas.style.height = height + "px";
    ui.canvas.width = Math.round(width * ratio);
    ui.canvas.height = Math.round(height * ratio);
    const context = ui.canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio * zoom, 0, 0, ratio * zoom,
      (ui.world.offsetLeft - ui.viewport.scrollLeft) * ratio, -ui.viewport.scrollTop * ratio);
    const style = getComputedStyle(ui.stage);
    const neutral = style.getPropertyValue("--wire").trim();
    const tones = Object.fromEntries(["encoding", "memory", "execution", "platform"].map(tone =>
      [tone, style.getPropertyValue("--" + tone).trim()]
    ));
    const trail = new Set(ancestors(entries.get(active)).map(entry => entry.id));
    function stroke(color, thickness, coords) {
      context.strokeStyle = color;
      context.lineWidth = thickness;
      context.beginPath();
      context.moveTo(...coords[0]);
      for (const vertex of coords.slice(1)) context.lineTo(...vertex);
      context.stroke();
    }
    for (const point of points.values()) {
      if (!point.children.length) continue;
      const start = point.x + nodeWidth;
      const fork = start + (columnStep - nodeWidth) * .55;
      stroke(neutral, 1.3, [[start, point.y], [fork, point.y]]);
      if (point.children.length > 1) {
        stroke(neutral, 1.3, [[fork, point.children[0].y], [fork, point.children.at(-1).y]]);
      }
      for (const child of point.children) {
        const color = tones[child.entry.tone] || neutral;
        const selected = trail.has(child.entry.id);
        const route = selected
          ? [[start, point.y], [fork, point.y], [fork, child.y], [child.x, child.y]]
          : [[fork, child.y], [child.x, child.y]];
        stroke(color, selected ? 2.5 : 1.45, route);
      }
    }
  }

  function schedulePaint() {
    cancelAnimationFrame(paintFrame);
    paintFrame = requestAnimationFrame(drawWires);
  }
  function detailList(title, items, className = "") {
    const heading = element("h3", { textContent: title });
    const list = element("ul", { className });
    for (const [caption, href] of items) {
      const item = element("li");
      item.append(element("a", { textContent: caption, href }));
      list.append(item);
    }
    ui.panel.append(heading, list);
  }

  function addOfficialDetails(official) {
    const definition = element("dl", { className: "official" });
    const rows = official.hypervisor
      ? [["无 H", official.base], ["有 H（M / HS）", official.hypervisor]]
      : [["规范名称", official.base]];
    for (const [term, value] of rows) {
      const row = element("div");
      row.append(element("dt", { textContent: term }), element("dd", { textContent: value }));
      definition.append(row);
    }
    ui.panel.append(definition);
  }

  function renderDetail() {
    const entry = entries.get(active);
    const { node } = entry;
    const toolbar = element("div", { className: "detail-toolbar" });
    const back = element("button", { type: "button", className: "detail-back", textContent: "回到图中" });
    back.addEventListener("click", () => focusNode(active));
    toolbar.append(element("p", { className: "panel-label", textContent: "节点详情" }), back);
    const heading = element("h2", { id: "detail-title", textContent: node.label });
    ui.panel.replaceChildren(toolbar, heading);
    ui.panel.hidden = hits?.size === 0;
    const tags = element("div", { className: "tags" });
    for (const tag of [node.status, node.profile].filter(Boolean)) {
      tags.append(element("span", { className: "tag " + tag, textContent: labels[tag] }));
    }
    if (tags.childElementCount) ui.panel.append(tags);
    if (node.detail) ui.panel.append(element("p", { textContent: node.detail }));
    if (node.official) addOfficialDetails(node.official);
    if (node.related) {
      detailList("相关节点", node.related.map(id => [entries.get(id).node.label, "#" + encodeURIComponent(id)]), "related");
    }
    let cited = entry;
    while (cited && !cited.node.sources) cited = cited.parent;
    const citations = new Set(cited?.node.sources || ["machine", "profile"]);
    if (node.profile) citations.add("profile");
    detailList("规范来源", [...citations].map(source => sources[source]));
  }

  function updateSelection() {
    for (const [id, { card, select }] of buttons) {
      if (id === active) select.setAttribute("aria-current", "true");
      else select.removeAttribute("aria-current");
      card.classList.toggle("is-selected", id === active);
    }
    renderDetail();
    renderPath();
    schedulePaint();
  }

  function selectNode(id, push = true) {
    active = id;
    if (push) {
      const hash = "#" + encodeURIComponent(id);
      if (location.hash !== hash) history.pushState(null, "", hash);
    }
    updateSelection();
  }

  function focusNode(id, control = "select") {
    const point = points.get(id);
    const target = buttons.get(id)?.[control];
    if (!point || !target) return;
    target.focus({ preventScroll: true });
    const margin = 10;
    const left = point.x * zoom - margin;
    const right = (point.x + nodeWidth) * zoom + margin;
    const top = (point.y - nodeHeight / 2) * zoom - margin;
    const bottom = (point.y + nodeHeight / 2) * zoom + margin;
    const viewport = ui.viewport;
    if (left < viewport.scrollLeft) viewport.scrollLeft = left;
    else if (right > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = right - viewport.clientWidth;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
  }

  function toggleNode(id, control = "select") {
    const open = openBranches();
    if (open.has(id)) open.delete(id);
    else open.add(id);
    renderTree(id);
    if (!points.has(active)) active = id;
    updateSelection();
    focusNode(id, control);
  }

  function applyFilters({ restore = true } = {}) {
    const query = normalize(ui.query.value.trim());
    const status = ui.status.value;
    const profile = ui.profile.value;
    const filtered = Boolean(query || status || profile);
    if (filtered && !hits) selectionBeforeFilter = active;
    if (!filtered && hits && restore) active = selectionBeforeFilter;
    hits = filtered ? new Set([...entries.values()].filter(entry =>
      entry.id !== "root" && (!status || entry.node.status === status) &&
      (!profile || entry.node.profile === profile) && matchesQuery(entry, query)
    ).map(entry => entry.id)) : null;
    visible = hits ? new Set() : null;
    filterExpanded = new Set();
    if (hits) {
      for (const id of hits) {
        const trail = ancestors(entries.get(id));
        trail.forEach(entry => visible.add(entry.id));
        trail.slice(0, -1).forEach(entry => filterExpanded.add(entry.id));
      }
      if (!hits.has(active)) active = hits.values().next().value || "root";
    }
    ui.clear.disabled = !hits;
    const count = Number(Boolean(status)) + Number(Boolean(profile));
    ui.filterToggle.textContent = count ? `筛选（${count}）` : "筛选";
    ancestors(entries.get(active)).slice(0, -1).forEach(entry => openBranches().add(entry.id));
    renderTree();
    updateSelection();
    if (points.has(active)) revealNode(active);
  }

  function revealNode(id) {
    const point = points.get(id);
    if (!point) return;
    const viewport = ui.viewport;
    viewport.scrollLeft = Math.max(0, (point.x + nodeWidth / 2) * zoom - viewport.clientWidth * .56);
    viewport.scrollTop = Math.max(0, point.y * zoom - viewport.clientHeight * .48);
  }

  function navigate(id, { focus = false, push = true, open = false } = {}) {
    const entry = entries.get(id);
    if (!entry) return;
    if (hits && !visible.has(id)) {
      ui.form.reset();
      applyFilters({ restore: false });
    }
    ancestors(entry).slice(0, -1).forEach(parent => openBranches().add(parent.id));
    if (open && availableChildren(entry).length) openBranches().add(id);
    renderTree();
    selectNode(id, push);
    if (focus) {
      ui.viewport.scrollIntoView({ block: "nearest" });
      focusNode(id);
    }
  }

  function setZoom(next, x = ui.viewport.clientWidth / 2, y = ui.viewport.clientHeight / 2) {
    const previous = zoom;
    const viewport = ui.viewport;
    const worldX = (viewport.scrollLeft + x - ui.world.offsetLeft) / previous;
    const worldY = (viewport.scrollTop + y) / previous;
    zoom = Math.max(minZoom, Math.min(maxZoom, next));
    sizeWorld();
    viewport.scrollLeft = worldX * zoom + ui.world.offsetLeft - x;
    viewport.scrollTop = worldY * zoom - y;
  }

  function fitTree() {
    setZoom(Math.min(ui.viewport.clientWidth / layoutWidth, ui.viewport.clientHeight / layoutHeight, 1), 0, 0);
    ui.viewport.scrollLeft = 0;
    ui.viewport.scrollTop = 0;
  }

  function bulkExpand(all) {
    const open = openBranches();
    open.clear();
    open.add("root");
    if (all) {
      for (const entry of entries.values()) {
        if (availableChildren(entry).length) open.add(entry.id);
      }
    }
    renderTree();
    if (!points.has(active)) active = "root";
    updateSelection();
    if (!all) revealNode("root");
  }

  function hashId() {
    try {
      return decodeURIComponent(location.hash.slice(1)) || "root";
    } catch {
      return "root";
    }
  }

  indexNode(data);
  ui.map.style.setProperty("--node-width", nodeWidth + "px");
  ui.map.style.setProperty("--node-height", nodeHeight + "px");
  ui.form.addEventListener("submit", event => event.preventDefault());
  ui.query.addEventListener("input", () => applyFilters());
  ui.status.addEventListener("change", () => applyFilters());
  ui.profile.addEventListener("change", () => applyFilters());
  ui.filterToggle.addEventListener("click", () => {
    const open = ui.filterToggle.getAttribute("aria-expanded") === "true";
    ui.filterToggle.setAttribute("aria-expanded", String(!open));
  });
  ui.clear.addEventListener("click", () => {
    ui.form.reset();
    applyFilters();
    ui.query.focus();
  });
  ui.jump.addEventListener("click", event => {
    event.preventDefault();
    ui.panel.focus();
  });
  ui.expand.addEventListener("click", () => bulkExpand(true));
  ui.collapse.addEventListener("click", () => bulkExpand(false));
  ui.zoomIn.addEventListener("click", () => setZoom(zoom * 1.18));
  ui.zoomOut.addEventListener("click", () => setZoom(zoom / 1.18));
  ui.fit.addEventListener("click", fitTree);
  ui.resetZoom.addEventListener("click", () => {
    setZoom(1);
    revealNode(active);
  });
  ui.viewport.addEventListener("scroll", schedulePaint, { passive: true });
  ui.viewport.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = ui.viewport.getBoundingClientRect();
    setZoom(zoom * (event.deltaY < 0 ? 1.12 : .89), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  ui.viewport.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("button")) return;
    const { left, top } = ui.viewport.getBoundingClientRect();
    if (event.clientX - left >= ui.viewport.clientWidth || event.clientY - top >= ui.viewport.clientHeight) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: ui.viewport.scrollLeft, top: ui.viewport.scrollTop };
    ui.viewport.setPointerCapture(event.pointerId);
    ui.viewport.classList.add("is-dragging");
  });
  ui.viewport.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    ui.viewport.scrollLeft = drag.left + drag.x - event.clientX;
    ui.viewport.scrollTop = drag.top + drag.y - event.clientY;
  });
  ui.viewport.addEventListener("lostpointercapture", () => {
    drag = null;
    ui.viewport.classList.remove("is-dragging");
  });

  document.addEventListener("click", event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const id = decodeURIComponent(anchor.hash.slice(1));
    if (!entries.has(id)) return;
    event.preventDefault();
    navigate(id, { focus: true, open: true });
  });
  window.addEventListener("hashchange", () => navigate(hashId(), { push: false, focus: true }));
  new ResizeObserver(schedulePaint).observe(ui.stage);
  theme.addEventListener("change", schedulePaint);
  ui.explorer.hidden = false;
  zoom = Math.min(.94, Math.max(.71, ui.viewport.clientWidth / (columnStep + nodeWidth + padding * 2)));
  const initial = hashId();
  navigate(entries.has(initial) ? initial : "root", { push: false, focus: initial !== "root" && entries.has(initial) });
  if (initial === "root" && compact.matches) revealNode("root");
})();
