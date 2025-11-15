import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { CreateRecipeDto } from "src/dish/dto/create-recipe.dto";
import { AiPrepareService } from "../prepare/ai-prepare.service";
import { AiHttpClientService } from "../ai-http-client/ai-http-client.service";
import { AiParseRecipeService } from "./ai-parse-recipe.service";
import { DishService } from "src/dish/dish.service";
import { Message, RequestType } from "@prisma/client";
import { ChatService } from "src/chat/chat.service";

@Injectable()
export class AiRecipeService {
  private readonly logger = new Logger(AiRecipeService.name);
  constructor(
    private readonly aiPrepareService: AiPrepareService,
    private readonly aiHttpClientService: AiHttpClientService,
    private readonly aiParseRecipeService: AiParseRecipeService,
    @Inject(forwardRef(() => DishService))
    private readonly dishService: DishService,
    private readonly chatService: ChatService,
  ) {}

  async createRecipe({
    dto,
    userId,
    content,
  }: {
    dto: CreateRecipeDto;
    userId: string;
    content?: string;
  }) {
    const preparedMessageForAI =
      await this.aiPrepareService.prepareCreateRecipe({
        userId,
        content,
        dto,
      });
    // const output = this.aiApiClientService.fetchRecipe()
    const output = await this.aiHttpClientService.fetchApiResponse(
      preparedMessageForAI,
      { temperature: 0.5 },
    );

    if (!output?.trim()) {
      throw new HttpException(
        "Failed to generate valid recipe response",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const { result, dishDetails } =
      this.aiParseRecipeService.parseRecipe(output);
    this.logger.log(
      `Parsed result: ${result}, dishDetails: ${JSON.stringify(dishDetails)}`,
    );

    const savedRecipe = await this.dishService.createDish(dishDetails, userId);

    return {
      recipe: savedRecipe,
    };
  }

  async createMessageRecipe({
    userId,
    content,
    userMessage,
    chatId,
  }: {
    userId: string;
    content?: string;
    userMessage: Message;
    chatId: number;
  }) {
    const preparedMessageForAI =
      await this.aiPrepareService.prepareCreateRecipe({
        userId,
        content,
      });
    const output = await this.aiHttpClientService.fetchApiResponse(
      preparedMessageForAI,
      { temperature: 0.5 },
    );

    if (!output?.trim()) {
      throw new HttpException(
        "Failed to generate valid recipe response",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const { result, dishDetails } =
      this.aiParseRecipeService.parseMessageRecipe(output);
    this.logger.log(
      `Parsed result: ${result}, dishDetails: ${JSON.stringify(dishDetails)}`,
    );

    const savedRecipe = await this.dishService.createDish(dishDetails, userId);

    const assistantMessage = await this.chatService.addMessage({
      chatId,
      userId,
      content: result,
      rawContent: output,
      isUser: false,
      dishId: savedRecipe.id,
      planId: null,
      aiResponseType: RequestType.RECIPE,
    });

    return {
      userMessage,
      assistantMessage,
      recipe: savedRecipe,
      type: RequestType.RECIPE,
    };
  }
}
