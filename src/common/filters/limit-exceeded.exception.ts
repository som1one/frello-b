import { HttpException, HttpStatus } from "@nestjs/common";

export type LimitType = "daily" | "trial";

export class LimitExceededException extends HttpException {
  constructor(
    private readonly type: LimitType,
    message: string,
  ) {
    super(message, HttpStatus.FORBIDDEN);
  }

  getResponse(): any {
    return {
      message: this.message,
      type: this.type,
    };
  }
}
