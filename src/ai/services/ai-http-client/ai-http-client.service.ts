import { HttpService } from "@nestjs/axios";
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { MessageRole } from "../prepare/ai-prepare.service";

@Injectable()
export class AiHttpClientService {
  private readonly logger = new Logger(AiHttpClientService.name);
  private readonly apiConfig = {
    model: "gpt-5-mini",
    temperature: 0.5,
    maxTokens: 4096,
    apiKey: process.env.GENAPI_API_KEY || "",
    baseUrl: "https://api.gen-api.ru/api/v1",
  };

  constructor(private readonly httpService: HttpService) { }
  async fetchApiResponse(
    messages: { role: MessageRole; content: string }[],
    options: { temperature?: number; maxTokens?: number } = {},
  ) {
    const { model, apiKey, baseUrl } = this.apiConfig;
    const temperature = options.temperature ?? this.apiConfig.temperature;
    // Используем переданный maxTokens или дефолтный, но для обычных сообщений можно уменьшить
    const maxTokens = options.maxTokens ?? this.apiConfig.maxTokens;

    if (!apiKey) {
      throw new HttpException(
        "No API Key provided",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/networks/gpt-5-mini`,
          {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            is_sync: true,
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 90000, // 90 секунд таймаут для безопасности
          },
        ),
      );

      // const data = {
      //   request_id: 27156506,
      //   model: "gpt-4-1",
      //   cost: 0.0034,
      //   response: [
      //     {
      //       index: 0,
      //       message: {
      //         role: "assistant",
      //         content:
      //           '{\n  "name": "Гречка с курицей qjgnf",\n  "ingredients": "Куриная грудка - 200 г\\nГречневая крупа - 100 г\\nВода - 200 мл\\nСоль - по вкусу\\nМасло растительное - 1 ст. ложка",\n  "instruction": "Промойте гречку.\\nОбжарьте куриную грудку на растительном масле до золотистого цвета.\\nДобавьте воду и соль, доведите до кипения.\\nВыложите гречку, уменьшите огонь и варите под крышкой 15-20 минут до готовности.\\nПодавайте горячим.",\n  "proteins": 25,\n  "fats": 5,\n  "carbs": 45,\n  "cookingTime": 30,\n  "calories": 350,\n  "portionSize": 300\n}',
      //         refusal: null,
      //       },
      //       logprobs: null,
      //       finish_reason: "stop",
      //     },
      //   ],
      // };

      // const data = {
      //   "request_id": 27138127,
      //   "model": "gpt-4-1",
      //   "cost": 0.0029,
      //   "response": [
      //     {
      //       "index": 0,
      //       "message": {
      //         "role": "assistant",
      //         "content": "[\n  {\n    \"meals\": [\n      {\"type\": \"breakfast\", \"recipeName\": \"Яичница с помидорами\", \"calories\": 350, \"portionSize\": 200},\n      {\"type\": \"lunch\", \"recipeName\": \"Гречка с курицей\", \"calories\": 600, \"portionSize\": 250},\n      {\"type\": \"dinner\", \"recipeName\": \"Запеченные овощи\", \"calories\": 400, \"portionSize\": 200}\n    ]\n  }\n]",
      //         "refusal": null
      //       },
      //       "logprobs": null,
      //       "finish_reason": "stop"
      //     }
      //   ]
      // }

      this.logger.log("Response from model", data);
      const finishReason = data.response[0]?.finish_reason;
      this.logger.log("Finish reason:", finishReason);
      const content = data.response[0]?.message?.content || "";

      this.logger.log("Content from model", content);

      if (!content?.trim() || content === "[]") {
        throw new HttpException(
          "Empty response from API",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return content;
    } catch (error) {
      this.logger.error("Error fetching API response", error);
      if (error.response?.status === 429) {
        throw new HttpException(
          "Лимит запросов к AI превышен",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error.response?.status >= 500) {
        throw new HttpException(
          "Сервер временно недоступен",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (error.response?.status === 401) {
        throw new HttpException(
          "Некорректный API ключ",
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw error
    }
  }
}
