import type * as React from 'react';

type EventMethod = () => void;

interface KeyboardEventBuilderOptions {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: EventTarget | null;
  preventDefault?: EventMethod;
}

interface PointerEventBuilderOptions {
  button?: number;
  clientX?: number;
  clientY?: number;
  pointerType?: string;
  preventDefault?: EventMethod;
  stopPropagation?: EventMethod;
}

interface MouseEventBuilderOptions {
  button?: number;
  clientX?: number;
  clientY?: number;
  movementX?: number;
  movementY?: number;
  shiftKey?: boolean;
  preventDefault?: EventMethod;
  stopPropagation?: EventMethod;
}

interface WheelEventBuilderOptions {
  deltaY?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  defaultPrevented?: boolean;
  preventDefault?: EventMethod;
}

interface TouchBuilderOptions {
  identifier?: number;
  clientX?: number;
  clientY?: number;
}

interface TouchEventBuilderOptions {
  type?: string;
  changedTouches?: Touch[];
  touches?: Touch[];
  bubbles?: boolean;
  cancelable?: boolean;
}

interface ReactMouseEventBuilderOptions {
  clientX?: number;
  clientY?: number;
  preventDefault?: EventMethod;
  stopPropagation?: EventMethod;
}

type ReactPointerEventBuilderOptions = ReactMouseEventBuilderOptions;

interface ReactTouchEventBuilderOptions {
  touches?: Touch[];
  preventDefault?: EventMethod;
  stopPropagation?: EventMethod;
}

type MutableTouchList = TouchList & ReactTouchList & {
  [index: number]: Touch;
};

type ReactTouchList = React.TouchList;

interface ThreeEventBuilderOptions<TNativeEvent extends Event> {
  instanceId?: number;
  nativeEvent: TNativeEvent;
  stopPropagation?: EventMethod;
}

export type TestReactMouseEvent<TElement extends Element = Element> = Pick<
  React.MouseEvent<TElement>,
  'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'
>;

export type TestReactPointerEvent<TElement extends Element = Element> = Pick<
  React.PointerEvent<TElement>,
  'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'
>;

export type TestReactTouchEvent<TElement extends Element = HTMLDivElement> = Pick<
  React.TouchEvent<TElement>,
  'touches' | 'preventDefault' | 'stopPropagation'
>;

export type TestThreeEvent<TNativeEvent extends Event> = {
  instanceId?: number;
  nativeEvent: TNativeEvent;
  stopPropagation: EventMethod;
};

class TestPointerEvent extends MouseEvent implements PointerEvent {
  readonly altitudeAngle = 0;
  readonly azimuthAngle = 0;
  readonly height = 1;
  readonly isPrimary = true;
  readonly pointerId = 1;
  readonly pointerType: string;
  readonly pressure = 0;
  readonly tangentialPressure = 0;
  readonly tiltX = 0;
  readonly tiltY = 0;
  readonly twist = 0;
  readonly width = 1;

  constructor({
    button = 0,
    clientX = 0,
    clientY = 0,
    pointerType = 'mouse',
    preventDefault = () => undefined,
    stopPropagation = () => undefined,
  }: PointerEventBuilderOptions = {}) {
    super('pointermove', {
      bubbles: true,
      button,
      cancelable: true,
      clientX,
      clientY,
    });
    this.pointerType = pointerType;
    defineEventMethodOverrides(this, { preventDefault, stopPropagation });
  }

  getCoalescedEvents(): PointerEvent[] {
    return [];
  }

  getPredictedEvents(): PointerEvent[] {
    return [];
  }
}

class TestTouch implements Touch {
  readonly clientX: number;
  readonly clientY: number;
  readonly force = 0;
  readonly identifier: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly radiusX = 1;
  readonly radiusY = 1;
  readonly rotationAngle = 0;
  readonly screenX: number;
  readonly screenY: number;
  readonly target: EventTarget;

  constructor({
    identifier = 0,
    clientX = 0,
    clientY = 0,
  }: TouchBuilderOptions = {}) {
    this.identifier = identifier;
    this.clientX = clientX;
    this.clientY = clientY;
    this.pageX = clientX;
    this.pageY = clientY;
    this.screenX = clientX;
    this.screenY = clientY;
    this.target = document.body;
  }
}

class TestTouchEvent extends UIEvent implements TouchEvent {
  readonly altKey = false;
  readonly changedTouches: TouchList;
  readonly ctrlKey = false;
  readonly metaKey = false;
  readonly shiftKey = false;
  readonly targetTouches: TouchList;
  readonly touches: TouchList;

  constructor({
    type = 'touchstart',
    changedTouches = [],
    touches = changedTouches,
    bubbles = true,
    cancelable = true,
  }: TouchEventBuilderOptions = {}) {
    super(type, { bubbles, cancelable });
    this.changedTouches = buildTouchList(changedTouches);
    this.touches = buildTouchList(touches);
    this.targetTouches = this.touches;
  }
}

