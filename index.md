---
layout: default
title: 首页
page_class: notebook-home
description: liulog 的技术笔记，记录 RISC-V、内核安全、虚拟化与 FPGA 的学习与实践。
---

<section class="home-intro">
  <div class="intro-copy">
    <p class="eyebrow"><span class="status-dot"></span> LIULOG / ENGINEERING NOTES</p>
    <h1>从代码出发，<br>看见底层的世界<span>。</span></h1>
    <p class="intro-description">你好，我是 liulog。记录系统软件与数字电路中的问题、实验和思考，把复杂的机制拆开，一点点弄明白。</p>
    <div class="intro-actions"><a class="button-primary" href="#library">浏览技术笔记 <span>↗</span></a><a class="quiet-link" href="/about.html">关于我 →</a></div>
    <div class="interest-line"><span>RISC-V</span><span>Kernel Security</span><span>Virtualization</span><span>FPGA</span></div>
  </div>
  <div class="intro-schematic" aria-label="从系统软件到硬件的知识层次">
    <div class="schematic-caption"><span>EXPLORING THE STACK</span><span>01 — 04</span></div>
    <div class="stack-layer"><span>01</span><strong>Software</strong><small>C / Rust / Scala</small></div>
    <div class="stack-layer"><span>02</span><strong>Systems</strong><small>Kernel / Hypervisor</small></div>
    <div class="stack-layer"><span>03</span><strong>Architecture</strong><small>RISC-V / MMU / Cache</small></div>
    <div class="stack-layer stack-layer--active"><span>04</span><strong>Hardware</strong><small>Chisel / RTL / FPGA</small></div>
    <div class="schematic-foot"><span class="status-dot"></span> 理解每一层，也理解它们之间的连接。</div>
  </div>
</section>

<section class="featured-note" aria-labelledby="featured-title">
  <div class="featured-copy"><p class="eyebrow">专题 · 从软件走向硬件</p><h2 id="featured-title"><a href="/chisel-to-fpga.html">一段 Chisel，如何变成<br>FPGA 上真实的电路？</a></h2><p>串起 HDL 生成、综合、布局布线与烧录；拆开一颗 Xilinx FPGA，看看里面的逻辑、存储和互连。</p><a class="feature-link" href="/chisel-to-fpga.html">开始阅读 <span>→</span></a></div>
  <a class="feature-circuit" href="/chisel-to-fpga.html" aria-label="阅读从 Chisel 到 FPGA 专题"><div class="circuit-source"><span>.scala</span><strong>Chisel</strong></div><span class="circuit-arrow">→</span><div class="circuit-source"><span>.sv</span><strong>RTL</strong></div><span class="circuit-arrow">→</span><div class="chip-package"><span class="chip-mark">配置 · .bit</span><strong>FPGA</strong><span class="chip-grid" aria-hidden="true">▦ ▦ ▦<br>▦ ▦ ▦<br>▦ ▦ ▦</span></div></a>
</section>

<section class="library" id="library" aria-labelledby="library-title">
  <div class="section-heading"><div><p class="eyebrow">THE NOTEBOOK</p><h2 id="library-title">技术笔记</h2></div><p>把原理、源码和实践连起来。</p></div>
  <div class="library-tools" hidden>
    <div class="filter-buttons" role="group" aria-label="按主题筛选"><button type="button" data-filter="all" aria-pressed="true">全部</button><button type="button" data-filter="architecture" aria-pressed="false">体系结构</button><button type="button" data-filter="kernel" aria-pressed="false">内核与安全</button><button type="button" data-filter="hardware" aria-pressed="false">数字电路</button><button type="button" data-filter="tools" aria-pressed="false">工程工具</button></div>
    <label class="search-field"><span class="sr-only">搜索文章</span><span aria-hidden="true">⌕</span><input id="article-search" type="search" placeholder="搜索笔记…" autocomplete="off"></label>
  </div>
  <p class="result-count" id="result-count" role="status" aria-live="polite">共 {{ site.data.articles.size }} 篇笔记</p>
  <div class="note-grid">
    {% for note in site.data.articles %}
    <article class="note-card" data-category="{{ note.category }}">
      <div class="note-meta"><span>{{ note.label }}</span><span>{{ note.format }}</span></div>
      <h3><a href="{{ note.url | relative_url }}">{{ note.title }}</a></h3><p>{{ note.description }}</p>
      <div class="note-bottom"><span class="note-number">NOTE / {% if forloop.index < 10 %}0{% endif %}{{ forloop.index }}</span><a href="{{ note.url | relative_url }}" aria-label="阅读：{{ note.title }}">↗</a></div>
    </article>
    {% endfor %}
  </div>
  <p class="empty-state" hidden>没有找到匹配的笔记，试试其他关键词或分类。</p>
</section>

<section class="elsewhere"><div><p class="eyebrow">LEARNING BY BUILDING</p><h2>也在代码里探索。</h2><p>参与开源，在真实的问题中理解系统。</p></div><div class="project-links"><a href="https://github.com/syswonder/hvisor">hvisor <small>Rust Hypervisor</small><span>↗</span></a><a href="https://github.com/syswonder/hvboot">hvboot <small>UEFI Bootloader</small><span>↗</span></a><a href="https://github.com/liulog/llaisys">llaisys <small>AI Inference</small><span>↗</span></a></div></section>
<p class="editorial-note">部分笔记由 AI 辅助整理，技术结论与适用范围请结合文中的源码和官方资料阅读。</p>
