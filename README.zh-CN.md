# @openclaw-harness/core

[![npm version](https://badge.fury.io/js/@openclaw-harness%2Fcore.svg)](https://www.npmjs.com/package/@openclaw-harness/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md) | 中文

> 用于 Agent 编排的工作流引擎和状态管理

## 特性

- 🔄 **工作流引擎** - 定义复杂的多阶段工作流
- 🗃️ **状态管理** - 用于稳健控制的有限状态机
- 📡 **事件系统** - 解耦的、事件驱动的架构
- 🎯 **多种阶段类型** - Agent、工具、条件、并行、循环、等待

## 安装

```bash
npm install @openclaw-harness/core
```

## 快速开始

```typescript
import { HarnessCorePlugin } from '@openclaw-harness/core';

const plugin = new HarnessCorePlugin();

// 使用 OpenClaw 上下文初始化
await plugin.init(openClawContext);

// 获取工作流服务
const workflowService = openClawContext.api.getService('harness:workflow');

// 创建工作流
const workflow = workflowService.create({
  id: 'my-workflow',
  name: '我的工作流',
  version: '1.0.0',
  stages: [
    {
      id: 'stage1',
      name: '第一阶段',
      type: 'tool',
      tool: { name: 'echo', parameters: { message: 'Hello' } },
      transitions: []
    }
  ]
});

// 执行工作流
const result = await workflowService.execute('my-workflow', {});
```

## CLI 命令

```bash
# 列出所有工作流
openclaw harness:workflow:list

# 从 JSON 文件创建工作流
openclaw harness:workflow:create ./my-workflow.json

# 运行工作流
openclaw harness:workflow:run my-workflow '{"input": "test"}'

# 查看执行状态
openclaw harness:execution:status <execution-id>
```

## HTTP API

```bash
# 列出工作流
curl http://localhost:3000/harness/workflows

# 创建工作流
curl -X POST http://localhost:3000/harness/workflows \
  -H "Content-Type: application/json" \
  -d @workflow-config.json

# 执行工作流
curl -X POST http://localhost:3000/harness/workflows/<id>/execute \
  -H "Content-Type: application/json" \
  -d '{"input": "test"}'
```

## 工作流配置示例

```json
{
  "id": "customer-support",
  "name": "客户支持工作流",
  "version": "1.0.0",
  "triggers": [
    { "type": "webhook", "config": { "endpoint": "/support" } }
  ],
  "stages": [
    {
      "id": "intake",
      "name": "工单录入",
      "type": "agent",
      "agent": { "agentId": "classifier", "maxTurns": 3 },
      "transitions": [{ "to": "routing" }]
    },
    {
      "id": "routing",
      "name": "路由分配",
      "type": "condition",
      "condition": {
        "expression": "${category} === \"technical\"",
        "branches": [
          { "condition": "true", "next": "tech-support" },
          { "condition": "false", "next": "general-support" }
        ]
      }
    },
    {
      "id": "tech-support",
      "name": "技术支持",
      "type": "agent",
      "agent": { "agentId": "tech-agent", "maxTurns": 10 },
      "transitions": []
    }
  ]
}
```

## 文档

查看 [完整文档](https://github.com/your-username/harness-core#readme) 获取更多详情。

## 许可证

MIT © [OpenClaw Harness Team](https://github.com/your-username)
