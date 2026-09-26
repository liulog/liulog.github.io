---
layout: default
title: 从 Chisel 到 FPGA：电路如何真正跑起来
description: 从 Chisel、FIRRTL 和 Verilog，到综合、布局布线、bitstream 与 FPGA 烧录；以 Xilinx 7 系列解释内部结构、JTAG 下载和 Flash 启动。
article: true
toc: true
page_class: fpga-article
sections:
  - { id: basics, title: "01 · 认识三个核心概念" }
  - { id: pipeline, title: "02 · 完整转换路线" }
  - { id: chisel, title: "03 · Chisel 怎样生成 HDL" }
  - { id: implementation, title: "04 · 综合与布局布线" }
  - { id: anatomy, title: "05 · FPGA 内部组成" }
  - { id: ps-pl, title: "06 · PS / PL 与组件关系" }
  - { id: programming, title: "07 · 谁来烧录，烧到哪里" }
  - { id: tools, title: "08 · 工具与产物" }
  - { id: practice, title: "09 · 第一次点亮 LED" }
  - { id: faq, title: "10 · 常见问题" }
  - { id: sources, title: "11 · 来源与延伸阅读" }
---

<header class="guide-hero">
  <p class="eyebrow">DIGITAL DESIGN / 从软件走向硬件</p>
  <h1>从 Chisel 到 FPGA<br>电路如何真正跑起来</h1>
  <p>一段代码怎样变成逻辑与连线？一颗 FPGA 里面有什么？电脑、下载器和 Flash，又分别做了什么？沿着一次 LED 闪烁，把这条链走通。</p>
  <div class="guide-meta"><span>整理于 2026.09.26</span><span>入门指南 · 原理 + 流程图</span><span>以 Xilinx 7 系列 / Vivado 为例</span></div>
</header>

<div class="guide-note"><strong>阅读范围</strong> · 基于 chisel 仓库的入门说明迁入并扩展。示例用于理解原理，实际实现需要确定开发板、FPGA 完整型号与约束；本文不提供经过上板验证的 bitstream。</div>

<h2 id="basics">01 · 先认识这三样东西</h2>

可以把 FPGA 想成一块已经生产好的、内部有大量可配置电子积木的芯片。设计者决定这些积木做什么、彼此怎样连接。

| 名称 | 通俗理解 | 常见文件 |
| --- | --- | --- |
| Chisel | 用程序生成电路设计的工具；可以用参数和循环批量搭建电路 | `.scala` |
| Verilog / SystemVerilog | 用文字描述电路：有哪些输入输出、如何运算、何时保存数据 | `.v` / `.sv` |
| bitstream（比特流） | 配置 FPGA 的数据：告诉芯片内部的逻辑单元和连线如何设置 | 例如 `.bit`，具体格式取决于器件和工具 |

