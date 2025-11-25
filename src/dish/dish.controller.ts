import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { CreateDishDto } from "./dto/create-dish.dto";
import { JwtAuthGuard } from "@/auth/guards/jwt.guard";
import { GetUserId } from "@/auth/decorators/auth.decorator";
import { PrismaService } from "@/prisma.service";
import { Dish } from "@prisma/client";
import { IsEmailConfirmedGuard } from "@/auth/guards/is-email-confirm.guard";
import { DishService } from "./dish.service";

@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
@Controller("dish")
export class DishController {
  constructor(
    private prisma: PrismaService,
    private readonly dishService: DishService,
  ) { }

  @UsePipes(ValidationPipe)
  @Post("create")
  async create(
    @Body() dto: CreateDishDto,
    @GetUserId("id") userId: string,
  ): Promise<Dish> {
    const dish = await this.prisma.dish.create({
      data: {
        calories: dto.calories,
        carbs: dto.carbs,
        cooking_time: dto.cookingTime,
        fats: dto.fats,
        image: dto.image,
        ingredients: dto.ingredients,
        instruction: dto.instruction,
        name: dto.name,
        proteins: dto.proteins,
        user_id: userId,
      },
    });

    if (dto.messageId) {
      await this.prisma.message.update({
        where: { id: dto.messageId },
        data: { dishId: dish.id },
      });
    }

    return dish;
  }

  @UsePipes(ValidationPipe)
  @HttpCode(HttpStatus.OK)
  @Post("favorite/toggle/:id")
  async toggleFavoriteDish(
    @GetUserId("id") userId: string,
    @Param("id", ParseIntPipe) dishId: number,
  ) {
    const dish = await this.prisma.dish.findFirst({ where: { id: dishId } });
    if (!dish) {
      throw new NotFoundException("Блюдо не найдено");
    }

    if (dish.user_id !== userId) {
      throw new ForbiddenException("Запрещено редактирование чужих блюд");
    }

    return await this.prisma.dish.update({
      where: { id: dishId },
      data: { isFavorite: !dish.isFavorite },
    });
  }

  @UsePipes(ValidationPipe)
  @Get("favorite/getAll")
  async getAllFavoriteDishes(@GetUserId("id") userId: string) {
    return this.prisma.dish.findMany({
      where: { isFavorite: true, user_id: userId },
      orderBy: { created_at: "desc" },
    });
  }

  @Delete(":id")
  async deleteDish(@Param("id", ParseIntPipe) id: number) {
    const dish = await this.dishService.deleteById(id);
    if (!dish) {
      throw new HttpException(
        `Dish with ID ${id} not found or you don't have access`,
        HttpStatus.NOT_FOUND,
      );
    }
    return dish;
  }

  @Get(":id")
  async getById(
    @GetUserId() userId: string,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const dish = await this.dishService.findById(id, userId);
    if (!dish) {
      throw new HttpException(
        `Dish with ID ${id} not found or you don't have access`,
        HttpStatus.NOT_FOUND,
      );
    }
    return { recipe: dish };
  }
}
