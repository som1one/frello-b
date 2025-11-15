import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { GetUserId } from "src/auth/decorators/auth.decorator";
import { AiService } from "./ai.service";
import { IsEmailConfirmedGuard } from "src/auth/guards/is-email-confirm.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt.guard";
import { FetchAssistantRequestDto } from "./dto/ai.dto";

@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("chat/:chatId")
  @UsePipes(new ValidationPipe({ transform: true }))
  async fetchAssistantResponse(
    @GetUserId("id") userId: string,
    @Param("chatId", ParseIntPipe) chatId: number,
    @Body()
    body: FetchAssistantRequestDto,
  ) {
    const data = await this.aiService.fetchAssistantResponse(
      chatId,
      body.content,
      userId,
    );
    return { data };
  }

  @Post("chat/:chatId/message/:messageId/favorite")
  async toggleFavoriteMessage(
    @GetUserId("id") userId: string,
    @Param("chatId", ParseIntPipe) chatId: number,
    @Param("messageId", ParseIntPipe) messageId: number,
  ) {
    return await this.aiService.toggleFavoriteMessage({
      userId,
      chatId,
      messageId,
    });
  }

  @Post("chat/:chatId/message/:messageId/regenerate")
  async regenerateMessage(
    @GetUserId("id") userId: string,
    @Param("chatId", ParseIntPipe) chatId: number,
    @Param("messageId", ParseIntPipe) messageId: number,
  ) {
    console.log("message.id", messageId);
    return await this.aiService.regenerateMessage({
      userId,
      chatId,
    });
  }
}
