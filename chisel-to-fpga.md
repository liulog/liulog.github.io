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
  - { id: programming, title: "06 · 谁来烧录，烧到哪里" }
  - { id: tools, title: "07 · 工具与产物" }
  - { id: practice, title: "08 · 第一次点亮 LED" }
  - { id: faq, title: "09 · 常见问题" }
  - { id: sources, title: "10 · 来源与延伸阅读" }
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

<h2 id="programming">06 · “烧录”到底烧到了哪里？</h2>

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

<h2 id="tools">07 · 实际会用到哪些工具？</h2>

| 环节 | 工具例子 | 主要产物 |
| --- | --- | --- |
| Chisel 生成 HDL | Scala CLI / Mill / sbt，配合 Chisel 和 firtool | SystemVerilog 文件 |
| 仿真 | Verilator，或厂商配套仿真工具 | 仿真结果、波形 |
| 面向受支持的 AMD/Xilinx FPGA 实现 | Vivado | 例如 `.bit`；具体器件可能采用其他配置镜像 |
| 面向受支持的 Altera FPGA 实现 | Quartus Prime | 例如 `.sof`，其他编程文件按器件与配置方式选择 |

Vivado 中常见流程是 **Run Synthesis → Run Implementation → Generate Bitstream → Hardware Manager 下载**。Quartus 中对应会看到 **Analysis & Synthesis → Fitter → Assembler → Programmer**，并配合时序分析。工具支持哪些器件、需要什么版本，应根据芯片型号查询。[Vivado 操作流程](https://docs.amd.com/r/2022.2-English/ug893-vivado-ide/Running-RTL-Analysis-Synthesis-Implementation-and-Bitstream-Generation)、[Quartus 官方介绍](https://www.altera.com/products/development-tools/quartus)、[Quartus 编程文件生成说明](https://www.intel.com/content/www/us/en/docs/programmable/683562/23-2/generation-of-device-programming-files.html)

<h2 id="practice">08 · 第一次动手可以怎么走？</h2>

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

<h2 id="faq">09 · 几个容易混淆的地方</h2>

- **Chisel 生成 Verilog 后，还需要 FPGA 工具吗？** 需要。常见 Chisel 流程到 HDL 为止，具体器件的综合、布局布线和配置文件生成由后续工具完成。
- **必须用 Chisel 吗？** 可以直接写 Verilog/SystemVerilog，从流程图中间进入。Chisel 的价值在于用 Scala 的参数化和抽象能力构造、复用电路。
- **Verilog 能仿真就能上板吗？** 不一定。测试平台中的 `#10` 这类仿真延时不能直接当作通用可综合的硬件等待指令；真实硬件里的定时通常要用时钟和计数器实现。
- **循环是不是每个时钟执行一次？** 描述硬件的循环常用于展开结构。跨多个时钟工作的行为必须有相应的状态和控制电路。
- **能像普通程序那样下载一个通用可执行文件吗？** bitstream 与具体 FPGA 实现相关；若设计中包含 CPU，该 CPU 使用的软件可执行文件又有自己的编译和加载流程。

进一步阅读可以从 [Chisel 官方入门](https://www.chisel-lang.org/docs)、[CIRCT 的 Verilog 生成说明](https://circt.llvm.org/docs/VerilogGeneration/)和 [AMD FPGA 设计流程课程](https://www.amd.com/en/corporate/university-program/vivado/vivado-workshops/vivado-fpga-design-flow.html)开始。

<h2 id="sources">10 · 来源与阅读顺序</h2>

本文迁入本地 `chisel/README.md`（2026-09-26 版本）的全部八节知识内容，保留计数器、工具对照和上板练习，改为网页流程图，并补充 FPGA 组成、烧录角色、文件格式和排查路线。下列官方资料用来核对新增技术说明。

1. [Chisel 官方文档](https://www.chisel-lang.org/docs)、[安装说明](https://www.chisel-lang.org/docs/installation)与 [ChiselStage API](https://www.chisel-lang.org/api/latest/circt/stage/ChiselStage%24.html)：先理解电路构造与 HDL 生成。
2. [Chisel 版本匹配规则](https://www.chisel-lang.org/docs/appendix/versioning)与 [CIRCT Verilog 生成](https://circt.llvm.org/docs/VerilogGeneration/)：遇到旧示例或编译问题时阅读；项目应固定相容的 Scala、Chisel、插件与 firtool 版本。
3. [AMD UG474](https://docs.amd.com/r/en-US/ug474_7Series_CLB/CLB-Overview)与 [DS180](https://docs.amd.com/api/khub/documents/2LByHkO~nSZXcei2D55fTg/content)：查逻辑资源组织与具体器件配置。
4. [AMD UG470](https://docs.amd.com/api/khub/documents/FOs3lXmlcWxBhTIFxVKyGA/content)与 [UG908](https://docs.amd.com/r/2024.1-English/ug908-vivado-programming-debugging)：查配置模式、比特流与 Flash 编程。
5. [Digilent Basys 3 手册](https://digilent.com/reference/_media/reference/programmable-logic/basys-3/basys3_rm.pdf)：用一块实际 Artix-7 开发板理解 USB-JTAG、Flash、跳线和 FPGA 的连接。

<div class="guide-end"><strong>第一次实践的目标</strong><p>先让一颗 LED 按预期闪烁，再让它在断电重启后自动闪烁。前一步串起硬件设计流程，后一步补齐非易失存储与启动流程。</p><a href="/#library">返回技术笔记 →</a></div>
