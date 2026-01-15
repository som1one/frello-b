import { HttpService } from "@nestjs/axios";

import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";

import { firstValueFrom } from "rxjs";

import { MessageRole } from "../prepare/ai-prepare.service";

@Injectable()

export class AiHttpClientService {

  private readonly logger = new Logger(AiHttpClientService.name);

  private readonly apiConfig = {
    model: "chat-gpt-4-turbo",
    temperature: 0.5,
    maxTokens: 4096,
    apiKey: process.env.GENAPI_API_KEY || "",
    baseUrl: "https://api.gen-api.ru/api/v1",
    // Endpoint для chat-gpt-4-turbo
    endpoint: process.env.GENAPI_GPT_ENDPOINT || "/networks/chat-gpt-4-turbo",
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
      
      // Логируем структуру сообщений (без полного контента для экономии места)
      const messagesStructure = messages.map(msg => ({
        role: msg.role,
        contentLength: msg.content?.length || 0,
        contentPreview: msg.content?.substring(0, 100) || "",
      }));

      const requestBody = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        is_sync: true, // Обязательно для синхронного запроса
      };

      this.logger.log(`Making request to: ${fullUrl}`, {
        model,
        hasApiKey: !!apiKey,
        messagesCount: messages.length,
        messagesStructure: JSON.stringify(messagesStructure, null, 2),
        temperature,
        max_tokens: maxTokens,
        requestBodyKeys: Object.keys(requestBody),
      });

      const { data } = await firstValueFrom(
        this.httpService.post(
          fullUrl,
          requestBody,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 180000, // 180 секунд таймаут для безопасности
          },
        ),
      );

      this.logger.log("Full API response structure:", JSON.stringify(data, null, 2));

      // Проверка на асинхронный статус (processing)
      if (data.status === "processing" || data.status === "pending") {
        this.logger.error("API returned processing status - async request not supported", {
          status: data.status,
          requestId: data.request_id,
          fullResponse: JSON.stringify(data, null, 2),
        });

        throw new HttpException(
          `API вернул статус "processing" - запрос обрабатывается асинхронно. Request ID: ${data.request_id || "неизвестен"}. Убедитесь, что параметр is_sync: true установлен.`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // Проверяем различные варианты структуры ответа
      let content = "";
      let finishReason = "";

      // Вариант 1: data.response[0] - массив строк (DeepSeek Chat формат)
      if (data.response && Array.isArray(data.response) && data.response[0]) {
        const firstItem = data.response[0];
        // Если элемент массива - строка (DeepSeek Chat формат)
        if (typeof firstItem === "string") {
          content = firstItem;
          this.logger.log("Parsed from response array (string format):", { contentLength: content.length });
        }
        // Если элемент массива - объект (Gemini формат)
        else if (typeof firstItem === "object") {
          finishReason = firstItem?.finish_reason || "";
          content = firstItem?.message?.content || firstItem?.content || "";
          this.logger.log("Parsed from response array (object format):", { finishReason, contentLength: content.length });
        }
      }
      // Вариант 2: data.choices[0]?.message?.content (OpenAI формат)
      else if (data.choices && Array.isArray(data.choices) && data.choices[0]) {
        finishReason = data.choices[0]?.finish_reason || "";
        content = data.choices[0]?.message?.content || "";
        this.logger.log("Parsed from choices array:", { finishReason, contentLength: content.length });
      }
      // Вариант 3: data.content или data.message (прямой формат)
      else if (data.content) {
        content = data.content;
        this.logger.log("Parsed from direct content:", { contentLength: content.length });
      }
      else if (data.message) {
        content = typeof data.message === "string" ? data.message : data.message.content || "";
        this.logger.log("Parsed from direct message:", { contentLength: content.length });
      }
      // Вариант 4: data.text
      else if (data.text) {
        content = data.text;
        this.logger.log("Parsed from text field:", { contentLength: content.length });
      }
      else {
        this.logger.error("Unknown response structure. Full data:", JSON.stringify(data, null, 2));
        content = "";
      }

      this.logger.log("Final content:", { 
        contentLength: content?.length || 0, 
        isEmpty: !content?.trim(), 
        isBrackets: content === "[]",
        firstChars: content?.substring(0, 100) || "empty"
      });

      // Проверка на пустой контент
      if (!content?.trim() || content === "[]") {
        this.logger.error("Empty or invalid response content", {
          rawData: JSON.stringify(data, null, 2),
          contentLength: content?.length || 0,
          contentPreview: content?.substring(0, 200) || "empty",
        });

        throw new HttpException(
          `Пустой ответ от API. Структура ответа: ${JSON.stringify(data)}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Проверка на сообщения об ошибках от API
      const errorMessages = [
        "Произошла ошибка",
        "ошибка",
        "error",
        "failed",
        "недоступен",
        "unavailable",
      ];

      const contentLower = content.toLowerCase();
      const isErrorMessage = errorMessages.some(msg => contentLower.includes(msg.toLowerCase()));

      if (isErrorMessage && content.length < 200) {
        // Если это короткое сообщение об ошибке (менее 200 символов), скорее всего это ошибка API
        this.logger.error("API returned error message", {
          errorMessage: content,
          rawData: JSON.stringify(data, null, 2),
          requestId: data.request_id,
          model: data.model,
        });

        throw new HttpException(
          `API вернул ошибку: ${content}. Request ID: ${data.request_id || "неизвестен"}`,
          HttpStatus.SERVICE_UNAVAILABLE,
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
        this.logger.error("Endpoint not found. Possible issues: wrong endpoint path or model name. Try setting GENAPI_GPT_ENDPOINT env variable to: /networks/chat-gpt-4-turbo or /networks/gpt-4-turbo");

        throw new HttpException(
          `Эндпоинт не найден. Проверьте путь: ${fullUrl}. Возможно, нужно использовать другой endpoint для модели chat-gpt-4-turbo.`,
          HttpStatus.NOT_FOUND,
        );
      }

      if (error.response?.status === 422) {
        const errorData = error.response?.data;
        this.logger.error("422 Unprocessable Entity - Invalid request format", {
          url: fullUrl,
          model,
          errorData: JSON.stringify(errorData, null, 2),
          requestBody: JSON.stringify({
            model,
            messagesCount: messages.length,
            temperature,
            max_tokens: maxTokens,
            is_sync: true,
          }, null, 2),
        });

        throw new HttpException(
          `Некорректный формат запроса к API. Проверьте название модели и структуру данных. Ответ API: ${JSON.stringify(errorData)}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      throw error

    }

  }

}