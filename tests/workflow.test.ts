/**
 * Harness Core - Workflow Engine Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HarnessCorePlugin } from '../src/index';
import { WorkflowConfig } from '../src/types';

describe('Workflow Engine', () => {
  let plugin: HarnessCorePlugin;
  let mockContext: any;

  beforeEach(() => {
    plugin = new HarnessCorePlugin();
    mockContext = {
      api: {
        registerService: () => {},
        registerHttpRoute: () => {},
        registerCommand: () => {},
        registerHook: () => {}
      }
    };
  });

  describe('Workflow Creation', () => {
    it('should create a workflow with valid config', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'stage1',
            name: 'First Stage',
            type: 'tool',
            tool: { name: 'test-tool', parameters: {} },
            transitions: [{ to: 'stage2' }]
          },
          {
            id: 'stage2',
            name: 'Second Stage',
            type: 'tool',
            tool: { name: 'test-tool-2', parameters: {} },
            transitions: []
          }
        ]
      };

      const workflow = workflowService.create(config);
      
      expect(workflow.id).toBe('test-workflow');
      expect(workflow.config.name).toBe('Test Workflow');
      expect(workflow.config.stages).toHaveLength(2);
    });

    it('should list all created workflows', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      workflowService.create({
        id: 'workflow-1',
        name: 'Workflow 1',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: []
      });

      workflowService.create({
        id: 'workflow-2',
        name: 'Workflow 2',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: []
      });

      const workflows = workflowService.list();
      
      expect(workflows).toHaveLength(2);
      expect(workflows.map(w => w.id)).toContain('workflow-1');
      expect(workflows.map(w => w.id)).toContain('workflow-2');
    });
  });

  describe('Workflow Execution', () => {
    it('should execute a simple workflow', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'simple-workflow',
        name: 'Simple Workflow',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'start',
            name: 'Start',
            type: 'tool',
            tool: { name: 'echo', parameters: { message: 'hello' } },
            transitions: []
          }
        ]
      };

      workflowService.create(config);
      
      const result = await workflowService.execute('simple-workflow', { test: true });
      
      expect(result.success).toBe(true);
      expect(result.executionId).toBeDefined();
      expect(result.stageResults).toHaveLength(1);
      expect(result.stageResults[0].stageId).toBe('start');
      expect(result.stageResults[0].success).toBe(true);
    });

    it('should execute multi-stage workflow', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'multi-stage-workflow',
        name: 'Multi Stage Workflow',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'stage1',
            name: 'Stage 1',
            type: 'tool',
            tool: { name: 'tool1', parameters: {} },
            transitions: [{ to: 'stage2' }]
          },
          {
            id: 'stage2',
            name: 'Stage 2',
            type: 'tool',
            tool: { name: 'tool2', parameters: {} },
            transitions: [{ to: 'stage3' }]
          },
          {
            id: 'stage3',
            name: 'Stage 3',
            type: 'tool',
            tool: { name: 'tool3', parameters: {} },
            transitions: []
          }
        ]
      };

      workflowService.create(config);
      
      const result = await workflowService.execute('multi-stage-workflow', {});
      
      expect(result.success).toBe(true);
      expect(result.stageResults).toHaveLength(3);
      expect(result.stageResults.map(r => r.stageId)).toEqual(['stage1', 'stage2', 'stage3']);
    });

    it('should handle workflow not found error', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      await expect(workflowService.execute('non-existent', {}))
        .rejects.toThrow('Workflow non-existent not found');
    });

    it('should track execution status', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'status-test',
        name: 'Status Test',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'stage1',
            name: 'Stage 1',
            type: 'tool',
            tool: { name: 'test', parameters: {} },
            transitions: []
          }
        ]
      };

      workflowService.create(config);
      
      const result = await workflowService.execute('status-test', {});
      
      const status = workflowService.getStatus(result.executionId);
      
      expect(status.status).toBe('completed');
      expect(status.currentStage).toBe('stage1');
      expect(status.stageHistory).toHaveLength(1);
    });
  });

  describe('Condition Stage', () => {
    it('should evaluate condition and branch correctly', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'condition-workflow',
        name: 'Condition Workflow',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'check',
            name: 'Check Condition',
            type: 'condition',
            condition: {
              expression: '${input.value} > 10',
              branches: [
                { condition: 'true', next: 'high' },
                { condition: 'false', next: 'low' }
              ]
            },
            transitions: []
          },
          {
            id: 'high',
            name: 'High Value',
            type: 'tool',
            tool: { name: 'high-handler', parameters: {} },
            transitions: []
          },
          {
            id: 'low',
            name: 'Low Value',
            type: 'tool',
            tool: { name: 'low-handler', parameters: {} },
            transitions: []
          }
        ]
      };

      workflowService.create(config);
      
      // Test with high value
      const highResult = await workflowService.execute('condition-workflow', { value: 15 });
      expect(highResult.success).toBe(true);
    });
  });

  describe('Parallel Stage', () => {
    it('should execute parallel branches', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'parallel-workflow',
        name: 'Parallel Workflow',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'parallel',
            name: 'Parallel Execution',
            type: 'parallel',
            parallel: {
              branches: [
                {
                  id: 'branch1',
                  name: 'Branch 1',
                  type: 'tool',
                  tool: { name: 'tool1', parameters: {} },
                  transitions: []
                },
                {
                  id: 'branch2',
                  name: 'Branch 2',
                  type: 'tool',
                  tool: { name: 'tool2', parameters: {} },
                  transitions: []
                }
              ],
              aggregate: 'merge'
            },
            transitions: []
          }
        ]
      };

      workflowService.create(config);
      
      const result = await workflowService.execute('parallel-workflow', {});
      
      expect(result.success).toBe(true);
      expect(result.stageResults).toHaveLength(1);
      expect(result.stageResults[0].output.type).toBe('parallel_result');
    });
  });

  describe('Loop Stage', () => {
    it('should execute loop until condition is met', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'loop-workflow',
        name: 'Loop Workflow',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'loop',
            name: 'Loop Stage',
            type: 'loop',
            loop: {
              condition: '${counter} < 3',
              body: {
                id: 'body',
                name: 'Loop Body',
                type: 'tool',
                tool: { name: 'increment', parameters: {} },
                transitions: []
              },
              maxIterations: 5
            },
            transitions: []
          }
        ]
      };

      workflowService.create(config);
      
      const result = await workflowService.execute('loop-workflow', { counter: 0 });
      
      expect(result.success).toBe(true);
    });
  });

  describe('Wait Stage', () => {
    it('should wait for specified duration', async () => {
      await plugin.init(mockContext);
      
      const workflowService = (plugin as any).workflowEngine;
      
      const config: WorkflowConfig = {
        id: 'wait-workflow',
        name: 'Wait Workflow',
        version: '1.0.0',
        triggers: [{ type: 'manual', config: {} }],
        stages: [
          {
            id: 'wait',
            name: 'Wait Stage',
            type: 'wait',
            wait: { duration: 100 }, // 100ms
            transitions: []
          }
        ]
      };

      workflowService.create(config);
      
      const startTime = Date.now();
      const result = await workflowService.execute('wait-workflow', {});
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });
});

describe('State Machine', () => {
  let plugin: HarnessCorePlugin;
  let mockContext: any;

  beforeEach(() => {
    plugin = new HarnessCorePlugin();
    mockContext = {
      api: {
        registerService: () => {},
        registerHttpRoute: () => {},
        registerCommand: () => {},
        registerHook: () => {}
      }
    };
  });

  it('should create and transition state machine', async () => {
    await plugin.init(mockContext);
    
    const stateService = (plugin as any).stateMachineEngine;
    
    const machine = stateService.createMachine({
      id: 'test-machine',
      initial: 'idle',
      states: {
        idle: {
          on: { START: 'running' }
        },
        running: {
          on: { STOP: 'idle', COMPLETE: 'completed' }
        },
        completed: {}
      }
    });

    expect(machine.state).toBe('idle');
    expect(machine.can('START')).toBe(true);
    expect(machine.can('STOP')).toBe(false);

    machine.transition('START');
    expect(machine.state).toBe('running');

    machine.transition('COMPLETE');
    expect(machine.state).toBe('completed');
  });

  it('should store and retrieve machines', async () => {
    await plugin.init(mockContext);
    
    const stateService = (plugin as any).stateMachineEngine;
    
    stateService.createMachine({
      id: 'stored-machine',
      initial: 'state1',
      states: {
        state1: { on: { NEXT: 'state2' } },
        state2: {}
      }
    });

    const retrieved = stateService.getMachine('stored-machine');
    expect(retrieved).toBeDefined();
    expect(retrieved?.state).toBe('state1');
  });
});

describe('Event System', () => {
  let plugin: HarnessCorePlugin;
  let mockContext: any;

  beforeEach(() => {
    plugin = new HarnessCorePlugin();
    mockContext = {
      api: {
        registerService: () => {},
        registerHttpRoute: () => {},
        registerCommand: () => {},
        registerHook: () => {}
      }
    };
  });

  it('should emit and receive events', async () => {
    await plugin.init(mockContext);
    
    const eventService = (plugin as any).eventEngine;
    const receivedEvents: any[] = [];

    eventService.on('test-event', (event) => {
      receivedEvents.push(event);
    });

    eventService.emit('test-event', { data: 'test' });

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].type).toBe('test-event');
    expect(receivedEvents[0].payload).toEqual({ data: 'test' });
  });

  it('should support one-time listeners', async () => {
    await plugin.init(mockContext);
    
    const eventService = (plugin as any).eventEngine;
    let callCount = 0;

    eventService.once('once-event', () => {
      callCount++;
    });

    eventService.emit('once-event', {});
    eventService.emit('once-event', {});

    expect(callCount).toBe(1);
  });

  it('should support unsubscribing', async () => {
    await plugin.init(mockContext);
    
    const eventService = (plugin as any).eventEngine;
    let callCount = 0;

    const handler = () => callCount++;
    const subscription = eventService.on('unsub-event', handler);

    eventService.emit('unsub-event', {});
    subscription.unsubscribe();
    eventService.emit('unsub-event', {});

    expect(callCount).toBe(1);
  });
});
