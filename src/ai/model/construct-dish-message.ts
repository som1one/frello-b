import { PlanMeal } from 'src/plan/dto/create-plan.dto'

export function constructDishMessage(dish: PlanMeal): string {
	return `Блюдо: ${dish.name}\n\nИнгредиенты:\n${dish.ingredients}\n\nИнструкция приготовления:\n${dish.instruction}\n\nВремя приготовления: ${dish.cookingTime} минут.\nКоличество килокалорий на порцию: ${dish.calories} ккал.\nКоличество белков, жиров, углеводов: белки - ${dish.proteins} г, жиры - ${dish.fats} г, углеводы - ${dish.carbs} г.\n\nПриятного аппетита!`
}
