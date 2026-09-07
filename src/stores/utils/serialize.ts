export function serializeDates<T = any>(input: T): T {
  if (input === null || input === undefined) return input;
  if (input instanceof Date) return input.toISOString() as any;
  if (Array.isArray(input)) return input.map(serializeDates) as any;
  if (typeof input === "object") {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, any>)) {
      out[key] = serializeDates(value);
    }
    return out as T;
  }
  return input;
}


