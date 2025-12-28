import { PrismaService } from "@/prisma.service";
import { HttpModule } from "@nestjs/axios";
import { forwardRef, Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { DishModule } from "src/dish/dish.module";
import { UserModule } from "src/user/user.module";
import { PlanModule } from "src/plan/plan.module";
import { AiModule } from "src/ai/ai.module";

@Module({
  controllers: [ChatController],
  providers: [ChatService, PrismaService],
  imports: [
    HttpModule,
    forwardRef(() => DishModule),
    UserModule,
    forwardRef(() => PlanModule),
    forwardRef(() => AiModule),
  ],
  exports: [ChatService],
})
export class ChatModule {}
