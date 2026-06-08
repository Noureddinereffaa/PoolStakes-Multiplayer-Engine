import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
let logStreamInitialized = false;

async function ensureLogDir() {
  if (!logStreamInitialized) {
    if (!existsSync(LOG_DIR)) {
      await mkdir(LOG_DIR, { recursive: true });
    }
    logStreamInitialized = true;
  }
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry) + '\n';
}

async function writeLog(entry: LogEntry) {
  await ensureLogDir();
  const line = formatEntry(entry);
  try {
    await appendFile(LOG_FILE, line, 'utf-8');
  } catch {
    // Fail silently — never throw in logging
  }
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

function shouldLog(level: LogLevel): boolean {
  const current = (process.env.LOG_LEVEL || 'info') as LogLevel;
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[current];
}

function createLogFn(level: LogLevel) {
  return (message: string, data?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log;
    consoleFn(`[${level.toUpperCase()}] ${message}`, data ? JSON.stringify(data) : '');
    writeLog(entry).catch(() => {});
  };
}

export const logger = {
  debug: createLogFn('debug'),
  info: createLogFn('info'),
  warn: createLogFn('warn'),
  error: createLogFn('error'),
};

import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
}
