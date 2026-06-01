export interface AppLogger {
  debug: (...data: unknown[]) => void;
  error: (...data: unknown[]) => void;
  info: (...data: unknown[]) => void;
  warn: (...data: unknown[]) => void;
}

export const appLogger: AppLogger = {
  debug: (...data) => console.debug(...data),
  error: (...data) => console.error(...data),
  info: (...data) => console.log(...data),
  warn: (...data) => console.warn(...data),
};

export const noopLogger: AppLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};
