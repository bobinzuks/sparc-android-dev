/**
 * Interface for the Observability Service component
 * Provides methods for logging, metrics, and tracing
 */
export interface ObservabilityService {
  /**
   * Record a metric value
   * @param name Name of the metric
   * @param value Value of the metric
   * @param tags Optional tags for the metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
  
  /**
   * Record an event
   * @param name Name of the event
   * @param properties Optional properties for the event
   */
  recordEvent(name: string, properties?: Record<string, any>): void;
  
  /**
   * Record an error
   * @param name Name of the error
   * @param error Error object
   * @param context Optional context for the error
   */
  recordError(name: string, error: Error, context?: Record<string, any>): void;
  
  /**
   * Start a trace span
   * @param name Name of the span
   * @param parentSpanId Optional parent span ID
   * @returns Span ID
   */
  startSpan(name: string, parentSpanId?: string): string;
  
  /**
   * End a trace span
   * @param spanId ID of the span to end
   * @param status Optional status of the span
   */
  endSpan(spanId: string, status?: SpanStatus): void;
  
  /**
   * Add attributes to a trace span
   * @param spanId ID of the span
   * @param attributes Attributes to add
   */
  addSpanAttributes(spanId: string, attributes: Record<string, any>): void;
  
  /**
   * Record a log message
   * @param level Log level
   * @param message Log message
   * @param context Optional context for the log
   */
  log(level: LogLevel, message: string, context?: Record<string, any>): void;
  
  /**
   * Set the global context for all observability data
   * @param context Global context
   */
  setGlobalContext(context: Record<string, any>): void;
  
  /**
   * Get the current global context
   * @returns Global context
   */
  getGlobalContext(): Record<string, any>;
}

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Span status
 */
export enum SpanStatus {
  OK = 'ok',
  ERROR = 'error',
  CANCELLED = 'cancelled'
}