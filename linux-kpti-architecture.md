---
layout: default
title: Linux KPTI：x86、Arm、RISC-V 与 LoongArch
article: true
---

# Linux KPTI：x86、Arm、RISC-V 与 LoongArch

> 资料核对日期：2026-07-19  
> 范围：上游 Linux 主线提交 [`f2ec6312bf71`](https://kernel.googlesource.com/pub/scm/linux/kernel/git/torvalds/linux/+/f2ec6312bf711369561bdcb22f8a63c0b118c479)（2026-07-18）和 Linux 官方文档。  
> 结论中的“支持”特指 **Linux 主线提供可配置、可在用户态/内核态边界切换页表的 KPTI 实现**，不只是 ISA 理论上可以实现。

<div class="audit-note" role="note">
  <strong>审核结论</strong>
  <span>原稿的主结论成立。发布版补充了可复现的上游提交和架构切换图；没有把“硬件可实现”或“存在 trampoline”误写成“Linux 已支持”。</span>
</div>

## 1. 先给结论

| 架构 | Linux 主线 KPTI | Kconfig | 主要 cmdline | 当前实现概括 |
| --- | --- | --- | --- | --- |
| x86-64 | 支持 | `CONFIG_CPU_MITIGATIONS=y`、`CONFIG_MITIGATION_PAGE_TABLE_ISOLATION=y` | `pti=on/off/auto`、`nopti`、`mitigations=off` | 每个 `mm` 维护 kernel/user 两套顶层页表，用户页表只保留入口所需内核映射；CR3/PCID 成对切换 |
| x86-32 PAE | 支持，但不是主要使用场景 | 同上，Kconfig 条件为 `X86_64 || X86_PAE` | 实现解析 `pti=`/`nopti`；官方参数表只把它们标为 X86-64 | 思路与 x86-64 相同，但顶层结构、预分配和性能条件更差 |
| arm64 | 支持 | `CONFIG_UNMAP_KERNEL_AT_EL0=y` | `kpti=0/1`、`mitigations=off` | 用户页表本来就在 TTBR0；KPTI 在 EL0 期间把 TTBR1 切到只含异常 trampoline 的页表 |
| ARM 32-bit | 不支持主线 KPTI | 无对应项 | 无 | 不应把 arm64 的 `UNMAP_KERNEL_AT_EL0` 套到 ARM32 |
| RISC-V | **不支持主线 KPTI** | 无对应项 | 无 | 每个进程 PGD 同时含用户映射和复制来的内核映射；陷入/返回不切换 `satp` |
| LoongArch | 不支持主线 KPTI | 无对应项 | 无 | 主线没有 KPTI 配置、参数和入口切换路径 |

这里最重要的现实结论是：截至核对日期，不能通过给 RISC-V Linux 增加某个 config 或 cmdline 来“打开 KPTI”。`CONFIG_STRICT_KERNEL_RWX`、`CONFIG_PAGE_TABLE_CHECK`、`CONFIG_RISCV_ISA_*`、`no4lvl`/`no5lvl` 都不是 KPTI。

<div class="arch-view-grid" aria-label="四种架构的 KPTI 页表视图对照">
  <section class="arch-view arch-view--supported">
    <div class="arch-view__heading"><strong>x86</strong><span>主线支持</span></div>
    <div class="arch-view__root">用户 CR3 <small>用户映射 + 最小入口区</small></div>
    <div class="arch-view__switch">↕ CR3 / PCID</div>
    <div class="arch-view__root arch-view__root--kernel">内核 CR3 <small>完整内核 + 用户映射</small></div>
  </section>
  <section class="arch-view arch-view--supported">
    <div class="arch-view__heading"><strong>arm64</strong><span>主线支持</span></div>
    <div class="arch-view__root">EL0：TTBR0 + trampoline TTBR1</div>
    <div class="arch-view__switch">↕ 切换 TTBR1 / ASID</div>
    <div class="arch-view__root arch-view__root--kernel">EL1：TTBR0 + 完整 TTBR1</div>
  </section>
  <section class="arch-view arch-view--missing">
    <div class="arch-view__heading"><strong>RISC-V</strong><span>主线未支持</span></div>
    <div class="arch-view__root">U-mode：单一 <code>mm-&gt;pgd</code></div>
    <div class="arch-view__switch">↕ trap / sret 不切 satp</div>
    <div class="arch-view__root arch-view__root--kernel">S-mode：仍是同一 root</div>
  </section>
  <section class="arch-view arch-view--missing">
    <div class="arch-view__heading"><strong>LoongArch</strong><span>主线未支持</span></div>
    <div class="arch-view__empty">无 Kconfig、cmdline 或入口页表切换路径</div>
  </section>
</div>

## 2. KPTI 要解决什么问题

传统内核为了降低系统调用、异常、缺页和 `copy_to_user()`/`copy_from_user()` 的成本，通常让进程正在使用的地址空间同时包含：

- 用户虚拟地址映射；
- 内核镜像、direct map、vmalloc、per-CPU 数据等内核映射。

普通用户态访问会被页表权限位阻止，架构上不能读取 supervisor-only 页面。但 Meltdown 类漏洞说明，某些处理器可能在权限检查最终拒绝访问之前进行瞬态执行，并通过 cache 等侧信道泄漏本应不可访问的数据。KAISER 最初还着眼于隐藏内核地址、提高 KASLR 对侧信道的抵抗力；Linux PTI 随后成为共享 user/kernel 地址空间攻击面的通用缓解措施。

KPTI 的核心不是“再检查一次权限”，而是让敏感内核映射在用户态执行期间 **根本不在当前硬件页表中**：

<figure class="kpti-flow">
  <div class="kpti-flow__state kpti-flow__state--user">
    <span class="kpti-flow__eyebrow">用户态</span>
    <strong>受限页表视图</strong>
    <small>用户映射 + 最小入口 trampoline</small>
  </div>
  <div class="kpti-flow__edge">
    <span>syscall / interrupt / exception</span>
    <b>→</b>
  </div>
  <div class="kpti-flow__state kpti-flow__state--gate">
    <span class="kpti-flow__eyebrow">双重映射入口</span>
    <strong>切换 root 与 TLB tag</strong>
    <small>尚不能访问普通内核栈和 per-CPU 数据</small>
  </div>
  <div class="kpti-flow__edge">
    <span>切换完成</span>
    <b>→</b>
  </div>
  <div class="kpti-flow__state kpti-flow__state--kernel">
    <span class="kpti-flow__eyebrow">内核态</span>
    <strong>完整页表视图</strong>
    <small>完成内核工作；退出时按相反方向切回</small>
  </div>
  <figcaption>安全边界在页表切换时序：入口要足够早，退出要足够晚，并覆盖所有异常路径。</figcaption>
</figure>

它主要缓解“用户态利用瞬态执行读取当前页表中的 supervisor-only 内核映射”。它不是 Spectre 所有变体的通用修复，也不能替代 SMEP/SMAP、PAN、RISC-V `SUM`、W^X、KASLR、内核内存隔离或针对具体 CPU erratum 的 workaround。

## 3. 一个合格 KPTI 实现通常需要什么

不同架构实现细节差异很大，但共同问题基本相同：

1. **两种翻译上下文**：用户运行时的受限视图，以及进入内核后的完整视图。
2. **双重可达的入口代码**：CPU 刚陷入时仍在受限页表下，第一段汇编、异常向量以及切换页表所需的极少量数据必须映射在两个视图中。
3. **在完整内核栈可用前完成切换**：入口代码不能提前访问未映射的普通 per-CPU 数据、任务结构或内核栈。
4. **受控返回**：在最后一次访问完整内核数据之后切回受限页表，再执行 `iret`/`eret`/`sret`。
5. **地址空间标签与 TLB 管理**：两个根页表可能映射相同虚拟地址但含义不同，必须正确分配 PCID/ASID，并同时处理两边的 invalidation。
6. **页表同步**：共享用户态下层页表可以节省内存并天然同步 A/D 位，但会引入权限继承和错误返回检测问题；不共享则要维护两份映射。
7. **全局映射处理**：global TLB 项不能把只应在 kernel view 中可见的翻译泄漏到 user view。
8. **异常中的异常**：NMI、double fault、SError、栈溢出、调试异常和错误的返回路径尤其容易暴露切换时序错误。

## 4. x86：Linux PTI 的参考实现

### 4.1 支持与控制方式

当前 x86 Kconfig 项是：

```text
CONFIG_CPU_MITIGATIONS=y
CONFIG_MITIGATION_PAGE_TABLE_ISOLATION=y
```

旧资料常写 `CONFIG_PAGE_TABLE_ISOLATION`。当前主线已经改名为 `CONFIG_MITIGATION_PAGE_TABLE_ISOLATION`，阅读旧文章或旧发行版 config 时要注意版本差异。该选项依赖 `(X86_64 || X86_PAE)`，默认 `y`。

启动参数：

- `pti=auto`：默认；按 CPU 漏洞与 mitigation 策略决定是否启用；
- `pti=on`：无条件请求启用；
- `pti=off`：无条件禁用；
- `nopti`：等价于 `pti=off`；
- `mitigations=off`：会聚合关闭包括 PTI 在内的可选 CPU mitigation，前提是构建时没有彻底裁掉相关支持。

`pti=on` 不是运行时热切换；这是 early boot 决策。是否实际启用可查看启动日志中的 `Kernel/User page tables isolation: enabled`，并结合 `/sys/devices/system/cpu/vulnerabilities/meltdown` 判断，不要只看 `.config`。

### 4.2 两套页表如何组织

x86 为每个进程维护相邻的 kernel-mode PGD 和 user-mode PGD。启用 PTI 时，PGD 分配阶数增大，`kernel_to_user_pgdp()` 可以从 kernel PGD 找到配对的 user PGD。

- **kernel page table**：完整内核映射，也含完整用户地址映射，内核因此可按正常路径访问用户内存；
- **user page table**：完整用户映射，但内核部分只保留 entry text、`cpu_entry_area`、TSS scratch、IDT/异常入口所需区域等最小集合；
- 用户地址部分通常在顶层同步后共享下层页表，因此只维护一组用户 PTE、A/D 位和锁。

系统调用入口的典型顺序是：`swapgs`，暂存用户 RSP，执行 `SWITCH_TO_KERNEL_CR3`，然后才切到普通内核栈并进入 C。退出时先切到 trampoline stack，执行 `SWITCH_TO_USER_CR3_STACK`，再 `sysretq`/`iretq`。

### 4.3 “kernel PT 的 userspace PGD 设置 NX”到底是什么

这是 x86 PTI 一个很有价值的 **防错机制**，不是 KPTI 隔离本身：

1. 同一个用户 PGD entry 先原样写入 user page table；
2. 写入 kernel page table 的副本，在满足 `_PAGE_USER | _PAGE_PRESENT` 且硬件支持 NX 时，被加上顶层 `_PAGE_NX`；
3. 由于 x86 的 NX 可从高层页表项向下约束，kernel CR3 下的整个用户子树变成不可执行；
4. 如果退出路径漏掉 kernel -> user CR3 切换，CPU 一执行第一条用户指令就应立即 page fault，而不是带着完整 kernel CR3 继续运行用户代码。

这个顶层 NX 本身不禁止数据访问，因此不破坏正常的 uaccess 设计；实际读写仍受叶项 R/W、SMAP 等机制约束。它的作用是尽早暴露致命的页表切换错误。EFI runtime 等需要内核执行的特殊 `_PAGE_USER` 映射、无 NX 的 CPU、清空 PGD 等情况有例外。

### 4.4 切换时如何区分 NX 与可执行视图

先给直接答案：**不是靠 CPL（当前是 ring 0 还是 ring 3）自动选择，也不是每次都先刷新 TLB；是 CR3 同时选择页表 root 和 PCID。** NX 是被选中那棵页表里的权限结果。

在 x86-64 PTI 快路径中，每个 `mm` 的两张 PGD 连续放在一个 8 KiB 区域：

- kernel PGD 在前 4 KiB，物理地址 bit 12 为 0；
- user PGD 在后 4 KiB，物理地址 bit 12 为 1；
- `SWITCH_TO_KERNEL_CR3` 清 CR3 的页表 bit 12，`SWITCH_TO_USER_CR3` 把它置 1；
- 启用 PCID 时，Linux 还用 PCID bit 11 区分 kPCID 与 uPCID，即 `uPCID = kPCID | 0x800`。

<div class="switch-flow" aria-label="x86 KPTI 的 CR3 与 PCID 切换流程">
  <span><strong>U-mode</strong><code>user PGD + uPCID</code><small>用户 PGD 可执行；只有最小内核入口映射</small></span>
  <b>→</b>
  <span><strong>入口 trampoline</strong><code>clear PGD bit 12<br>clear PCID bit 11</code><small>写 CR3，选择 kernel view</small></span>
  <b>→</b>
  <span><strong>kernel mode</strong><code>kernel PGD + kPCID</code><small>完整内核映射；用户 PGD 顶层带 NX</small></span>
  <b>→</b>
  <span><strong>受控退出</strong><code>set PGD bit 12<br>set PCID bit 11</code><small>检查 uPCID 是否有待处理失效，再写 CR3</small></span>
</div>

这产生了两个可同时存在的翻译上下文。以同一个用户虚拟地址为例：

| 当前视图 | CR3 root | TLB tag | 用户代码页的有效权限 |
| --- | --- | --- | --- |
| 用户态 | user PGD | uPCID | 顶层 PGD 不带 NX，叶 PTE 的 X 权限生效，可以取指 |
| 内核态 | kernel PGD | kPCID | 同一 lower-level table 被顶层 NX 约束；NX 禁止取指，数据访问仍受叶项权限与 SMAP 等机制控制 |

TLB 会缓存最终翻译及权限，包括 NX。PCID 开启后，uPCID 下“可执行”的条目与 kPCID 下“不可执行”的条目具有不同 tag，可以同时留在 TLB；切换 CR3 后，CPU 只匹配新 PCID 的条目。因此正常 U → K 切换会设置 CR3 的 no-flush 位，通常不需要全量刷新。K → U 时则先检查当前 CPU 的 `user_pcid_flush_mask`：

- uPCID 没有过期：设置 no-flush 位，直接复用它的 TLB 条目；
- uPCID 有待处理失效：清除 pending bit，并在写入 user CR3 时不设置 no-flush，使目标 uPCID 的非 global 条目失效；
- CPU 不支持 PCID：两边实际只有 PCID 0，写 CR3 会冲刷非 global TLB，因此每次边界切换成本明显更高。

修改用户页表时还必须同时考虑 kPCID 和 uPCID。Linux 可以立即失效 kernel PCID，并把 user PCID 标成 pending，延迟到下一次返回用户态再清；支持硬件广播失效的路径则会直接对 `kern_pcid(asid)` 和 `user_pcid(asid)` 都发失效操作。这是“页表切换”和“TLB shootdown”两个不同问题：前者选择当前视图，后者只在缓存内容已经过期时保证一致性。

最后，这也解释了 NX guard 如何发现漏切换：`SYSRET`/`IRET` 只负责返回低特权级，不会替 Linux 改 CR3。如果退出路径遗漏 `SWITCH_TO_USER_CR3`，CPU 会以 CPL3 继续使用 **kernel PGD + kPCID**；第一条用户指令在 kernel view 的顶层 NX 约束下 fault。这里触发错误的是错误 root 中的 NX，不是一次 TLB flush。

### 4.5 PCID、global 与成本

PTI 为同一个 `mm` 使用 kernel/user 两个 PCID 语义上下文，避免每次 CR3 切换都全量冲刷 TLB；对应地，失效路径必须覆盖两边。没有 PCID 时，CR3 写造成的 TLB 代价更明显。

只在 user page table 和 kernel page table 中都存在的少量入口映射才能安全利用 global translation。完整 kernel image 通常需要去掉 global；主线还会依据 PCID、强制 `pti=on`、RANDSTRUCT 等条件决定是否把一部分非敏感 kernel text 克隆进 user table 来换取性能。因而“user PT 绝对只映射一页 trampoline”是过度简化。

主要成本包括：每进程额外顶层页表、入口共享区域、每次用户/内核边界的 CR3 操作、更多 TLB miss，以及 fork 和顶层页表更新时的同步工作。

## 5. Arm：arm64 支持，ARM32 不支持

### 5.1 配置、参数与启用策略

arm64 的构建选项是：

```text
CONFIG_UNMAP_KERNEL_AT_EL0=y
```

它默认 `y`，在 `EXPERT` 下可见。启动参数为：

- `kpti=1`：强制开启；
- `kpti=0`：强制关闭；
- `mitigations=off`：通常关闭可选 mitigation，但 KASLR 可能仍要求 KPTI；官方参数表特意写成 `if nokaslr then kpti=0 [ARM64]`；
- 没有 x86 的 `pti=auto`/`nopti` 作为 arm64 KPTI 接口。

默认策略不是所有 CPU 一律开启。内核综合 CPU MIDR safe list、`ID_AA64PFR0_EL1.CSV3`、erratum、KASLR 要求和 cmdline，形成 `ARM64_UNMAP_KERNEL_AT_EL0` capability。部分已声明不需要该 mitigation 的 CPU 默认关闭；用户仍可用 `kpti=1` 强制，但特定已知 erratum 可强制禁用。

这里也只讨论 AArch64/arm64。上游 ARM32 没有 `CONFIG_UNMAP_KERNEL_AT_EL0` 和对应 KPTI 入口实现。

### 5.2 为什么 arm64 不照搬 x86 的双 PGD

arm64 的普通地址空间结构本来就与 x86 不同：

- `TTBR0_EL1` 指向当前进程用户页表；
- `TTBR1_EL1` 指向内核高地址页表 `swapper_pg_dir`；
- 地址高位决定使用 TTBR0 还是 TTBR1。

所以 arm64 KPTI 不需要为用户映射建立一个 x86 式“完整第二份 PGD”。它主要隔离的是 TTBR1：

```text
EL0 运行：TTBR0 = 当前用户页表
          TTBR1 = tramp_pg_dir（只映射异常 trampoline）

异常进入：先在 trampoline vector 中执行
          TTBR1: tramp_pg_dir -> swapper_pg_dir
          VBAR_EL1: trampoline vectors -> 完整 kernel vectors

返回 EL0：切回 trampoline vector
          TTBR1: swapper_pg_dir -> tramp_pg_dir
          ERET
```

`tramp_map_kernel`/`tramp_unmap_kernel` 通过调整 `TTBR1_EL1` 完成切换，并用 `USER_ASID_FLAG` 区分用户侧上下文。2025 年的 arm64 TLB 改造邮件仍明确指出：启用 KPTI 时 user/kernel 使用不同 ASID，按 ASID 的 VA invalidation 必须覆盖两者。这说明该机制仍是当前维护中的真实路径，而不是只剩历史代码。

arm64 还会把 kernel mapping 从 Global 改为 non-Global，使它们受 ASID 区分；仅 trampoline 这种始终映射的区域可以保留 global。KASLR 已创建 non-global mapping 时可省掉这次 stop-machine 重写。

### 5.3 与 x86 NX 防错机制的区别

arm64 的用户页表只在 TTBR0，完整内核页表只在 TTBR1；KPTI 切换的是 TTBR1 根。因此它不存在 x86 那种“把共享 userspace PGD 的 kernel-side 顶层副本设 NX”的同构步骤。

Arm 的相邻机制包括 PAN（阻止 EL1 非显式地访问 EL0 映射）、不同 ASID、TTBR1 trampoline 和 non-global kernel mappings。PAN 约束内核访问用户页，KPTI 约束用户执行期间可见的内核页；两者不能互相替代。

这也意味着 arm64 没有 x86 那种“漏切页表后第一条用户指令立即 fault”的同构 fail-stop 保护。若某条错误的返回路径绕过 trampoline，在执行 `ERET` 前没有把 `TTBR1_EL1` 从完整的 `swapper_pg_dir` 切回受限的 `tramp_pg_dir`，返回后的状态会是：

```text
EL0 用户代码运行
  TTBR0_EL1 = 正常用户页表
  TTBR1_EL1 = 完整 kernel page table（错误地遗留）
```

用户代码仍通过 TTBR0 正常取指，因此这个错误通常不会像 x86 漏切 CR3 那样立即暴露。内核映射的 AP 权限仍会阻止普通、架构层面的 EL0 访问，但完整 kernel mapping 已重新存在于用户执行期间的翻译上下文中；对 KPTI 所防范的瞬态权限旁路和 KASLR 侧信道而言，隔离已经被破坏。

PAN、PXN/UXN 和 AP 权限不能替代这个防错能力：PAN 主要限制 EL1 访问 EL0 页面；PXN/UXN 与 AP 约束映射自身的执行或访问权限，但 TTBR0 中合法的用户代码必须保持 EL0 可执行。它们不会因为 TTBR1 当前错误地指向 `swapper_pg_dir` 就禁止 TTBR0 用户代码执行。因此 arm64 KPTI 的正确性依赖所有返回 EL0 的路径都经过受控 trampoline，并正确恢复受限 TTBR1。

## 6. RISC-V：主线现状与实现 KPTI 的关键问题

### 6.1 当前主线明确不支持

截至核对日期，上游主线具有以下可交叉验证的事实：

- `arch/riscv/Kconfig` 没有 `PAGE_TABLE_ISOLATION`、`KPTI` 或 `UNMAP_KERNEL_AT_EL0`；
- 官方 kernel parameter 表的 `kpti=` 只标记 `[ARM64,EARLY]`，`pti=`/`nopti` 只标记 x86；
- RISC-V `pgd_alloc()` 调用 `sync_kernel_mappings()`，把 `init_mm.pgd` 中 `USER_PTRS_PER_PGD` 之后的所有顶层内核映射复制到每个进程 PGD；
- `switch_mm()` 只在进程地址空间切换时把 `mm->pgd`、ASID 和 mode 写入 `satp`；
- `handle_exception` 和 `ret_from_exception` 在 U/S 边界保存恢复寄存器、切内核栈并执行 `sret`，但不切换 `satp`。

因此当前模型是：

```text
每进程一个 mm->pgd
  低地址：该进程用户映射
  高地址：从 init_mm 同步的完整内核映射

U -> S trap：仍使用同一个 satp
S -> U sret：仍使用同一个 satp
```

RISC-V 源码中名为 `trampoline_pg_dir` 的对象用于早期启用 MMU/重定位等启动过程，不代表已经实现 KPTI，不能因为名字含 trampoline 就得出相反结论。

### 6.2 `SUM` 不是 KPTI

当前入口会清除 `sstatus.SUM`，仅在显式用户拷贝路径临时允许 S-mode 访问 U=1 数据页。RISC-V 规范还规定，SUM 不允许 S-mode 从 U=1 页面取指。

这些规则能减少内核误访问或执行用户页的风险，但用户态执行时，完整内核映射仍存在于 `satp` 指向的页表中。因此 `SUM=0`、U/S PTE 权限和 KPTI 分别解决不同方向的问题：

- `SUM/PTE.U`：限制 S-mode 如何访问用户页；
- KPTI：让 U-mode 运行时的页表不包含敏感 S-mode 映射；
- `STRICT_KERNEL_RWX`：限制内核映射自身的 W/X 属性。

### 6.3 RISC-V 已具备哪些硬件积木

从 ISA 能力看，RISC-V 完全可以由软件设计 KPTI：

- `satp.PPN` 选择根页表；
- `satp.ASID` 给翻译上下文打标签；
- `satp.MODE` 选择 Sv32/Sv39/Sv48/Sv57；
- `SFENCE.VMA` 按地址/ASID同步页表更新与地址翻译；
- `stvec` 提供 trap 入口，`sscratch` 可在最早期交换一个寄存器；
- PTE U 位区分用户/特权页面，G 位表示跨 ASID global mapping。

“ISA 可以实现”不等于“所有微架构都需要 KPTI”，也不等于“Linux 已实现”。RISC-V 架构允许实现进行推测性的 page-table walk；任何具体核是否存在可利用的权限检查旁路，要看微架构与安全公告。没有主线 KPTI 不能被解读为规范替所有实现作出绝对的无漏洞保证。

### 6.4 若给 Linux/RISC-V 实现 KPTI，需要改什么

一种接近 x86 的设计是每个 `mm` 维护成对 root：

- `user_root`：用户映射 + 最小 trap trampoline + 切换需要的 per-hart scratch；
- `kernel_root`：完整内核映射 + 当前进程用户映射；
- U-mode 使用 user ASID/root，S-mode 使用 kernel ASID/root；
- 用户页表更新必须同步两个 root，或让两边安全共享用户 lower-level tables；
- trap 最前端和 `sret` 最后端负责 `satp` 切换，并按规范处理 `SFENCE.VMA`。

主线改造至少会触及：

1. `pgd_alloc()`、fork、exec、mm teardown：分配和释放成对 root；
2. `set_pgd()`/用户映射更新：维护 user/kernel view 的一致性；
3. ASID allocator：一个 `mm` 至少要有 user/kernel 两个可区分上下文，而当前只维护一个 `mm->context.id`；
4. TLB shootdown：修改用户映射时要失效两个 ASID；修改仅 kernel view 可见映射时不能污染 user view；
5. `handle_exception`：在访问普通内核栈、`task_struct`、per-CPU 区和 C 函数前切到 kernel root；
6. `ret_from_exception`：所有内核数据访问结束后切到 user root，再 `sret`；
7. trap/中断边角路径：嵌套异常、NMI 类本地中断模型、栈溢出、kprobe、ftrace、SBI/KVM 交互和 suspend/resume；
8. 页表 dump、自测和故障注入：验证 user root 不含 direct map、vmalloc、module、BPF JIT、内核栈等映射。

入口时序尤其困难。当前代码从 `sscratch` 取回 `tp` 后会访问 `thread_info`/`task_struct` 中的内核地址，并加载内核栈。如果 user root 不映射这些对象，就必须先在一段双重映射且位置稳定的汇编 trampoline 中，仅依赖寄存器或最小 per-hart scratch 得到 kernel `satp`，完成切换后才能沿用现有入口逻辑。

### 6.5 为什么 x86 的“顶层 PGD NX”不能直接移植

RISC-V 页表项与 x86 有一个决定性差异：

- x86 高层页表项可以携带 NX，并把“不可执行”约束传递给整个下层子树；
- RISC-V 中 V=1 且 R/W/X 全为 0 才表示指向下一级页表的 **非叶 PTE**；只要 R 或 X 为 1，它就被解释为 leaf mapping（W=1、R=0 还是保留非法组合）；
- 因而不能在一个正常的 RISC-V 非叶 PGD/PUD/PMD 上加 X/NX 位来表达“下层都不可执行”。RISC-V 也没有 x86 式可在顶层继承的 NX 位。

这会影响“漏切页表后立即杀死用户执行”的设计：

- 若 kernel root 与 user root 共享可执行用户页的下层 PTE，错误地带着 kernel `satp` 执行 `sret` 后，U-mode 仍可能正常取指，同时完整内核映射也仍在当前 root 中；
- 若想得到 x86 同等的 fail-stop 属性，可以不给 kernel root 映射可执行用户页、维护一套 leaf 级去 X 的副本，或在返回路径增加其他可验证约束；
- 但去掉 kernel root 的用户执行映射会影响 page fault、ptrace、`access_process_vm()` 等路径对用户地址空间的处理，维护 leaf 副本又增加内存、A/D 位一致性和 TLB 成本。

RISC-V 规范保证 S-mode 不能从 U=1 页取指，这保护的是 **内核执行期间**；一旦 `sret` 已把特权级降到 U-mode，这条保证不能检测“仍装着 kernel root”的错误。它不能替代 x86 的顶层 NX 防错技巧。

### 6.6 ASID 与 `SFENCE.VMA` 是性能和正确性的中心

RISC-V 规范明确：写 `satp` 本身不提供页表内存更新的排序，也不自动失效 address-translation cache。ASID 改变立即生效，但在复用 ASID、改变非叶 PTE、修改 leaf PTE 等情况下仍必须按规则执行 `SFENCE.VMA`。

这对 KPTI 有几个直接后果：

- 有足够 ASID 时，应为同一 `mm` 的 user/kernel view 使用不同 ASID，避免每次 U/S 边界都全 TLB flush；
- 两边共享的用户映射发生变化时，shootdown 必须覆盖两个 ASID；
- kernel global mapping 若错误地以 G=1 出现在 user root，按 ASID flush 也清不掉，既是隔离错误也是难查的 TLB bug；
- 没有硬件 ASID 或 ASID 数量不足时，当前主线会在切换 `satp` 后执行本地全量 flush。KPTI 若在每次 syscall/interrupt 上这么做，成本会非常高；
- 远端 hart 的 TLB 同步还需结合 SBI RFENCE 或 IPI 路径，不能只处理当前 hart。

### 6.7 与 xv6-riscv 的关系

xv6-riscv 常被用来讲解 KPTI 风格的 trampoline：用户页表映射 trampoline 和 trapframe，进入后切到内核页表，退出时切回用户页表。它很好地展示了最小机制，但不能证明 Linux/RISC-V 已支持，也不能直接照搬：Linux 有 SMP ASID rollover、通用 MM、动态 vmalloc/module/BPF、复杂中断入口、KASLR、KVM、页表层级动态选择和远程 TLB shootdown，状态空间大得多。

## 7. LoongArch：当前不支持，简单结论

截至核对日期，上游 `arch/loongarch/Kconfig` 没有 KPTI/page-table-isolation 选项，官方参数表也没有为 LoongArch 声明 `kpti=`、`pti=` 或 `nopti`。因此主线 LoongArch Linux 不能配置或通过 cmdline 启用 KPTI。

LoongArch 已有 MMU、TLB 和用户/内核权限机制并不等价于 KPTI。若未来出现补丁，应以是否增加受限 user view、入口/退出页表切换、TLB tag 管理以及公开 Kconfig/cmdline 为判断依据，而不是仅看架构是否有 PGD 或 privilege level。

## 8. 架构共同点与差异汇总

| 维度 | x86 | arm64 | RISC-V 主线 | LoongArch 主线 |
| --- | --- | --- | --- | --- |
| 当前支持 | 是 | 是 | 否 | 否 |
| 用户/内核普通页表基础 | 一个 CR3 root 同时覆盖低/高地址 | TTBR0 用户、TTBR1 内核天然分离 | 一个 `satp` root 同时含用户/内核映射 | 当前无 KPTI 路径 |
| KPTI 切换对象 | CR3 指向的成对 PGD | TTBR1 的 `tramp_pg_dir`/`swapper_pg_dir` | 若实现需切 `satp.PPN` | 未实现 |
| TLB tag | 每 `mm` 的 kernel/user PCID | user/kernel ASID | 当前每 `mm` 一个 ASID；KPTI 需成对设计 | 未实现 |
| 最小双映射入口 | entry text、`cpu_entry_area` 等 | exception vector trampoline | 需要新增长期 user-visible trap trampoline | 未实现 |
| 用户 lower page tables | kernel/user PGD 之间共享 | 用户映射独立位于 TTBR0 | 当前只有一套；未来是否共享是关键设计选择 | 未实现 |
| kernel view 中 user PGD 的 NX guard | 有，顶层 NX 可继承 | 无同构需求 | 不能直接实现：非叶 PTE 无继承式 NX | 不适用 |
| 漏掉返回前页表切换 | kernel CR3 下用户子树为 NX，第一条用户指令应 fault | 用户代码仍从 TTBR0 正常执行，完整 TTBR1 静默遗留，KPTI 隔离被破坏 | 未实现 KPTI | 未实现 KPTI |
| global mapping 处理 | 大部分 kernel global 需移除；少量共享区域可 global | kernel mappings 转 nG；trampoline 可 global | 若实现必须严格审计 PTE.G | 未实现 |
| 无 tag 时成本 | CR3 通常冲刷 TLB | 依具体实现与 ASID | 每次 `satp` 切换可能需要 `SFENCE.VMA`，代价突出 | 未实现 |

## 9. 实机检查建议

### x86

```sh
grep -E 'CONFIG_(CPU_MITIGATIONS|MITIGATION_PAGE_TABLE_ISOLATION)=' /boot/config-"$(uname -r)"
cat /proc/cmdline
cat /sys/devices/system/cpu/vulnerabilities/meltdown
dmesg | grep -iE 'page tables isolation|pti'
```

### arm64

```sh
grep 'CONFIG_UNMAP_KERNEL_AT_EL0=' /boot/config-"$(uname -r)"
cat /proc/cmdline
dmesg | grep -iE 'kpti|page table isolation|kernel.*unmapped'
```

### RISC-V / LoongArch

```sh
grep -Ei 'KPTI|PAGE_TABLE_ISOLATION|UNMAP_KERNEL_AT_EL0' /boot/config-"$(uname -r)"
cat /proc/cmdline
```

主线下预期找不到对应 config。某个厂商树若出现同名选项，仍需继续检查实际入口汇编和页表构造代码，确认它不是占位项或不同含义的功能。

## 10. 资料来源与阅读顺序

以下上游源码链接固定到审核基线 `f2ec6312bf71`，避免 `master` 漂移导致行文与代码不再对应。

1. Linux 官方 x86 PTI 文档：[Page Table Isolation](https://docs.kernel.org/arch/x86/pti.html)
2. 当前 x86 配置定义：[arch/x86/Kconfig](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/x86/Kconfig)
3. 当前启动参数总表：[kernel-parameters.txt](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/Documentation/admin-guide/kernel-parameters.txt)
4. x86 PTI 建表、NX guard 与最小映射：[arch/x86/mm/pti.c](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/x86/mm/pti.c)
5. x86 PGD/PMD 分配与双页表维护：[arch/x86/mm/pgtable.c](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/x86/mm/pgtable.c)
6. x86 syscall/异常 CR3 切换：[arch/x86/entry/entry_64.S](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/x86/entry/entry_64.S)
7. arm64 配置定义：[arch/arm64/Kconfig](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/arm64/Kconfig)
8. arm64 CPU 判断与 `kpti=` 解析：[arch/arm64/kernel/cpufeature.c](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/arm64/kernel/cpufeature.c)
9. arm64 trampoline 与 TTBR1 切换：[arch/arm64/kernel/entry.S](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/arm64/kernel/entry.S)
10. arm64 nG 重写和 trampoline page table：[arch/arm64/mm/mmu.c](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/arm64/mm/mmu.c)
11. 2025 arm64 TLB/KPTI 维护邮件：[Implicitly invalidate user ASID based on TLBI operation](https://lists.infradead.org/pipermail/linux-arm-kernel/2025-July/1044849.html)
12. 2025 arm64 KPTI helper 整理邮件：[Move KPTI helpers to mmu.c](https://lists.infradead.org/pipermail/linux-arm-kernel/2025-September/1061576.html)
13. RISC-V 当前配置：[arch/riscv/Kconfig](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/riscv/Kconfig)
14. RISC-V 当前进程 PGD 复制 kernel mapping：[arch/riscv/include/asm/pgalloc.h](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/riscv/include/asm/pgalloc.h)
15. RISC-V 当前 `satp`/ASID 切换：[arch/riscv/mm/context.c](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/riscv/mm/context.c)
16. RISC-V 当前 trap 入口/返回：[arch/riscv/kernel/entry.S](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/riscv/kernel/entry.S)
17. RISC-V 特权规范（ratified library）：[Supervisor-Level ISA](https://docs.riscv.org/reference/isa/priv/supervisor.html)
18. RISC-V SBI 远程 TLB fence：[RFENCE Extension](https://docs.riscv.org/reference/sbi/ext/rfence.html)
19. LoongArch 当前配置：[arch/loongarch/Kconfig](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/loongarch/Kconfig)
20. Meltdown 论文：[Meltdown: Reading Kernel Memory from User Space](https://meltdownattack.com/meltdown.pdf)
21. KAISER 论文：[KASLR is Dead: Long Live KASLR](https://gruss.cc/files/kaiser.pdf)
22. x86-64 CR3/PCID 切换宏：[arch/x86/entry/calling.h](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/x86/entry/calling.h)
23. x86 kPCID/uPCID 与延迟失效：[arch/x86/mm/tlb.c](https://github.com/torvalds/linux/blob/f2ec6312bf711369561bdcb22f8a63c0b118c479/arch/x86/mm/tlb.c)

推荐先读 1、4、6、22、23 理解 x86 完整机制，再读 7 至 12 看 arm64 为什么只切 TTBR1，最后对照 14 至 18 分析 RISC-V 移植的入口、ASID 和非叶 PTE 限制。
