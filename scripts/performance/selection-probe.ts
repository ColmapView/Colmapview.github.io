import type { Page } from '@playwright/test';

/** Diagnostic instrumentation only; never mix these observations with quiet timing runs. */
export async function installSelectionProbe(page: Page) {
  await page.addInitScript(() => {
    const probe = {
      active: 0, sequence: 0, start: 0,
      events: [] as Array<Record<string, number | string | boolean>>,
      fences: [] as Promise<void>[],
      fenced: false,
      begin(index: number) {
        this.active = index; this.sequence = index; this.start = performance.now(); this.fenced = false;
        performance.mark(`selection-${index}-start`);
      },
      clickReturned() { this.events.push({ selection: this.active, method: 'click-return', at: performance.now(), elapsed: performance.now() - this.start }); },
      raf(index: number) { this.events.push({ selection: this.active, method: `raf-${index}`, at: performance.now(), elapsed: performance.now() - this.start }); },
      end() { performance.mark(`selection-${this.active}-end`); this.active = 0; },
      async settle() { await Promise.all(this.fences); this.fences = []; },
    };
    (window as unknown as { __selectionProbe: typeof probe }).__selectionProbe = probe;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (this: WebGL2RenderingContext, ...args: unknown[]) => unknown>;
    const shaders = new WeakMap<WebGLShader, string>();
    const programs = new WeakMap<WebGLProgram, { id: number; label: string }>();
    const currentPrograms = new WeakMap<WebGL2RenderingContext, WebGLProgram>();
    let nextProgramId = 1;
    const shaderSource = proto.shaderSource;
    proto.shaderSource = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const result = shaderSource.apply(this, args);
      const source = String(args[1]);
      shaders.set(args[0] as WebGLShader, `${source.match(/#define SHADER_NAME (\w+)/)?.[1] ?? source.match(/#define SHADER_TYPE (\w+)/)?.[1] ?? 'custom'}${source.includes('#define USE_COLOR') ? ':vertex-color' : ''}`);
      return result;
    };
    const attachShader = proto.attachShader;
    proto.attachShader = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const result = attachShader.apply(this, args);
      const program = args[0] as WebGLProgram;
      if (!programs.has(program)) programs.set(program, { id: nextProgramId++, label: shaders.get(args[1] as WebGLShader) ?? 'unknown' });
      return result;
    };
    for (const method of ['bufferData', 'bufferSubData', 'shaderSource', 'compileShader', 'linkProgram', 'getProgramInfoLog', 'getShaderInfoLog', 'getProgramParameter', 'getShaderParameter', 'useProgram', 'drawArrays', 'drawElements']) {
      const original = proto[method];
      proto[method] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
        if (method === 'useProgram' && args[0]) currentPrograms.set(this, args[0] as WebGLProgram);
        if (!probe.active || !(this.canvas instanceof HTMLCanvasElement) || !this.canvas.closest('[data-testid="scene-3d"]')) return original.apply(this, args);
        const selection = probe.active;
        const at = performance.now();
        const result = original.apply(this, args);
        const end = performance.now();
        const event: Record<string, number | string | boolean> = { selection, method, at, duration: end - at };
        const program = method.startsWith('draw') ? currentPrograms.get(this) : args[0] as WebGLProgram;
        const identity = program && programs.get(program);
        if (identity) event.program = `${identity.id}:${identity.label}`;
        if (method === 'bufferData' || method === 'bufferSubData') {
          const source = args[method === 'bufferData' ? 1 : 2];
          event.bytes = typeof source === 'number' ? source : ArrayBuffer.isView(source) || source instanceof ArrayBuffer ? source.byteLength : 0;
          // WebGL2 partial uploads pass a source-element offset and count while
          // retaining the full typed array as the source argument.
          if (ArrayBuffer.isView(source)) {
            const elementBytes = 'BYTES_PER_ELEMENT' in source ? Number(source.BYTES_PER_ELEMENT) : 1;
            const offset = typeof args[3] === 'number' ? args[3] : 0;
            const count = typeof args[4] === 'number' && args[4] > 0
              ? args[4] : source.byteLength / elementBytes - offset;
            event.bytes = count * elementBytes;
          }
        }
        if (method === 'drawArrays' || method === 'drawElements') {
          event.mode = Number(args[0]); event.count = Number(args[method === 'drawArrays' ? 2 : 1]);
        }
        probe.events.push(event);
        // The selection point overlay is a nonempty POINTS draw smaller than the
        // million-point base cloud. Fence completion is NOT compositor presentation.
        if (method === 'drawArrays' && args[0] === this.POINTS && typeof args[2] === 'number' && args[2] > 0 && args[2] < 1000000 && !probe.fenced) {
          probe.fenced = true;
          const gl = this as WebGL2RenderingContext;
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (sync) {
            gl.flush();
            const started = probe.start;
            probe.fences.push(new Promise<void>(resolve => {
              const poll = () => {
                const status = gl.clientWaitSync(sync, 0, 0);
                const now = performance.now();
                const completed = status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED;
                if (completed || status === gl.WAIT_FAILED || now - started > 5000) {
                  probe.events.push({ selection, method: 'overlay-gpu-completion-observed', at: now, elapsed: now - started, completed });
                  gl.deleteSync(sync); resolve();
                } else setTimeout(poll, 0);
              };
              setTimeout(poll, 0);
            }));
          }
        }
        return result;
      };
    }
  });
}
