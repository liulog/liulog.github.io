---
layout: default
title: 链接器脚本地址速通：VMA、LMA 与 AT()
article: true
page_class: linker-article
---

# 链接器脚本地址速通：VMA、LMA 与 `AT()`

> 一条主线读懂“文件放在哪里、加载到哪里、运行时用什么地址”，并逐行拆解 Asterinas RISC-V 高半区内核脚本。

<div class="address-rule">
  <strong>先记住唯一主线</strong>
  <span>输入节 → 输出节 → ELF 文件偏移 → LMA（装载位置）→ VMA（运行位置）</span>
</div>

如果你只带走一句话，请带走这句：

> **VMA 是链接器为运行时引用算出来的地址；LMA 是镜像内容被装载/存放的地址。`AT(x)` 只把当前输出节的 LMA 指定为 `x`，不会改变它的 VMA，也不会替 CPU 搬数据或创建页表。**

---

## 0. 先纠正“到底是什么地址”

“地址”至少有四种，不能混着读：

| 名字 | 它回答的问题 | 谁使用 | ELF 中常见位置 |
|---|---|---|---|
| 文件偏移（file offset） | 字节在 ELF 文件第几字节？ | 文件系统、加载器 | `sh_offset`、`p_offset` |
| LMA（Load Memory Address） | 镜像内容应先放到内存哪里？ | 固件、bootloader、镜像拷贝代码 | 通常体现为 `PT_LOAD.p_paddr` |
| VMA（Virtual Memory Address） | 程序运行时认为这个字节在哪里？ | 链接器、重定位、CPU 执行后的指针 | `sh_addr`、`PT_LOAD.p_vaddr` |
| PA（Physical Address） | 硬件总线/RAM 的实际地址是什么？ | MMU、CPU、设备 | **不是链接器脚本天然能决定的** |

<div class="callout callout--danger">
  <strong>最重要的防混淆</strong>
  <p><b>LMA 不等于“物理地址”的定义。</b>它是链接/装载约定。在裸机和很多内核镜像里，加载器把 LMA 当作 PA，于是数值相等；但这是该启动协议的选择，不是 LMA 这个词的硬件语义。ELF 通用 ABI 中 <code>p_paddr</code> 在不少系统甚至没有规定用途。</p>
</div>

可以用一条数据的旅程来记：

```text
ELF 文件中                         RAM / ROM                      CPU 运行时
┌────────────────┐  loader 放置   ┌────────────────┐  映射/搬运  ┌────────────────┐
│ p_offset       │ ─────────────> │ LMA            │ ──────────> │ VMA            │
│ 文件里的字节    │                │ 初始存放位置     │             │ 指令和指针所用地址│
└────────────────┘                └────────────────┘             └────────────────┘
```

当 `LMA == VMA`，中间两格重合，所以平时感觉不到它们是两个概念；`LMA != VMA` 时，系统必须建立一种桥：

- **拷贝**：例如 `.data` 初始值放在 Flash，启动代码复制到 RAM；
- **地址映射**：例如内核字节在物理 RAM `0x802...`，页表把高虚拟地址 `0xffffffff802...` 映射到它；
- 或两者兼有。

链接器只描述结果，**桥必须由加载器或启动代码真正完成**。

---

## 1. 用一个最小脚本建立直觉

```ld
SECTIONS
{
    . = 0x2000;

    .data : AT(0x1000) {
        *(.data)
    }
}
```

逐字符读：

1. `. = 0x2000`：把 location counter（位置计数器）移到 `0x2000`；
2. `.data :`：创建输出节 `.data`，未另写地址，所以其 VMA 从当前 `.` 开始；
3. `AT(0x1000)`：把这个输出节的 LMA 设为 `0x1000`；
4. `*(.data)`：收集所有输入文件的 `.data` 输入节。

结果：

```text
ADDR(.data)      = 0x2000   # VMA
LOADADDR(.data)  = 0x1000   # LMA
```

若 `.data` 大小是 `0x80`：

```text
运行地址范围（VMA）  [0x2000, 0x2080)
装载地址范围（LMA）  [0x1000, 0x1080)
```

