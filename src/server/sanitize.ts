import { Request, Response, NextFunction } from 'express';

function stripHtml(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/['"]?(?:javascript|data|vbscript):/gi, '')
      .replace(/&#x?[0-9a-f]+;/gi, '') // strip HTML entities (&#x3C;, &#60;)
      .replace(/on\w+\s*=\s*['"][^'"]*['"]/gi, '') // strip event handlers (onload=, onclick=)
      .replace(/style\s*=\s*['"][^'"]*['"]/gi, '') // strip style attributes with expressions
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(stripHtml);
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = stripHtml(v);
    }
    return sanitized;
  }
  return value;
}

export function xssSanitize(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = stripHtml(req.body) as typeof req.body;
  }
  next();
}
