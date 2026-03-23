/**
 * OpenClaw Harness Core Plugin
 * 
 * Provides workflow engine, state management, and event system
 * for building complex Agent orchestrations.
 * 
 * @module @openclaw-harness/core
 */

import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowConfig,
  StageConfig,
  ExecutionContext,
  ExecutionState,
  StageExecution,
  ExecutionResult,
  StageResult,
  StateMachineConfig,
  StateMachine,
  StateConfig,
  HarnessEvent,
  EventHandler,
  EventSubscription,
  WorkflowService,
  StateService,
  EventService,
  Workflow,
  ErrorHandlerConfig,
  TransitionConfig
} from './types';

// Re-export types
export * from './types';

/**
 * Workflow execution engine
 */
class WorkflowEngine implements WorkflowService {
  private workflows = new Map<string, Workflow>();
  private executions = new Map<string, ExecutionContext>();
  private openClawApi: any = null;

  setOpenClawApi(api: any): void {
    this.openClawApi = api;
  }

  create(config: WorkflowConfig): Workflow {
    const workflow: Workflow = {
      id: config.id,
      config,
      executions: new Map()
    };
    this.workflows.set(config.id, workflow);
    return workflow;
  }

  async execute(workflowId: string, input: any): Promise<ExecutionResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = uuidv4();
    const executionContext = this.createExecutionContext(workflowId, executionId, input);
    this.executions.set(executionId, executionContext);

    const startTime = Date.now();
    const stageResults: StageResult[] = [];

