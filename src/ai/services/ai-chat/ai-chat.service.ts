import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Message } from "@prisma/client";
import { ChatService } from "src/chat/chat.service";

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  constructor(private readonly chatService: ChatService) {}

  async addUserMessage(
    chatId: number,
    userId: string,
    content: string,
  ): Promise<Message> {
    const message = await this.chatService.addMessage({
      chatId,
      userId,
      content,
      isUser: true,
    });
    this.logger.log("Saved user message", { userMessage: message });
    return message;
  }

  async getChatMessages(chatId: number): Promise<Message[]> {
    const messages = await this.chatService.getMessagesByChat(chatId);
    this.logger.log("Messages from chat", { messages });
    return messages;
  }

  async getUserMessageForRegeneration(messageId: number): Promise<Message> {
    const message = await this.chatService.getMessageById(messageId);
    if (!message || !message.isUser) {
      throw new HttpException(
        "Invalid user message ID",
        HttpStatus.BAD_REQUEST,
      );
    }
    return message;
  }

  async saveAssistantResponse(
    chatId: number,
    userId: string,
    content: string,
    isRegeneration: boolean,
    existingMessageId?: number,
    dishId?: number,
    planId?: number,
  ): Promise<Message> {
    if (isRegeneration && existingMessageId) {
      return this.chatService.updateMessage({
        chatId,
        messageId: existingMessageId,
        userId,
        newContent: content,
      });
    }
    return this.chatService.addMessage({
      chatId,
      userId,
      content,
      isUser: false,
      dishId,
      planId,
    });
  }

  findAssistantMessageId(
    messages: Message[],
    userMessage: Message,
  ): number | undefined {
    return messages.find(
      (msg) => !msg.isUser && msg.createdAt > userMessage.createdAt,
    )?.id;
  }

  async getMessageById(messageId: number): Promise<Message> {
    return await this.chatService.getMessageById(messageId);
  }

  async updateMessage({
    chatId,
    messageId,
    userId,
    newContent,
    dishId,
    planId,
    isLiked,
  }: {
    chatId: number;
    messageId: number;
    userId: string;
    newContent: string;
    dishId?: number;
    planId?: number;
    isLiked?: boolean;
  }): Promise<Message> {
    return await this.chatService.updateMessage({
      chatId,
      messageId,
      userId,
      newContent,
      dishId,
      planId,
      isLiked,
    });
  }

  getLastUserMessage({
    chatId,
    userId,
  }: {
    chatId: number;
    userId: string;
  }): Promise<Message | undefined> {
    return this.chatService.getLastUserMessage({
      chatId,
      userId,
    });
  }

  getLastAssistantMessage({
    chatId,
  }: {
    chatId: number;
  }): Promise<Message | undefined> {
    return this.chatService.getLastAssistantMessage({
      chatId,
    });
  }
}
