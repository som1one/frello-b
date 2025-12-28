// backend/src/plan/plan.service.ts
import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from "@nestjs/common";
import { PrismaService } from "@/prisma.service";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { RequestType } from "@prisma/client";
import { AiParsePlanService } from "@/ai/services/plan/ai-parse-plan.service";
import { AiParseRecipeService } from "@/ai/services/recipe/ai-parse-recipe.service";
import { AiPlanGeneratorService } from "@/ai/services/ai-plan-generator/ai-plan-generator.service";
import { AiUserService } from "@/ai/services/ai-user/ai-user.service";
import { DishService } from "@/dish/dish.service";

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);
  constructor(
    private prismaService: PrismaService,
    private aiParsePlanService: AiParsePlanService,
    private aiParseRecipeService: AiParseRecipeService,
    private aiPlanGeneratorService: AiPlanGeneratorService,
    private aiUserService: AiUserService,
    private dishService: DishService,
  ) { }

  async create(dto: CreatePlanDto, userId: string) {
    this.logger.log(
      "Creating in create plan with:",
      JSON.stringify(dto, null, 2),
    );

    const message = await this.prismaService.message.findUnique({
      where: { id: dto.messageId },
    });
    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    let date: Date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    if (dto.plan.length > 1) {
      const firstDayOfWeek = new Date(date);
      const dayOfWeek = date.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      firstDayOfWeek.setDate(date.getDate() + diff);
      date = firstDayOfWeek;
    }

    const createdPlans = [];
    for (const day of dto.plan) {
      const createdPlan = await this.prismaService.mealPlan.create({
        data: {
          date,
          userId,
          meals: {
            createMany: {
              data: day.meals.map((meal) => ({
                type: meal.type,
                dishId: meal.dishId,
                recipeName: meal.recipeName,
                calories: meal.calories,
              })),
            },
          },
        },
      });
      createdPlans.push(createdPlan);
      date.setUTCDate(date.getUTCDate() + 1);
    }

    if (createdPlans.length > 0) {
      await this.prismaService.message.update({
        where: { id: dto.messageId },
        data: { planId: createdPlans[0].id },
      });
    }

    const updatedMessage = await this.prismaService.message.findUnique({
      where: { id: dto.messageId },
    });

    return {
      id: createdPlans[0]?.id || null,
      plans: createdPlans,
      message: updatedMessage,
    };
  }

  async createAndToggleFavorite(dto: CreatePlanDto, userId: string) {
    this.logger.log(
      " Creating in create and toggle plan with:",
      JSON.stringify(dto, null, 2),
    );

    const message = await this.prismaService.message.findUnique({
      where: { id: dto.messageId },
    });
    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    let date: Date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    if (dto.plan.length > 1) {
      const firstDayOfWeek = new Date(date);
      const dayOfWeek = date.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      firstDayOfWeek.setDate(date.getDate() + diff);
      date = firstDayOfWeek;
    }

    const createdPlans = [];
    for (const day of dto.plan) {
      const createdPlan = await this.prismaService.mealPlan.create({
        data: {
          date,
          userId,
          meals: {
            createMany: {
              data: day.meals.map((meal) => ({
                type: meal.type,
                dishId: meal.dishId,
                recipeName: meal.recipeName,
                calories: meal.calories,
                portionSize: meal.portionSize || 0,
              })),
            },
          },
          visible: true,
        },
      });
      createdPlans.push(createdPlan);
      date.setUTCDate(date.getUTCDate() + 1);
    }

    if (createdPlans.length > 0) {
      await this.prismaService.message.update({
        where: { id: dto.messageId },
        data: { planId: createdPlans[0].id },
      });
    }

    const updatedMessage = await this.prismaService.message.findUnique({
      where: { id: dto.messageId },
    });

    return {
      id: createdPlans[0]?.id || null,
      plans: createdPlans,
      message: updatedMessage,
    };
  }

  async saveFromMessage(messageId: number, userId: string) {
    this.logger.log(`Saving plan/recipe from message ${messageId} for user ${userId}`);

    const message = await this.prismaService.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException("Сообщение не найдено");
    }

    if (message.userId !== userId) {
      throw new HttpException("Нет доступа к этому сообщению", HttpStatus.FORBIDDEN);
    }

    // Проверяем, не сохранено ли уже
    if (message.planId || message.dishId) {
      this.logger.log(`Message ${messageId} already has planId=${message.planId} or dishId=${message.dishId}`);
      return {
        success: true,
        alreadySaved: true,
        planId: message.planId,
        dishId: message.dishId,
      };
    }

    const content = message.rawContent || message.content;
    if (!content) {
      throw new HttpException("Содержимое сообщения пусто", HttpStatus.BAD_REQUEST);
    }

    const mealFrequency = await this.aiUserService.getMealFrequency(userId);

    try {
      if (message.aiResponseType === RequestType.MEAL_PLAN || message.aiResponseType === RequestType.REGENERATION_MEAL_PLAN) {
        // Парсим план (может быть несколько дней)
        const { planDetails } = this.aiParsePlanService.parseAiOutput(content, mealFrequency);
        
        if (!planDetails || planDetails.length === 0 || !planDetails[0].meals || planDetails[0].meals.length === 0) {
          throw new HttpException("Не удалось распарсить план питания", HttpStatus.BAD_REQUEST);
        }

        // Сохраняем план
        const { planId } = await this.aiPlanGeneratorService.saveDishAndPlan({
          dishDetails: planDetails[0].meals[0],
          planDetails,
          userId,
          mealFrequency,
          messageId,
          requestType: message.aiResponseType,
        });

        return {
          success: true,
          planId,
          dishId: null,
        };
      } else if (message.aiResponseType === RequestType.RECIPE) {
        // Парсим рецепт
        const { dishDetails } = this.aiParseRecipeService.parseMessageRecipe(content);
        
        if (!dishDetails || !dishDetails.name) {
          throw new HttpException("Не удалось распарсить рецепт", HttpStatus.BAD_REQUEST);
        }

        // Сохраняем рецепт
        const dish = await this.dishService.createDish(dishDetails, userId);
        
        // Обновляем сообщение
        await this.prismaService.message.update({
          where: { id: messageId },
          data: { dishId: dish.id },
        });

        return {
          success: true,
          planId: null,
          dishId: dish.id,
        };
      } else {
        throw new HttpException("Это сообщение не содержит план питания или рецепт", HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      this.logger.error(`Failed to save from message ${messageId}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        "Не удалось сохранить план питания или рецепт",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
