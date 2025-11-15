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
			dinner: 'Ужин',
			snack: 'Перекус',
		},
		5: {
			breakfast: 'Завтрак',
			lunch: 'Обед',
			dinner: 'Ужин',
			snack: 'Перекус',
			snack2: 'Перекус',
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
