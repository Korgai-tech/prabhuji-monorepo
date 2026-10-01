export class AppError extends Error {
  readonly statusCode: number;
  readonly errorCode?: string;

  constructor(message: string, statusCode = 500, errorCode?: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errorCode = "VALIDATION_ERROR") {
    super(message, 400, errorCode);
  }
}
