---
layout: default
title: MMU 页表基址寄存器可视化
---

# MMU 页表基址寄存器可视化

把 **x86 CR3**、**ARM64 TTBR0_EL1 / TTBR1_EL1** 与 **RISC-V satp** 三种硬件寄存器
摆在同一张桌面上，逐一拆解每个字段，并附上 Linux 内核在进程切换、ASID 分配、
KPTI/PTI 进出、TLB 维护等场景下使用它们的真实代码路径。

👉 **[打开交互式可视化页面 →](/mmu-page-table-base.html)**

## 涵盖内容

- **x86 CR3**：64-bit 位图，含 Legacy（CR4.PCIDE=0）与 PCID（CR4.PCIDE=1）双模式
  切换、PWT/PCD/PML4 基址/PCID/noflush 等字段含义；
- **ARM64 TTBR0 / TTBR1**：两个寄存器独立位图，对应用户/内核地址空间分离；
  16-bit ASID 字段与 `mm->context.id` 的关系；CnP 位在 Linux 启动期的用途；
- **RISC-V satp**：RV64 与 RV32 双布局，MODE/ASID/PPN 三段字段；
  MODE 取值（Bare/Sv39/Sv48/Sv57/Sv64）对照表；
- **Linux 使用方式**：每个架构附 3 段真实内核代码片段
  （`cr3_set_user_pcid` / `cpu_switch_mm` / `csr_write(CSR_SATP)` 等），含中文注释；
- **流程图**：进程切换 / KPTI 进出 / `sfence.vma` 序列的 SVG 时序图；
- **横向对比表**：13 个维度对比三架构的寄存器、ASID 大小、TLB 维护指令、KPTI 实现。

## 参考资料

- Intel® 64 and IA-32 SDM, Volume 3A — Chapter 4 (Paging)
- ARM Architecture Reference Manual ARMv8-A — VMSAv8-64
- RISC-V Privileged ISA Manual — §4.1 Supervisor CSRs
- Linux kernel 6.x `arch/x86/mm/`、`arch/arm64/mm/`、`arch/riscv/mm/`
