// backend/src/plan/plan.service.ts
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma.service";
import { CreatePlanDto } from "./dto/create-plan.dto";

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);
  constructor(private prismaService: PrismaService) { }

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
}
