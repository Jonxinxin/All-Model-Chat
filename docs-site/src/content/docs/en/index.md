---
title: AMC WebUI
description: All-in-one Model Console WebUI featuring native Google Gemini capabilities and OpenAI-compatible endpoints.
template: splash
hero:
  title: AMC WebUI
  tagline: Next-generation AI Console engineered for power users · Harness native Google Gemini deep reasoning, real-time Live API, and open tool ecosystems.
  image:
    dark: ../../../assets/app-logo-dark.png
    light: ../../../assets/app-logo.png
    alt: AMC WebUI
  actions:
    - text: 🚀 Getting Started
      link: /en/getting-started/introduction/
      icon: right-arrow
      variant: primary
    - text: 🌐 Live Demo
      link: https://all-model-chat.pages.dev/
      icon: external
    - text: ⭐️ GitHub Repo
      link: https://github.com/yeahhe365/AMC-WebUI
      icon: external
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

## Core Capabilities

<CardGrid stagger>
  <Card title="🧠 Deep Reasoning (Thinking)" icon="open-book">
    Visualized chain-of-thought for Gemini 3.x models, custom token budgets, and real-time thought translation.
  </Card>
  <Card title="🎙️ Real-time Audio & Video (Live API)" icon="laptop">
    Bidirectional streaming voice calls, screen sharing, camera vision input, and AudioWorklet visualization.
  </Card>
  <Card title="🧩 Live Artifacts" icon="puzzle">
    Automatic sandbox rendering of interactive HTML/SVG with Apache ECharts, Mermaid flowcharts, and Graphviz.
  </Card>
  <Card title="🐍 Local Python Sandbox (Pyodide)" icon="setting">
    Browser-side WASM environment with numpy/pandas preloaded, dynamic package installation, and plot capture.
  </Card>
  <Card title="🔌 Model Context Protocol (MCP)" icon="add-document">
    Full MCP client supporting local stdio and remote SSE/Stream servers with human-in-the-loop tool approvals.
  </Card>
  <Card title="🛡️ Local-First Architecture" icon="bars">
    IndexedDB persistence with Web Locks API concurrency control; Gemini and OpenAI settings strictly isolated.
  </Card>
</CardGrid>
