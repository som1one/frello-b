import {
  ExecutionContext,
  UseGuards,
  createParamDecorator,
  UnauthorizedException,
} from "@nestjs/common";

import { JwtAuthGuard } from "../guards/jwt.guard";

export const Auth = () => UseGuards(JwtAuthGuard);

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    console.log(request.user);
    return request.user;
  },
);

export const GetUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user || typeof request.user.id === "undefined") {
      throw new UnauthorizedException("User not found or not authorized");
    }
    return request.user.id;
  },
);
