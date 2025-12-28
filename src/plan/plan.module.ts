import { forwardRef, Module } from "@nestjs/common";
import { PlanService } from "./plan.service";
import { PlanController } from "./plan.controller";
import { PrismaService } from "@/prisma.service";
import { AiModule } from "@/ai/ai.module";
import { DishModule } from "@/dish/dish.module";

@Module({
  controllers: [PlanController],
  providers: [PlanService, PrismaService],
  exports: [PlanService],
  imports: [forwardRef(() => AiModule), forwardRef(() => DishModule)],
})
export class PlanModule {}
