import { z } from 'zod';
import { commandRequestSchema, executeAgentCommand, readAgentState, listAgentFeatures,
  startAgentSession, endAgentSession, useCommandState, queryAgentImages, imageQuerySchema } from '../commands/runtime';

interface ModelContext {
  registerTool(tool: {
    name: string; description: string; inputSchema: object;
    annotations: { readOnlyHint: boolean; consequentialHint: boolean };
    execute: (input: unknown, context: { signal?: AbortSignal }) => Promise<string>;
  }, options: { signal: AbortSignal }): Promise<void> | void;
}
export interface ColmapAgentBridge {
  protocolVersion: 1;
  listFeatures: typeof listAgentFeatures;
  readState: typeof readAgentState;
  execute: typeof executeAgentCommand;
  queryImages: typeof queryAgentImages;
}
declare global {
  interface Window { colmapAgent?: ColmapAgentBridge }
}

let cleanup: (() => void) | undefined;

/** Called by the consent button, never made available as an agent tool. */
export async function enableAgentControl(): Promise<string> {
  disableAgentControl();
  const sessionId = startAgentSession();
  const abort = new AbortController();
  const checkSession = () => {
    if (useCommandState.getState().sessionId !== sessionId) throw new Error('This agent session has ended.');
  };
  const bridge: ColmapAgentBridge = Object.freeze({ protocolVersion: 1,
    listFeatures: () => { checkSession(); return listAgentFeatures(); },
    readState: () => { checkSession(); return readAgentState(); },
    execute: (input: unknown, signal?: AbortSignal) => { checkSession(); return executeAgentCommand(input, signal); },
    queryImages: (input: unknown) => { checkSession(); return queryAgentImages(input); },
  });
  window.colmapAgent = bridge;
  const timer = window.setTimeout(disableAgentControl, 30 * 60 * 1000);
  const unsubscribe = useCommandState.subscribe(state => {
    if (!state.sessionId) cleanup?.();
  });
  cleanup = () => {
    cleanup = undefined;
    unsubscribe();
    clearTimeout(timer);
    abort.abort();
    if (window.colmapAgent === bridge) delete window.colmapAgent;
    window.removeEventListener('pagehide', disableAgentControl);
  };
  window.addEventListener('pagehide', disableAgentControl);
  const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!modelContext?.registerTool) return 'Browser bridge ready. WebMCP is unavailable in this browser.';
  const tools = [
    { name: 'colmap_list_features', description: 'Discover supported COLMAP View feature contracts and input schemas.', readOnly: true,
      schema: z.toJSONSchema(z.strictObject({})), execute: () => listAgentFeatures() },
    { name: 'colmap_read_state', description: 'Read the active session, settings, revision and dataset generation before issuing a command.', readOnly: true,
      schema: z.toJSONSchema(z.strictObject({})), execute: () => readAgentState() },
    { name: 'colmap_query_images', description: 'Read a bounded page of dataset image IDs and names. Pass returned datasetGeneration on subsequent pages.', readOnly: true,
      schema: z.toJSONSchema(imageQuerySchema), execute: queryAgentImages },
    { name: 'colmap_execute', description: 'Set a feature or undo. Requires current session/revisions. dataset.loadUrl accepts a non-cancellable URL load job: poll its state for completion. Does not pick local files, bake transforms or export.', readOnly: false,
      schema: z.toJSONSchema(commandRequestSchema), execute: executeAgentCommand },
  ];
  try {
    for (const tool of tools) {
      if (abort.signal.aborted) return 'Agent control stopped.';
      await modelContext.registerTool({ name: tool.name, description: tool.description,
        inputSchema: tool.schema, annotations: { readOnlyHint: tool.readOnly, consequentialHint: !tool.readOnly },
        execute: async (input, context) => {
          if (abort.signal.aborted) throw new Error('Agent control stopped.');
          if (tool.readOnly && tool.name !== 'colmap_query_images') z.strictObject({}).parse(input);
          return JSON.stringify(tool.execute(input, context.signal));
        },
      }, { signal: abort.signal });
    }
    return abort.signal.aborted ? 'Agent control stopped.' : 'WebMCP tools and browser bridge ready.';
  } catch {
    abort.abort(); // Remove partial native registration; keep the ordinary bridge.
    return 'Browser bridge ready. WebMCP registration was unavailable.';
  }
}

export function disableAgentControl() {
  cleanup?.();
  endAgentSession();
}

if (import.meta.hot) import.meta.hot.dispose(disableAgentControl);
