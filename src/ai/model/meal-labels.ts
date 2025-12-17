export const getMealLabels = (
	mealFrequency: number,
	customLabels?: string[]
): Record<string, string> => {
	if (customLabels?.length === mealFrequency) {
		return customLabels.reduce(
			(acc, label, i) => ({ ...acc, [`meal${i + 1}`]: label }),
			{}
		)
	}
	const labels: Record<number, Record<string, string>> = {
		1: { breakfast: 'Завтрак' },
		2: { breakfast: 'Завтрак', dinner: 'Ужин' },
		3: { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' },
		4: {
			breakfast: 'Завтрак',
			lunch: 'Обед',
			snack: 'Полдник',
			dinner: 'Ужин',
		},
		5: {
			breakfast: 'Завтрак',
			snack1: 'Второй завтрак',
			lunch: 'Обед',
			snack2: 'Полдник',
			dinner: 'Ужин',
		},
		6: {
			breakfast: 'Завтрак',
			snack1: 'Второй завтрак',
			lunch: 'Обед',
			snack2: 'Полдник',
			dinner: 'Ужин',
			snack3: 'Перекус',
		},
	}
	if (labels[mealFrequency]) {
		return labels[mealFrequency]
	}
	const defaultLabels = labels[4]
	const extraMeals = Array.from({ length: mealFrequency - 4 }, (_, i) => ({
		[`snack${i + 1}`]: 'Перекус',
	}))
	return {
		...defaultLabels,
		...Object.assign({}, ...extraMeals),
	}
}
