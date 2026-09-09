---
title: AMC WebUI
description: All-in-one Model Console WebUI · 以 Google Gemini 原生能力为主，兼具 OpenAI 兼容生态
template: splash
hero:
  tagline: 以 Google Gemini 原生能力为主，兼具 OpenAI 兼容生态的极客级 AI 控制台。本地持久化，隐私优先。
  actions:
    - text: 🚀 快速上手
      link: /getting-started/introduction/
      icon: right-arrow
      variant: primary
    - text: 🌐 在线演示
      link: https://all-model-chat.pages.dev/
      icon: external
    - text: ⭐️ GitHub 仓库
      link: https://github.com/yeahhe365/AMC-WebUI
      icon: external
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

## 核心特性

<CardGrid stagger>
  <Card title="🧠 深度推理 (Thinking)" icon="open-book">
    支持 Gemini 3.x 系列深度思维链可视化、Token 预算精细控制与思维链实时双向翻译。
  </Card>
  <Card title="🎙️ 实时音视频 (Live API)" icon="laptop">
    双向低延迟语音通话、摄像头画面捕获、屏幕共享与基于 AudioWorklet 的实时音频波形渲染。
  </Card>
  <Card title="🧩 Live Artifacts 交互构件" icon="puzzle">
    代码块自动识别为全屏 HTML/SVG 交互沙箱，内置 Apache ECharts、Mermaid 与 Graphviz 多引擎图表直出。
  </Card>
  <Card title="🐍 本地 Python 沙箱 (Pyodide)" icon="setting">
    浏览器端 WASM 独立安全环境执行科学计算，预装 numpy/pandas，动态安装 scipy/sklearn，本地图表自动捕获。
  </Card>
  <Card title="🔌 MCP 协议扩展" icon="add-document">
    完整支持 Model Context Protocol，兼容本地 stdio 进程与远程 SSE/Stream 服务，提供严谨的工具调用审批流。
  </Card>
  <Card title="🛡️ Local-First 隐私优先" icon="bars">
    数据默认存储于浏览器 IndexedDB 并由 Web Locks 保护；Gemini 原生与 OpenAI 兼容配置严格隔离。
  </Card>
</CardGrid>
