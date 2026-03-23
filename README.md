# @openclaw-harness/core

[![npm version](https://badge.fury.io/js/@openclaw-harness%2Fcore.svg)](https://www.npmjs.com/package/@openclaw-harness/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

English | [中文](./README.zh-CN.md)

> Workflow engine and state management for Agent orchestration

## Features

- 🔄 **Workflow Engine** - Define complex multi-stage workflows
- 🗃️ **State Management** - Finite state machines for robust control
- 📡 **Event System** - Decoupled, event-driven architecture
- 🎯 **Multiple Stage Types** - Agent, Tool, Condition, Parallel, Loop, Wait

## Installation

```bash
npm install @openclaw-harness/core
```

## Quick Start

```typescript
import { HarnessCorePlugin } from '@openclaw-harness/core';

const plugin = new HarnessCorePlugin();

// Initialize with OpenClaw context
await plugin.init(openClawContext);

// Get workflow service
const workflowService = openClawContext.api.getService('harness:workflow');

// Create a workflow
const workflow = workflowService.create({
  id: 'my-workflow',
  name: 'My Workflow',
  version: '1.0.0',
  stages: [
    {
      id: 'stage1',
      name: 'First Stage',
      type: 'tool',
      tool: { name: 'echo', parameters: { message: 'Hello' } },
      transitions: []
    }
  ]
});

// Execute workflow
const result = await workflowService.execute('my-workflow', {});
```

## Documentation

See the [full documentation](https://github.com/SevenTianyu/harness-core#readme) for more details.

## License

MIT © [OpenClaw Harness Team](https://github.com/SevenTianyu)
