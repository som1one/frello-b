// backend/src/plan/dto/create-plan.dto.ts
import { MealType } from '@prisma/client'
import { Type } from 'class-transformer'
import {
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsInstance,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Min,
} from 'class-validator'

export class PlanMeal {
	@IsEnum(MealType)
	type: MealType

	@IsString()
	@IsNotEmpty()
	recipeName: string

	@IsInt()
	@Min(0)
	calories: number

	@IsString()
	@IsOptional()
	name?: string

	@IsString()
	@IsOptional()
	ingredients?: string

	@IsString()
	@IsOptional()
	instruction?: string

	@IsNumber()
	@IsOptional()
	proteins?: number

	@IsNumber()
	@IsOptional()
	fats?: number

	@IsNumber()
	@IsOptional()
	carbs?: number

	@IsNumber()
	@IsOptional()
	cookingTime?: number

	@IsNumber()
	dishId: number
	
	@IsNumber()
	portionSize: number
}

export class PlanDay {
	@IsInstance(PlanMeal, { each: true })
	@ArrayMinSize(1)
	@IsArray()
	@Type(() => PlanMeal)
	meals: PlanMeal[]

	warning?: string
}

export class CreatePlanDto {
	@IsInstance(PlanDay, { each: true })
	@ArrayMinSize(1)
	@IsArray()
	@Type(() => PlanDay)
	plan: PlanDay[]

	@IsInt()
	messageId: number

	@IsInt()
	mealFrequency: number
}
