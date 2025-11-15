import { Module } from "@nestjs/common";
import { PlanService } from "./plan.service";
import { PlanController } from "./plan.controller";
import { PrismaService } from "@/prisma.service";

@Module({
  controllers: [PlanController],
  providers: [PlanService, PrismaService],
  exports: [PlanService],
})
export class PlanModule {}
