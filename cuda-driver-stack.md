---
layout: default
title: NVIDIA CUDA 软件栈与 GPU 内存管理
description: 从 GHost in the Shell 的背景出发，梳理 PyTorch、Triton、cuDNN、CUDA 运行时、Linux 驱动和 GPU 的分工，并解释 HMM 如何改变访存路径。
article: true
toc: true
page_class: cuda-guide
sections:
  - { id: stack, title: "CUDA 软件栈的五层" }
  - { id: ecosystem, title: "PyTorch 怎样接到 CUDA" }
  - { id: api, title: "Runtime API 与 Driver API" }
  - { id: launch, title: "一次 GPU kernel launch" }
  - { id: memory, title: "UVA、Unified Memory 与 HMM" }
  - { id: packages, title: "Toolkit 与驱动如何分发" }
  - { id: paper, title: "回到论文的背景" }
---

<header class="guide-hero">
  <h1>NVIDIA CUDA 软件栈与 GPU 内存管理</h1>
  <p>从 CPU 上的一次 CUDA 调用出发，追踪请求如何经过 <code>libcudart</code>、<code>libcuda</code> 和 Linux 内核驱动，最终由 GPU 执行。再用这条路径理解 HMM 改变了什么。</p>
</header>

*GHost in the Shell* 的 §2 按主机程序、CUDA Runtime、GPU 驱动和 GPU kernel 来介绍软件栈。其中的 `libcuda-rt` 指 CUDA Runtime，实际库名通常写作 `libcudart`。把论文合称的 GPU driver 再拆成用户态的 `libcuda` 和内核态驱动，就能看清 API 边界、操作系统权限边界和设备执行边界。 [论文 §2.1](https://leeyoochan.github.io/assets/pdf/ghost_SP_2026.pdf#page=1) · [NVIDIA CUDA 平台](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html)

<h2 id="stack">CUDA 软件栈的五层</h2>

下面以原生 Linux 上的 NVIDIA CUDA 为例。两条主机调用路径共享同一套 CUDA Driver API 和底层驱动。一部分代码通过 Runtime API 发起工作，另一部分可以直接调用 Driver API。

<figure class="cuda-diagram cuda-stack" aria-labelledby="cuda-stack-caption">
  <figcaption id="cuda-stack-caption">CUDA 调用如何从应用抵达 GPU</figcaption>
  <div class="cuda-plane cuda-plane--user">
    <h3>CPU 用户态</h3>
    <div class="cuda-plane-body">
      <div class="cuda-node cuda-node--wide"><strong>应用、框架与计算库</strong><small>如 PyTorch 和 cuBLAS</small></div>
      <div class="cuda-split">
        <div class="cuda-branch">
          <div class="cuda-node cuda-node--accent"><strong><code>libcudart</code></strong><small>Runtime API · <code>cuda*</code></small></div>
        </div>
        <div class="cuda-branch">
          <div class="cuda-node cuda-node--dashed"><strong>直接调用</strong><small>Driver API · <code>cu*</code></small></div>
        </div>
      </div>
      <div class="cuda-node cuda-node--wide cuda-node--accent"><strong><code>libcuda.so</code></strong><small>用户态驱动 · CUDA Driver API</small></div>
    </div>
  </div>
  <span class="cuda-down" aria-hidden="true"></span>
  <div class="cuda-plane cuda-plane--kernel">
    <h3>CPU 内核态</h3>
    <div class="cuda-node cuda-node--wide"><strong>NVIDIA Linux 驱动</strong><small><code>nvidia.ko</code> · <code>nvidia-uvm.ko</code></small></div>
  </div>
  <span class="cuda-down" aria-hidden="true"></span>
  <div class="cuda-plane cuda-plane--device">
    <h3>GPU 设备端</h3>
    <div class="cuda-node cuda-node--wide"><strong>GPU kernel</strong><small>线程按网格执行设备代码</small></div>
  </div>
</figure>

| 层 | 职责 | 常见接口或组件 |
| --- | --- | --- |
| 主机应用和计算库 | 选择运算、组织输入输出、提交 GPU 工作。cuBLAS 等库提供面向运算的接口，并在内部调用设备代码 | PyTorch、cuBLAS、cuDNN |
| CUDA Runtime | 为常见操作提供较高层的接口，处理多数应用所需的上下文选择与设备代码加载 | `libcudart`、`cudaMalloc`、`cudaMemcpy` |
| 用户态 CUDA Driver | 在主机进程里提供较低层的 Driver API，让程序显式控制上下文、模块、函数和执行队列 | `libcuda.so`、`cuModuleLoad`、`cuLaunchKernel` |
| Linux 内核驱动 | 提供底层 GPU 访问，并协同 Linux 管理设备和内存。UVM 内核模块支持 CPU 与 GPU 间的内存共享 | `nvidia.ko`、`nvidia-uvm.ko` |
| GPU 设备代码 | 在 GPU 上按网格执行线程，处理数据并产生结果 | CUDA C++ 的 `__global__` 函数 |

GPU kernel 是 GPU 上执行的计算函数。Linux kernel 是 CPU 上执行的操作系统内核。源码里讨论 CUDA kernel 的线程、网格和 block 时，指的是第一种。 [CUDA C++ 入门](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/intro-to-cuda-cpp.html) · [NVIDIA Linux 驱动组件](https://download.nvidia.com/XFree86/Linux-x86_64/595.71.05/README/installedcomponents.html)

<h2 id="ecosystem">PyTorch 怎样接到 CUDA</h2>

**PyTorch 负责张量、算子和模型执行，CUDA 平台提供在 NVIDIA GPU 上运行这些工作的编程模型、工具链和驱动接口。** 例如，同一段训练代码可能先调用 cuDNN 做卷积，再运行 Triton 生成的计算 kernel，最后用 NCCL 做梯度归约。每一步选用哪个实现，由算子、输入、硬件和软件配置决定。 [PyTorch 编译器](https://docs.pytorch.org/docs/2.15/user_guide/torch_compiler/torch.compiler.html) · [NVIDIA cuDNN 集成说明](https://docs.nvidia.com/cudnn/overview/) · [NVIDIA NCCL](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/overview.html)

<figure class="cuda-diagram cuda-ecosystem" aria-labelledby="cuda-ecosystem-caption">
  <figcaption id="cuda-ecosystem-caption">PyTorch 在 NVIDIA GPU 上的常见执行路径</figcaption>
  <div class="cuda-ecosystem-root cuda-node cuda-node--wide"><strong>PyTorch</strong><small>张量算子、模型和分布式训练</small></div>
  <span class="cuda-down cuda-down--center" aria-hidden="true"></span>
  <div class="cuda-ecosystem-routes">
    <section class="cuda-ecosystem-route cuda-ecosystem-route--native">
      <h3>框架内置算子</h3>
      <p>eager 算子分派</p>
      <div class="cuda-node"><strong>ATen CUDA kernel</strong><small>例如逐元素计算</small></div>
    </section>
    <section class="cuda-ecosystem-route cuda-ecosystem-route--library">
      <h3>厂商计算库</h3>
      <p>合适的算子可调用库</p>
      <div class="cuda-node"><strong>cuDNN · cuBLAS(Lt)</strong><small>卷积、注意力、矩阵乘法等</small></div>
    </section>
    <section class="cuda-ecosystem-route cuda-ecosystem-route--compiler">
      <h3>编译生成 kernel</h3>
      <p><code>torch.compile</code> 经 TorchInductor</p>
      <div class="cuda-node"><strong>Triton · CUTLASS</strong><small>例如融合算子或矩阵乘法候选</small></div>
    </section>
    <section class="cuda-ecosystem-route cuda-ecosystem-route--communication">
      <h3>多 GPU 通信</h3>
      <p><code>torch.distributed</code></p>
      <div class="cuda-node"><strong>NCCL</strong><small>例如 AllReduce</small></div>
    </section>
  </div>
  <span class="cuda-down cuda-down--center" aria-hidden="true"></span>
  <div class="cuda-ecosystem-root cuda-node cuda-node--wide cuda-node--accent"><strong>CUDA 主机接口</strong><small>按路径使用 <code>libcudart</code> 或 <code>libcuda.so</code></small></div>
  <span class="cuda-down cuda-down--center" aria-hidden="true"></span>
  <div class="cuda-ecosystem-root cuda-node cuda-node--wide"><strong>NVIDIA Linux 驱动</strong><small>将工作交给 GPU 执行</small></div>
</figure>

**Triton 是用于编写和生成 GPU kernel 的语言与编译器。** `torch.compile` 默认使用 TorchInductor，后者可以用 Triton 生成 GPU kernel，也可以保留对已有实现的调用。以矩阵乘法为例，Inductor 在适用的配置下可以比较 Triton、ATen／cuBLAS 等候选。PyTorch 的 profiling 文档以 `cuLaunchKernel` 举例说明 Inductor 生成的 Triton kernel 在 NVIDIA GPU 上的典型提交路径。 [Triton 文档](https://triton-lang.org/main/index.html) · [TorchInductor 的 GEMM 后端](https://pytorch.org/blog/gemms-torchinductor-cutedsl-backend/) · [PyTorch 的 kernel launch profiling](https://docs.pytorch.org/docs/2.15/user_guide/torch_compiler/torch.compiler_profiling_torch_compile.html)

| 组件 | 看到这个名字时，通常是哪类工作 |
| --- | --- |
| cuDNN | 执行面向深度学习的优化计算，例如卷积、注意力和归一化。 [NVIDIA cuDNN](https://docs.nvidia.com/cudnn/overview/) |
| cuBLAS / cuBLASLt | 执行稠密线性代数。cuBLASLt 聚焦可配置的矩阵乘法。 [NVIDIA cuBLAS](https://docs.nvidia.com/cuda/cublas/) |
| CUTLASS / CuTe DSL | 提供构建矩阵乘法等 GPU kernel 的模板与抽象，可用于开发或生成具体实现。 [NVIDIA CUTLASS](https://docs.nvidia.com/cutlass/latest/overview.html) |
| NCCL | 提供 GPU 间通信原语，例如 AllReduce 和 AllGather，可由 PyTorch 分布式后端调用。 [PyTorch 分布式文档](https://docs.pytorch.org/docs/2.15/distributed.html) · [NVIDIA NCCL](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/overview.html) |
| cuFFT / cuSPARSE | 分别面向快速傅里叶变换和稀疏线性代数。 [NVIDIA CUDA 库文档](https://docs.nvidia.com/cuda-libraries/index.html) |

<h2 id="api">Runtime API 与 Driver API</h2>

两套 API 都能分配内存、提交 kernel 和等待结果。它们提供了不同程度的资源控制。CUDA **context** 承载设备地址空间和已加载模块等资源。**module** 是加载到 context 中的设备代码和相关符号。**stream** 表示 GPU 工作的有序队列。 [NVIDIA Driver API](https://docs.nvidia.com/cuda/cuda-programming-guide/03-advanced/driver-api.html) · [Runtime 与 Driver API 的区别](https://docs.nvidia.com/cuda/archive/13.1.2/cuda-runtime-api/driver-vs-runtime-api.html)

| 操作 | Runtime API · `libcudart` | Driver API · `libcuda` |
| --- | --- | --- |
| 初始化和选择上下文 | 应用通常用 `cudaSetDevice` 选择设备。Runtime 通常使用设备在本进程中的 primary context | `cuInit` 初始化 Driver API，可用 `cuDevicePrimaryCtxRetain` 获取 primary context，也可以显式创建、切换上下文 |
| 分配设备内存 | `cudaMalloc` | `cuMemAlloc` |
| 取得 GPU 函数 | 由 Runtime 与编译器生成的主机端代码配合处理 | 典型流程使用 `cuModuleLoad` 和 `cuModuleGetFunction` |
| 提交 GPU 工作 | CUDA C++ 的 `kernel<<<grid, block>>>(...)` 或 `cudaLaunchKernel` | `cuLaunchKernel`，显式传入函数句柄、执行配置和参数 |
| 等待同一个 stream 中已提交的工作 | `cudaStreamSynchronize` | `cuStreamSynchronize` |

两套 API 可以在同一程序中互操作。如果调用线程已通过 Driver API 设定当前 context，Runtime 通常会沿用它。这样，上层库选择 Runtime API 时，外层应用仍可管理双方共同使用的 context。 [CUDA Driver API 的互操作说明](https://docs.nvidia.com/cuda/cuda-programming-guide/03-advanced/driver-api.html)

<h2 id="launch">一次 GPU kernel launch</h2>

以向量加法为例。运行前，`nvcc` 可以把主机代码交给主机编译器，把设备代码编译为 PTX 和／或面向特定 GPU 的 cubin，再把设备部分嵌入主机产物。**PTX** 是虚拟指令集表示。运行时需要根据目标 GPU 装载兼容的设备二进制，或者由驱动把 PTX 即时编译成设备机器码。 [NVCC 的 CUDA 编译流程](https://docs.nvidia.com/cuda/cuda-compiler-driver-nvcc/index.html) · [NVIDIA 驱动的 PTX JIT 组件](https://download.nvidia.com/XFree86/Linux-x86_64/595.71.05/README/installedcomponents.html)

<figure class="cuda-diagram" aria-labelledby="cuda-launch-caption">
  <figcaption id="cuda-launch-caption">主机发起 launch 后，CPU 和 GPU 怎样推进</figcaption>
  <div class="cuda-sequence">
    <div class="cuda-lane cuda-lane--host">CPU 主机线程</div>
    <span aria-hidden="true"></span>
    <div class="cuda-lane cuda-lane--device">GPU stream</div>
    <div class="cuda-node"><strong>准备输入</strong><small><code>cudaMalloc</code> 和 <code>cudaMemcpy</code></small></div>
    <span class="cuda-across" aria-hidden="true">→</span>
    <div class="cuda-node"><strong>设备缓冲区就绪</strong><small>存放输入向量</small></div>
    <div class="cuda-node cuda-node--accent"><strong>提交 kernel</strong><small><code>&lt;&lt;&lt;grid, block&gt;&gt;&gt;</code></small></div>
    <span class="cuda-across" aria-hidden="true">→</span>
    <div class="cuda-node cuda-node--accent"><strong>工作进入 stream</strong><small>按 stream 的顺序执行</small></div>
    <div class="cuda-node"><strong>主机线程可继续执行</strong><small>launch 异步返回</small></div>
    <span aria-hidden="true"></span>
    <div class="cuda-node"><strong>GPU 线程并行计算</strong><small>例如逐元素计算向量和</small></div>
    <div class="cuda-node"><strong>等待并读取结果</strong><small>例如同步后拷回输出</small></div>
    <span class="cuda-across" aria-hidden="true">←</span>
    <div class="cuda-node"><strong>设备端结果就绪</strong><small>写入输出缓冲区</small></div>
  </div>
</figure>

1. **准备数据。** 主机程序用 `cudaMalloc` 分配设备缓冲区，再用 `cudaMemcpy` 拷入输入向量。Runtime 将请求交给 CUDA Driver 层处理。
2. **提交计算。** 主机线程通过 `<<<grid, block>>>` 发起 launch。编译器生成的主机端代码与 Runtime 一起提交函数、参数、网格大小等信息。用户态驱动和内核驱动协作，让 GPU 在对应的执行环境里运行设备代码。
3. **读取结果。** GPU 线程并行计算输出。Launch 通常异步返回，主机在选定的同步点等待，或使用具有相应同步语义的数据传输，再读取结果。 [论文 §2.2](https://leeyoochan.github.io/assets/pdf/ghost_SP_2026.pdf#page=2) · [CUDA C++ 的执行与异步错误](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/intro-to-cuda-cpp.html)

这条路径里，CPU 在调用 API、管理资源和提交命令，GPU 在执行算法。理解二者的分工后，还需要单独判断 GPU 运行时可以访问哪些地址。

<h2 id="memory">UVA、Unified Memory 与 HMM</h2>

**UVA（Unified Virtual Addressing）** 让主机内存和不同 GPU 的内存在一个进程的统一虚拟地址布局中占用不同区间。地址值可以用于辨别分配的位置。某段内存能否被 CPU 或某个 GPU 解引用，取决于该分配的类型、可用映射和平台能力。 [NVIDIA Unified and System Memory](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/understanding-memory.html)

<figure class="cuda-diagram" aria-labelledby="cuda-memory-caption">
  <figcaption id="cuda-memory-caption">从主机数据到 GPU 的三条内存路径</figcaption>
  <div class="cuda-memory">
    <section class="cuda-memory-route cuda-memory-route--copy">
      <h3>显式拷贝</h3>
      <div class="cuda-node"><strong>CPU 主机缓冲区</strong><small><code>malloc</code></small></div>
      <div class="cuda-memory-flow"><span aria-hidden="true">↓</span><code>cudaMemcpy</code></div>
      <div class="cuda-node"><strong>GPU 设备缓冲区</strong><small><code>cudaMalloc</code></small></div>
      <p>GPU 使用设备指针，CPU 和 GPU 各有缓冲区。</p>
    </section>
    <section class="cuda-memory-route cuda-memory-route--managed">
      <h3>显式托管内存</h3>
      <div class="cuda-node"><strong>CPU 和 GPU 共用指针</strong><small>双方访问同一块托管内存</small></div>
      <div class="cuda-memory-flow"><span aria-hidden="true">↕</span>驱动按平台放置或迁移</div>
      <div class="cuda-node"><strong>CUDA 托管分配</strong><small><code>cudaMallocManaged</code></small></div>
      <p>应用通过 CUDA API 指定托管分配。</p>
    </section>
    <section class="cuda-memory-route cuda-memory-route--hmm">
      <h3>HMM 下的系统分配</h3>
      <div class="cuda-node"><strong>CPU 上的普通系统分配</strong><small><code>malloc</code>、<code>new</code>、<code>mmap</code></small></div>
      <div class="cuda-memory-flow"><span aria-hidden="true">↕</span>HMM 与驱动维护映射</div>
      <div class="cuda-node"><strong>GPU 使用原主机指针</strong><small>支持 HMM 的平台</small></div>
      <p>适用的系统分配自动具备 Unified Memory 语义。</p>
    </section>
  </div>
</figure>

| 内存使用方式 | 应用做什么 | 地址如何使用 |
| --- | --- | --- |
| 设备缓冲区与显式拷贝 | 主机以 `malloc` 分配输入，以 `cudaMalloc` 分配设备缓冲区，再显式拷贝 | CPU 读取主机缓冲区，GPU kernel 使用设备指针 |
| 显式映射的页锁定主机内存 | 例如注册已有主机缓冲区，并在支持的条件下将其映射给设备 | GPU 可以访问已映射的主机分配 |
| 显式 Unified Memory | 应用用 `cudaMallocManaged` 分配托管内存 | CPU 和 GPU 可使用相同指针，驱动按平台能力处理放置、迁移或访问 |
| HMM 环境下的系统分配 | 支持完整软件一致性 Unified Memory 的 Linux 环境可以直接使用普通系统分配，例如 `malloc`、`new`、`mmap` | 适用的主机分配可以直接传给 GPU kernel，设备侧访问依赖驱动与操作系统建立、维护映射 |

**Unified Memory 是 CUDA 提供的内存语义，Linux HMM（Heterogeneous Memory Management）是实现完整 Unified Memory 的一种内核机制。** HMM 为驱动镜像进程地址空间、跟踪 CPU 映射变化和迁移页面提供基础设施。GPU 缺少所需的设备侧映射时，可由驱动结合 Linux 内存管理处理缺页，再建立相应映射。支持硬件一致性的 CUDA 平台还可以借助 ATS 提供对普通系统分配的访问。 **程序仍需按 stream、事件或同步 API 的规则协调 CPU 与 GPU 的读写顺序。** [Linux HMM](https://docs.kernel.org/mm/hmm.html) · [NVIDIA Unified Memory](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/unified-memory.html)

<h2 id="packages">Toolkit 与驱动如何分发</h2>

| 常见名字 | 通常来自哪里 | 用来做什么 |
| --- | --- | --- |
| `libcudart.so`、`libcudart_static.a` | CUDA Toolkit 或应用随附的运行时依赖 | 运行 Runtime API。Linux 支持共享和静态链接 |
| `libcuda.so` | NVIDIA 驱动的用户态组件 | 在主机进程中提供 Driver API |
| `nvidia.ko`、`nvidia-uvm.ko` | NVIDIA Linux 驱动的内核态组件 | 设备访问以及统一内存相关支持 |
| `nvcc`、`libnvrtc` | CUDA Toolkit | `nvcc` 编译 CUDA 源码，NVRTC 供程序在运行时编译 CUDA C++ |

论文描述的是动态链接 Runtime 的路径。在 Linux 上，`nvcc` 的 `--cudart` 选项还支持静态版本，默认也是静态 Runtime。若产物把 `libcudart.so` 作为直接共享库依赖，动态依赖表才会列出它。Toolkit 和 NVIDIA 驱动也各有版本，部署时按官方兼容规则判断组合。 [NVCC 的 Runtime 链接选项](https://docs.nvidia.com/cuda/cuda-compiler-driver-nvcc/index.html) · [NVRTC 用户指南](https://docs.nvidia.com/cuda/nvrtc/) · [NVIDIA 驱动组件的分发](https://docs.nvidia.com/datacenter/tesla/drivers/latest/software-deployment-workflow.html) · [CUDA 兼容性](https://docs.nvidia.com/deploy/cuda-compatibility/latest/why-cuda-compatibility.html)

<h2 id="paper">回到论文的背景</h2>

理解论文 §2.3 时，可以同时追踪两条路径。**调用路径**回答谁发起 GPU 工作，从应用、Runtime API 或 Driver API 一直走到内核驱动。**访存路径**回答 GPU 指令发出后如何解释指针、找到数据并检查访问，涉及 context、设备侧映射和 Linux 内存管理。HMM 扩大了支持平台上 GPU 可访问的主机分配范围，因此 GPU 内存安全与主机进程的内存边界需要一起考虑。 [论文 §2.3](https://leeyoochan.github.io/assets/pdf/ghost_SP_2026.pdf#page=3) · [Linux HMM](https://docs.kernel.org/mm/hmm.html)