    try {
      executionContext.state.status = 'running';
      
      // Find initial stage
      const initialStage = workflow.config.stages.find(s => 
        !workflow.config.stages.some(other => 
          other.transitions.some(t => t.to === s.id)
        )
      );

      if (!initialStage) {
        throw new Error('No initial stage found in workflow');
      }

      let currentStage: StageConfig | undefined = initialStage;
      
      while (currentStage) {
        executionContext.state.currentStage = currentStage.id;
        
        const stageResult = await this.executeStage(currentStage, executionContext);
        stageResults.push(stageResult);

        if (!stageResult.success) {
          // Handle error according to config
          const errorResult = await this.handleStageError(
            currentStage, 
            stageResult.error!, 
            executionContext
          );
          
          if (errorResult.shouldStop) {
            executionContext.state.status = 'failed';
            break;
          }
          
          if (errorResult.nextStage) {
            currentStage = errorResult.nextStage;
            continue;
          }
        }

        // Determine next stage
        currentStage = this.getNextStage(currentStage, stageResult, workflow.config.stages);
      }

      executionContext.state.status = 'completed';
      executionContext.state.endTime = new Date();

      return {
        success: true,
        executionId,
        output: this.extractOutput(executionContext),
        duration: Date.now() - startTime,
        stageResults
      };

    } catch (error) {
      executionContext.state.status = 'failed';
      executionContext.state.endTime = new Date();

      return {
        success: false,
        executionId,
        error: error as Error,
        duration: Date.now() - startTime,
        stageResults
      };
    }
  }

  private createExecutionContext(
    workflowId: string, 
    executionId: string, 
    input: any
  ): ExecutionContext {
    return {
      workflowId,
      executionId,
      input,
      state: {
        status: 'pending',
        currentStage: null,
        startTime: new Date(),
        stageHistory: []
      },
      variables: new Map(),
      metadata: {
        triggeredBy: 'manual',
        triggerType: 'manual',
        correlationId: uuidv4()
      }
    };
  }

  private async executeStage(
    stage: StageConfig, 
    context: ExecutionContext
  ): Promise<StageResult> {
    const stageExecution: StageExecution = {
      stageId: stage.id,
      status: 'running',
      input: this.prepareStageInput(stage, context),
      startTime: new Date()
    };

    context.state.stageHistory.push(stageExecution);

    const startTime = Date.now();

    try {
      let output: any;

      switch (stage.type) {
        case 'agent':
          output = await this.executeAgentStage(stage, context);
          break;
        case 'tool':
          output = await this.executeToolStage(stage, context);
          break;
        case 'condition':
          output = await this.executeConditionStage(stage, context);
          break;
        case 'parallel':
          output = await this.executeParallelStage(stage, context);
          break;
        case 'loop':
          output = await this.executeLoopStage(stage, context);
          break;
        case 'wait':
          output = await this.executeWaitStage(stage, context);
          break;
        default:
          throw new Error(`Unknown stage type: ${stage.type}`);
      }

      stageExecution.status = 'completed';
      stageExecution.output = output;
      stageExecution.endTime = new Date();

      // Store output in context variables
      context.variables.set(stage.id, output);

      return {
        stageId: stage.id,
        success: true,
        output,
        duration: Date.now() - startTime
      };

    } catch (error) {
      stageExecution.status = 'failed';
      stageExecution.error = error as Error;
      stageExecution.endTime = new Date();

      return {
        stageId: stage.id,
        success: false,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Execute an Agent stage by invoking OpenClaw's agent system
   */
  private async executeAgentStage(stage: StageConfig, context: ExecutionContext): Promise<any> {
    if (!this.openClawApi) {
      throw new Error('OpenClaw API not available. Plugin not properly initialized.');
    }

    const agentConfig = stage.agent;
    if (!agentConfig) {
      throw new Error(`Agent stage ${stage.id} missing agent configuration`);
    }

    // Prepare the prompt with variable substitution
    const prompt = this.substituteVariables(agentConfig.prompt || '', context);
    
    // Prepare input from workflow context
    const input = {
      prompt,
      context: {
        workflowId: context.workflowId,
        executionId: context.executionId,
        stageId: stage.id,
        variables: Object.fromEntries(context.variables)
      }
    };

    try {
      // Call OpenClaw's agent execution API
      let result: any;

      if (agentConfig.agentId && this.openClawApi.executeAgent) {
        // Execute specific agent by ID
        result = await this.openClawApi.executeAgent(agentConfig.agentId, input, {
          maxTurns: agentConfig.maxTurns || 10,
          tools: agentConfig.tools,
          model: agentConfig.model
        });
      } else if (this.openClawApi.generate) {
        // Fallback to direct generation API
        result = await this.openClawApi.generate({
          prompt: input.prompt,
          tools: agentConfig.tools,
          model: agentConfig.model,
          maxTokens: 4096
        });
      } else {
        throw new Error('No agent execution API available in OpenClaw');
      }

      return {
        type: 'agent_response',
        stageId: stage.id,
        agentId: agentConfig.agentId,
        prompt: input.prompt,
        response: result.response || result.content || result,
        tokensUsed: result.tokensUsed || result.usage,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Agent stage ${stage.id} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Execute a Tool stage by invoking OpenClaw's tool system
   */
  private async executeToolStage(stage: StageConfig, context: ExecutionContext): Promise<any> {
    if (!this.openClawApi) {
      throw new Error('OpenClaw API not available. Plugin not properly initialized.');
    }

    const toolConfig = stage.tool;
    if (!toolConfig) {
      throw new Error(`Tool stage ${stage.id} missing tool configuration`);
    }

    // Substitute variables in parameters
    const parameters = this.substituteVariablesInObject(toolConfig.parameters, context);

    try {
      let result: any;

      // Try different OpenClaw tool execution APIs
      if (this.openClawApi.executeTool) {
        // Direct tool execution API
        result = await this.openClawApi.executeTool(toolConfig.name, parameters);
      } else if (this.openClawApi.callTool) {
        // Alternative API name
        result = await this.openClawApi.callTool(toolConfig.name, parameters);
      } else if (this.openClawApi.tools && this.openClawApi.tools[toolConfig.name]) {
        // Tool registry pattern
        result = await this.openClawApi.tools[toolConfig.name](parameters);
      } else {
        // Try to get tool from registered tools
        const tool = this.openClawApi.getTool?.(toolConfig.name);
        if (tool) {
          result = await tool.handler(parameters);
        } else {
          throw new Error(`Tool '${toolConfig.name}' not found in OpenClaw registry`);
        }
      }

      return {
        type: 'tool_result',
        stageId: stage.id,
        tool: toolConfig.name,
        parameters,
        result: result.result || result.data || result,
        success: result.success !== false,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Tool stage ${stage.id} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Substitute ${variable} patterns in a string with values from context
   */
  private substituteVariables(template: string, context: ExecutionContext): string {
    return template.replace(/\$\{(\w+)\}/g, (match, varName) => {
      const value = context.variables.get(varName);
      if (value !== undefined) {
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
      // Try workflow input
      if (context.input && context.input[varName] !== undefined) {
        const inputValue = context.input[varName];
        return typeof inputValue === 'string' ? inputValue : JSON.stringify(inputValue);
      }
      return match; // Keep original if not found
    });
  }

  /**
   * Substitute variables in an object recursively
   */
  private substituteVariablesInObject(obj: any, context: ExecutionContext): any {
    if (typeof obj === 'string') {
      return this.substituteVariables(obj, context);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteVariablesInObject(item, context));
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteVariablesInObject(value, context);
      }
      return result;
    }
    return obj;
  }

  private async executeConditionStage(stage: StageConfig, context: ExecutionContext): Promise<any> {
    const condition = stage.condition!;
    
    // Simple expression evaluation (in production, use a proper expression engine)
    const result = this.evaluateExpression(condition.expression, context);
    
    return {
      type: 'condition_result',
      stageId: stage.id,
      expression: condition.expression,
      result,
      timestamp: new Date().toISOString()
    };
  }

  private async executeParallelStage(stage: StageConfig, context: ExecutionContext): Promise<any> {
    const parallel = stage.parallel!;
    
    const results = await Promise.all(
      parallel.branches.map(branch => this.executeStage(branch, context))
    );

    // Aggregate results based on config
    let aggregated: any;
    switch (parallel.aggregate) {
      case 'first':
        aggregated = results.find(r => r.success)?.output;
        break;
      case 'all':
        aggregated = results.filter(r => r.success).map(r => r.output);
        break;
      case 'merge':
      default:
        aggregated = results.reduce((acc, r) => {
          if (r.success && r.output) {
            return { ...acc, ...r.output };
          }
          return acc;
        }, {});
    }

    return {
      type: 'parallel_result',
      stageId: stage.id,
      results,
      aggregated,
      timestamp: new Date().toISOString()
    };
  }

  private async executeLoopStage(stage: StageConfig, context: ExecutionContext): Promise<any> {
    const loop = stage.loop!;
    const iterations: any[] = [];
    let iteration = 0;

    while (iteration < (loop.maxIterations || 100)) {
      const condition = this.evaluateExpression(loop.condition, context);
      if (!condition) break;

      const result = await this.executeStage(loop.body, context);
      iterations.push(result);
      
      if (!result.success) {
        throw result.error;
      }

      iteration++;
    }

    return {
      type: 'loop_result',
      stageId: stage.id,
      iterations,
      iterationCount: iteration,
      timestamp: new Date().toISOString()
    };
  }

  private async executeWaitStage(stage: StageConfig, context: ExecutionContext): Promise<any> {
    const wait = stage.wait!;

    if (wait.duration) {
      await new Promise(resolve => setTimeout(resolve, wait.duration));
    }

    // For wait.until, would need event-driven implementation
    return {
      type: 'wait_result',
      stageId: stage.id,
      duration: wait.duration,
      timestamp: new Date().toISOString()
    };
  }

  private evaluateExpression(expression: string, context: ExecutionContext): boolean {
    // Simple expression evaluator
    // In production, use a proper expression engine like json-logic-js or similar
    try {
      // Replace variable references with actual values
      const evaluated = expression.replace(/\$\{(\w+)\}/g, (match, varName) => {
        const value = context.variables.get(varName);
        return JSON.stringify(value);
      });

      // Safe evaluation (in production, use a sandboxed evaluator)
      return new Function('context', `return ${evaluated}`)(context);
    } catch {
      return false;
    }
  }

  private prepareStageInput(stage: StageConfig, context: ExecutionContext): any {
    // Prepare input based on stage configuration and context
    return {
      stageId: stage.id,
      stageName: stage.name,
      workflowInput: context.input,
      variables: Object.fromEntries(context.variables)
    };
  }

  private async handleStageError(
    stage: StageConfig, 
    error: Error, 
    context: ExecutionContext
  ): Promise<{ shouldStop: boolean; nextStage?: StageConfig }> {
    const errorConfig = stage.transitions.find(t => t.condition === 'onError') 
      || context.metadata.workflowErrorConfig;

    if (!errorConfig) {
      return { shouldStop: true };
    }

    // Find fallback stage if specified
    const workflow = this.workflows.get(context.workflowId);
    const fallbackStage = workflow?.config.stages.find(s => s.id === errorConfig.to);

    return {
      shouldStop: false,
      nextStage: fallbackStage
    };
  }

  private getNextStage(
    currentStage: StageConfig, 
    result: StageResult, 
    allStages: StageConfig[]
  ): StageConfig | undefined {
    // Find transition based on result
    const transition = currentStage.transitions.find(t => {
      if (!t.condition) return true;
      if (t.condition === 'onSuccess' && result.success) return true;
      if (t.condition === 'onFailure' && !result.success) return true;
      return false;
    });

    if (!transition) return undefined;

    return allStages.find(s => s.id === transition.to);
  }

  private extractOutput(context: ExecutionContext): any {
    // Extract final output from context
    const lastStage = context.state.stageHistory[context.state.stageHistory.length - 1];
    return lastStage?.output;
  }

  getStatus(executionId: string): ExecutionState {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }
    return execution.state;
  }

  cancel(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      execution.state.status = 'cancelled';
      execution.state.endTime = new Date();
    }
  }

  list(): Workflow[] {
    return Array.from(this.workflows.values());
  }
}

/**
 * State machine implementation
 */
class StateMachineEngine implements StateService {
  private machines = new Map<string, StateMachine>();

  createMachine(config: StateMachineConfig): StateMachine {
    const machine: StateMachine = {
      state: config.initial,
      context: {},
      transition: (event: string, payload?: any) => {
        const currentStateConfig = config.states[machine.state];
        if (!currentStateConfig?.on?.[event]) {
          throw new Error(`Invalid transition: ${event} from state ${machine.state}`);
        }

        const transition = currentStateConfig.on[event];
        const targetState = typeof transition === 'string' ? transition : transition.target;
        const actions = typeof transition === 'string' ? [] : (transition.actions || []);

        // Execute exit actions
        currentStateConfig.onExit?.(machine.context);

        // Update state
        machine.state = targetState;
        if (payload) {
          machine.context = { ...machine.context, ...payload };
        }

        // Execute entry actions
        const newStateConfig = config.states[targetState];
        newStateConfig.onEntry?.(machine.context);

        // Execute transition actions
        actions.forEach(action => {
          // Execute action
        });
      },
      can: (event: string) => {
        const currentStateConfig = config.states[machine.state];
        return !!currentStateConfig?.on?.[event];
      }
    };

    this.machines.set(config.id, machine);
    return machine;
  }

  getMachine(id: string): StateMachine | undefined {
    return this.machines.get(id);
  }

  transition(machineId: string, event: string, payload?: any): void {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new Error(`State machine ${machineId} not found`);
    }
    machine.transition(event, payload);
  }
}

/**
 * Event system implementation
 */
class EventEngine implements EventService {
  private handlers = new Map<string, Set<EventHandler>>();
  private oneTimeHandlers = new Map<string, Set<EventHandler>>();

  emit(event: string, payload: any): void {
    const harnessEvent: HarnessEvent = {
      type: event,
      payload,
      timestamp: new Date(),
      source: 'harness-core'
    };

    // Notify regular handlers
    const handlers = this.handlers.get(event);
    handlers?.forEach(handler => {
      try {
        handler(harnessEvent);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });

    // Notify one-time handlers
    const oneTime = this.oneTimeHandlers.get(event);
    oneTime?.forEach(handler => {
      try {
        handler(harnessEvent);
      } catch (error) {
        console.error(`Error in one-time handler for ${event}:`, error);
      }
    });
    oneTime?.clear();
  }

  on(event: string, handler: EventHandler): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return {
      unsubscribe: () => {
        this.handlers.get(event)?.delete(handler);
      }
    };
  }

  once(event: string, handler: EventHandler): EventSubscription {
    if (!this.oneTimeHandlers.has(event)) {
      this.oneTimeHandlers.set(event, new Set());
    }
    this.oneTimeHandlers.get(event)!.add(handler);

    return {
      unsubscribe: () => {
        this.oneTimeHandlers.get(event)?.delete(handler);
      }
    };
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
    this.oneTimeHandlers.get(event)?.delete(handler);
  }
}

/**
 * Harness Core Plugin
 * 
 * Main plugin class that integrates with OpenClaw
 */
export class HarnessCorePlugin {
  name = 'openclaw-harness-core';
  version = '0.1.0';
  
  private workflowEngine: WorkflowEngine;
  private stateMachineEngine: StateMachineEngine;
  private eventEngine: EventEngine;
  private api: any;

  constructor() {
    this.workflowEngine = new WorkflowEngine();
    this.stateMachineEngine = new StateMachineEngine();
    this.eventEngine = new EventEngine();
  }

  /**
   * Initialize plugin with context (alias for register)
   */
  async init(context: any): Promise<void> {
    return this.register(context.api || context);
  }

  /**
   * OpenClaw plugin entrypoint registration.
   *
   * Registers in-process services, HTTP routes, and CLI commands.
   */
  async register(api: any): Promise<void> {
    this.api = api;
    
    // Set OpenClaw API for workflow engine to enable agent/tool execution
    this.workflowEngine.setOpenClawApi(api);

    // Register in-process services
    const workflowService = Object.assign(this.workflowEngine, {
      id: 'harness:workflow',
      start: async (_ctx: any) => {
        // no-op: in-memory workflow registry
      },
    });

    const stateService = Object.assign(this.stateMachineEngine, {
      id: 'harness:state',
      start: async (_ctx: any) => {
        // no-op: in-memory state machine registry
      },
    });

    const eventService = Object.assign(this.eventEngine, {
      id: 'harness:event',
      start: async (_ctx: any) => {
        // no-op: in-memory event bus
      },
    });

    api.registerService(workflowService);
    api.registerService(stateService);
    api.registerService(eventService);

    // Register HTTP routes
    this.registerHttpRoutes(api);

    // Register CLI commands
    this.registerCliCommands(api);

    // Register tools for OpenClaw integration
    this.registerTools(api);
  }

  /**
   * Register HTTP routes for workflow management
   */
  private registerHttpRoutes(api: any): void {
    // List workflows
    api.registerHttpRoute?.({
      method: 'GET',
      path: '/harness/workflows',
      handler: async (req: any, res: any) => {
        try {
          const workflows = this.workflowEngine.list();
          res.json({ 
            success: true,
            workflows: workflows.map(w => ({
              id: w.id,
              name: w.config.name,
              version: w.config.version,
              description: w.config.description,
              stages: w.config.stages.length
            })) 
          });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    // Get workflow by ID
    api.registerHttpRoute?.({
      method: 'GET',
      path: '/harness/workflows/:id',
      handler: async (req: any, res: any) => {
        try {
          const { id } = req.params;
          const workflows = this.workflowEngine.list();
          const workflow = workflows.find(w => w.id === id);
          
          if (!workflow) {
            res.status(404).json({ 
              success: false, 
              error: `Workflow ${id} not found` 
            });
            return;
          }

          res.json({
            success: true,
            workflow: {
              id: workflow.id,
              name: workflow.config.name,
              version: workflow.config.version,
              description: workflow.config.description,
              stages: workflow.config.stages,
              triggers: workflow.config.triggers,
              variables: workflow.config.variables
            }
          });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    // Create workflow
    api.registerHttpRoute?.({
      method: 'POST',
      path: '/harness/workflows',
      handler: async (req: any, res: any) => {
        try {
          const config: WorkflowConfig = req.body;
          const workflow = this.workflowEngine.create(config);
          res.status(201).json({ 
            success: true,
            workflow: { 
              id: workflow.id, 
              name: workflow.config.name,
              version: workflow.config.version 
            } 
          });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    // Execute workflow
    api.registerHttpRoute?.({
      method: 'POST',
      path: '/harness/workflows/:id/execute',
      handler: async (req: any, res: any) => {
        const { id } = req.params;
        const input = req.body;
        
        try {
          const result = await this.workflowEngine.execute(id, input);
          res.json({ ...result });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    // Get execution status
    api.registerHttpRoute?.({
      method: 'GET',
      path: '/harness/executions/:id',
      handler: async (req: any, res: any) => {
        const { id } = req.params;
        
        try {
          const status = this.workflowEngine.getStatus(id);
          res.json({ 
            success: true,
            executionId: id, 
            status 
          });
        } catch (error) {
          res.status(404).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    // Cancel execution
    api.registerHttpRoute?.({
      method: 'POST',
      path: '/harness/executions/:id/cancel',
      handler: async (req: any, res: any) => {
        const { id } = req.params;
        
        try {
          this.workflowEngine.cancel(id);
          res.json({ 
            success: true, 
            message: `Execution ${id} cancelled` 
          });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    // State machine routes
    api.registerHttpRoute?.({
      method: 'POST',
      path: '/harness/state-machines',
      handler: async (req: any, res: any) => {
        try {
          const config: StateMachineConfig = req.body;
          const machine = this.stateMachineEngine.createMachine(config);
          res.status(201).json({
            success: true,
            stateMachine: {
              id: config.id,
              initialState: config.initial,
              currentState: machine.state
            }
          });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    api.registerHttpRoute?.({
      method: 'POST',
      path: '/harness/state-machines/:id/transition',
      handler: async (req: any, res: any) => {
        try {
          const { id } = req.params;
          const { event, payload } = req.body;
          this.stateMachineEngine.transition(id, event, payload);
          const machine = this.stateMachineEngine.getMachine(id);
          res.json({
            success: true,
            stateMachine: {
              id,
              currentState: machine?.state
            }
          });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });

    // Event routes
    api.registerHttpRoute?.({
      method: 'POST',
      path: '/harness/events',
      handler: async (req: any, res: any) => {
        try {
          const { event, payload } = req.body;
          this.eventEngine.emit(event, payload);
          res.json({ 
            success: true, 
            message: `Event ${event} emitted` 
          });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }
    });
  }

  /**
   * Register CLI commands
   */
  private registerCliCommands(api: any): void {
    // List workflows
    api.registerCommand?.({
      name: 'harness:workflow:list',
      description: 'List all harness workflows',
      handler: async () => {
        const workflows = this.workflowEngine.list();
        if (workflows.length === 0) {
          console.log('No workflows registered.');
          return;
        }
        console.table(workflows.map(w => ({
          ID: w.id,
          Name: w.config.name,
          Version: w.config.version,
          Stages: w.config.stages.length
        })));
      }
    });

    // Create workflow
    api.registerCommand?.({
      name: 'harness:workflow:create',
      description: 'Create a new workflow from JSON file',
      arguments: [
        { name: 'file', required: true, description: 'Path to workflow JSON file' }
      ],
      handler: async (args: any) => {
        try {
          const fs = require('fs');
          const config = JSON.parse(fs.readFileSync(args.file, 'utf8'));
          const workflow = this.workflowEngine.create(config);
          console.log(`✅ Workflow created: ${workflow.id} (${workflow.config.name})`);
        } catch (error) {
          console.error('❌ Error:', (error as Error).message);
        }
      }
    });

    // Run workflow
    api.registerCommand?.({
      name: 'harness:workflow:run',
      description: 'Run a harness workflow',
      arguments: [
        { name: 'workflowId', required: true, description: 'Workflow ID to execute' },
        { name: 'input', required: false, description: 'JSON input string' }
      ],
      handler: async (args: any) => {
        try {
          const parsedInput = args.input ? JSON.parse(args.input) : {};
          console.log(`🚀 Starting workflow: ${args.workflowId}`);
          const result = await this.workflowEngine.execute(args.workflowId, parsedInput);
          
          if (result.success) {
            console.log('✅ Workflow completed successfully');
            console.log('Output:', JSON.stringify(result.output, null, 2));
          } else {
            console.log('❌ Workflow failed');
            console.log('Error:', result.error?.message);
          }
          
          console.log(`Duration: ${result.duration}ms`);
          console.log(`Stages executed: ${result.stageResults.length}`);
        } catch (error) {
          console.error('❌ Error:', (error as Error).message);
        }
      }
    });

    // Get execution status
    api.registerCommand?.({
      name: 'harness:execution:status',
      description: 'Get workflow execution status',
      arguments: [
        { name: 'executionId', required: true, description: 'Execution ID' }
      ],
      handler: async (args: any) => {
        try {
          const status = this.workflowEngine.getStatus(args.executionId);
          console.log('Execution Status:');
          console.table({
            'Execution ID': args.executionId,
            'Status': status.status,
            'Current Stage': status.currentStage || 'N/A',
            'Start Time': status.startTime.toISOString(),
            'End Time': status.endTime?.toISOString() || 'Running',
            'Stages Completed': status.stageHistory.filter(s => s.status === 'completed').length,
            'Stages Failed': status.stageHistory.filter(s => s.status === 'failed').length
          });
        } catch (error) {
          console.error('❌ Error:', (error as Error).message);
        }
      }
    });

    // Create state machine
    api.registerCommand?.({
      name: 'harness:state:create',
      description: 'Create a state machine from JSON file',
      arguments: [
        { name: 'file', required: true, description: 'Path to state machine JSON file' }
      ],
      handler: async (args: any) => {
        try {
          const fs = require('fs');
          const config = JSON.parse(fs.readFileSync(args.file, 'utf8'));
          const machine = this.stateMachineEngine.createMachine(config);
          console.log(`✅ State machine created: ${config.id}`);
          console.log(`Current state: ${machine.state}`);
        } catch (error) {
          console.error('❌ Error:', (error as Error).message);
        }
      }
    });

    // Transition state machine
    api.registerCommand?.({
      name: 'harness:state:transition',
      description: 'Send event to state machine',
      arguments: [
        { name: 'machineId', required: true, description: 'State machine ID' },
        { name: 'event', required: true, description: 'Event name' }
      ],
      handler: async (args: any) => {
        try {
          this.stateMachineEngine.transition(args.machineId, args.event);
          const machine = this.stateMachineEngine.getMachine(args.machineId);
          console.log(`✅ Transitioned: ${args.event}`);
          console.log(`Current state: ${machine?.state}`);
        } catch (error) {
          console.error('❌ Error:', (error as Error).message);
        }
      }
    });
  }

  /**
   * Register tools for OpenClaw integration
   */
  private registerTools(api: any): void {
    // Register workflow execution tool
    api.registerTool?.({
      name: 'harness:execute_workflow',
      description: 'Execute a harness workflow by ID with given input',
      parameters: {
        workflowId: { 
          type: 'string', 
          description: 'The ID of the workflow to execute' 
        },
        input: { 
          type: 'object', 
          description: 'Input data for the workflow execution',
          default: {}
        }
      },
      handler: async (params: any) => {
        const result = await this.workflowEngine.execute(
          params.workflowId, 
          params.input || {}
        );
        return {
          success: result.success,
          executionId: result.executionId,
          output: result.output,
          duration: result.duration,
          stageResults: result.stageResults.map(s => ({
            stageId: s.stageId,
            success: s.success,
            duration: s.duration
          }))
        };
      }
    });

    // Register state machine transition tool
    api.registerTool?.({
      name: 'harness:state_transition',
      description: 'Send an event to a state machine to trigger a transition',
      parameters: {
        machineId: { 
          type: 'string', 
          description: 'The ID of the state machine' 
        },
        event: { 
          type: 'string', 
          description: 'The event to trigger' 
        },
        payload: { 
          type: 'object', 
          description: 'Optional payload data',
          default: {}
        }
      },
      handler: async (params: any) => {
        this.stateMachineEngine.transition(
          params.machineId, 
          params.event, 
          params.payload
        );
        const machine = this.stateMachineEngine.getMachine(params.machineId);
        return {
          success: true,
          machineId: params.machineId,
          currentState: machine?.state,
          can: machine?.can
        };
      }
    });

    // Register event emission tool
    api.registerTool?.({
      name: 'harness:emit_event',
      description: 'Emit an event to the harness event bus',
      parameters: {
        event: { 
          type: 'string', 
          description: 'The event type/name' 
        },
        payload: { 
          type: 'object', 
          description: 'Event payload data',
          default: {}
        }
      },
      handler: async (params: any) => {
        this.eventEngine.emit(params.event, params.payload);
        return {
          success: true,
          event: params.event,
          timestamp: new Date().toISOString()
        };
      }
    });
  }
}

// Export singleton instance
export const harnessCore = new HarnessCorePlugin();
export default {
  id: 'openclaw-harness-core',
  name: 'OpenClaw Harness Core',
  version: harnessCore.version,
  description: 'Workflow engine and state management for Agent orchestration',
  register: (api: any) => harnessCore.register(api),
};
