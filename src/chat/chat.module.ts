import { PlanService } from "@/plan/plan.service";
import { PrismaService } from "@/prisma.service";
import { HttpModule } from "@nestjs/axios";
import { forwardRef, Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { DishModule } from "src/dish/dish.module";
import { UserModule } from "src/user/user.module";

@Module({
  controllers: [ChatController],
  providers: [ChatService, PlanService, PrismaService],
  imports: [HttpModule, forwardRef(() => DishModule), UserModule],
  exports: [ChatService],
})
export class ChatModule {}
