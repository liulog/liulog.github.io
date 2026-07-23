---
layout: default
title: 首页
---

<div class="hero">
    <h1 class="hero-title">你好，我是 liulog</h1>
    <p class="hero-subtitle">系统编程爱好者 · RISC-V、虚拟化与 Kernel Security 学习者</p>
    <div class="hero-tags">
        <span class="tag">Rust Hypervisor</span>
        <span class="tag">RISC-V</span>
        <span class="tag">Kernel Security</span>
        <span class="tag">AI Inference</span>
    </div>
</div>

<div class="card-grid mt-xl">
    <div class="card">
        <h3 class="section-title">📝 最新动态</h3>
        <p>正在探索 RISC-V、虚拟化、裸机开发、Kernel Security 与 AI 推理系统；这里记录系统软件学习中的问题、实验与思考。</p>
    </div>

    <div class="card">
        <h3 class="section-title">🛠 技术栈</h3>
        <ul class="skill-list">
            <li class="skill-item">C</li>
            <li class="skill-item">Rust</li>
            <li class="skill-item">Python</li>
            <li class="skill-item">RISC-V</li>
            <li class="skill-item">QEMU</li>
            <li class="skill-item">Git</li>
        </ul>
    </div>

    <div class="card">
        <h3 class="section-title">🎯 项目</h3>
        <ul class="skill-list">
            <li class="skill-item"><a href="https://github.com/syswonder/hvisor" target="_blank">hvisor</a></li>
            <li class="skill-item"><a href="https://github.com/liulog/llaisys" target="_blank">llaisys</a></li>
            <li class="skill-item"><a href="https://github.com/syswonder/hvboot" target="_blank">hvboot</a></li>
        </ul>
    </div>
</div>

<div class="card-grid mt-xl">
    <div class="card">
        <h3 class="section-title">📚 项目可视化 / Visualizations</h3>
        <ul class="skill-list">
            <li class="skill-item">
                🎬 <a href="/riscv-sv39-pagetable-bringup.html">RISC-V Sv39 页表构建步进播放器</a>
                <small>（互动 HTML，鼠标/键盘步进）</small>
            </li>
            <li class="skill-item">
                📖 <a href="/riscv-sv39-pagetable-bringup-doc.html">RISC-V Sv39 页表构建文档</a>
                <small>（Linux 6.18 源码逐步梳理）</small>
            </li>
            <li class="skill-item">
                📖 <a href="/riscv-satp-sfence-semantics.html">RISC-V satp 与 sfence.vma 语义详解</a>
                <small>（Bare↔分页瞬间、TLB stale、sfence 时机）</small>
            </li>
            <li class="skill-item">
                🖥 <a href="/smp-multicore-arch.html">SMP 多核处理器架构可视化</a>
                <small>（4-Core TLB + Cache 层次结构，RISC-V / ARM 对比）</small>
            </li>
            <li class="skill-item">
                🔐 <a href="/linux-kpti-architecture.html">Linux KPTI 架构对照与 RISC-V 实现分析</a>
                <small>（x86 / arm64 / RISC-V / LoongArch，含主线源码审核与切换图）</small>
            </li>
            <li class="skill-item">
                🧭 <a href="/mmu-page-table-base.html">MMU 页表基址寄存器可视化：x86 CR3 · ARM64 TTBR0/1 · RISC-V satp</a>
                <small>（64-bit 位图 / 字段含义 / Linux 进程切换 / KPTI / sfence.vma 流程）</small>
            </li>
            <li class="skill-item">
                🧷 <a href="/linker-script-addresses.html">链接器脚本地址速通：VMA、LMA 与 AT()</a>
                <small>（Asterinas RISC-V 高半区实例 / ELF Segment / readelf 排查）</small>
            </li>
        </ul>
        <p><small>🤖 部分内容由 AI 辅助整理，技术结论请结合文内源码链接交叉验证。</small></p>
    </div>
</div>
