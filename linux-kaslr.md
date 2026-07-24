---
layout: default
title: Linux KASLR：内核地址空间布局随机化
article: true
page_class: kaslr-article
---

# Linux KASLR：内核地址空间布局随机化

> 资料核对日期：2026-07-24。本文先建立通用模型，再以 x86-64 Linux 为主要实验对象；具体随机化范围、对齐和熵位数由架构、内核版本、内存布局与启动环境共同决定。

<div class="address-rule">
  <strong>一句话理解 KASLR</strong>
  <span>内核仍是同一份镜像，符号之间的相对距离通常不变；每次启动选择一个新的整体偏移（slide），让攻击者不能预先写死内核地址。</span>
</div>

## 1. KASLR 到底随机化了什么

KASLR（Kernel Address Space Layout Randomization）是内核地址空间布局随机化。它在**启动早期**为内核镜像选择随机的装载位置和/或虚拟映射基址。Linux 官方自保护文档将 `CONFIG_RANDOMIZE_BASE` 概括为在启动时重定位内核的物理与虚拟基址，以提高依赖已知内核地址的攻击难度。[Linux Kernel Self-Protection](https://docs.kernel.org/security/self-protection.html#kernel-address-space-layout-randomization-kaslr)

先用最小模型理解。假设链接时地址和某次启动选中的 slide 是：

```text
链接时 _text：     0xffffffff81000000
本次启动 slide： + 0x000000001a400000
                  ──────────────────
运行时 _text：     0xffffffff9b400000
```

如果 `commit_creds` 在镜像中距离 `_text` 为 `0x0c8d40`，那么同一次启动中：

```text
runtime(symbol) = link(symbol) + slide

_text          = 0xffffffff9b400000
commit_creds   = 0xffffffff9b4c8d40
两者距离       = 0x0000000000c8d40   ← 通常没有改变
```

下次冷启动可能选中另一偏移：

```text
                启动 A                         启动 B
高地址
  ▲        ┌──────────────┐             ┌──────────────┐
  │        │ kernel image │             │ kernel image │
  │        │ text/data/bss│             │ text/data/bss│
  │        └──────────────┘             └──────────────┘
  │              ▲                              ▲
  │       slide = 0x1a400000             slide = 0x0c200000
  │
  └── 固定的候选窗口 ──────────────────────────────────────>
```

这揭示了 KASLR 的边界：经典 KASLR 主要随机化**基址**，不是把每个函数单独洗牌。只要泄露一个已知符号的运行时地址，攻击者常可用固定的符号间偏移推导其他地址。

## 2. 启动时发生了什么

具体代码随架构而异，但抽象流程相似：

```text
固件 / bootloader
    │  镜像、内存图、随机种子（如 EFI RNG 或 DT /chosen/kaslr-seed）
    ▼
早期解压/启动代码（此时可用服务很少）
    │
    ├─ 收集可用熵
    ├─ 计算允许的候选范围
    ├─ 排除 initrd、固件保留区、不可用 RAM 等冲突
    ├─ 按架构要求对齐，选择随机槽位
    ├─ 解压/复制镜像或建立随机虚拟映射
    └─ 应用重定位（relocations）
    ▼
建立正式页表，跳到随机化后的内核入口
    ▼
正常启动
```

这里有四个关键点：

1. **内核必须可重定位。** 编译、链接和早期启动代码要允许实际地址与默认地址不同；KASLR 不是简单修改一个页表常量。
2. **随机值会被约束。** 候选窗口有限，镜像大小、对齐粒度、物理内存空洞和保留区都会减少可选位置。
3. **熵不等于候选窗口大小。** 若有 `N` 个等概率合法槽位，理论上限才是 `log2(N)` bit；偏差、冲突重选或弱启动种子还会降低有效熵。
4. **重定位修正绝对引用。** 相对寻址天然随镜像移动；需要修正的绝对地址由架构启动代码根据 relocation 信息处理。

设备树启动的系统常由 bootloader 在 `/chosen/kaslr-seed` 提供种子；Linux 的 EFI stub 也可从固件 RNG 获取随机性。种子是安全敏感数据，内核消费后不应继续把它暴露在运行时设备树中。不同架构还可能混入计时器、CPU 随机指令等来源，不能假定所有平台具有相同质量。

## 3. “物理随机化”和“虚拟随机化”

高半区内核至少涉及两类地址：

```text
ELF / 启动镜像
     │
     │ 解压或复制
     ▼
随机物理位置 PA ──────────────┐
                              │ 页表映射
固定/随机 direct map ─────────┤
                              ▼
                       随机内核 VMA
                       CPU 在此取指
```

- **物理位置随机化**：镜像实际落在 RAM 的哪个位置变化；
- **虚拟基址随机化**：内核代码从哪个高虚拟地址执行变化；
- 两者是不同的随机化维度，不能看到虚拟地址变了就推断物理地址也以同样偏移变化。

在 x86-64 上还要区分 `CONFIG_RANDOMIZE_BASE` 和 `CONFIG_RANDOMIZE_MEMORY`：

| 配置 | 主要对象 | 直观效果 |
|---|---|---|
| `CONFIG_RANDOMIZE_BASE` | 内核镜像及模块基址 | `_text` 等内核符号随启动改变 |
| `CONFIG_RANDOMIZE_MEMORY` | direct map、`vmalloc/ioremap`、`vmemmap` 等区域 | 内核虚拟地址空间内部区域的基址也产生偏移 |

官方 x86-64 内存布局文档说明，启用 `CONFIG_RANDOMIZE_MEMORY` 后，direct mapping、`vmalloc/ioremap` 和 virtual memory map 会在早期启动时偏移，但区域顺序保持不变。[x86-64 Memory Management](https://docs.kernel.org/arch/x86/x86_64/mm.html)

所以“KASLR 打开了”不代表内核地址空间里的每个对象都独立随机。`kmalloc` 对象、每次系统调用的内核栈偏移、slab freelist 和结构体字段布局分别有其他机制或配置。

## 4. 一个可复现的观察实验

下面以启用了 `CONFIG_KALLSYMS` 的 Linux 为例。读取原始内核地址通常需要 root；`kptr_restrict`、lockdown、容器权限或发行版策略可能让 `/proc/kallsyms` 显示全零，这是保护生效，不是 KASLR 失效。

### 4.1 检查构建配置与启动参数

```bash
grep -E 'CONFIG_(RANDOMIZE_BASE|RANDOMIZE_MEMORY|RELOCATABLE)=' \
  /boot/config-$(uname -r)

cat /proc/cmdline
```

典型 x86-64 输出可能是：

```text
CONFIG_RELOCATABLE=y
CONFIG_RANDOMIZE_BASE=y
CONFIG_RANDOMIZE_MEMORY=y
```

`CONFIG_RANDOMIZE_BASE=y` 表示内核具备该能力；若 `/proc/cmdline` 中出现 `nokaslr`，本次启动会禁用内核和模块基址随机化。`nokaslr` 的官方语义见 [内核命令行参数](https://docs.kernel.org/admin-guide/kernel-parameters.html#cmdoption-arg-nokaslr)。

### 4.2 同一次启动：证明“整体 slide”

先从未随机化的 `vmlinux` 读取链接时符号。必须使用与正在运行内核**完全匹配且未 strip** 的文件：

```bash
nm -n /usr/lib/debug/boot/vmlinux-$(uname -r) |
  awk '$3 == "_text" || $3 == "start_kernel" { print }'
```

再读取本次启动的运行时地址：

```bash
sudo awk '$3 == "_text" || $3 == "start_kernel" { print }' \
  /proc/kallsyms
```

假设得到以下**示意值**：

```text
                        _text                 start_kernel
链接时地址              ffffffff81000000      ffffffff82a00120
运行时地址              ffffffff99400000      ffffffff9ae00120
两者各自相减            0000000018400000      0000000018400000
```

两个符号算出的 slide 相同，正是经典 base randomization 的特征。不要直接复制这些地址；它们只用于展示计算方法。

### 4.3 跨重启：证明基址变化

每次启动后记录：

```bash
sudo awk '$3 == "_text" { print $1, $3 }' /proc/kallsyms
```

预期观察：

```text
boot A: ffffffff99400000 _text
boot B: ffffffff8f200000 _text
boot C: ffffffffa5c00000 _text
```

有些架构会在启动日志打印 KASLR offset；日志可能受 `dmesg_restrict`、日志级别和发行版补丁影响：

```bash
sudo dmesg | grep -Ei 'kaslr|kernel offset'
```

这类实验应在自己的测试机或虚拟机进行。不要为了“看见地址”永久放宽生产机的 `kptr_restrict` 或 lockdown。

### 4.4 对照组：`nokaslr`

在可回滚的测试虚拟机中，把 `nokaslr` 加到 kernel cmdline 并重启，再重复上面的 `_text` 观察。它通常会回到架构默认位置，并在多次启动间保持不变。

```text
正常启动：   default base + random slide  ──> 每次可能不同
nokaslr：    default base + 0             ──> 通常固定
```

修改 bootloader 配置可能导致系统无法启动，且不同发行版使用 GRUB、systemd-boot、U-Boot 等不同方式；本文只给出对照原理，不建议在远程或无串口恢复能力的机器上直接操作。

## 5. KASLR、ASLR、KPTI 不要混淆

| 机制 | 改变/隔离什么 | 典型开关 | 主要目标 |
|---|---|---|---|
| 用户态 ASLR | 进程的 PIE、库、stack、mmap、heap 等 | `/proc/sys/kernel/randomize_va_space` | 随机化用户进程布局 |
| KASLR | 内核镜像、模块及部分内核区域基址 | `CONFIG_RANDOMIZE_BASE`、`nokaslr` | 隐藏可利用内核对象的地址 |
| KPTI | 用户态和内核态看到的页表映射 | 架构相关 | 用户运行时移除大部分内核映射 |
| 内核栈 offset 随机化 | 每次系统调用进入后的栈内偏移 | `CONFIG_RANDOMIZE_KSTACK_OFFSET`、`randomize_kstack_offset=` | 干扰依赖固定栈位置的攻击 |

用户 ASLR 的 sysctl 不控制 KASLR：

```bash
cat /proc/sys/kernel/randomize_va_space
```

这里的 `0/1/2` 只描述用户进程布局策略，官方定义见 [`randomize_va_space`](https://docs.kernel.org/admin-guide/sysctl/kernel.html#randomize-va-space)。把它写成 `0` 不会关闭 KASLR。

KASLR 与 KPTI 也不是替代关系：

```text
KASLR：  “内核映射在哪里？”        → 让地址难猜
KPTI：   “用户态当前页表里有没有？” → 尽量让映射不可见
权限位： “即使有映射，能否访问？”   → 硬件访问控制
```

完整的防护是多层组合。KASLR 仍需要页表权限、W^X、SMEP/SMAP 或 PAN、KPTI、控制流保护和信息泄露防护共同工作。

## 6. 为什么一个地址泄露可能击穿 KASLR

考虑一个利用链事先知道：

```text
offset(commit_creds - leaked_symbol) = 0x0034a780
```

若漏洞泄露了本次启动的 `leaked_symbol = 0xffffffff93412000`，攻击者即可推导：

```text
commit_creds = 0xffffffff93412000 + 0x0034a780
             = 0xffffffff9375c780
```

这就是为什么官方自保护文档强调：随机化会反过来提高信息泄露的价值。常见破坏因素包括：

- 日志、procfs/debugfs、崩溃输出或驱动 ioctl 暴露原始内核指针；
- 越界读、未初始化内存或 use-after-free 泄露含指针的数据；
- timing/cache 等侧信道缩小候选范围；
- 熵源质量不足、候选槽位太少或布局约束过强；
- 攻击者可反复尝试，而失败不会让目标进程或系统可靠终止。

因此 KASLR 是**概率型加固**，不是安全边界。它提高利用成本，但不能修复内存破坏漏洞，也不能抵御已经获得任意内核读能力的攻击者。

## 7. 常见误区

### 误区一：地址每次 `exec()` 都变

用户进程 ASLR 常在 `exec()` 时重新布局；KASLR 通常在一次 boot 时决定。系统不重启，内核镜像 slide 一般保持不变。

### 误区二：所有函数的顺序都随机

经典 `CONFIG_RANDOMIZE_BASE` 主要移动整块镜像，符号间相对距离仍大体固定。函数级布局随机化是另一类更细粒度机制，不能从“KASLR 已启用”自动推出。

### 误区三：`/proc/kallsyms` 是零，所以没有 KASLR

更常见的原因是当前凭据或安全策略隐藏了地址。先检查：

```bash
sysctl kernel.kptr_restrict
cat /sys/kernel/security/lockdown 2>/dev/null
```

### 误区四：编译时开了配置，本次启动就一定启用

构建能力、启动参数、启动环境是三层不同状态。至少同时检查内核 config、`/proc/cmdline` 和启动日志；某些架构在缺少合适种子或地址空间条件时可能退化。

### 误区五：虚拟机快照恢复等于一次新启动

快照恢复会恢复旧内存状态，也会恢复旧的 KASLR slide。只有真正重新走启动随机化流程，才有机会得到新布局。

## 8. 调试和故障分析

KASLR 会让裸地址不能直接拿未重定位的 `vmlinux` 解符号。核心换算是：

```text
link_address = runtime_address - slide
```

实际工作中优先使用能理解重定位的工具和完整配套信息：

- 本次启动匹配的 `vmlinux`、`System.map` 和模块 debug symbols；
- kdump 生成的 `vmcore` 与对应 `vmcoreinfo`；
- `crash`、`drgn`、GDB 内核调试脚本或发行版的符号化工具；
- 本次启动日志中架构提供的 offset 信息。

最危险的错误是拿“同版本号但不同构建”的 `vmlinux` 做减法。编译选项、编译器、LTO、补丁甚至链接顺序都会改变符号偏移；版本字符串相同不保证布局相同。

## 9. 小结

```text
             随机种子
                │
                ▼
默认链接布局 + 合法候选窗口 ──> 本次 boot 的 slide
                │                       │
                └───────────────────────┤
                                        ▼
                              运行时内核地址

安全收益：攻击者不能仅凭内核版本预知精确地址
主要弱点：相对偏移常固定；一次有效地址泄露可能恢复整个布局
正确定位：概率型纵深防御，不是漏洞修复，也不是访问控制
```

继续阅读：

- [Linux Kernel Self-Protection：KASLR](https://docs.kernel.org/security/self-protection.html#kernel-address-space-layout-randomization-kaslr)
- [Linux 内核命令行参数：`nokaslr`](https://docs.kernel.org/admin-guide/kernel-parameters.html#cmdoption-arg-nokaslr)
- [x86-64 虚拟内存布局](https://docs.kernel.org/arch/x86/x86_64/mm.html)
- [本站：Linux KPTI 架构对照与 RISC-V 实现分析](/linux-kpti-architecture.html)
- [本站：链接器脚本地址速通：VMA、LMA 与 `AT()`](/linker-script-addresses.html)
