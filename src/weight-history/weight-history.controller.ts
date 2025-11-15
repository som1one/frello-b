import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "@/auth/guards/jwt.guard";
import { IsEmailConfirmedGuard } from "@/auth/guards/is-email-confirm.guard";
import { GetUserId } from "src/auth/decorators/auth.decorator";
import { WeightHistoryService } from "./weight-history.service";

@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
@Controller("weight-history")
export class WeightHistoryController {
  constructor(private readonly service: WeightHistoryService) {}

  @Get("")
  async getWeightHistory(@GetUserId() userId: string) {
    return await this.service.getWeightHistory(userId);
  }

  @Post("/weight")
  async addWeight(
    @GetUserId() userId: string,
    @Body() { weight }: { weight: number },
  ) {
    return await this.service.updateWeight({ userId, weight });
  }
}
