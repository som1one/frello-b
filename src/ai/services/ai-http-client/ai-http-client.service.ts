import { HttpService } from "@nestjs/axios";

import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";

import { firstValueFrom } from "rxjs";

import { MessageRole } from "../prepare/ai-prepare.service";

@Injectable()

export class AiHttpClientService {

  private readonly logger = new Logger(AiHttpClientService.name);

  private readonly apiConfig = {
    model: "deepseek-v3.2",
    temperature: 0.5,
    maxTokens: 4096,
    apiKey: process.env.GENAPI_API_KEY || "",
    baseUrl: "https://api.gen-api.ru/api/v1",
    // Возможные варианты endpoint для DeepSeek:
    // - /networks/deepseek-v3-2 (текущий)
    // - /networks/deepseek
    // - /networks/deepseek-chat
    endpoint: process.env.GENAPI_DEEPSEEK_ENDPOINT || "/networks/deepseek-v3-2",
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
      const endpoint = this.apiConfig.endpoint;
      const fullUrl = `${baseUrl}${endpoint}`;
      
      this.logger.log(`Making request to: ${fullUrl}`, {
        model,
        hasApiKey: !!apiKey,
      });

      const { data } = await firstValueFrom(
        this.httpService.post(
          fullUrl,
          {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            is_sync: true,
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 180000, // 180 секунд таймаут для безопасности
          },
        ),
      );

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

      const endpoint = this.apiConfig.endpoint;
      const fullUrl = `${baseUrl}${endpoint}`;
      
      this.logger.error("Error fetching API response", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: fullUrl,
        model,
        hasApiKey: !!apiKey,
        endpoint,
      });

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

      if (error.response?.status === 404) {

        this.logger.error("Endpoint not found. Possible issues: wrong endpoint path or model name. Try setting GENAPI_DEEPSEEK_ENDPOINT env variable to: /networks/deepseek or /networks/deepseek-chat");

        throw new HttpException(

          `Эндпоинт не найден. Проверьте путь: ${fullUrl}. Возможно, нужно использовать другой endpoint для модели DeepSeek.`,

          HttpStatus.NOT_FOUND,

        );

      }

      throw error

    }

  }

}