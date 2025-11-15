import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@/prisma.service";
import { PlanMeal } from "src/plan/dto/create-plan.dto";
import { MealType } from "@prisma/client";
import { AiRecipeService } from "src/ai/services/recipe/ai-recipe.service";

@Injectable()
export class DishService {
  private readonly logger = new Logger(DishService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AiRecipeService))
    private readonly aiRecipeService: AiRecipeService,
  ) {}

  async findDishByName(name: string, userId: string) {
    return this.prisma.dish.findFirst({
      where: { name, user_id: userId },
    });
  }

  async createDish(dto: PlanMeal, userId: string) {
    return this.prisma.dish.upsert({
      where: {
        name_user_id: {
          name: dto.name || dto.recipeName,
          user_id: userId,
        },
      },
      update: {
        ingredients: dto.ingredients || "",
        instruction: dto.instruction || "",
        proteins: dto.proteins,
        fats: dto.fats,
        carbs: dto.carbs,
        cooking_time: dto.cookingTime,
        calories: dto.calories,
      },
      create: {
        name: dto.name || dto.recipeName,
        ingredients: dto.ingredients || "",
        instruction: dto.instruction || "",
        proteins: dto.proteins,
        fats: dto.fats,
        carbs: dto.carbs,
        cooking_time: dto.cookingTime,
        calories: dto.calories,
        user_id: userId,
      },
    });
  }

  async createAndToggleFavoriteDish(dto: PlanMeal, userId: string) {
    return this.prisma.dish.upsert({
      where: {
        name_user_id: {
          name: dto.name || dto.recipeName,
          user_id: userId,
        },
      },
      update: {
        ingredients: dto.ingredients || "",
        instruction: dto.instruction || "",
        proteins: dto.proteins,
        fats: dto.fats,
        carbs: dto.carbs,
        cooking_time: dto.cookingTime,
        calories: dto.calories,
        isFavorite: true,
      },
      create: {
        name: dto.name || dto.recipeName,
        ingredients: dto.ingredients || "",
        instruction: dto.instruction || "",
        proteins: dto.proteins,
        fats: dto.fats,
        carbs: dto.carbs,
        cooking_time: dto.cookingTime,
        calories: dto.calories,
        user_id: userId,
        isFavorite: true,
      },
    });
  }

  async findById(id: number, userId: string) {
    return this.prisma.dish.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });
  }

  async getOrGenerateDish(id: number, userId: string) {
    // Проверяем, есть ли блюдо
    const dish = await this.prisma.dish.findFirst({
      where: { id, user_id: userId },
    });

    // Проверяем, полное ли блюдо
    if (dish && this.isDishComplete(dish)) {
      this.logger.log(
        `Returning complete dish with ID ${id} for user ${userId}`,
      );
      return dish;
    }

    // Если блюда нет или оно неполное, генерируем/обновляем
    if (!dish) {
      this.logger.warn(`Dish with ID ${id} not found for user ${userId}`);
      throw new HttpException(
        `Dish with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const recipe = await this.aiRecipeService.createRecipe({
      dto: { recipeName: dish.name, calories: dish.calories },
      userId,
    });

    // Обновляем блюдо в базе
    const updatedDish = await this.prisma.dish.update({
      where: { id, user_id: userId },
      data: {
        ingredients: recipe.recipe.ingredients || "",
        instruction: recipe.recipe.instruction || "",
        proteins: recipe.recipe.proteins,
        fats: recipe.recipe.fats,
        carbs: recipe.recipe.carbs,
        cooking_time: recipe.recipe.cooking_time,
        calories: recipe.recipe.calories,
      },
    });

    this.logger.log(
      `Generated and updated dish with ID ${id} for user ${userId}`,
    );
    return updatedDish;
  }

  private isDishComplete(dish: any): boolean {
    return !!(
      dish.proteins != null &&
      dish.fats != null &&
      dish.carbs != null &&
      dish.ingredients &&
      dish.instruction
    );
  }

  async deleteById(dishId: number) {
    return this.prisma.dish.delete({ where: { id: dishId } });
  }

  isValidDish(dish: Partial<PlanMeal>): boolean {
    if (!dish) return false;
    // Проверяем только обязательные поля
    return !!(
      dish.recipeName &&
      typeof dish.recipeName === "string" &&
      dish.recipeName.trim() &&
      typeof dish.calories === "number" &&
      dish.calories >= 0
    );
  }

  isValidDishType(type: unknown, validMealTypes: MealType[]): boolean {
    return (
      typeof type === "string" && validMealTypes.includes(type as MealType)
    );
  }
}
