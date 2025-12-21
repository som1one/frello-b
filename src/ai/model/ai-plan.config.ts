export const PLAN_CONFIG = {
  mealTypes: {
    1: { breakfast: "Завтрак" },
    2: { breakfast: "Завтрак", dinner: "Ужин" },
    3: { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин" },
    4: {
      breakfast: "Завтрак",
      lunch: "Обед",
      snack: "Полдник",
      dinner: "Ужин",
    },
    5: {
      breakfast: "Завтрак",
      lunch: "Обед",
      snack1: "Второй завтрак",
      snack2: "Полдник",
      dinner: "Ужин",
    },
    6: {
      breakfast: "Завтрак",
      lunch: "Обед",
      snack1: "Второй завтрак",
      snack2: "Полдник",
      dinner: "Ужин",
      snack3: "Перекус",
    },
  },
  mealSchema: ["type", "recipeName", "calories", "portionSize"],
  recipeSchema: [
    "name",
    "ingredients",
    "instruction",
    "proteins",
    "fats",
    "carbs",
    "cookingTime",
    "calories",
    "portionSize",
  ],
} as const;

export const BASE_SYSTEM_MESSAGE = `Ты - API для генерации планов питания. Отвечай ТОЛЬКО в заданном формате. Никакого другого текста.

ФОРМАТ ОТВЕТА:
Ваша суточная норма калорий: [число] ккал.
План на [число] дней:

День 1
Завтрак: [Блюдо] ([число] ккал, [число] г)
Обед: [Блюдо] ([число] ккал, [число] г)
Ужин: [Блюдо] ([число] ккал, [число] г)

День 2
...

ЗАПРЕЩЕНО: приветствия, расчёты, объяснения, советы, БЖУ, любой текст кроме формата выше.`;

export const FRELLO_INSTRUCTION = `Сегодня: {{CURRENT_DATE}}. Рассчитай норму калорий по Миффлину-Сан Жеору. Возраст считай из даты рождения. Учитывай аллергии и предпочтения.`;