Chisel 是嵌入在 Scala 里的硬件构造语言。运行 Chisel 程序时，它会构造一个“硬件结构图”。现代常见流程输出的是 **SystemVerilog**，也就是在 Verilog 基础上扩展的语言；入门时可以先把两者理解为同一流程中的电路描述文件。[Chisel 官方介绍](https://www.chisel-lang.org/docs)、[SystemVerilog 生成 API](https://www.chisel-lang.org/api/latest/circt/stage/ChiselStage%24.html)

**FPGA 加载 bitstream 后，内部电路就按你的设计工作。** 通常没有一个 CPU 在逐行执行你的 Verilog。若你在 FPGA 内搭建了一个 CPU，那颗 CPU 执行的软件又是另一层。

<h2 id="pipeline">02 · 先看完整路线</h2>

<div class="flow-explorer">
  <p><strong>从描述到电路，分成六站。</strong>点击每一步，查看执行者与产物。直接写 Verilog 的设计可以从第 3 站开始。</p>
  <div class="pipeline-grid">
    <details class="pipeline-stage"><summary>01 · 构造电路<small>Scala + Chisel → FIRRTL</small></summary><p>电脑运行 Scala 程序，展开参数、模块和连接。循环可以生成多份硬件；它并不等于在 FPGA 上逐拍执行循环。</p></details>
    <details class="pipeline-stage"><summary>02 · 生成 HDL<small>CIRCT / firtool → .sv</small></summary><p>编译器转换中间表示，输出 SystemVerilog。此时仍是电路描述，还没有选定芯片上的位置与线路。</p></details>
    <details class="pipeline-stage"><summary>03 · 综合<small>Vivado → mapped netlist</small></summary><p>结合目标器件，把 RTL 映射为 LUT、触发器、进位链、RAM 或 DSP 等元件及连接。HDL 可先做功能仿真。</p></details>
    <details class="pipeline-stage"><summary>04 · 布局布线<small>Implementation → routed design</small></summary><p>在具体 FPGA 中安排资源位置和连接路径，使用时钟、引脚等约束；检查布线后的时序和 DRC。</p></details>
    <details class="pipeline-stage"><summary>05 · 生成配置<small>Bitstream generation → .bit</small></summary><p>把 LUT 内容、互连和资源设置编码为目标器件的配置数据。Flash 镜像还可能需要 write_cfgmem 转换。</p></details>
    <details class="pipeline-stage"><summary>06 · 配置与启动<small>Hardware Manager → FPGA</small></summary><p>下载器通过 JTAG 传输配置，或者先把镜像写进 Flash，再由 FPGA 的配置电路在上电时读取。</p></details>
  </div>
</div>

把上面的路线连起来：

**Chisel → 展开 → FIRRTL → firtool → Verilog/SystemVerilog → 综合 → 布局布线 → 检查 → bitstream → FPGA。**

这是一条便于学习的主线。实际工具会在多个阶段做优化和检查，发现问题后也要回去修改设计或约束。[Chisel 编译与仿真说明](https://www.chisel-lang.org/docs/explanations/testing)、[AMD 设计流程说明](https://docs.amd.com/r/en-US/Vivado-Design-Suite-User-Guide-Design-Flows-Overview-UG892/Vivado-System-Level-Design-Flows)

<h2 id="chisel">03 · Chisel 究竟怎么变成 Verilog？</h2>

这里有两个不同的时间：**在电脑上生成电路的时间**，以及**电路在 FPGA 上工作的时间**。

例如下面这个 8 位计数器：

```scala
import chisel3._
import circt.stage.ChiselStage

class Counter8 extends Module {
  val io = IO(new Bundle {
    val count = Output(UInt(8.W))
  })

  val counter = RegInit(0.U(8.W))
  counter := counter + 1.U
  io.count := counter
}

object Generate extends App {
  ChiselStage.emitSystemVerilogFile(
    new Counter8,
    args = Array("--target-dir", "generated")
  )
}
```

这段代码需要放在已经配置好 Chisel 库、编译器插件和兼容 Scala 版本的工程中。它表达的是：用一个 8 位寄存器保存数字，每个时钟上升沿加一，数到 255 后回到 0，并把当前值接到输出端。`Module` 默认提供时钟和复位接口；这里采用默认的同步复位语义。

`RegInit` 构造带复位值的寄存器，`:=` 描述硬件连接或寄存器的下一状态。Scala 的 `val` 保存的是对这些硬件对象的引用，不能直接把它当作 FPGA 内部保存数值的寄存器。

生成过程分成三步：

1. **编译并运行 Scala 程序。** 在电脑上的 JVM 中执行 `Generate`，Chisel 据此创建模块、寄存器、加法和连接。这一步叫展开（elaboration）。例如用 Scala 循环创建四个模块，通常是在生成时创建四份电路；运行时逐拍做事需要用寄存器、计数器或状态机描述。
2. **形成中间表示。** 工具把硬件结构表达为 FIRRTL 等中间形式，方便分析和转换。可把它理解成编译器内部使用的电路草稿；初学时不必手写它，也不必每次把它保存成独立文件。
3. **由 CIRCT 的 firtool 生成 SystemVerilog。** 工具逐步转换和优化电路表达，输出后续 FPGA 工具能处理的 HDL 文件。旧教程可能使用旧版 Scala FIRRTL 编译器和 `emitVerilog` 接口，复制代码时要匹配工程版本。[Chisel 官方介绍](https://www.chisel-lang.org/docs)、[CIRCT FIRRTL 说明](https://circt.llvm.org/docs/Dialects/FIRRTL/RationaleFIRRTL/)、[ChiselStage API](https://www.chisel-lang.org/api/latest/circt/stage/ChiselStage%24.html)

为了看清对应关系，上面的电路可以用下面的 Verilog 表达。**这是人工简化的等价功能示意，并非实际工具输出；生成文件的命名、格式及辅助代码可能不同。**

```verilog
module Counter8 (
    input  wire       clock,
    input  wire       reset,
    output wire [7:0] io_count
);
    reg [7:0] counter;

    always @(posedge clock) begin
        if (reset)
            counter <= 8'd0;
        else
            counter <= counter + 8'd1;
    end

    assign io_count = counter;
endmodule
```

`always @(posedge clock)` 表示在时钟上升沿更新寄存器。电路结构可以想成：“寄存器的输出 → 加一电路 → 寄存器的输入”，时钟决定什么时候把新值存进去。

若只想先体验生成 HDL，Chisel 官方提供 Scala CLI 单文件入门示例；较大工程还可以用 Mill 或 sbt 管理构建。安装和版本搭配以[官方安装文档](https://www.chisel-lang.org/docs/installation)为准。

<h2 id="implementation">04 · Verilog 怎么变成 FPGA 能用的东西？</h2>

### 第一步：准备完整设计和约束

Verilog 描述了功能，但工具还需要知道：使用哪个 FPGA、哪个模块是顶层、时钟多快，以及模块端口接芯片上的哪些引脚。

以 LED 为例，代码里的 `led` 只是信号名。板厂原理图或约束文件才会告诉你：板上的 LED 实际接到了 FPGA 哪个管脚、什么电压标准、输出高还是低时点亮。

Vivado 常用 `.xdc` 文件表达引脚、电气标准和时序要求。例如，假设板子实际提供 100 MHz 时钟：

```tcl
# 告诉工具：clock 输入的周期是 10 ns，即 100 MHz。
create_clock -name sys_clk -period 10.000 [get_ports clock]

# 下列只是格式示意，必须按具体开发板填写，不能直接使用占位符。
# set_property PACKAGE_PIN <板上时钟对应管脚> [get_ports clock]
# set_property IOSTANDARD <对应电气标准> [get_ports clock]
```

**`create_clock` 是告诉工具实际时钟的要求，不会凭空产生一个 100 MHz 时钟。** 实际时钟来自板上晶振、外部输入或片内时钟管理电路。[AMD create_clock 文档](https://docs.amd.com/r/2021.2-English/ug835-vivado-tcl-commands/create_clock)、[AMD 约束说明](https://download.amd.com/docnav/documents/UG903_2023.1_English.pdf)

### 第二步：综合（Synthesis）——决定用哪些电路元件

综合工具读懂可综合的 Verilog，把功能转换成适合目标 FPGA 的元件及连接关系，称为**网表（netlist）**。

FPGA 内部已有很多种资源，常见的有：

| 资源 | 可以先这样理解 |
| --- | --- |
| LUT，查找表 | 可配置的小逻辑单元，用输入查表得到输出，能实现与、或、选择等逻辑 |
| FF，触发器 | 通常保存一位状态；多个组合起来形成寄存器 |
| 进位链 | 帮助实现加法、计数等运算 |
| Block RAM | 芯片内的存储块 |
| DSP 单元 | 擅长乘法、乘加等计算的专用模块 |
| 可编程互连 | 连接上述元件的线路和开关 |

前面的计数器通常会用到触发器、加法相关逻辑和复位相关逻辑。工具会优化设计，所以源码里的一个对象不一定严格对应一个最终物理元件。[AMD 综合与实现介绍](https://www.amd.com/en/products/software/adaptive-socs-and-fpgas/vivado/implementation.html)、[AMD 逻辑块结构手册](https://www.amd.com/content/dam/xilinx/support/documents/user_guides/ug574-ultrascale-clb.pdf)

### 第三步：布局布线（Place and Route）——决定放哪里、怎样接

网表说清了“需要什么元件、谁连谁”，还没有完全确定芯片内部的具体位置和线路。

**布局**给元件安排具体位置，**布线**选择芯片上实际可用的连接路径。可以类比装修：先列好灯、插座和接线关系，再决定它们放在哪、线从哪里走。FPGA 的资源和线路早已制造好，这里是在选择和配置它们。

位置和线路会影响信号传输时间，所以同样的功能可能因为布局不同而有不同速度。[AMD 实现指南](https://www.amd.com/content/dam/xilinx/support/documents/sw_manuals/xilinx2021_1/ug904-vivado-implementation.pdf)

### 第四步：检查功能、时序和规则

这三种检查回答不同的问题：

| 检查 | 要回答的问题 |
| --- | --- |
| 功能仿真 | 给定输入后，输出和状态变化是否符合设计？例如复位后从 0 开始、255 后回到 0 |
| 静态时序分析 | 信号能否在时钟要求的时间内到达，并满足保持时间等要求？ |
| 设计规则检查（DRC） | 引脚、电气标准、资源连接等是否符合器件和工具的规则？ |

比如 100 MHz 的周期是 10 ns。某条寄存器到寄存器的路径若需要 12 ns，显然赶不上下一次采样；实际分析还要考虑建立时间、时钟偏差等。修正时可能需要减少组合逻辑、增加流水线，或降低实际运行频率并同步修改约束。

功能仿真一般在生成 HDL 后就开始。布局布线完成后的时序分析利用更准确的线路延迟。**仿真通过不代表时序通过；生成了 bitstream 也不自动证明功能正确。** 约束是否完整同样影响结论。[Chisel 仿真说明](https://www.chisel-lang.org/docs/explanations/testing)、[AMD FPGA 流程课程](https://www.amd.com/en/corporate/university-program/vivado/vivado-workshops/vivado-fpga-design-flow.html)、[Altera 设计流程与时序分析说明](https://www.altera.com/design/guidance/software/quartus-support)

### 第五步：生成 bitstream——把配置方案编码成文件

工具把最终实现转换成配置数据，例如 LUT 的内容、互连开关选择、寄存器及其他资源的配置，再按目标器件的格式封装输出。

它包含的是具体硬件的配置，因此通常不能把一个 FPGA 型号的 bitstream 拿到另一个型号上使用。同型号的不同开发板也可能有不同引脚、时钟和外围电路，需要重新适配。[AMD 配置概述](https://docs.amd.com/r/en-US/ug570-ultrascale-configuration/Overview)

<h2 id="anatomy">05 · 拆开一颗典型的 Xilinx FPGA</h2>

以 **AMD/Xilinx 7 系列（如 Artix-7）** 为例：FPGA 芯片内部是已经制造好的逻辑、存储、运算和连线资源，bitstream 配置这些资源的功能与连接。下面是便于理解的组成示意，**不是实际芯片的版图或资源数量比例**。

<figure class="fabric-figure">
  <div class="fabric-boundary">
    <div class="fabric-title"><strong>XILINX 7 SERIES / FPGA</strong><small>芯片内部 · 可配置逻辑与专用硬件</small></div>
    <div class="fabric-io">I/O Banks · 输入输出缓冲、管脚与电气标准</div>
    <div class="fabric-grid" aria-label="CLB 逻辑、BRAM 存储与 DSP 运算资源通过可编程互连相连">
      <div class="fabric-column"><span>CLB</span><span>CLB</span><span>CLB</span></div>
      <div class="fabric-column fabric-column--ram"><span>BRAM</span><span>BRAM</span><span>BRAM</span></div>
      <div class="fabric-column"><span>CLB</span><span>CLB</span><span>CLB</span></div>
      <div class="fabric-column fabric-column--dsp"><span>DSP</span><span>DSP</span><span>DSP</span></div>
      <div class="fabric-column"><span>CLB</span><span>CLB</span><span>CLB</span></div>
    </div>
    <div class="fabric-clock">时钟资源 · MMCM / PLL / 全局时钟网络</div>
    <div class="fabric-config">配置控制器 + 配置 SRAM · JTAG / 配置接口</div>
  </div>
  <div class="fabric-board"><span>↓ 芯片之外 / 开发板上 ↓</span><span>晶振</span><span>配置 Flash</span><span>USB-JTAG 桥</span><span>电源</span><span>LED / 按键</span><span>可选 DDR</span></div>
  <figcaption>背景横线表示互连的概念。专用高速收发器、PCIe 等资源是否存在及数量，取决于具体器件和封装；不是所有 FPGA 都有硬核 CPU。</figcaption>
</figure>

### CLB、Slice、LUT 和 FF：最基本的电路积木

7 系列中，一个 **CLB 包含两个 Slice**；每个 Slice 有 **4 个 6 输入 LUT、8 个存储单元（通常作触发器）**，以及进位和多路选择逻辑。6 输入 LUT 可以理解成用 6 位输入索引的 64 项真值表，配置不同表项就能得到不同布尔函数。FF 保存状态，进位链让计数器、加法器等运算更高效。具有存储能力的 SLICEM 还可以把 LUT 用作分布式 RAM 或移位寄存器。[AMD UG474：CLB 组成](https://docs.amd.com/r/en-US/ug474_7Series_CLB/CLB-Overview)、[LUT 功能](https://docs.amd.com/r/en-US/ug474_7Series_CLB/Look-Up-Table)

这解释了为什么一段 `counter := counter + 1.U` 最后可能落到多个 FF 与专用进位逻辑，而不是某个“执行加一指令的 CPU”。不要把上述数量直接套到 UltraScale：不同架构的 CLB / Slice 组织不同。[AMD UG574：UltraScale CLB](https://www.amd.com/content/dam/xilinx/support/documents/user_guides/ug574-ultrascale-clb.pdf)

### 除了逻辑单元，还有什么？

| 组成 | 做什么 | 与设计的关系 |
| --- | --- | --- |
| 可编程互连 | 通过可配置开关选择信号路径 | 连接 LUT、FF、RAM、DSP；布线延迟会影响时序 |
| Block RAM（BRAM） | 专用片内存储块；7 系列有 36 Kb 块，可按模式拆为两个 18 Kb 块 | 用于缓冲、FIFO、ROM、小型存储；不是板外 DDR，也不是保存配置的 Flash |
| DSP48E1 | 专用乘法、加法和累加等运算硬件 | 适合信号处理、滤波和乘加；综合是否使用它取决于写法、位宽和优化 |
| 时钟管理与分配 | MMCM / PLL 调整时钟频率与相位，时钟网络分配时钟 | 时钟源通常来自板上晶振或外部输入，约束本身不会生成时钟 |
| I/O Banks | 组织管脚、输入输出缓冲和电气接口 | I/O 标准必须与 Bank 供电、外围器件相容 |
| 配置控制器与配置 SRAM | 接收配置数据，建立资源设置并完成启动流程 | 配置控制器是芯片已有的专用电路，空白 FPGA 也能接收配置 |
| 器件相关的硬核资源 | 如高速串行收发器、PCIe、XADC 等 | 是否具有、可用数量和连接方式都要查具体型号 |

资源概览参见 [AMD DS180：7 系列数据手册](https://docs.amd.com/api/khub/documents/2LByHkO~nSZXcei2D55fTg/content)和 [UG953：原语分类](https://docs.amd.com/r/2021.2-English/ug953-vivado-7series-libraries/Functional-Categories)；运算单元见 [DSP48E1 说明](https://docs.amd.com/r/2021.1-English/ug953-vivado-7series-libraries/DSP48E1)。

### FPGA 芯片 ≠ FPGA 开发板 ≠ SoC

**芯片**提供可编程资源，**开发板**再加上电源、晶振、下载接口、LED、Flash 等外围，某些板还有外部 DDR。板载 USB 接口也可能分别用于供电、串口或 JTAG，不能只凭“插上 USB”就认为可下载；要看板卡原理图和接口说明。[以 Basys 3 开发板手册为例](https://digilent.com/reference/_media/reference/programmable-logic/basys-3/basys3_rm.pdf)

普通 Artix-7 FPGA 不自带 Arm 处理器；可以用逻辑实现 MicroBlaze 或 RISC-V 等软核 CPU。Zynq-7000 则把 Arm 处理系统（PS）与可编程逻辑（PL）集成在一颗芯片中，启动时还涉及处理器侧的启动软件和 PL 配置路径。不能把普通 FPGA 的 SPI 启动步骤原样当成所有 SoC 的启动方案。[AMD Zynq-7000 概览](https://www.amd.com/en/products/adaptive-socs-and-fpgas/soc/zynq-7000.html)

<h2 id="ps-pl">06 · PS、PL 与 FPGA，到底是什么关系？</h2>

**在 Zynq 这类 SoC 的语境里，你说的“FPGA 部分”通常就是 PL；但 FPGA 这个词也可以指普通的整颗 FPGA 器件，并不总是特指某颗 SoC 的子区域。** PS（Processing System）是硬核处理系统，PL（Programmable Logic）是 FPGA 可编程逻辑，两者在 Zynq 中集成于同一颗芯片。PS 也不只是 CPU：它还包含缓存、片内存储、存储控制器与外设。[AMD UG585：Zynq-7000 架构概览](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/Overview)

### 先分清三层边界：开发板、芯片、芯片内的区域

<div class="device-compare" aria-label="普通 FPGA 与 Zynq SoC 的组成对照">
  <section class="device-card">
    <p class="eyebrow">普通 FPGA / ARTIX-7 示例</p>
    <div class="device-outline"><strong>一颗 FPGA 芯片</strong><div class="device-region device-region--pl">FPGA 可编程逻辑与硬件资源<small>LUT · FF · BRAM · DSP · 互连 · I/O</small></div><p>配置、时钟等专用电路也在芯片内；没有 Zynq 式硬核 PS。</p></div>
    <p class="device-board-label">板上另有：电源、晶振、Flash、下载接口等</p>
  </section>
  <section class="device-card">
    <p class="eyebrow">带 FPGA 逻辑的 SoC / ZYNQ-7000 示例</p>
    <div class="device-outline"><strong>一颗 Zynq SoC 芯片</strong><div class="device-region device-region--ps">PS · 硬核处理系统<small>Arm CPU · Cache · OCM · DDR 控制器 · 外设</small></div><div class="device-bridge">↕ 片内接口：AXI、时钟、中断、配置等</div><div class="device-region device-region--pl">PL · FPGA 可编程逻辑<small>LUT · FF · BRAM · DSP · 互连 · I/O</small></div></div>
    <p class="device-board-label">板上另有：DDR 芯片、启动存储、电源、接口等</p>
  </section>
</div>

因此，说“在 FPGA 上做一个加速器”，在 Zynq 工程里通常指**在 PL 中实现加速电路，再由 PS 上的软件控制它**。说“这是一块 FPGA 板”，口语上可能指搭载普通 FPGA 的板，也可能指搭载 Zynq 的板；选工具和理解启动流程时，必须落实到具体芯片型号。上图是概念对照，外设配置取决于实际开发板。[Artix-7 所属的 7 系列概览](https://docs.amd.com/api/khub/documents/2LByHkO~nSZXcei2D55fTg/content)、[Zynq-7000 数据手册 DS190](https://docs.amd.com/api/khub/documents/juMnxca71Tf2gfjmNyjM8A/content)

### 一张关系图：PS 如何使用 PL 里的加速器？

下面选择一个 **Zynq-7000 + PL 加速器 + 板外 DDR** 的教学设计。按钮高亮不同连接；所有连线的用途也在图中标出。图中箭头表示请求、通知或配置的主要方向，AXI 读取的数据会沿相反方向返回。

<figure class="soc-explorer" data-soc-explorer aria-labelledby="soc-map-title">
  <div class="soc-heading"><div><span class="eyebrow">INSIDE A ZYNQ-7000</span><strong id="soc-map-title">一颗芯片，两类计算资源</strong></div><span class="soc-legend"><i class="legend-ps"></i>PS 硬核系统 <i class="legend-pl"></i>PL 可编程逻辑</span></div>
  <div class="soc-controls" role="group" aria-label="选择要查看的 PS 与 PL 连接" hidden>
    <button type="button" data-soc-view="all" aria-pressed="true">全部关系</button>
    <button type="button" data-soc-view="control" aria-pressed="false">① CPU 发命令</button>
    <button type="button" data-soc-view="data" aria-pressed="false">② DMA 搬数据</button>
    <button type="button" data-soc-view="irq" aria-pressed="false">③ 完成后中断</button>
    <button type="button" data-soc-view="config" aria-pressed="false">④ 配置 PL</button>
  </div>
  <div class="soc-die">
    <div class="soc-boundary-label">同一颗 Zynq-7000 芯片内部 · 关系示意，不是版图</div>
    <div class="soc-columns">
      <section class="soc-domain soc-domain--ps" aria-label="PS 硬核处理系统">
        <h4>PS <small>出厂已有的硬件</small></h4>
        <div class="soc-node" data-routes="control data irq config"><strong>Arm Cortex-A9 + L1 / L2 Cache</strong><small>运行裸机程序或操作系统，访问控制寄存器</small></div>
        <div class="soc-node" data-routes="data"><strong>DDR 控制器 / OCM</strong><small>DDR 控制器接板外内存；OCM 是片内 SRAM</small></div>
        <div class="soc-node" data-routes="irq"><strong>GIC → CPU</strong><small>中断控制器将通知交给 CPU 处理</small></div>
        <div class="soc-node" data-routes="config"><strong>BootROM / DevC</strong><small>启动代码与设备配置控制；软件驱动 PCAP</small></div>
        <div class="soc-node"><strong>PS 时钟与复位控制</strong><small>按工程配置，向 PL 提供时钟与控制信号</small></div>
        <div class="soc-node"><strong>UART · SPI · I²C · GPIO 等</strong><small>硬核外设，可经 MIO 或受支持的 EMIO 路径连接</small></div>
      </section>
      <div class="soc-lanes" aria-label="PS 和 PL 之间的连接">
        <span class="soc-lane-heading">片内连接</span>
        <div class="soc-lane" data-routes="control"><b>① PS → PL</b><span>M_AXI_GP0</span><span>PS 发起寄存器读写</span><small>PL 侧可适配 AXI4-Lite</small></div>
        <div class="soc-lane" data-routes="data"><b>② PS ← PL</b><span>S_AXI_HP0</span><span>PL 主设备发起内存读写</span><small>访问 PS 侧 DDR / OCM</small></div>
        <div class="soc-lane" data-routes="irq"><b>③ PS ← PL</b><span>IRQ_F2P</span><span>PL 通知 PS</span><small>进入中断控制器 GIC</small></div>
        <div class="soc-lane" data-routes="config"><b>④ PS → PL</b><span>DevC / PCAP</span><span>传输 PL 配置比特流</span><small>经专用配置电路接收</small></div>
        <div class="soc-lane"><b>PS → PL</b><span>FCLK / 复位控制</span><small>按设计连接和同步复位</small></div>
        <div class="soc-lane"><b>PS ↔ PL</b><span>EMIO（受支持外设）</span><small>信号也可走 PS MIO 引脚</small></div>
      </div>
      <section class="soc-domain soc-domain--pl" aria-label="PL 可编程逻辑">
        <h4>PL <small>bitstream 定义的电路</small></h4>
        <div class="soc-node" data-routes="control"><strong>AXI 互连 + 控制寄存器</strong><small>保存地址、长度、启动位；供 CPU 读写</small></div>
        <div class="soc-node" data-routes="data"><strong>DMA ↔ 加速器</strong><small>PL 主设备通过 HP 访问内存；用户电路组合 BRAM / DSP / LUT / FF</small></div>
        <div class="soc-node" data-routes="irq"><strong>加速器 / DMA 完成信号</strong><small>产生中断通知；也可把状态存入寄存器供轮询</small></div>
        <div class="soc-node" data-routes="config"><strong>专用配置电路 + 配置 SRAM</strong><small>装入 LUT 内容、互连和资源配置</small></div>
        <div class="soc-node"><strong>PL 时钟网络 / 复位逻辑</strong><small>连接用户电路，处理所需的时钟域与复位同步</small></div>
        <div class="soc-node"><strong>PL I/O · 外部引脚</strong><small>用户逻辑可连接 LED、采集接口等外设</small></div>
      </section>
    </div>
    <div class="soc-pin-row"><span data-routes="data">PS DDR 引脚 ↕</span><span data-routes="config">PS 启动接口 / MIO ↕</span><span>PL I/O 引脚 ↕</span></div>
  </div>
  <div class="soc-board"><span class="soc-board-title">芯片外 / 开发板上</span><div class="soc-external" data-routes="data"><strong>DDR DRAM 芯片</strong><small>本例的输入 / 输出缓冲区</small></div><div class="soc-external" data-routes="config"><strong>SD 卡 / QSPI Flash</strong><small>启动镜像与 PL 配置数据</small></div><div class="soc-external"><strong>LED / 外部采集器件</strong><small>通过板级连线接 PL 引脚</small></div></div>
  <div class="soc-explanation" aria-live="polite" aria-atomic="true">
    <div data-soc-description="all"><strong>先看边界，再看连接。</strong><p>CPU、DDR 控制器在 PS，定制加速器在 PL，DDR 存储芯片在板上。控制寄存器、搬运数据、完成中断和配置比特流，分别走不同的通路。</p></div>
    <div data-soc-description="control" hidden><strong>① CPU 发命令：PS → M_AXI_GP0 → PL 寄存器</strong><p>软件写入缓冲区地址、长度和启动位；PL 控制逻辑据此开始工作。普通寄存器访问不会重新配置 LUT 或布线，也不是 CPU 在执行 Verilog。</p></div>
    <div data-soc-description="data" hidden><strong>② DMA 搬数据：PL 主设备 → S_AXI_HP0 → PS DDR 控制器 ↔ 板外 DDR</strong><p>本例的 PL DMA 取输入、向加速器送数据，再把输出写回 DDR。读请求朝 PS 发出，读数据返回 PL；CPU 不必逐个搬运数据。HP 不自动保持 CPU Cache 一致性。</p></div>
    <div data-soc-description="irq" hidden><strong>③ 完成后中断：PL → IRQ_F2P → PS 的 GIC → CPU</strong><p>加速器或 DMA 发出中断，CPU 执行驱动的中断处理函数，确认完成并处理结果。中断只是通知，数据通常已经通过内存通路写入缓冲区；也可以轮询状态寄存器。</p></div>
    <div data-soc-description="config" hidden><strong>④ 配置 PL：PS 软件 → DevC / PCAP → PL 配置电路</strong><p>FSBL 或后续软件把存储中的 bitstream 交给配置通路，建立 PL 电路。BootROM 本身不配置 PL；经 PCAP 加载是软件后续执行的步骤，也可以使用受支持的 JTAG 配置路径。</p></div>
  </div>
  <figcaption>为保持图形清晰，只展开本例选用的 GP、HP、中断与 PCAP 通路；并未画出所有 PS 内部路由、AXI 端口、外设与时钟。左右模块还通过各自区域内的互连配合工作，例如 CPU 访问 DDR、寄存器控制加速器；这些内部连线已省略。</figcaption>
</figure>

该示意依据 [UG585：PS–PL AXI 接口及方向](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PS-PL-AXI-Interfaces)、[PL 经 HP 接口进行 DMA 的示例](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PL-DMA-via-AXI-High-Performance-HP-Interface)与 [PS–PL 功能和配置接口](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PS-PL-Interfaces)绘制；中断和时钟复位分别参见 [Interrupt Signals](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/Interrupt-Signals)与 [Clocks and Resets](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/Clocks-and-Resets)。DMA、加速器和寄存器的组合是一个教学设计，不是每颗 Zynq 上电就自带的用户电路。

### 图里的每条连接，各解决什么问题？

| 连接 | 关系与作用 | 容易误解的地方 |
| --- | --- | --- |
| PS CPU → `M_AXI_GP0` → PL 控制寄存器 | 配置用户 IP 的参数、读状态、发启动命令 | 这里的“配置参数”不是加载 bitstream；`M` 表示 PS 侧是 AXI 主设备 |
| PL DMA → `S_AXI_HP0` → PS 内存通路 | PL 主动读写 DDR / OCM，用于大批量数据搬运 | `S` 表示 PS 接口是从设备，发请求的是 PL；数据可双向传输 |
| PL → `IRQ_F2P` → PS GIC | 报告任务完成或异常 | 中断线不承载整个结果数组 |
| PS → DevC / PCAP → PL 配置电路 | 加载 bitstream，建立或更新 PL 电路 | 专用配置路径与用户 IP 的 AXI 控制接口用途不同 |
| PS FCLK / 复位信号 → PL | 为用户逻辑提供可选时钟来源和复位控制 | 仍要正确设计时钟域与复位同步；PL 也可使用外部时钟与片内时钟资源 |
| PS 外设 → MIO 或 EMIO → 引脚 / PL | 连接硬核 UART、GPIO 等受支持外设 | EMIO 路经 PL，不意味着该硬核外设变成了 PL 中生成的软 IP |

Zynq-7000 的 PS 侧 AXI 接口基于 **AXI3**；图中用户 IP 可采用 AXI4-Lite 等接口，通过适当互连或协议转换连接。`GP`、`HP` 端口名与方向以 **PS 一侧** 为参照。具体接口规范与 MIO / EMIO 限制分别见 [UG585：AXI 接口表](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PS-PL-AXI-Interfaces)和 [I/O 外设连接](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/IOP-Interface-Connections)。

**共享 DDR 不等于自动 Cache 一致。** 本例的 HP 通路不经过 CPU 的一致性路径，驱动必须按平台要求处理 DMA 缓冲区的一致性与同步，例如使用操作系统 DMA API。Zynq-7000 还提供 ACP，可在正确的事务属性与系统配置下支持与 CPU Cache 一致的访问；它与 HP 是不同接口。不要把其他 Zynq 系列的端口名称和一致性机制直接套过来。[UG585：系统级内存访问路径](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/System-Level-View)、[ACP 使用方式](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/ACP-Usage)

### 再放大 PL：LUT、FF、DSP 与 BRAM 怎样配合？

PL 中的各组件通过可编程互连组成你的电路。下面用一个**把输入做乘加并暂存结果**的例子，画出数据和时钟的关系；它不是每个设计必须遵循的流水线。

<figure class="pl-datapath">
  <div class="pl-path-title"><strong>PL 内部的一条示例数据通路</strong><span>布局布线决定资源位置与实际线路</span></div>
  <div class="pl-path-stages">
    <div><b>输入接口</b><small>PL I/O 或 AXI 数据</small></div><span aria-hidden="true">→</span>
    <div><b>LUT + FF</b><small>选择 / 控制 / 暂存</small></div><span aria-hidden="true">→</span>
    <div><b>DSP + FF</b><small>乘加 / 流水寄存器</small></div><span aria-hidden="true">→</span>
    <div><b>BRAM</b><small>结果缓冲区</small></div><span aria-hidden="true">→</span>
    <div><b>输出接口</b><small>DMA 或 PL I/O</small></div>
  </div>
  <div class="pl-clock-path"><b>时钟网络 → 各时序单元</b><span>FF、DSP 的寄存器与 BRAM 端口按所连接的时钟工作；LUT 的组合逻辑在输入变化后传播结果。</span></div>
  <div class="pl-config-path"><b>配置 SRAM → 资源设置与互连选择</b><span>决定电路“怎样组成”；BRAM 和 FF 则可保存运行中的用户数据与状态。</span></div>
  <figcaption>一部分乘法也可能映射到 LUT；存储可以映射到 BRAM 或分布式 RAM。实际映射以综合与实现结果为准，原理依据 <a href="https://docs.amd.com/r/en-US/ug474_7Series_CLB/CLB-Overview">UG474 的逻辑块说明</a>与 <a href="https://docs.amd.com/r/2021.1-English/ug953-vivado-7series-libraries/DSP48E1">DSP48E1 原语说明</a>。</figcaption>
</figure>

### PS 上的软件、PL 的电路，各装入什么？

<div class="soc-build-paths">
  <div class="soc-build-path soc-build-path--ps"><strong>PS 软件路线</strong><p>C / C++ 等 → Arm 编译器与链接器 → ELF / 启动镜像中的软件 → CPU 从存储器取指执行</p><small>PS 的硬核 CPU 已经存在；程序与寄存器设置决定它执行什么、外设怎样工作。</small></div>
  <div class="soc-build-path soc-build-path--pl"><strong>PL 硬件路线</strong><p>Chisel / Verilog → 综合与布局布线 → bitstream → 配置 SRAM → 电路按时钟并行工作</p><small>实现加速器、控制逻辑或软核 CPU。软核 CPU 即使能运行程序，也仍然属于 PL。</small></div>
</div>

**“软核 CPU”不会把 PL 变成 PS。** 判断依据是硬件从哪里来：PS 的 Arm 核在芯片制造时已固定；在 PL 中实现的 RISC-V 或 MicroBlaze 使用可编程资源。相反，把 PS 的外设信号通过 EMIO 接到 PL 引脚，也不会把那个硬核外设变成软 IP。

对于 Zynq-7000，一个常见的非安全启动例子是：**PS 执行 BootROM → 从所选启动介质装入 FSBL → FSBL 初始化系统，并可选地通过 PCAP 配置 PL → 继续运行应用或后续引导程序。** PL 也可以稍后再配置；在相应供电与启动条件下，PS 软件可以在 PL 用户逻辑尚未配置时运行。这里的 FSBL 是第一阶段引导程序，BootROM 本身不负责把用户 bitstream 配入 PL。[UG585：PS 启动与可选 PL 配置](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PS-Bring-up-with-PL-Configuration-Example)、[PL 初始化与配置](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PL-Initialization-and-Configuration)

加载 PL 比特流的硬件路径和传输机制参见 [UG585：PCAP Bridge](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PCAP-Bridge-to-PL)及 [PL 配置方式](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/PL-Configuration-Considerations)。这与上一节普通 Artix-7 从配置 Flash 自主加载的例子不同，不能混用启动方案。

<h2 id="programming">07 · “烧录”到底烧到了哪里？</h2>

对常见的 SRAM 型 FPGA，需要区分两件事：

| 操作 | 发生了什么 | 断电后 |
| --- | --- | --- |
| 直接配置 FPGA | 常见做法是通过 JTAG 把配置数据加载到 FPGA 的配置存储器 | 当前配置丢失，下次上电需要重新加载 |
| 写入板上的配置 Flash | 把配置镜像保存到非易失存储器，配合正确启动模式，上电时再加载到 FPGA | Flash 中的镜像仍在，可供下次启动 |

所以“下载成功、LED 亮了”与“拔电重插后还能自动运行”是两个阶段。写 Flash 时，工具可能还需要把 bitstream 转成特定的存储镜像格式；不能只改文件后缀。器件架构和开发板启动方式不同，操作也会不同。[AMD 配置概述](https://docs.amd.com/r/en-US/ug570-ultrascale-configuration/Overview)、[AMD 配置流程说明](https://www.amd.com/content/dam/amd/en/documents/products/adaptive-socs-and-fpgas/vivado/configuration-flow-for-spartan-ultrascale-plus.pdf)

### 谁来“烧录”？一条链上有几个角色

写设计的人发起操作，**Vivado 负责生成配置文件，Hardware Manager / hw_server 负责组织下载，下载器负责传输，FPGA 内部的配置电路负责接收并配置芯片**。下载器不会把 Scala 源码变成电路；烧录时发送的是已经生成的配置数据。

<div class="program-paths">
  <div class="program-path"><strong>A / 调试：直接配置 FPGA</strong><p>电脑上的 .bit → Hardware Manager / hw_server → USB-JTAG 下载器 → FPGA 的 JTAG 端口与配置控制器 → 配置 SRAM</p><small>这里的 USB-JTAG 下载器可以是板载桥接芯片，也可以是外接下载线。配置进入易失存储器，断电后丢失。</small></div>
  <div class="program-path"><strong>B / 固化：把启动镜像写进 Flash</strong><p>电脑上的 .mcs / .bin → 下载器 → FPGA 中的临时 Flash 编程电路 → 板载 SPI / QSPI Flash</p><small>这是 Vivado 常用的间接编程路径。工具先给 FPGA 加载临时设计，再擦除、写入并校验 Flash。也可以使用板卡支持的独立 Flash 编程器。</small></div>
  <div class="program-path"><strong>C / 脱离电脑：上电自动配置</strong><p>供电与初始化 → 配置模式选择 → FPGA 配置控制器读取 Flash → 加载配置 SRAM → 完成启动 → 用户电路运行</p><small>以 Master SPI 模式为例，读取方是 FPGA 的专用配置电路，Flash 提供存储；电脑和 USB 下载器可以不参与。</small></div>
</div>

A、B 路径及板载桥的实际例子见 [Basys 3 手册的 FPGA Configuration 章节](https://digilent.com/reference/_media/reference/programmable-logic/basys-3/basys3_rm.pdf)。Master SPI 的配置模式与启动细节见 [AMD UG470：7 系列配置手册](https://docs.amd.com/api/khub/documents/FOs3lXmlcWxBhTIFxVKyGA/content)。这也是“空白 FPGA 怎么能读 Flash”的答案：最初的配置能力来自出厂已有的硬件，而非你的用户电路。

### 在 Vivado 里具体怎么操作？

**先做 JTAG 下载：**

1. 为准确的 FPGA 器件建立工程，加入生成的 HDL、依赖 IP、顶层模块和板卡 XDC。
2. 依次执行 **Run Synthesis → Run Implementation**，查看时序、约束与 DRC 报告，处理问题后 **Generate Bitstream**。
3. 板卡上电，连接正确的编程 USB 接口或外部 JTAG 下载器；确保对应驱动可用。
4. 进入 **Open Hardware Manager → Open Target → Auto Connect**，核对识别到的器件。
5. 选择 **Program Device**，指定本设计的 `.bit`，执行下载。若设计插入了 ILA/VIO 等调试核，还需匹配的探针信息，如 `.ltx`。
6. 检查配置状态，并实际验证 LED 或其他功能。配置完成不代表用户逻辑、复位和外部连线都正确。

**再做 Flash 固化：**

1. 查明 Flash 完整型号、容量、SPI 总线宽度、启动模式与镜像偏移，不能只选择“差不多大小”的型号。
2. 使用 **Generate Memory Configuration File**（Tcl 为 `write_cfgmem`）按板卡要求生成 `.mcs` 或 `.bin`，输入来源通常是已生成的 `.bit`；文件格式转换不是改后缀。
3. 在 Hardware Manager 的 FPGA 上选择 **Add Configuration Memory Device**，选中真实的 Flash 型号，再执行 **Program Configuration Memory Device**，按需擦除、写入和校验。
4. 按板卡手册设置 SPI 启动模式。断电重启，验证离开电脑后能自动运行。

界面名称以工具版本为准；操作和配置镜像生成参见 [AMD UG908：Programming and Debugging](https://docs.amd.com/r/2024.1-English/ug908-vivado-programming-debugging)和 [添加配置存储器](https://docs.amd.com/r/2020.2-English/ug908-vivado-programming-debugging/Adding-a-Configuration-Memory-Device)。这里不填写具体管脚、Flash 型号和镜像偏移，因为它们需要由实际开发板确定。

### `.bit`、`.bin`、`.mcs` 和 `.elf` 有什么不同？

| 文件 | 典型作用 | 不能误解成什么 |
| --- | --- | --- |
| `.v` / `.sv` | Verilog / SystemVerilog 电路描述 | 不能直接交给 JTAG 当配置数据 |
| `.xdc` | 引脚、电气和时序等约束 | 不包含真正的晶振或硬件 |
| `.dcp` | Vivado 设计检查点，用于保存或复用某阶段设计 | 不是板卡的启动镜像 |
| `.bit` | 常见 FPGA 配置比特流文件 | 不是 CPU 的机器指令，也不表示已写入 Flash |
| `.bin` / `.mcs` | 按工具与启动方案生成的二进制 / Intel HEX 格式配置存储镜像 | 文件后缀本身不保证镜像适合当前板卡 |
| `.elf` | CPU 软件的可执行文件，适用于硬核或软核处理器 | 单靠它不能描述整颗 FPGA 的逻辑与布线 |

在包含 CPU 的设计里，bitstream 配置 CPU 及其外围硬件，软件工具链生成供 CPU 执行的程序。程序可以通过调试器加载、由启动流程加载，或按工程方案放入初始化存储器；这些是另一层的数据与启动关系。更换到 Versal 等架构时，还会遇到 PDI 等镜像格式，不能把所有 AMD 器件都简化成同一种 `.bit` 流程。[AMD UG908 文件与编程流程](https://docs.amd.com/r/2024.1-English/ug908-vivado-programming-debugging)

<h2 id="tools">08 · 实际会用到哪些工具？</h2>

| 环节 | 工具例子 | 主要产物 |
| --- | --- | --- |
| Chisel 生成 HDL | Scala CLI / Mill / sbt，配合 Chisel 和 firtool | SystemVerilog 文件 |
| 仿真 | Verilator，或厂商配套仿真工具 | 仿真结果、波形 |
| 面向受支持的 AMD/Xilinx FPGA 实现 | Vivado | 例如 `.bit`；具体器件可能采用其他配置镜像 |
| 面向受支持的 Altera FPGA 实现 | Quartus Prime | 例如 `.sof`，其他编程文件按器件与配置方式选择 |

Vivado 中常见流程是 **Run Synthesis → Run Implementation → Generate Bitstream → Hardware Manager 下载**。Quartus 中对应会看到 **Analysis & Synthesis → Fitter → Assembler → Programmer**，并配合时序分析。工具支持哪些器件、需要什么版本，应根据芯片型号查询。[Vivado 操作流程](https://docs.amd.com/r/2022.2-English/ug893-vivado-ide/Running-RTL-Analysis-Synthesis-Implementation-and-Bitstream-Generation)、[Quartus 官方介绍](https://www.altera.com/products/development-tools/quartus)、[Quartus 编程文件生成说明](https://www.intel.com/content/www/us/en/docs/programmable/683562/23-2/generation-of-device-programming-files.html)

<h2 id="practice">09 · 第一次动手可以怎么走？</h2>

建议把第一个小目标定成：**用 Chisel 写计数器，让一颗 LED 慢慢闪烁。**

1. 找到开发板型号、FPGA 完整型号、用户手册和板厂约束文件，确认时钟与 LED 的连接。
2. 先在电脑上生成计数器的 SystemVerilog，观察它和 Chisel 的对应关系。
3. 做功能仿真，检查复位、递增和回绕。
4. 加入适合板子的顶层连接。前面的 8 位计数器只是教学示例：100 MHz 下变化太快，人眼看不出闪烁。可改用 27 位计数器并输出第 26 位，LED 完整明灭周期约为 `2^27 / 100,000,000 ≈ 1.34 秒`。
5. 接好实际时钟、复位和 LED，按板子情况处理复位极性、按键同步及 LED 极性，并填写约束。这里的 LED 输出只用于点灯，不拿它当其他逻辑的时钟。
6. 用对应 FPGA 工具综合、布局布线、检查并生成配置文件，先下载到 FPGA 观察效果。
7. 需要上电自动运行时，再按开发板手册写入配置 Flash 并选择启动模式。

上面的频率和闪烁周期是示例计算。没有具体开发板信息时，无法给出可直接烧录的完整工程、真实管脚或 bitstream；本文完成的是流程调研与原理说明。

### 一个 27 位计数器，怎么对应到 LED？

原文的 8 位计数器适合观察波形；若目标是 100 MHz 下肉眼可见的闪烁，可以把主体改成下面的 Chisel。它仍需要带 Chisel 依赖与插件的工程，以及实际板卡的顶层和约束。

```scala
class Blinker extends Module {
  val io = IO(new Bundle {
    val led = Output(Bool())
  })
  val counter = RegInit(0.U(27.W))
  counter := counter + 1.U
  io.led := counter(26)
}
```

第 26 位每 `2^26` 个周期翻转一次，完整明灭周期为 `2^27 / 100 MHz ≈ 1.342 s`，约 `0.745 Hz`。这些值取决于真实时钟。低有效 LED 需要在板级适配中反相；异步外部按键需要同步，按需求去抖；复位的极性与释放方式也要明确。用时钟使能控制慢速逻辑通常比把计数器位直接当新时钟更容易管理时序。

建议在仿真中使用可参数化的小位宽加速检查，验证复位、回绕与输出位的关系；上板再选用实际位宽。这里提供的是教学代码，**未执行 Chisel 编译、HDL 仿真或 FPGA 上板验证**。

### 上板不工作，从哪里查？

| 现象 | 优先检查 |
| --- | --- |
| Hardware Manager 看不到器件 | 板卡电源、是否插对编程接口、USB 线的数据能力、驱动、JTAG 链与 hw_server 连接 |
| 综合后逻辑几乎没有了 | 顶层是否选对、输出是否接出、状态是否被常量约束或优化掉 |
| 时序不满足 | 实际时钟与约束是否一致、是否有未约束路径、组合路径长度、跨时钟域处理；必要时插流水线 |
| 下载成功但 LED 不闪 | 管脚与 LED 极性、时钟是否存在、复位是否一直有效、输出位与计数器周期 |
| JTAG 能运行，重启却不行 | 是否只配置了 SRAM、Flash 是否正确写入和校验、启动模式、镜像偏移、总线宽度与配置参数 |

这些排查项由前述配置、时序和板级连接关系归纳，不能替代特定开发板的诊断步骤。

<h2 id="faq">10 · 几个容易混淆的地方</h2>

- **Chisel 生成 Verilog 后，还需要 FPGA 工具吗？** 需要。常见 Chisel 流程到 HDL 为止，具体器件的综合、布局布线和配置文件生成由后续工具完成。
- **必须用 Chisel 吗？** 可以直接写 Verilog/SystemVerilog，从流程图中间进入。Chisel 的价值在于用 Scala 的参数化和抽象能力构造、复用电路。
- **Verilog 能仿真就能上板吗？** 不一定。测试平台中的 `#10` 这类仿真延时不能直接当作通用可综合的硬件等待指令；真实硬件里的定时通常要用时钟和计数器实现。
- **循环是不是每个时钟执行一次？** 描述硬件的循环常用于展开结构。跨多个时钟工作的行为必须有相应的状态和控制电路。
- **能像普通程序那样下载一个通用可执行文件吗？** bitstream 与具体 FPGA 实现相关；若设计中包含 CPU，该 CPU 使用的软件可执行文件又有自己的编译和加载流程。

进一步阅读可以从 [Chisel 官方入门](https://www.chisel-lang.org/docs)、[CIRCT 的 Verilog 生成说明](https://circt.llvm.org/docs/VerilogGeneration/)和 [AMD FPGA 设计流程课程](https://www.amd.com/en/corporate/university-program/vivado/vivado-workshops/vivado-fpga-design-flow.html)开始。

<h2 id="sources">11 · 来源与阅读顺序</h2>

PS / PL 关系与接口核对依据为 AMD UG585（1.15，2026-02-06）。本节关系图针对 Zynq-7000；其他 Zynq、Versal 或厂商器件需要使用各自的架构文档。

本文迁入本地 `chisel/README.md`（2026-09-26 版本）的全部八节知识内容，保留计数器、工具对照和上板练习，改为网页流程图，并补充 FPGA 组成、烧录角色、文件格式和排查路线。下列官方资料用来核对新增技术说明。

1. [Chisel 官方文档](https://www.chisel-lang.org/docs)、[安装说明](https://www.chisel-lang.org/docs/installation)与 [ChiselStage API](https://www.chisel-lang.org/api/latest/circt/stage/ChiselStage%24.html)：先理解电路构造与 HDL 生成。
2. [Chisel 版本匹配规则](https://www.chisel-lang.org/docs/appendix/versioning)与 [CIRCT Verilog 生成](https://circt.llvm.org/docs/VerilogGeneration/)：遇到旧示例或编译问题时阅读；项目应固定相容的 Scala、Chisel、插件与 firtool 版本。
3. [AMD UG474](https://docs.amd.com/r/en-US/ug474_7Series_CLB/CLB-Overview)与 [DS180](https://docs.amd.com/api/khub/documents/2LByHkO~nSZXcei2D55fTg/content)：查逻辑资源组织与具体器件配置。
4. [AMD UG470](https://docs.amd.com/api/khub/documents/FOs3lXmlcWxBhTIFxVKyGA/content)与 [UG908](https://docs.amd.com/r/2024.1-English/ug908-vivado-programming-debugging)：查配置模式、比特流与 Flash 编程。
5. [Digilent Basys 3 手册](https://digilent.com/reference/_media/reference/programmable-logic/basys-3/basys3_rm.pdf)：用一块实际 Artix-7 开发板理解 USB-JTAG、Flash、跳线和 FPGA 的连接。

6. [AMD UG585：Zynq-7000 技术参考手册](https://docs.amd.com/r/en-US/ug585-zynq-7000-SoC-TRM/Overview)：核对 PS / PL 边界、AXI 连接、DDR 访问、MIO / EMIO 与 PCAP 配置；文中给出了各主题的直接链接。

<div class="guide-end"><strong>第一次实践的目标</strong><p>先让一颗 LED 按预期闪烁，再让它在断电重启后自动闪烁。前一步串起硬件设计流程，后一步补齐非易失存储与启动流程。</p><a href="/#library">返回技术笔记 →</a></div>
