import { forwardRef, Module } from "@nestjs/common";
import { PrismaService } from "@/prisma.service";
import { DishController } from "./dish.controller";
import { DishService } from "./dish.service";
import { ChatModule } from "src/chat/chat.module";
import { RecipeController } from "./recipe.controller";
import { AiModule } from "src/ai/ai.module";

@Module({
  providers: [DishService, PrismaService],
  controllers: [DishController, RecipeController],
  exports: [DishService],
  imports: [forwardRef(() => ChatModule), forwardRef(() => AiModule)],
})
export class DishModule {}
