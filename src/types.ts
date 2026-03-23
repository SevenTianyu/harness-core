/**
 * OpenClaw Harness Core - Type Definitions
 * 
 * Provides comprehensive type definitions for workflow engine,
 * state management, and event system.
 */

// Mock PluginContext for standalone testing
export interface PluginContext {
  api: {
    registerService: (service: any) => void;
    registerHttpRoute?: (route: any) => void;
    registerCommand?: (command: any) => void;
    registerHook?: (hook: string, handler: Function) => void;
    registerTool?: (tool: any) => void;
    on?: (event: string, handler: Function) => void;
    emit?: (event: string, payload: any) => void;
    executeAgent?: (agentId: string, input: any, options?: any) => Promise<any>;
    generate?: (options: any) => Promise<any>;
    executeTool?: (name: string, parameters: any) => Promise<any>;
    callTool?: (name: string, parameters: any) => Promise<any>;
    tools?: Record<string, Function>;
    getTool?: (name: string) => any;
  };
}

export interface OpenClawPlugin {
  name: string;
  version: string;
  init: (context: PluginContext) => Promise<void>;
}

// ==================== Workflow Types ====================

export interface WorkflowConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  triggers: TriggerConfig[];
  stages: StageConfig[];
  variables?: Record<string, any>;
  onError?: ErrorHandlerConfig;
}

export interface TriggerConfig {
  type: 'webhook' | 'schedule' | 'event' | 'manual';
  config: Record<string, any>;
}

export interface StageConfig {
  id: string;
  name: string;
  type: 'agent' | 'tool' | 'condition' | 'parallel' | 'loop' | 'wait';
  
  // Agent stage
  agent?: {
    agentId?: string;
    prompt?: string;
    maxTurns?: number;
    tools?: string[];
    model?: string;
  };
  
  // Tool stage
  tool?: {
    name: string;
    parameters: Record<string, any>;
  };
  
  // Condition stage
  condition?: {
    expression: string;
    branches: { condition: string; next: string }[];
    default?: string;
  };
  
  // Parallel stage
  parallel?: {
    branches: StageConfig[];
    aggregate?: 'merge' | 'first' | 'all';
  };
  
  // Loop stage
  loop?: {
    condition: string;
    body: StageConfig;
    maxIterations?: number;
  };
  
  // Wait stage
  wait?: {
    duration?: number;
    until?: string;
  };
  
  transitions: TransitionConfig[];
}

export interface TransitionConfig {
  to: string;
  condition?: string;
}

export interface ErrorHandlerConfig {
  strategy: 'retry' | 'fallback' | 'abort';
  maxRetries?: number;
  fallbackStage?: string;
  onError?: (error: Error, context: ExecutionContext) => void;
}

// ==================== Execution Types ====================

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  input: any;
  state: ExecutionState;
  variables: Map<string, any>;
  metadata: ExecutionMetadata;
}

export interface ExecutionState {
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStage: string | null;
  startTime: Date;
  endTime?: Date;
  stageHistory: StageExecution[];
}

export interface StageExecution {
  stageId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: any;
  output?: any;
  startTime: Date;
  endTime?: Date;
  error?: Error;
}

export interface ExecutionMetadata {
  triggeredBy: string;
  triggerType: string;
  correlationId: string;
  tags?: string[];
  workflowErrorConfig?: any;
}

// ==================== State Machine Types ====================

export interface StateMachineConfig {
  id: string;
  initial: string;
  states: Record<string, StateConfig>;
}

export interface StateConfig {
  on?: Record<string, string | { target: string; actions?: string[] }>;
  entry?: string[];
  exit?: string[];
  onEntry?: (context: any) => void;
  onExit?: (context: any) => void;
}

export interface StateMachine {
  state: string;
  context: any;
  transition: (event: string, payload?: any) => void;
  can: (event: string) => boolean;
}

// ==================== Event System Types ====================

export interface HarnessEvent {
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
}

export interface EventHandler {
  (event: HarnessEvent): void | Promise<void>;
}

export interface EventSubscription {
  unsubscribe: () => void;
}

// ==================== Service Interfaces ====================

export interface WorkflowService {
  create(config: WorkflowConfig): Workflow;
  execute(workflowId: string, input: any): Promise<ExecutionResult>;
  getStatus(executionId: string): ExecutionState;
  cancel(executionId: string): void;
  list(): Workflow[];
}

export interface StateService {
  createMachine(config: StateMachineConfig): StateMachine;
  getMachine(id: string): StateMachine | undefined;
  transition(machineId: string, event: string, payload?: any): void;
}

export interface EventService {
  emit(event: string, payload: any): void;
  on(event: string, handler: EventHandler): EventSubscription;
  once(event: string, handler: EventHandler): EventSubscription;
  off(event: string, handler: EventHandler): void;
}

// ==================== Result Types ====================

export interface ExecutionResult {
  success: boolean;
  executionId: string;
  output?: any;
  error?: Error;
  duration: number;
  stageResults: StageResult[];
}

export interface StageResult {
  stageId: string;
  success: boolean;
  output?: any;
  error?: Error;
  duration: number;
}

export interface Workflow {
  id: string;
  config: WorkflowConfig;
  executions: Map<string, ExecutionContext>;
}

// ==================== Plugin Interface ====================

export interface HarnessCorePlugin extends OpenClawPlugin {
  workflowService: WorkflowService;
  stateService: StateService;
  eventService: EventService;
}

// ==================== Utility Types ====================

export type WorkflowStatus = 'active' | 'inactive' | 'deprecated';
export type StageType = 'agent' | 'tool' | 'condition' | 'parallel' | 'loop' | 'wait';
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
