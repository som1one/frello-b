import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import { RequestType, MealType } from "@prisma/client";
import { DishService } from "src/dish/dish.service";
import { PlanMeal, PlanDay } from "src/plan/dto/create-plan.dto";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class AiPlanGeneratorService {
  private readonly logger = new Logger(AiPlanGeneratorService.name);

  constructor(
    private readonly dishService: DishService,
    private readonly prisma: PrismaService,
  ) { }

  async saveDishAndPlan({
    dishDetails,
    planDetails,
    userId,
    mealFrequency,
    messageId,
    requestType,
  }: {
    dishDetails: PlanMeal;
    planDetails: PlanDay[];
    userId: string;
    mealFrequency: number;
    messageId: number;
    requestType: RequestType;
  }): Promise<{ dishId: number | null; planId: number | null }> {
    let dishId: number | null = null;
    let planId: number | null = null;

    if (requestType === RequestType.RECIPE && this.isValidDish(dishDetails)) {
      this.logger.log("determine Recipe. processDish dishDetails", dishDetails);
      dishId = await this.saveDish(dishDetails, userId);
    }

    if (planDetails.length > 0) {
      planId = await this.savePlan(
        planDetails,
        userId,
        mealFrequency,
        messageId,
      );
    }

    return { dishId, planId };
  }

  private async savePlan(
    planDetails: PlanDay[],
    userId: string,
    mealFrequency: number,
    messageId: number,
  ): Promise<number | null> {
    try {
      // Hide old visible plans before creating new ones
      this.logger.log(`Hiding old plans for user ${userId}`);
      const updateResult = await this.prisma.mealPlan.updateMany({
        where: { userId, visible: true },
        data: { visible: false }
      });
      this.logger.log(`Hidden ${updateResult.count} old plans`);

      const date: Date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      if (planDetails.length > 1) {
        const dayOfWeek = date.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        date.setDate(date.getDate() + diff);
      }

      const createdPlans = [];
      for (const day of planDetails) {
        const savedMeals = await Promise.all(
          day.meals
            .slice(0, mealFrequency)
            .filter((meal) => meal.recipeName && meal.recipeName.trim()) // Filter out invalid meals
            .map(async (meal) => {
            const dish = await this.dishService.createDish(meal, userId);
            // Normalize meal type: snack1, snack2, etc. -> snack
            const normalizedType = meal.type.replace(/\d+$/, '') as MealType;
            return {
              type: normalizedType,
              dishId: dish.id,
              recipeName: meal.recipeName,
              calories: meal.calories,
              portionSize: meal.portionSize || 0,
            };
          }),
        );

        const createdPlan = await this.prisma.mealPlan.create({
          data: {
            date,
            userId,
            meals: { createMany: { data: savedMeals } },
            visible: true,
          },
        });

        createdPlans.push(createdPlan);
        date.setUTCDate(date.getUTCDate() + 1);
      }

      if (createdPlans.length > 0) {
        await this.prisma.message.update({
          where: { id: messageId },
          data: { planId: createdPlans[0].id },
        });
      }

      return createdPlans[0]?.id || null;
    } catch (error) {
      this.logger.error("Failed to save plan", error);
      throw new HttpException(
        "Failed to save plan",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async saveDish(
    dishDetails: PlanMeal,
    userId: string,
  ): Promise<number> {
    try {
      const dish = await this.dishService.createDish(dishDetails, userId);
      this.logger.log(`Saved dish: ${dish.id}`);
      return dish.id;
    } catch (error) {
      this.logger.error("Failed to save dish", error);
      throw new HttpException(
        "Failed to save dish",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private isValidDish(dish: Partial<PlanMeal>): boolean {
    return this.dishService.isValidDish(dish);
  }

  async markDishAsFavorite(dishId: number): Promise<void> {
    await this.dishService.markAsFavorite(dishId);
  }
}
