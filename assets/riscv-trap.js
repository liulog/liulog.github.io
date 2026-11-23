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

  const topics = [
    { id: "topic-encoding", tone: "encoding", title: "编码与陷阱落点",
      detail: "先从 cause 寄存器区分同步异常和中断，再查异常编码、委托与现场寄存器。",
      ids: ["mcause", "deleg", "irq", "custom"] },
    { id: "topic-memory", tone: "memory", title: "地址与访存",
      detail: "从访问类型和异常编码出发，区分页表、物理保护、客户地址翻译与对齐检查。",
      ids: ["af", "pf", "gpf", "mis"] },
    { id: "topic-execution", tone: "execution", title: "执行与调试",
      detail: "查阅指令和 CSR 门控、调试触发器、软件检查以及有效特权的影响。",
      ids: ["ill", "bp", "sw", "eff"] },
    { id: "topic-platform", tone: "platform", title: "设备与能力",
      detail: "查阅设备侧故障记录、互连保护及 CHERI 草案中的能力异常。",
      ids: ["ext", "cheri"] }
  ];
  const overviewLabels = {
    mcause: "标准编码速查", deleg: "陷阱委托", irq: "中断与通知", custom: "定制编码",
    af: "访问故障", pf: "页故障", gpf: "客户页故障", mis: "地址未对齐",
    ill: "非法与虚拟指令", bp: "断点与调试", sw: "软件检查与硬件错误", eff: "有效特权",
    ext: "设备与互连", cheri: "CHERI 能力异常"
  };
  const data = JSON.parse(document.getElementById("tree-data").textContent);
  const ui = {
    explorer: document.getElementById("explorer"),
    stage: document.getElementById("map-stage"),
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
    clear: document.getElementById("clear")
  };

  const entries = new Map();
  const compact = matchMedia("(max-width: 940px)");
  const destinations = new Map(topics.map(topic => [topic.id, topic]));
  const nodeButtons = new Map();
  const topicByBranch = new Map(topics.flatMap(topic => topic.ids.map(id => [id, topic])));
  let active = "root";
  let matches = null;
  let wires = [];
  let paintFrame;

  function element(tag, options = {}) {
    return Object.assign(document.createElement(tag), options);
  }

  function normalize(text) {
    return String(text).normalize("NFKC").toLowerCase().replace(/\s*([=:])\s*/g, "$1");
  }

  function indexNodes(nodes, parent = null) {
    for (const node of nodes) {
      const topic = parent?.topic || topicByBranch.get(node.id);
      const search = normalize([
        node.id, node.label, node.detail, node.sub, node.codes?.join(" "),
        ...Object.values(node.official || {}), labels[node.status], labels[node.profile],
        ...(node.sources || []).map(source => sources[source][0])
      ].filter(Boolean).join(" "));
      const entry = { node, parent, topic, search, id: node.id };
      entries.set(node.id, entry);
      destinations.set(node.id, entry);
      if (node.children) indexNodes(node.children, entry);
    }
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

  function nodeTrail(entry) {
    const trail = [];
    for (let item = entry; item; item = item.parent) trail.unshift(item);
    return trail;
  }

  function pathPart(label, id, last) {
    if (last) {
      const current = element("span", { textContent: label });
      current.setAttribute("aria-current", "location");
      return current;
    }
    const button = element("button", { type: "button", textContent: label });
    button.addEventListener("click", () => navigate(id, { focus: true }));
    return button;
  }

  function renderPath() {
    const crumbs = [["总览", "root"]];
    if (matches) {
      crumbs.push(["搜索与筛选", null]);
    } else if (active !== "root") {
      const destination = destinations.get(active);
      const topic = destination.topic || destination;
      crumbs.push([topic.title, topic.id]);
      for (const entry of nodeTrail(entries.get(active))) {
        crumbs.push([overviewLabels[entry.id] || entry.node.label, entry.id]);
      }
    }
    const parts = crumbs.flatMap(([label, id], index) => {
      const part = pathPart(label, id, index === crumbs.length - 1);
      if (!index) return [part];
      const separator = element("span", { textContent: "›" });
      separator.setAttribute("aria-hidden", "true");
      return [separator, part];
    });
    ui.path.replaceChildren(...parts);
  }

  function hub(title, id, meta = "") {
    const box = element("div", { className: "hub", tabIndex: -1 });
    box.append(element("h3", { textContent: title }));
    if (meta) box.append(element("code", { textContent: meta }));
    nodeButtons.set(id, box);
    return box;
  }

  function nodeButton(entry, { short = false, context = "" } = {}) {
    const { node, id } = entry;
    const button = element("button", { type: "button", className: "map-node" });
    button.dataset.node = id;
    button.setAttribute("aria-controls", "detail");
    if (id === active) button.setAttribute("aria-current", "true");
    if (node.children) button.classList.add("has-children");
    button.append(element("span", { className: "node-label", textContent: short ? overviewLabels[id] : node.label }));
    const meta = node.sub || node.codes?.join(" / ") || context;
    if (meta) button.append(element("span", { className: "node-meta", textContent: meta }));
    button.addEventListener("click", () => {
      const showDetails = compact.matches && !node.children;
      navigate(id, { focus: !showDetails, keepFilters: true });
      if (showDetails) ui.panel.focus();
    });
    nodeButtons.set(id, button);
    return button;
  }

  function cluster(topic, items, summary) {
    const group = element("section", { className: "cluster" });
    group.dataset.tone = topic.tone;
    const title = element("h3");
    const heading = element("button", { type: "button", className: "cluster-link", textContent: topic.title });
    heading.addEventListener("click", () => navigate(topic.id, { focus: true }));
    title.append(heading);
    const points = element("div", { className: "cluster-nodes" });
    for (const entry of items) {
      points.append(nodeButton(entry, { short: summary, context: summary ? "" : entry.parent?.node.label }));
    }
    group.append(title, points);
    if (summary) group.append(element("span", { className: "cluster-count", textContent: items.length + " 个分支" }));
    return group;
  }

  function renderOverview() {
    const chart = element("div", { className: "overview" });
    const root = hub("陷阱", "root", "Interrupt · Exception");
    root.classList.add("overview-hub");
    chart.append(root);
    for (const topic of topics) {
      const group = cluster(topic, topic.ids.map(id => entries.get(id)), true);
      chart.append(group);
      wires.push({ from: root, to: group, type: "overview" });
    }
    return chart;
  }

  function renderFocus() {
    const selected = entries.get(active);
    const topic = selected?.topic || destinations.get(active);
    const anchor = selected?.node.children ? selected : selected?.parent;
    const children = anchor?.node.children || topic.ids.map(id => entries.get(id).node);
    const title = anchor?.node.label || topic.title;
    const id = anchor?.id || topic.id;
    const chart = element("div", { className: "focus-chart" });
    chart.dataset.tone = topic.tone;
    const root = hub(title, id, anchor?.node.sub || anchor?.node.codes?.join(" / "));
    const points = element("div", { className: "node-grid" });
    points.style.setProperty("--columns", Math.min(4, children.length));
    for (const child of children) {
      const point = nodeButton(entries.get(child.id));
      points.append(point);
      wires.push({ from: root, to: point, type: "focus" });
    }
    chart.append(root, points);
    return chart;
  }

  function renderMatches() {
    const chart = element("div", { className: "search-clusters" });
    for (const topic of topics) {
      const items = matches.filter(entry => entry.topic === topic);
      if (items.length) chart.append(cluster(topic, items, false));
    }
    return chart;
  }

  function renderMap() {
    nodeButtons.clear();
    wires = [];
    const empty = matches?.length === 0;
    ui.empty.hidden = !empty;
    ui.jump.hidden = empty;
    ui.count.textContent = matches ? `匹配 ${matches.length} 项` : `${entries.size} 个节点`;
    ui.map.replaceChildren(...(empty ? [] : [matches ? renderMatches() : active === "root" ? renderOverview() : renderFocus()]));
    renderPath();
    schedulePaint();
  }

  function drawWires() {
    if (!wires.length) {
      ui.canvas.width = 0;
      ui.canvas.height = 0;
      return;
    }
    const stage = ui.stage.getBoundingClientRect();
    if (!stage.width || !stage.height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    ui.canvas.width = Math.round(stage.width * ratio);
    ui.canvas.height = Math.round(stage.height * ratio);
    const context = ui.canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 1.4;
    context.lineJoin = "round";
    context.globalAlpha = .7;

    for (const { from, to, type } of wires) {
      const start = from.getBoundingClientRect();
      const end = to.getBoundingClientRect();
      const x1 = start.left + start.width / 2 - stage.left;
      const x2 = end.left + end.width / 2 - stage.left;
      const upward = end.bottom <= start.top;
      const y1 = (upward ? start.top : start.bottom) - stage.top;
      const y2 = (upward ? end.bottom : end.top) - stage.top;
      const branch = getComputedStyle(to).getPropertyValue("--branch").trim();
      context.strokeStyle = branch || "#a6edcd";
      context.beginPath();
      context.moveTo(x1, y1);
      const bend = type === "overview" ? (y1 + y2) / 2 : y2 - 8;
      if (type === "focus" && end.top > to.parentElement.getBoundingClientRect().top + 2) {
        const y = to.parentElement.getBoundingClientRect().top - stage.top - 14;
        context.lineTo(x1, y);
        context.lineTo(5, y);
        context.lineTo(5, bend);
      } else {
        context.lineTo(x1, bend);
      }
      context.lineTo(x2, bend);
      context.lineTo(x2, y2);
      context.stroke();
      context.beginPath();
      context.arc(x2, y2, 2.4, 0, Math.PI * 2);
      context.fillStyle = context.strokeStyle;
      context.fill();
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
    const topic = !entry && destinations.get(active);
    const node = entry?.node || data;
    const tags = element("div", { className: "tags" });
    for (const tag of [node.status, node.profile].filter(Boolean)) {
      tags.append(element("span", { className: "tag " + tag, textContent: labels[tag] }));
    }
    const label = element("p", { className: "panel-label", textContent: "节点详情" });
    const back = element("button", { type: "button", className: "detail-back", textContent: "回到图中" });
    back.addEventListener("click", () => focusNode(active));
    const toolbar = element("div", { className: "detail-toolbar" });
    toolbar.append(label, back);
    const heading = element("h2", { id: "detail-title", textContent: topic?.title || node.label });
    ui.panel.hidden = matches?.length === 0;
    ui.panel.replaceChildren(toolbar, tags, heading);
    if (entry?.parent) {
      ui.panel.append(element("p", { className: "breadcrumb", textContent: nodeTrail(entry.parent).map(item => item.node.label).join(" / ") }));
    }
    if (topic?.detail || node.detail) ui.panel.append(element("p", { textContent: topic?.detail || node.detail }));
    if (node.official) addOfficialDetails(node.official);
    if (node.related) {
      detailList("相关节点", node.related.map(id => [entries.get(id).node.label, "#" + encodeURIComponent(id)]), "related");
    }
    if (matches && entry) {
      const locate = element("a", { textContent: "在关系图中定位", href: "#" + encodeURIComponent(active) });
      const action = element("p");
      action.append(locate);
      ui.panel.append(action);
    }

    let cited = entry;
    while (cited && !cited.node.sources) cited = cited.parent;
    const citations = new Set(cited?.node.sources || ["machine", "profile"]);
    if (node.profile) citations.add("profile");
    detailList("规范来源", [...citations].map(source => sources[source]));
  }

  function render() {
    renderMap();
    renderDetail();
  }

  function applyFilters() {
    const query = normalize(ui.query.value.trim());
    const status = ui.status.value;
    const profile = ui.profile.value;
    matches = query || status || profile ? [...entries.values()].filter(entry =>
      (!status || entry.node.status === status) &&
      (!profile || entry.node.profile === profile) &&
      matchesQuery(entry, query)
    ) : null;
    if (matches && !matches.some(entry => entry.id === active)) active = matches[0]?.id || "root";
    ui.clear.disabled = !matches;
    const count = Number(Boolean(status)) + Number(Boolean(profile));
    ui.filterToggle.textContent = count ? `筛选（${count}）` : "筛选";
    render();
  }

  function focusNode(id) {
    const target = nodeButtons.get(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }

  function navigate(id, { focus = false, push = true, keepFilters = false } = {}) {
    if (id !== "root" && !destinations.has(id)) return;
    if (!keepFilters || !matches?.some(entry => entry.id === id)) {
      ui.form.reset();
      matches = null;
      ui.clear.disabled = true;
      ui.filterToggle.textContent = "筛选";
    }
    active = id;
    if (push) {
      const hash = "#" + encodeURIComponent(id);
      if (location.hash !== hash) history.pushState(null, "", hash);
    }
    render();
    if (focus) focusNode(id);
  }

  function hashId(hash) {
    try {
      return decodeURIComponent(hash.slice(1));
    } catch {
      return "";
    }
  }

  indexNodes(data.children);
  ui.form.addEventListener("submit", event => event.preventDefault());
  ui.query.addEventListener("input", applyFilters);
  ui.status.addEventListener("change", applyFilters);
  ui.profile.addEventListener("change", applyFilters);
  ui.filterToggle.addEventListener("click", () => {
    const expanded = ui.filterToggle.getAttribute("aria-expanded") === "true";
    ui.filterToggle.setAttribute("aria-expanded", String(!expanded));
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
  document.addEventListener("click", event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const id = hashId(anchor.hash);
    if (!destinations.has(id)) return;
    event.preventDefault();
    navigate(id, { focus: true });
  });
  window.addEventListener("hashchange", () => {
    const id = hashId(location.hash);
    if (!id || id === "root" || destinations.has(id)) navigate(id || "root", { push: false });
  });
  new ResizeObserver(schedulePaint).observe(ui.stage);
  ui.explorer.hidden = false;
  const initial = hashId(location.hash);
  const direct = initial === "root" || destinations.has(initial);
  navigate(direct ? initial : "root", { push: false, focus: direct });
})();
