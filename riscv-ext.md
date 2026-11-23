---
layout: default
title: RISC-V 陷阱与访问控制
description: 用 cause、epc 和 tval 区分 RISC-V 的页故障、物理访问故障与客户页故障，并对照 RVA23S64 和相关扩展。
article: true
toc: true
page_class: riscv-trap-guide
sections:
  - { id: read-trap, title: "读取陷阱现场" }
  - { id: memory, title: "三类访存故障" }
  - { id: cases, title: "四个排查场景" }
  - { id: profile, title: "RVA23S64 的保证" }
  - { id: beyond, title: "扩展与设备侧故障" }
  - { id: sources, title: "规范来源" }
---

<header class="guide-hero">
  <h1>RISC-V 陷阱与访问控制</h1>
  <p>一次加载失败可能发生在页表权限检查、页表项读取、客户物理地址翻译或最终物理访问。异常编码指出故障类别，再用陷阱现场和当时的配置缩小范围。</p>
  <a class="button-primary" href="{{ '/riscv-trap-access-control-tree.html' | relative_url }}">打开交互索引</a>
</header>

<h2 id="read-trap">读取陷阱现场</h2>

先按陷阱**实际进入**的模式选择寄存器，再读取 cause 的最高位。最高位为 0 时，低位是同步异常编码；为 1 时，低位是中断编码。例如同步异常 5 是加载访问故障，中断 5 是监督级定时器中断。 [Machine ISA](https://docs.riscv.org/reference/isa/v20260120/priv/machine.html) · [H 扩展](https://docs.riscv.org/reference/isa/v20260120/priv/hypervisor.html)

| 陷阱落点 | 原因 | 指令位置 | 补充信息 |
| --- | --- | --- | --- |
| M | `mcause` | `mepc` | `mtval`。实现 H 时还有 `mtval2`、`mtinst` |
| S / HS | `scause` | `sepc` | `stval`。HS 还有 `htval`、`htinst` |
| VS | `vscause` | `vsepc` | `vstval` |

`epc` 给出发生异常或被中断的指令位置。按异常和实现，`tval` 可包含故障地址、指令位、软件检查子码或 0。RVA23S64 的 `Sstvala` 对若干异常的 `stval` 另有写入要求，Sha 中的 `Shvstvala` 将对应要求应用于 `vstval`。 [Supervisor ISA](https://docs.riscv.org/reference/isa/v20260120/priv/supervisor.html) · [RVA23 Profiles v1.0](https://docs.riscv.org/reference/rva23/v1.0/rva23-profiles.html)

<h2 id="memory">三类访存故障</h2>

| 陷阱族 | 取指 | 加载 | 存储 / AMO | 从哪里查起 |
| --- | ---: | ---: | ---: | --- |
| [访问故障]({{ '/riscv-trap-access-control-tree.html#af' | relative_url }}) | 1 | 5 | 7 | PMP、PMA，以及读取 PTE 或硬件写回 A/D 位时的物理访问 |
| [页故障]({{ '/riscv-trap-access-control-tree.html#pf' | relative_url }}) | 12 | 13 | 15 | 虚拟地址格式、PTE 有效位和权限、超级页对齐、A/D 策略 |
| [客户页故障]({{ '/riscv-trap-access-control-tree.html#gpf' | relative_url }}) | 20 | 21 | 23 | H 的 G-stage，包括 VS-stage 为读取客户页表而发出的隐式访问 |

同一条指令可能满足多个异常条件。规范规定异常优先级，数据访问未对齐相对于页故障和访问故障的优先级还允许实现选择。分解后的多段存储也可能在后续一段报错前已有部分写入生效。 [Machine ISA](https://docs.riscv.org/reference/isa/v20260120/priv/machine.html) · [Supervisor ISA](https://docs.riscv.org/reference/isa/v20260120/priv/supervisor.html)

<h2 id="cases">四个排查场景</h2>

### 取指时页表遍历停止

如果物理内存中的 PTE 可读但 `V=0`，报告指令页故障 **12**。如果读取 PTE 本身违反 PMP 或 PMA，报告指令访问故障 **1**。读取 PTE 是隐式操作，编码仍按原始取指选择。 [虚拟地址翻译流程](https://docs.riscv.org/reference/isa/v20260120/priv/supervisor.html)

### 客户加载触发 21

客户加载的 VS-stage 页表访问也要经过 G-stage。若这一隐式访问被 G-stage 拦截，HS 中的 `stval` 可记录引发故障的 GVA，`htval` 中可用的 GPA 对应的是客户 PTE 所在位置，按右移两位的形式记录。读取 `htinst` 时，非零的伪指令值可帮助识别隐式访问。基础 H 允许 `htval` 为零；RVA23S64 的 `Shtvala` 增加了在 ISA 允许记录时写入该地址的要求。 [H 扩展](https://docs.riscv.org/reference/isa/v20260120/priv/hypervisor.html) · [RVA23 Profiles v1.0](https://docs.riscv.org/reference/rva23/v1.0/rva23-profiles.html)

### VS 执行地址翻译管理指令

在 VS 下执行 `SFENCE.VMA` 或访问 `satp`，且 `hstatus.VTVM=1` 时，可见虚拟指令异常 **22**。HS 下相应操作被 `mstatus.TVM` 截获时，报告非法指令 **2**。排查时记录实际执行模式和相应 CSR。 [Machine ISA](https://docs.riscv.org/reference/isa/v20260120/priv/machine.html) · [H 扩展](https://docs.riscv.org/reference/isa/v20260120/priv/hypervisor.html)

### 影子栈相关陷阱

启用 Zicfiss 时，返回地址校验不匹配报告软件检查 **18**，`tval=3`。普通存储指令写影子栈页，或特定影子栈指令使用未对齐的 `ssp`，则报告存储/AMO 访问故障 **7**。Zicfilp 的 landing-pad 检查失败对应 **18**、`tval=2`。 [特权 ISA · Control-flow Integrity](https://docs.riscv.org/reference/isa/v20260120/priv/priv-cfi.html) · [Machine ISA](https://docs.riscv.org/reference/isa/v20260120/priv/machine.html)

<h2 id="profile">RVA23S64 的保证</h2>

RVA23S64 v1.0 描述面向 S 模式的执行环境能力，基于特权架构 1.13。判断一个平台能否出现某种异常时，还需看启用状态、访问类型和平台实现。 [RVA23 Profiles v1.0](https://docs.riscv.org/reference/rva23/v1.0/rva23-profiles.html)

| 范围 | 与访问控制有关的能力 |
| --- | --- |
| **RVA23S64 强制** | Sv39、Bare、Svade、Svnapot、Svpbmt、Svinval、Ssnpm，以及包含 H 的 Sha |
| **RVA23S64 可选** | Sv48、Sv57、Svadu、Svvptc、Sdtrig、Sspm |
| **RVA23U64 可选** | Zicfilp、Zicfiss 和 Zama16b 见 RVA23U64 的可选项。使用这些功能前应确认所在执行环境提供支持 |
| **另查规范或平台** | M 级 PMP、Smepmp、额外的分页扩展、系统互连和设备侧保护 |

在 **Svade** 行为下，访问时遇到 `A=0` 或写入时遇到 `D=0`，软件处理相应页故障。实现并启用 **Svadu** 时，硬件可更新 A/D 位；更新 PTE 遇到物理保护错误时仍可报访问故障。实现 **Svvptc** 时，可见的 PTE 写入使 `V` 从 0 变为 1，后续隐式读取会在有限时间内看到变化。撤销映射和修改有效页的权限仍按适用的翻译同步规则处理。 [Supervisor ISA](https://docs.riscv.org/reference/isa/v20260120/priv/supervisor.html)

<h2 id="beyond">扩展与设备侧故障</h2>

- **Sspmp v1.0** 已批准，适用的 Bare 场景可以复用页故障编码。与 Shbare 配合时，客户访问被 SPMP 拒绝可复用客户页故障编码。面向虚拟机的 SPMP for Hypervisor 有独立的公开草案。 [SPMP v1.0](https://github.com/riscv/riscv-spmp/blob/v1.0/sspmp/spmp_spec.adoc) · [SPMP for Hypervisor v0.6](https://github.com/riscv/riscv-spmp/releases/tag/spmp-for-hyp-v0.6)
- **CHERI** 的公开草案提出同步异常 32–36。特权 ISA 20260120 仍把 32–47 列为保留，24–31 与 48–63 则分配给定制使用。 [CHERI v0.9.10.1-ar20261013 草案](https://riscv.github.io/riscv-cheri/0.9.10.1-ar20261013/riscv-cheri-full-0.9.10.1-ar20261013.html) · [Machine ISA](https://docs.riscv.org/reference/isa/v20260120/priv/machine.html)
- **IOMMU** 把设备事务的故障写入故障队列，记录包含设备标识、自有 `CAUSE` 和相关地址。排查 DMA 时应先确定记录来自 IOMMU，还是由平台转成了 hart 可见的中断或异常。 [RISC-V IOMMU · Fault/event queue](https://docs.riscv.org/reference/iommu/v20260222/iommu_in_memory_queues.html)

<h2 id="sources">规范来源</h2>

- [RISC-V 特权 ISA 20260120 · 版本与组件](https://docs.riscv.org/reference/isa/v20260120/priv/priv-preface.html)
- [RISC-V RVA23 Profiles v1.0](https://docs.riscv.org/reference/rva23/v1.0/rva23-profiles.html)
- [RISC-V Debug Specification 1.0](https://docs.riscv.org/reference/debug/v1.0/)
- [RISC-V Specification Dashboard · 公开工作项进度](https://riscv.github.io/adm-spec-dashboard/)
- [RISC-V Sv39 页表构建文档]({{ '/riscv-sv39-pagetable-bringup-doc.html' | relative_url }})与 [satp / sfence.vma 语义]({{ '/riscv-satp-sfence-semantics.html' | relative_url }})
