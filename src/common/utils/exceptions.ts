import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessRuleException extends HttpException {
  constructor(message: string) {
    super(
      { code: 'BUSINESS_RULE_VIOLATION', message },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class ConflictException extends HttpException {
  constructor(message: string) {
    super({ code: 'CONFLICT', message }, HttpStatus.CONFLICT);
  }
}

export class NotFoundException extends HttpException {
  constructor(message: string) {
    super({ code: 'NOT_FOUND', message }, HttpStatus.NOT_FOUND);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message: string) {
    super({ code: 'FORBIDDEN', message }, HttpStatus.FORBIDDEN);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message: string) {
    super({ code: 'UNAUTHORIZED', message }, HttpStatus.UNAUTHORIZED);
  }
}