启动代码通常要做：

```c
memcpy((void *)ADDR(.data),
       (void *)LOADADDR(.data),
       SIZEOF(.data));
```

这只是表达含义的伪代码。实际工程会把三个值导出为链接符号。

### `AT()` 的冒号位置不要读错

完整输出节语法可简化为：

```ld
section_name [VMA] : AT(LMA) {
    input_sections
} >VMA_REGION AT>LMA_REGION :program_header
```

- 冒号**前面**的地址是 VMA；
- `AT(...)` 或 `AT>region` 决定 LMA；
- `>region` 为 VMA 选择 `MEMORY` 区域；
- `:program_header` 把节归入某个 `PHDRS` 段。

官方 GNU ld 文档也明确区分：输出节地址指定 VMA，`AT`/`AT>` 指定 LMA；若省略 `AT`，链接器按规则推导 LMA，而不是永远机械地令其等于 VMA。[GNU ld：Output Section LMA](https://sourceware.org/binutils/docs/ld/Output-Section-LMA.html)

---

## 2. `.`、`ADDR()`、`LOADADDR()` 到底返回什么

### 2.1 `.`：当前位置计数器，主要沿 VMA 空间前进

```ld
. = 0x80000000;
.text : { *(.text) }
. = ALIGN(4096);
.rodata : { *(.rodata) }
```

在 `SECTIONS` 中，`.` 是当前输出位置；改变它会改变下一处输出的位置。在输出节内部，加入内容也会使它递增。[GNU ld：Location Counter](https://sourceware.org/binutils/docs/ld/Location-Counter.html)

实用读法：

```ld
. = 0x80000000;  /* 给“VMA 游标”赋初值 */
. += OFFSET;     /* 把后续输出节的 VMA 整体抬高 */
```

`AT()` 不会把 `.` 切换成“LMA 游标”。需要 LMA 时明确使用 `LOADADDR()`。

### 2.2 三个常用函数

| 表达式 | 值 | 常见用途 |
|---|---|---|
| `ADDR(.text)` | `.text` 的 VMA | 页表映射、运行地址边界 |
| `LOADADDR(.text)` | `.text` 的 LMA | 加载/复制源地址 |
| `SIZEOF(.text)` | 输出节的字节数 | 算结束位置或复制长度 |

GNU ld 内建函数的权威定义见 [Builtin Functions](https://sourceware.org/binutils/docs/ld/Builtin-Functions.html)。

### 2.3 符号赋值不是分配内存

```ld
__text_start = .;
.text : { *(.text) }
__text_end = .;
```

符号只是给当前数值起名字。它不会自动占 8 字节，也不是 C 变量。

在 C/Rust/汇编中，通常要取**符号的地址**：

```c
extern char __text_start[];
extern char __text_end[];
size_t text_size = __text_end - __text_start;
```

另一个细节：节定义内部的符号可能是 section-relative；需要明确的绝对值时可使用 `ABSOLUTE(.)`。日常最终 ELF 中很多场景看不出区别，但做可重定位链接 `ld -r` 时尤其值得注意。

---

## 3. 最常见的 `LMA != VMA`：Flash → RAM

```ld
MEMORY
{
    FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 512K
    RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 128K
}

SECTIONS
{
    .text : {
        *(.text .text.*)
        *(.rodata .rodata.*)
    } >FLASH

    .data : {
        __data_start = .;
        *(.data .data.*)
        __data_end = .;
    } >RAM AT>FLASH

    __data_load = LOADADDR(.data);

    .bss (NOLOAD) : {
        __bss_start = .;
        *(.bss .bss.* COMMON)
        __bss_end = .;
    } >RAM
}
```

这里：

```text
.data LMA ──位于 Flash，镜像中保存初始值──┐
                                           │ reset handler memcpy
.data VMA ──位于 RAM，程序中的全局变量地址<┘

.bss  VMA ──位于 RAM，只有大小、没有文件内容── reset handler memset(0)
```

典型启动代码：

```c
copy(__data_start, __data_load, __data_end - __data_start);
zero(__bss_start, __bss_end - __bss_start);
```

### `.bss` 的关键：`MemSiz > FileSiz`

`.bss` 通常是 ELF 的 `SHT_NOBITS`：

- 在运行内存里要占空间；
- ELF 文件里不保存一大坨零；
- 对应 `PT_LOAD` 常出现 `p_memsz > p_filesz`；
- 加载器或启动代码负责将差额清零。

所以必须分清：

```text
节大小 / 运行内存大小  ≠  文件中实际字节数
```

`NOLOAD`、`SHT_NOBITS` 和“是否出现在某个 `PT_LOAD`”是相关但不同层次的概念，不要只凭一个词推断完整装载行为。

---

## 4. Asterinas RISC-V：高半区内核案例

本文分析的是工作区 `../asterinas/osdk/src/base_crate/riscv64.ld.template` 及生成后的 `target/osdk/aster-kernel-run-base/riscv64.ld`。核心常量：

```ld
KERNEL_LMA = 0x80200000;
KERNEL_VMA = 0xffffffff80200000;
KERNEL_VMA_OFFSET = KERNEL_VMA - KERNEL_LMA;
```

算一下：

```text
KERNEL_VMA_OFFSET = 0xffffffff00000000
```

这表示高半区线性映射满足：

```text
VA = PA + 0xffffffff00000000
PA = VA - 0xffffffff00000000
```

<div class="callout callout--key">
  <strong>Asterinas 的桥不是 memcpy，而是页表</strong>
  <p>镜像始终位于从 <code>0x80200000</code> 开始的物理 RAM。早期启动代码先用低地址执行，再建立页表，使高 VMA 映射回同一批物理页；没有把整个内核再复制一份。</p>
</div>

### 4.1 第一阶段：`.boot` 的 VMA 与 LMA 相等

```ld
. = KERNEL_LMA;

__kernel_start = . + KERNEL_VMA_OFFSET;

.boot : AT(ADDR(.boot)) {
    KEEP(*(.boot))
    KEEP(*(.boot.stack))
    . = ALIGN(4096);
}
```

此时：

```text
.boot VMA = 0x80200000
.boot LMA = ADDR(.boot) = 0x80200000
```

为什么 `.boot` 的 VMA 不直接用高地址？因为进入 `_start` 时 MMU 尚未提供高地址映射。CPU 必须能在镜像实际装载的低地址取指，`.boot` 因而采用 `VMA == LMA`。

`__kernel_start` 却被赋成：

```text
0x80200000 + 0xffffffff00000000
= 0xffffffff80200000
```

它是一个**高地址符号值**，并不表示 `.boot` 自己搬到了高地址。

### 4.2 `.ap_boot` 紧跟 `.boot` 的 LMA

```ld
.ap_boot : AT(LOADADDR(.boot) + SIZEOF(.boot)) {
    KEEP(*(.ap_boot))
    . = ALIGN(4096);
}
```

这里 VMA 由当前 `.` 决定；LMA 则显式写成 `.boot` 的 LMA 尾部：

```text
LMA(.ap_boot) = LMA(.boot) + SIZEOF(.boot)
```

当前构建的实测值：

| 输出节 | VMA | LMA / `PhysAddr` | 大小 |
|---|---:|---:|---:|
| `.boot` | `0x80200000` | `0x80200000` | `0x44000` |
| `.ap_boot` | `0x80244000` | `0x80244000` | `0x1000` |

### 4.3 关键一跳：只抬高 VMA 游标

```ld
. += KERNEL_VMA_OFFSET;
```

执行前：

```text
. = 0x80245000
```

执行后：

```text
. = 0xffffffff80245000
```

下一输出节 `.text` 因而获得高 VMA：

```ld
.text : AT(ADDR(.text) - KERNEL_VMA_OFFSET) {
    *(.text .text.*)
    PROVIDE(__etext = .);
}
```

代入当前构建：

```text
ADDR(.text)     = 0xffffffff80245000       # VMA
KERNEL_OFFSET   = 0xffffffff00000000
LOADADDR(.text) = 0x0000000080245000       # LMA
```

也就是：

```text
VMA  0xffffffff80245000  ──页表翻译──>  PA 0x80245000
LMA  0x0000000080245000  ──加载约定──>  PA 0x80245000
```

LMA 和实际 PA 在这个启动约定中数值相同，于是加载到物理 RAM 的那份 `.text`，开 MMU 后可以通过高 VMA 原地访问。

### 4.4 后续每个节为什么都重复 `AT(...)`

```ld
.rodata : AT(ADDR(.rodata) - KERNEL_VMA_OFFSET) { ... }
.data   : AT(ADDR(.data)   - KERNEL_VMA_OFFSET) { ... }
.bss    : AT(ADDR(.bss)    - KERNEL_VMA_OFFSET) { ... }
```

它们共同维护不变量：

```text
对高半区每个输出节：LMA = VMA - KERNEL_VMA_OFFSET
```

显式写出来有两个好处：

1. 阅读时能直接看见布局意图；
2. 不依赖 GNU ld 在省略 `AT` 时的 LMA 启发式传播规则。

### 4.5 把整个脚本压成一张图

```text
地址增大 →

低地址 / 物理装载视图（LMA，启动协议中也作为 PA）
0x80200000        0x80244000  0x80245000                     0x80cc87d0
┌────────────────┬───────────┬──────────────────────────────┬─────────┐
│ .boot          │ .ap_boot  │ .text .rodata .data ...      │  .bss   │
│ 早期 BSP/页表/栈│ AP 跳板   │ 高半区内核的实际镜像字节       │ 零填充  │
└────────────────┴───────────┴──────────────────────────────┴─────────┘
        │ VMA=LMA      │                     │ VA = PA + offset
        ▼              ▼                     ▼
运行视图（VMA）
0x80200000        0x80244000  0xffffffff80245000      0xffffffff80cc87d0
┌────────────────┬───────────┬──────────────────────────────┬─────────┐
│ .boot          │ .ap_boot  │ .text .rodata .data ...      │  .bss   │
└────────────────┴───────────┴──────────────────────────────┴─────────┘
```

注意 `.boot` 和 `.ap_boot` 仍是低 VMA，而其后的普通内核节是高 VMA。它不是“整个 ELF 只有一组统一偏移”，而是在脚本中间切换了策略。

---

## 5. CPU 真正怎样从低地址跳到高地址

Asterinas 的 `ostd/src/arch/riscv/boot/bsp_boot.S` 放入 `.boot`，入口 `_start` 在 `0x80200000`。流程可以机械地读成：

```text
OpenSBI / loader
    │ 将 ELF 的 LOAD 段放到 PhysAddr
    ▼
_start @ 0x80200000
    │ MMU 尚未按最终高地址工作；在 .boot 低地址执行
    │ 构造 Sv39 / Sv48 页表：
    │   identity: VA 0x802... -> PA 0x802...
    │   linear:   VA 0xffffffff802... -> PA 0x802...
    ▼
csrw satp, page_table
sfence.vma
    │ 同一物理内存同时可由低 VA 和高 VA 到达
    ▼
jr 0xffffffff...bsp_boot_virt
    │ 现在 PC、SP、符号引用切换到链接时约定的高 VMA
    ▼
Rust riscv_boot()
```

脚本中的 `AT()` **没有参与运行时地址翻译**。真正让

```text
0xffffffff80245000 → 0x80245000
```

成立的是启动汇编写入的页表和 `satp`。

### 为什么链接器必须提前使用高 VMA

因为普通 `.text` 中：

- 函数符号值；
- 全局变量地址；
- 重定位结果；
- 调试信息；

都必须符合开 MMU后的最终运行地址。如果仍按低地址链接，页表切换后大量指针和跳转目标就不符合高半区设计。

### 一个值得注意的实测结果

当前 ELF 头：

```text
Entry point address: 0x80200000
```

入口是 `_start` 的低 VMA，而不是 `__kernel_start = 0xffffffff80200000`。`ENTRY(_start)` 选择的是符号 `_start`，不会因为另一个名为 `__kernel_start` 的符号存在而改变。

### 进入最终 VA 前后的代码契约

可以把高半区内核启动浓缩为：

> **进入最终 VA 空间之前，只运行一小段经过特殊约束的 bootstrap 代码；建立页表并把 PC、SP 等运行状态切到链接器约定的高 VMA 后，才进入普通内核代码。**

```text
物理地址 / Bare 模式
    │
    │ early boot：
    │   · PC-relative call / jump
    │   · PC-relative 获取早期符号
    │   · 只访问当前阶段可达的栈、页表和数据
    │   · 避免普通函数指针和绝对高 VMA
    ▼
构建 VA → PA 页表
    │
    ▼
写 satp，开启地址翻译
    │
    │ 修正或切换 PC、SP、异常入口及必要寄存器
    ▼
进入最终高 VA 空间
    │
    ▼
普通内核执行环境
```

这里的 early-boot 代码需要“精心设计”，而不是普通函数天然都能在任意地址运行。它通常遵守以下限制：

- early-boot 代码和它使用的数据整体平移后，相对距离保持不变；
- 直接调用主要使用 `jal` 或 `auipc + jalr` 等 PC-relative 形式；
- 不通过普通函数指针跳到尚不可达的高 VMA；
- 不随意访问按高 VMA 求值的普通全局变量；
- 必须访问某个高 VMA 符号时，显式减去固定 offset 得到当前低地址；
- 栈、页表、设备树等必须使用当前阶段真正可访问的地址；
- 在切换页表前，预先安排好返回地址、下一条指令和异常入口；
- 新页表必须覆盖切换点代码以及马上要使用的代码、数据和栈。

#### PC-relative 调用不等于整个函数是完整 PIC

假设：

```text
caller VMA = 0xffffffff80201000
foo    VMA = 0xffffffff80202000
```

直接调用只需要二者差值：

```text
foo - caller = 0x1000
```

镜像整体在低物理地址执行时：

```text
caller PA = 0x80201000
foo    PA = 0x80202000
foo - caller 仍然等于 0x1000
```

所以 PC-relative 直接调用可能仍能到达 `foo`。但下面这些操作仍可能过早使用完整高 VMA：

```c
void (*fn)(void) = foo;  /* 函数指针通常保存 foo 的高 VMA */
fn();                    /* 间接跳转需要该高 VMA 已可达 */

int *p = &global;        /* 普通全局变量符号也是高 VMA */
value = *p;              /* 页表未建立时不能直接解引用 */
```

函数内部还可能访问全局变量、GOT、per-CPU 数据、回调表或绝对地址重定位。因此必须区分：

```text
直接 call 是 PC-relative
        ≠
整个函数只使用 PC-relative 地址
        ≠
整个内核可以在任意地址无修改运行
```

Linux RISC-V 的早期 `setup_vm` 一类函数能在切换前调用，是因为它们与入口汇编共同遵守专门的 early-boot 约束；这不是普通内核函数的默认保证。

#### 什么时候才算“进入 VA 后正常运行”

仅仅写完 `satp` 还不够，至少要同时满足：

1. 新页表覆盖即将使用的代码、数据、栈和必要设备映射；
2. 当前指令切换点在新地址空间中仍能取指；
3. PC、SP、异常入口以及架构要求的全局寄存器已经使用正确地址；
4. 必要的页表写入可见性与 TLB 同步已经完成。

完成这些条件后：

```text
函数符号       = 正常 VMA
全局变量地址   = 正常 VMA
函数指针       = 正常 VMA
链接器普通符号 = 正常 VMA
```

此时 CPU 实际运行地址与链接器假定的 VMA 一致，才可以进入普通内核执行环境。

---

## 6. Section 与 Segment：别只看 `readelf -S`

链接器主要按 **section（节）** 组织输入，加载器通常按 **segment（段）** 装载。

```text
链接视角： .text  .rodata  .data  .bss       ← Section Headers
                \    |      /
装载视角：       PT_LOAD                    ← Program Headers
```

ELF 中最有诊断价值的对应关系：

| 链接器概念 | `readelf` 观察点 |
|---|---|
| 输出节 VMA | `readelf -S` 的 `Address`（`sh_addr`） |
| 输出节文件位置 | `readelf -S` 的 `Off`（`sh_offset`） |
| 可装载段 VMA | `readelf -l` 的 `VirtAddr`（`p_vaddr`） |
| 可装载段 LMA 的常见体现 | `readelf -l` 的 `PhysAddr`（`p_paddr`） |
| 文件内字节数 | `FileSiz` |
| 运行内存占用 | `MemSiz` |

当前 Asterinas ELF 的关键行：

```text
Type  Offset    VirtAddr           PhysAddr           FileSiz MemSiz Flags
LOAD  0x001000  0x0000000080200000 0x0000000080200000 0x44000 0x44000 RWE
LOAD  0x046000  0xffffffff80245000 0x0000000080245000 0x73c6ca 0x73c6ca R E
LOAD  0xac4080  0xffffffff80cc3080 0x0000000080cc3080 0x000000 0x005750 RW
```

三行分别证明：

1. `.boot`：VMA = LMA；
2. `.text`：高 VMA、低 `PhysAddr`，差正是 `KERNEL_VMA_OFFSET`；
3. `.bss`：`FileSiz = 0` 而 `MemSiz = 0x5750`，需要运行内存但不在文件里存零。

<div class="callout callout--warn">
  <strong>移植时的坑</strong>
  <p>并非每个 ELF 加载器都会照着 <code>p_paddr</code> 装载。你的 bootloader、固件、QEMU <code>-kernel</code> 路径或自制加载器究竟看哪些字段，必须查对应协议或源码；“链接器生成了正确 LMA”不等于“加载器一定尊重它”。</p>
</div>

---

## 7. 一套可复制的排查命令

对最终 ELF 做诊断，不要只盯着 `.ld` 猜：

```bash
# 1) ELF 类型、架构、入口地址
riscv64-linux-gnu-readelf -h kernel.elf

# 2) 加载器真正关心的 PT_LOAD：Offset / VirtAddr / PhysAddr / FileSiz / MemSiz
riscv64-linux-gnu-readelf -Wl kernel.elf

# 3) 输出节的 VMA、文件偏移、大小、PROGBITS/NOBITS
riscv64-linux-gnu-readelf -WS kernel.elf

# 4) 按地址排序观察关键链接符号
riscv64-linux-gnu-nm -n kernel.elf |
  rg '_start|__kernel_start|__bss|__kernel_end'

# 5) 生成 map 文件：输入节到底被谁吃掉、符号如何求值
riscv64-linux-gnu-ld -Map=kernel.map ...

# Rust/Cargo 通常把参数传给最终 linker
RUSTFLAGS="-C link-arg=-Map=kernel.map" cargo build
```

如果怀疑二进制里某条跳转用了错误地址，再看：

```bash
riscv64-linux-gnu-objdump -drS kernel.elf
```

### 机械检查公式

对每个 `PT_LOAD`：

```text
期望偏移 = p_vaddr - p_paddr
```

然后检查：

- 低地址启动段是否为 `0`；
- 高半区段是否都为同一个 `KERNEL_VMA_OFFSET`；
- `p_filesz <= p_memsz`；
- 各 LMA/物理装载范围是否重叠；
- `p_offset` 与 `p_vaddr` 是否满足加载器要求的对齐同余关系；
- 入口地址在初始寻址模式下是否真能取指；
- `.bss` 是谁清零；
- `KEEP()` 保护的入口/表项是否在 `--gc-sections` 下仍存在。

---

## 8. 高频误区，逐个击破

### 误区 1：VMA 就是 MMU 翻译后的物理地址

反了。VMA 是翻译**之前** CPU/程序使用的虚拟地址；PA 是页表翻译结果。链接器不会执行翻译。

### 误区 2：LMA 必然是 PA

不必然。裸机/内核协议经常令两者数值相同，但 LMA 是装载布局概念，PA 是硬件地址概念。

### 误区 3：`AT()` 会在启动时复制数据

不会。它只写布局元数据/影响镜像组织。Flash→RAM 的 `.data` 要由 reset handler 复制；高半区内核要由页表建立映射。

### 误区 4：`.` 同时自动表示 VMA 和 LMA

读脚本时应把 `.` 当作输出位置/VMA 游标；LMA 用 `AT()` 决定，用 `LOADADDR()`查询。省略 `AT()` 后 GNU ld 可能继承前一节的 VMA-LMA 差值，更不能靠直觉猜。

### 误区 5：`ADDR(.text)` 是文件偏移

不是。它是 VMA。文件偏移要看 ELF section/program header 的 `Offset`。

### 误区 6：高 VMA 意味着 ELF 文件前面有巨大空洞

不是。文件偏移、VMA、LMA 是独立坐标。Asterinas 的 `.text` 文件偏移仅 `0x46000`，VMA 却是 `0xffffffff80245000`。

### 误区 7：给 `.bss` 写 `AT(...)` 就会在文件里生成零

通常不会。`.bss` 是 `NOBITS`，文件无内容；加载器/启动代码负责零填充。

### 误区 8：`__kernel_start = ...` 会把当前位置移过去

不会。给普通符号赋值只定义符号值；只有给特殊符号 `.` 赋值才移动位置计数器。

---

## 9. 60 秒读陌生链接器脚本

按这个顺序读，最快：

1. 找 `OUTPUT_ARCH` / `OUTPUT_FORMAT` 和 `ENTRY`；
2. 找 `MEMORY`，画出 ROM、RAM、物理装载区；
3. 找第一次 `. = ...`，确定初始 VMA；
4. 给每个输出节记两列：VMA 来源、LMA 来源；
5. 圈出所有 `AT()`、`AT>`、`LOADADDR()`；
6. 圈出每次对 `.` 的大幅修改，尤其是加一个高半区 offset；
7. 找 `PHDRS` / `:phdr`，确认加载段；
8. 找导出符号：start/end/load/size；
9. 回到启动代码，找 memcpy、memset、建页表、开 MMU；
10. 最后用 `readelf -Wl/-WS` 验证，不要停留在脚本推测。

可以给每节做这张草稿表：

| Section | VMA 怎么来 | LMA 怎么来 | 谁让它可用 |
|---|---|---|---|
| `.boot` | `.` 从 `KERNEL_LMA` 开始 | `AT(ADDR(.boot))` | loader 直接放置，低地址取指 |
| `.text` | `.` 加高半区 offset | `ADDR - offset` | loader 放低地址 + 页表映射 |
| `.data`（MCU） | RAM region | Flash region | reset handler 复制 |
| `.bss` | RAM region | 无文件字节 | loader/reset handler 清零 |

---

## 10. 最终记忆卡

```text
VMA       程序运行时“认为自己在哪里”
LMA       镜像内容“启动时先放在哪里”
PA        硬件实际访问的物理地址；可能与 LMA 数值相同，但概念不同
Offset    字节在 ELF 文件中的位置

.         当前输出位置计数器（按 VMA 主线理解）
ADDR(s)   输出节 s 的 VMA
LOADADDR(s) 输出节 s 的 LMA
SIZEOF(s) 输出节 s 的内存大小
AT(x)     指定当前输出节的 LMA = x
AT>ROM    从 ROM region 为 LMA 分配空间
>RAM      从 RAM region 为 VMA 分配空间

LMA != VMA 时必须追问：
“谁负责把 LMA 的内容变成 VMA 可访问？”
答案只能是：复制、映射，或两者。
```

### 参考资料

- [GNU ld 官方手册：Scripts / SECTIONS](https://sourceware.org/binutils/docs/ld/SECTIONS.html)
- [GNU ld 官方手册：Output Section LMA（`AT` / `AT>`）](https://sourceware.org/binutils/docs/ld/Output-Section-LMA.html)
- [GNU ld 官方手册：Builtin Functions（`ADDR` / `LOADADDR` / `SIZEOF`）](https://sourceware.org/binutils/docs/ld/Builtin-Functions.html)
- [GNU ld 官方手册：PHDRS](https://sourceware.org/binutils/docs/ld/PHDRS.html)
- [Asterinas 源码仓库](https://github.com/asterinas/asterinas)

> 本文的 Asterinas 数值来自 2026-07-23 工作区中的实际 RISC-V ELF；源码演进后，节大小和边界可能变化，但 VMA/LMA 推导方法不变。
