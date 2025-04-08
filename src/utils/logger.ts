import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';

// Ensure logs directory exists
const logDir = path.join(homedir(), '.openapi-mcp', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.metadata(),
  winston.format.json({ space: 2 }),
  winston.format.prettyPrint()
);

// Create rotating file transport
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '5k', // 5KB max size per file
  maxFiles: 10, // Keep 10 files
  format: logFormat,
});

// creteate console transport
const consoleTransport = new winston.transports.Console({
  format: logFormat,
  stderrLevels: ['error', 'warn', 'info', 'debug'],
  level: process.env.LOG_LEVEL || 'debug',
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: logFormat,
  defaultMeta: { service: 'openapi-to-mcp' },
  transports: [
    fileRotateTransport,
    consoleTransport
  ],
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

export default logger;