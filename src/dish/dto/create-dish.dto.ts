import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateDishDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  ingredients: string;

  @IsString()
  instruction: string;

  @IsInt()
  proteins: number;

  @IsInt()
  fats: number;

  @IsInt()
  carbs: number;

  @IsInt()
  cookingTime: number;

  @IsInt()
  calories: number;

  @IsInt()
  @IsOptional()
  messageId?: number;
}
