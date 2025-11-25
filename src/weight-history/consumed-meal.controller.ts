import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
  Delete,
} from "@nestjs/common";
import { GetUserId } from "src/auth/decorators/auth.decorator";
import { IsEmailConfirmedGuard } from "src/auth/guards/is-email-confirm.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt.guard";
import { PrismaService } from "src/prisma.service";

@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
@Controller("consumed-meal")
export class ConsumedMealController {
  constructor(private prisma: PrismaService) { }

  @Post()
  async addConsumedMeal(
    @GetUserId() userId: string,
    @Body() { mealId, planId }: { mealId: number; planId: number },
  ) {
    const existingConsumedMeal = await this.prisma.consumedMeal.findFirst({
      where: { userId, mealId, planId },
    });
    if (existingConsumedMeal) {
      throw new HttpException("Meal already consumed", HttpStatus.BAD_REQUEST);
    }
    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      select: { calories: true, planId: true },
    });

    if (!meal) {
      throw new HttpException("Meal not found", HttpStatus.NOT_FOUND);
    }

    if (meal.planId !== planId) {
      throw new HttpException(
        "Meal does not belong to this plan",
        HttpStatus.BAD_REQUEST,
      );
    }

    const consumedMeal = await this.prisma.consumedMeal.create({
      data: {
        userId,
        mealId,
        planId,
        calories: meal.calories,
      },
    });

    return { ...consumedMeal, calories: meal.calories };
  }

  @Delete()
  async removeConsumedMeal(
    @GetUserId() userId: string,
    @Body() { mealId, planId }: { mealId: number; planId: number },
  ) {
    console.log({ userId, mealId, planId }, "{userId, mealId, planId}");
    const consumedMeal = await this.prisma.consumedMeal.findFirst({
      where: {
        userId,
        mealId,
        planId,
      },
      select: { id: true, calories: true, mealId: true, planId: true },
    });

    if (!consumedMeal) {
      throw new HttpException("Consumed meal not found", HttpStatus.NOT_FOUND);
    }

    const deletedMeal = await this.prisma.consumedMeal.delete({
      where: { id: consumedMeal.id },
    });

    return { ...deletedMeal, calories: consumedMeal.calories };
  }

  @Get("/calories-history")
  async getCaloriesHistory(@GetUserId() userId: string) {
    const consumedMeals = await this.prisma.consumedMeal.findMany({
      where: {
        userId,
      },
      select: {
        planId: true,
        calories: true,
        mealId: true,
        createdAt: true,
        plan: {
          select: {
            date: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const caloriesByDate = consumedMeals.reduce(
      (acc, meal) => {
        // Group by consumption date (YYYY-MM-DD)
        const dateKey = meal.createdAt.toISOString().split('T')[0];

        if (!acc[dateKey]) {
          acc[dateKey] = {
            calories: 0,
            mealIds: [],
            date: meal.createdAt,
            // Keep planId for compatibility, though it's less relevant now. 
            // We can use the meal's planId or a default.
            planId: meal.planId
          };
        }
        acc[dateKey].calories += meal.calories;
        acc[dateKey].mealIds.push(meal.mealId);
        return acc;
      },
      {} as Record<string, { calories: number; mealIds: number[]; date: Date; planId: number }>,
    );

    return Object.values(caloriesByDate)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
