import { forwardRef, Module } from "@nestjs/common";
import { AiProcessService } from "./services/ai-process.service";
import { AiHttpClientService } from "./services/ai-http-client/ai-http-client.service";
import { AiDishService } from "./services/dish/ai-dish.service";
import { AiPlanService } from "./services/plan/ai-plan.service";
import { AiParsePlanService } from "./services/plan/ai-parse-plan.service";
import { AiPrepareService } from "./services/prepare/ai-prepare.service";
import { AiRecipeService } from "./services/recipe/ai-recipe.service";
import { AiParseRecipeService } from "./services/recipe/ai-parse-recipe.service";
import { AiRegenerateService } from "./services/regenerate/ai-regenerate.service";
import { AiSimpleMessageService } from "./services/simple-message/ai-simple-message.service";
import { AiService } from "./ai.service";
import { AiUserService } from "./services/ai-user/ai-user.service";
import { UserModule } from "src/user/user.module";
import { AiChatService } from "./services/ai-chat/ai-chat.service";
import { HttpModule } from "@nestjs/axios";
import { ChatModule } from "src/chat/chat.module";
import { DishModule } from "src/dish/dish.module";
import { PrismaService } from "src/prisma.service";
import { AiController } from "./ai.controller";
import { PlanModule } from "src/plan/plan.module";
import { AiPlanGeneratorService } from "./services/ai-plan-generator/ai-plan-generator.service";

@Module({
  imports: [
    UserModule,
    HttpModule,
    forwardRef(() => DishModule),
    forwardRef(() => ChatModule),
    PlanModule,
  ],
  controllers: [AiController],
  providers: [
    PrismaService,
    AiService,
    AiProcessService,
    AiHttpClientService,
    AiDishService,
    AiPlanService,
    AiParsePlanService,
    AiPrepareService,
    AiRecipeService,
    AiParseRecipeService,
    AiRegenerateService,
    AiSimpleMessageService,
    AiUserService,
    AiChatService,
    AiPlanGeneratorService,
  ],
  exports: [AiRecipeService],
})
export class AiModule {}
