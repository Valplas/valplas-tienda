/**
 * Logger estructurado para la aplicación
 *
 * Proporciona logging con diferentes niveles y estructura consistente
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private formatLog(entry: LogEntry): string {
    if (this.isDevelopment) {
      // Formato legible para desarrollo
      const contextStr = entry.context ? `\n${JSON.stringify(entry.context, null, 2)}` : '';
      return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}`;
    }

    // Formato JSON para producción (compatible con herramientas de log aggregation)
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context
    };

    const formatted = this.formatLog(entry);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }
}

// Singleton instance
export const logger = new Logger();
