/**
 * Deterministic LangGraph-style state machine for idea execution.
 * Nodes: compress → lock → branch → agent → verify → commit → pr → unlock
 */

export type GraphNodeName =
  'compress' | 'lock' | 'branch' | 'agent' | 'verify' | 'commit' | 'pr' | 'unlock' | 'fail';

export type GraphState = {
  node: GraphNodeName;
  contextPack: string;
  lockedFiles: string[];
  branchName: string;
  lintOk: boolean;
  testsOk: boolean;
  verifyLog: string;
  commitSha: string | null;
  prUrl: string | null;
  error: string | null;
  done: boolean;
};

export type NodeHandler = (
  state: GraphState
) => Promise<Partial<GraphState> & { node?: GraphNodeName }>;

export class StateGraph {
  private handlers = new Map<GraphNodeName, NodeHandler>();
  private edges = new Map<GraphNodeName, (state: GraphState) => GraphNodeName | null>();

  addNode(name: GraphNodeName, handler: NodeHandler): this {
    this.handlers.set(name, handler);
    return this;
  }

  addEdge(
    from: GraphNodeName,
    to: GraphNodeName | ((state: GraphState) => GraphNodeName | null)
  ): this {
    this.edges.set(from, typeof to === 'function' ? to : () => to);
    return this;
  }

  async run(initial: GraphState, maxSteps = 24): Promise<GraphState> {
    let state = { ...initial };
    for (let i = 0; i < maxSteps; i++) {
      if (state.done) return state;
      const current = state.node;
      const handler = this.handlers.get(current);
      if (!handler) throw new Error(`No handler for node ${current}`);
      const patch = await handler(state);
      state = { ...state, ...patch };
      // Keep graph position as the node we executed unless handler forced a jump
      if (!patch.node) state.node = current;
      else state.node = patch.node;

      if (state.done) return state;

      const nextFn = this.edges.get(current);
      const next = nextFn ? nextFn(state) : null;
      if (!next) {
        state.done = true;
        return state;
      }
      state.node = next;
    }
    state.error = state.error || 'Max graph steps exceeded';
    state.node = 'fail';
    return state;
  }
}

export function buildIdeaGraph(handlers: Record<GraphNodeName, NodeHandler>): StateGraph {
  const g = new StateGraph();
  (Object.keys(handlers) as GraphNodeName[]).forEach((name) => g.addNode(name, handlers[name]!));

  g.addEdge('compress', 'lock');
  g.addEdge('lock', (s) => (s.error ? 'fail' : 'branch'));
  g.addEdge('branch', (s) => (s.error ? 'fail' : 'agent'));
  g.addEdge('agent', (s) => (s.error ? 'unlock' : 'verify'));
  g.addEdge('verify', (s) => (s.lintOk && s.testsOk ? 'commit' : 'unlock'));
  g.addEdge('commit', (s) => (s.error ? 'unlock' : 'pr'));
  g.addEdge('pr', 'unlock');
  g.addEdge('unlock', () => null);
  g.addEdge('fail', 'unlock');
  return g;
}
