import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  UseGuards,
} from "@nestjs/common";
import { DishService } from "./dish.service";
import { GetUserId } from "src/auth/decorators/auth.decorator";
import { JwtAuthGuard } from "src/auth/guards/jwt.guard";

@UseGuards(JwtAuthGuard)
@Controller("recipe")
export class RecipeController {
  private readonly logger = new Logger(RecipeController.name);
  constructor(private readonly dishService: DishService) {}

  @Get(":id")
  async getOrCreate(
    @GetUserId() userId: string,
    @Param("id", ParseIntPipe) id: number,
  ) {
    this.logger.log(`Getting recipe with ID ${id} for user ${userId}`);
    const dish = await this.dishService.getOrGenerateDish(id, userId);
    if (!dish) {
      throw new HttpException(
        `Dish with ID ${id} not found or you don't have access`,
        HttpStatus.NOT_FOUND,
      );
    }
    return { recipe: dish };
  }
}
