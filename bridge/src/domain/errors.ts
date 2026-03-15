export type DomainErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INTERNAL"
  | "AUTH";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly correlationId: string;

  constructor(code: DomainErrorCode, message: string, correlationId?: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.correlationId = correlationId ?? `corr-${Date.now()}`;
  }
}
