export interface SelectRowOption<T extends string = string> {
  value: T;
  label: string;
}

export function getNextSelectRowValue<T extends string>(
  options: readonly SelectRowOption<T>[],
  value: T,
  deltaY: number
): T | null {
  if (options.length === 0) {
    return null;
  }

  const currentIndex = options.findIndex(option => option.value === value);
  if (deltaY > 0) {
    const nextIndex = Math.min(currentIndex + 1, options.length - 1);
    return options[nextIndex].value;
  }

  const previousIndex = Math.max(currentIndex - 1, 0);
  return options[previousIndex].value;
}

export function getSelectRowOptionValue<T extends string>(
  options: readonly SelectRowOption<T>[],
  value: string
): T | null {
  return options.find(option => option.value === value)?.value ?? null;
}

export function getToggledRowValue(checked: boolean): boolean {
  return !checked;
}
