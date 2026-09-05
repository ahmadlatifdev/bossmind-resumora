/**
 * Deterministic LangGraph-style state machine for idea execution.
 * Nodes: compress → lock → branch → agent → verify → commit → pr → unlock
 */
export class StateGraph {
  handlers = new Map();
  edges = new Map();
  addNode(name, handler) {
    this.handlers.set(name, handler);
    return this;
  }
  addEdge(from, to) {
    this.edges.set(from, typeof to === 'function' ? to : () => to);
    return this;
  }
  async run(initial, maxSteps = 24) {
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
export function buildIdeaGraph(handlers) {
  const g = new StateGraph();
  Object.keys(handlers).forEach((name) => g.addNode(name, handlers[name]));
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