export function buildKeyboardEvent({
  key = '',
  ctrlKey = false,
  metaKey = false,
  target = document.body,
  preventDefault = () => undefined,
}: KeyboardEventBuilderOptions = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey,
    key,
    metaKey,
  });

  Object.defineProperties(event, {
    target: {
      configurable: true,
      value: target,
    },
  });
  defineEventMethodOverrides(event, { preventDefault });

  return event;
}

export function buildPointerEvent({
  ...options
}: PointerEventBuilderOptions = {}): PointerEvent {
  return new TestPointerEvent(options);
}

export function buildMouseEvent({
  button = 0,
  clientX = 0,
  clientY = 0,
  movementX = 0,
  movementY = 0,
  shiftKey = false,
  preventDefault = () => undefined,
  stopPropagation = () => undefined,
}: MouseEventBuilderOptions = {}): MouseEvent {
  const event = new MouseEvent('mousemove', {
    bubbles: true,
    button,
    cancelable: true,
    clientX,
    clientY,
    shiftKey,
  });

  Object.defineProperties(event, {
    movementX: {
      configurable: true,
      value: movementX,
    },
    movementY: {
      configurable: true,
      value: movementY,
    },
  });
  defineEventMethodOverrides(event, { preventDefault, stopPropagation });

  return event;
}

export function buildWheelEvent({
  deltaY = 0,
  altKey = false,
  ctrlKey = false,
  defaultPrevented = false,
  preventDefault = () => undefined,
}: WheelEventBuilderOptions = {}): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
    altKey,
    ctrlKey,
  });

  if (defaultPrevented) {
    Object.defineProperties(event, {
      defaultPrevented: {
        configurable: true,
        value: defaultPrevented,
      },
    });
  }

  defineEventMethodOverrides(event, { preventDefault });

  return event;
}

export function buildTouch({
  ...options
}: TouchBuilderOptions = {}): Touch {
  return new TestTouch(options);
}

export function buildTouchEvent({
  ...options
}: TouchEventBuilderOptions = {}): TouchEvent {
  return new TestTouchEvent(options);
}

export function buildReactMouseEvent<TElement extends Element = Element>({
  clientX = 0,
  clientY = 0,
  preventDefault = () => undefined,
  stopPropagation = () => undefined,
}: ReactMouseEventBuilderOptions = {}): TestReactMouseEvent<TElement> {
  return {
    clientX,
    clientY,
    preventDefault,
    stopPropagation,
  };
}

export function buildReactPointerEvent<TElement extends Element = Element>({
  clientX = 0,
  clientY = 0,
  preventDefault = () => undefined,
  stopPropagation = () => undefined,
}: ReactPointerEventBuilderOptions = {}): TestReactPointerEvent<TElement> {
  return {
    clientX,
    clientY,
    preventDefault,
    stopPropagation,
  };
}

export function buildReactTouchEvent({
  touches = [],
  preventDefault = () => undefined,
  stopPropagation = () => undefined,
}: ReactTouchEventBuilderOptions = {}): TestReactTouchEvent<HTMLDivElement> {
  const reactTouches = buildTouchList(touches);

  return {
    preventDefault,
    stopPropagation,
    touches: reactTouches,
  };
}

export function buildThreePointerEvent({
  instanceId,
  nativeEvent,
  stopPropagation = () => undefined,
}: ThreeEventBuilderOptions<PointerEvent>): TestThreeEvent<PointerEvent> {
  return {
    instanceId,
    nativeEvent,
    stopPropagation,
  };
}

export function buildThreeMouseEvent({
  instanceId,
  nativeEvent,
  stopPropagation = () => undefined,
}: ThreeEventBuilderOptions<MouseEvent>): TestThreeEvent<MouseEvent> {
  return {
    instanceId,
    nativeEvent,
    stopPropagation,
  };
}

function buildTouchList(touches: Touch[]): MutableTouchList {
  const touchList: MutableTouchList = {
    length: touches.length,
    item: (index: number) => touches[index] ?? null,
    identifiedTouch: (identifier: number) => touches.find((touch) => touch.identifier === identifier) ?? touches[0] ?? buildTouch(),
    [Symbol.iterator]: () => touches[Symbol.iterator](),
  };

  touches.forEach((touch, index) => {
    touchList[index] = touch;
  });

  return touchList;
}

function defineEventMethodOverrides(
  event: Event,
  {
    preventDefault,
    stopPropagation,
  }: {
    preventDefault?: EventMethod;
    stopPropagation?: EventMethod;
  }
): void {
  const properties: PropertyDescriptorMap = {};

  if (preventDefault) {
    properties.preventDefault = {
      configurable: true,
      value: preventDefault,
    };
  }

  if (stopPropagation) {
    properties.stopPropagation = {
      configurable: true,
      value: stopPropagation,
    };
  }

  Object.defineProperties(event, properties);
}
