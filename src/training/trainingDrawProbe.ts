/** Development-only draw-submission evidence; never retains files or GPU objects. */
export class TrainingDrawProbe {
  private resources = new WeakMap<object, { id: number; fileName: string; sourceRows: number }>();
  private files = new WeakMap<File, number>();
  private drawn = new Set<number>();
  private nextId = 0;
  private events: { id: number; fileName: string; sourceRows: number; mappedRows: number; activeSplats: number | null; atMs: number }[] = [];
  private overflow = false;

  register(node: object, file: File, sourceRows: number) {
    let id = this.files.get(file);
    if (id === undefined) { id = ++this.nextId; this.files.set(file, id); }
    this.resources.set(node, { id, fileName: file.name, sourceRows });
  }

  observe(mapping: readonly { node: object; count: number }[], activeSplats: number | null, atMs = performance.now()) {
    if (activeSplats !== null && activeSplats <= 0) return;
    for (const { node, count } of mapping) {
      const resource = this.resources.get(node);
      if (!resource || this.drawn.has(resource.id) || count <= 0) continue;
      if (this.events.length >= 256) { this.overflow = true; return; }
      this.drawn.add(resource.id);
      this.events.push({ ...resource, mappedRows: count, activeSplats, atMs });
    }
  }

  inspect() { return { events: this.events.map(event => ({ ...event })), overflow: this.overflow }; }
}

export const trainingDrawProbe = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('e2eProbe') === '1'
  ? new TrainingDrawProbe() : null;

export function createTrainingWebGpuDrawProbe(file: File, count: number): (() => void) | undefined {
  if (!trainingDrawProbe) return undefined;
  const node = {};
  trainingDrawProbe.register(node, file, count);
  // Uploaded row count is known; the renderer's culled/active count is not.
  return () => trainingDrawProbe?.observe([{ node, count }], null);
}
