import { GetUserId } from "@/auth/decorators/auth.decorator";
import { IsEmailConfirmedGuard } from "@/auth/guards/is-email-confirm.guard";
import { JwtAuthGuard } from "@/auth/guards/jwt.guard";
import { UserService } from "@/user/user.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ChatService } from "./chat.service";

@Controller("chats")
@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard) // Secures these routes
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  constructor(
    private readonly chatService: ChatService,
    private readonly userService: UserService,
  ) {}

  // Create a new chat
  @Post("create")
  async createChat(
    @GetUserId("id") userId: string, // Extract userId from JWT
    @Body("title") title: string, // Get chat title from body
  ) {
    return this.chatService.createChat(userId, title);
  }

  // Get all chats for a user
  @Get()
  async getChatsByUser(
    @GetUserId("id") userId: string, // Extract userId from JWT
  ) {
    this.logger.log("getChatsByUser", userId);
    return this.chatService.getChatsByUser(userId);
  }

  @Get(":chatId/messages")
  async getMessages(@Param("chatId", ParseIntPipe) chatId: number) {
    return this.chatService.getMessagesByChat(chatId);
  }

  // Add message to chat
  @UseGuards(JwtAuthGuard) // Защита маршрута с использованием JWT Guard
  @Post(":chatId/message")
  async addMessage(
    @Param("chatId", ParseIntPipe) chatId: number,
    @GetUserId("id") userId: string,
    @Body("content") content: string,
    @Body("isUser") isUser: boolean,
  ) {
    return this.chatService.addMessage({ chatId, userId, content, isUser });
  }

  // Delete a single chat
  @Post(":chatId/delete")
  async deleteChat(
    @Param("chatId") chatId: string,
    @GetUserId("id") userId: string, // Extract userId from JWT
  ) {
    return this.chatService.deleteChat(chatId, userId);
  }

  // Delete all chats of a user
  @Delete("delete-all")
  async deleteAllChats(
    @GetUserId("id") userId: string, // Extract userId from JWT
  ) {
    return this.chatService.deleteAllChats(userId);
  }

  // Rename a chat
  @Patch(":chatId/rename")
  async renameChat(
    @Param("chatId") chatId: string,
    @GetUserId("id") userId: string, // Extract userId from JWT
    @Body("newTitle") newTitle: string,
  ) {
    return this.chatService.renameChat(chatId, userId, newTitle);
  }
}
