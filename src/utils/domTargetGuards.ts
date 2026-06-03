export function isNodeTarget(target: EventTarget | null): target is Node {
  return target instanceof Node;
}

export function containsEventTarget(container: Node, target: EventTarget | null): boolean {
  return isNodeTarget(target) && container.contains(target);
}

export function isEventTargetOutside(container: Node | null, target: EventTarget | null): boolean {
  return container !== null && isNodeTarget(target) && !container.contains(target);
}
