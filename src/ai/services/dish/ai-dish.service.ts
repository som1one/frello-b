import { Injectable } from '@nestjs/common'
import { MealType } from '@prisma/client'

@Injectable()
export class AiDishService {
	constructor() {}

	parseDishFromText(
		text: string,
		dishId: number,
		type: MealType = MealType[0]
	) {
		const extractName = (text: string): string | null => {
			const dishLabelMatch = text.match(/Блюдо:\s*(.*)/i)
			if (dishLabelMatch && dishLabelMatch[1]) return dishLabelMatch[1].trim()
			const lines = text.split('\n').filter(line => line.trim() !== '')
			const ingredientsIndex = lines.findIndex(line =>
				line.toLowerCase().includes('ингредиенты')
			)
			if (ingredientsIndex > 0) {
				const potentialTitle = lines[ingredientsIndex - 1].trim()
				if (
					potentialTitle &&
					!potentialTitle.toLowerCase().startsWith('конечно,') &&
					!potentialTitle.toLowerCase().startsWith('вот') &&
					potentialTitle.length < 100
				) {
					return potentialTitle
				}
			}
			return null
		}

		const extractIngredients = (text: string): string => {
			const regex =
				/Ингредиенты:\s*([\s\S]*?)(?=\n\n|Инструкция|Время приготовления)/i
			const match = text.match(regex)
			return match ? match[1].trim() : ''
		}

		const extractInstructions = (text: string): string => {
			const regex =
				/Инструкция(?: приготовления)?:\s*([\s\S]*?)(?=\n\n|Время приготовления|Приятного аппетита!|$)/i
			const match = text.match(regex)
			return match ? match[1].trim() : ''
		}

		const extractCookingTime = (text: string): number => {
			const regex = /Время приготовления:\s*(\d+)/i
			const match = text.match(regex)
			return match ? parseInt(match[1], 10) : 0
		}

		const extractNutritionalInfo = (
			text: string
		): { proteins: number; fats: number; carbs: number; calories: number } => {
			const regex =
				/Количество белков, жиров, углеводов:\s*белки\s*[-—]\s*(\d+)\s*г,\s*жиры\s*[-—]\s*(\d+)\s*г,\s*углеводы\s*[-—]\s*(\d+)\s*г/i
			const match = text.match(regex)
			const caloriesRegex = /Количество килокалорий на порцию:\s*(\d+)/i
			const caloriesMatch = text.match(caloriesRegex)
			return {
				proteins: match ? parseInt(match[1], 10) : 0,
				fats: match ? parseInt(match[2], 10) : 0,
				carbs: match ? parseInt(match[3], 10) : 0,
				calories: caloriesMatch ? parseInt(caloriesMatch[1], 10) : 0,
			}
		}
		const extractPortionSize = (text: string): number => {
			const regex = /Порция:\s*(\d+)\s*г/i
			const match = text.match(regex)
			return match ? parseInt(match[1], 10) : 0
		}

		const name = extractName(text)
		const ingredients = extractIngredients(text)
		const instruction = extractInstructions(text)
		const cookingTime = extractCookingTime(text)
		const nutritionalInfo = extractNutritionalInfo(text)
		const portionSize = extractPortionSize(text)

		if (!name || !ingredients || !instruction) {
			return null
		}

		return {
			name,
			type,
			dishId,
			recipeName: name,
			ingredients,
			instruction,
			cookingTime,
			calories: nutritionalInfo.calories,
			proteins: nutritionalInfo.proteins,
			fats: nutritionalInfo.fats,
			carbs: nutritionalInfo.carbs,
			portionSize,
		}
	}
}
