import { Request, Response, NextFunction } from 'express';

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function convertKeysToCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(convertKeysToCamelCase);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        snakeToCamel(k),
        convertKeysToCamelCase(v)
      ])
    );
  }
  return value;
}

export function camelCaseResponse(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = function (data: unknown) {
    return originalJson(convertKeysToCamelCase(data));
  };
  next();
}
