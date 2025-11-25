import { ArrayMaxSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength, IsObject } from 'class-validator';

// Перечисления для возраста, частоты приема пищи и опыта в приготовлении пищи
enum AgeRange {
  A3_17 = '3-17', // 3-17
  A18_29 = '18-29', // 18-29
  A30_39 = '30-39', // 30-39
  A40_49 = '40-49', // 40-49
  A50_Plus = 'Больше 50', // 50+
}

enum MealFrequency {
  ONE = 'Одно',
  TWO = 'Два',
  THREE = 'Три',
  FOUR = 'Четыре',
  FIVE_OR_MORE = 'Пять или более',
}

enum CookingExperience {
  BEGINNER = 'Совсем не умею готовить', // Совсем не умею готовить
  OCCASIONAL = 'Готовлю простые блюда, но нечасто', // Готовлю простые блюда, но нечасто
  REGULAR = 'Регулярно готовлю', // Регулярно готовлю
  EXPERIENCED = 'Опытный повар, готовлю сложные блюда', // Опытный повар, готовлю сложные блюда
}

export class UserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString({ message: 'Имя должно быть строкой' })
  @IsOptional()
  name?: string;

  @IsOptional()
  @MinLength(6, { message: 'Пароль должен быть длиной не менее 6 символов' })
  @IsString({ message: 'Пароль должен быть строкой' })
  password?: string;

  @IsArray()
  @ArrayMaxSize(2, { message: 'Максимальное количество планов питания на неделю - 2' })
  @IsString({ each: true, message: 'Каждый план питания должен быть строкой' })
  @IsOptional()
  weeklyPlans?: string[];

  @IsArray()
  @ArrayMaxSize(10, { message: 'Максимальное количество планов питания на день - 10' })
  @IsString({ each: true, message: 'Каждый план питания должен быть строкой' })
  @IsOptional()
  dailyPlans?: string[];

  @IsString({ message: 'Диетические предпочтения должны быть строкой' })
  @IsOptional()
  dietaryPreferences?: string;

  @IsString({ message: 'Диетические ограничения должны быть строкой' })
  @IsOptional()
  dietaryRestrictions?: string;

  @IsEnum(AgeRange, { message: 'Укажите корректный диапазон возраста' })
  @IsOptional()
  ageRange?: AgeRange;

  @IsString({ message: 'Цель в питании должна быть строкой' })
  @IsOptional()
  goal?: string;

  @IsEnum(CookingExperience, { message: 'Укажите корректный уровень опыта в приготовлении пищи' })
  @IsOptional()
  cookingExperience?: CookingExperience;

  @IsEnum(MealFrequency, { message: 'Укажите корректную частоту приема пищи' })
  @IsOptional()
  mealFrequency?: MealFrequency;
}

export class UpdateSettingsDto {
  @IsObject()
  settings: any;
}
