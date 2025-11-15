import { IsInt, IsString } from "class-validator";

export class CreateRecipeDto {
  @IsString()
  recipeName: string;

  @IsInt()
  calories: number;
}
