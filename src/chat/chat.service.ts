import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma.service";
import { Message, RequestType } from "@prisma/client";

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createChat(userId: string, title: string): Promise<any> {
    return this.prisma.chat.create({
      data: {
        userId,
        title,
      },
    });
  }

  async getChatsByUser(userId: string) {
    return this.prisma.chat.findMany({
      where: {
        userId,
      },
      include: {
        messages: {
          select: {
            id: true,
            isUser: true,
            content: true,
            chatId: true,
            dishId: true,
            planId: true,
            userId: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async addMessage({
    chatId,
    userId,
    content,
    rawContent,
    isUser,
    aiResponseType = RequestType.TEXT,
    dishId,
    planId,
  }: {
    chatId: number;
    userId: string;
    content: string;
    rawContent?: string;
    isUser: boolean;
    aiResponseType?: RequestType;
    dishId?: number | null;
    planId?: number | null;
  }): Promise<Message> {
    // Проверяем существование чата
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new BadRequestException("Chat not found");
    }

    return this.prisma.message.create({
      data: {
        chatId,
        userId,
        content,
        rawContent,
        isUser,
        dishId: dishId ?? null,
        planId: planId ?? null,
        aiResponseType,
      },
      select: {
        id: true,
        isUser: true,
        content: true,
        chatId: true,
        dishId: true,
        planId: true,
        userId: true,
        createdAt: true,
        aiResponseType: true,
        isLiked: true,
        rawContent: true,
      },
    });
  }

  // Удаление одного чата
  async deleteChat(chatId: string, userId: string): Promise<void> {
    const id = parseInt(chatId, 10);
    if (isNaN(id)) {
      throw new Error("Invalid chat ID");
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id },
    });

    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    await this.prisma.chat.delete({
      where: { id },
    });
  }

  // Удаление всех чатов пользователя
  async deleteAllChats(userId: string): Promise<void> {
    await this.prisma.chat.deleteMany({
      where: { userId },
    });
  }

  // Обновление сообщения
  async updateMessage({
    chatId,
    messageId,
    userId,
    newContent,
    dishId = null,
    planId = null,
    isLiked = false,
  }: {
    chatId: number;
    messageId: number;
    userId: string;
    newContent: string;
    dishId?: number | null;
    planId?: number | null;
    isLiked?: boolean;
  }): Promise<any> {
    if (isNaN(chatId) || isNaN(messageId)) {
      throw new Error("Invalid chat or message ID");
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.userId !== userId || message.chatId !== chatId) {
      throw new Error("Message not found or unauthorized");
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { content: newContent, dishId, planId, isLiked: isLiked },
      select: {
        id: true,
        isUser: true,
        content: true,
        chatId: true,
        dishId: true,
        planId: true,
        userId: true,
        createdAt: true,
        aiResponseType: true,
        isLiked: true,
      },
    });
  }

  async renameChat(
    chatId: string,
    userId: string,
    newTitle: string,
  ): Promise<any> {
    const id = parseInt(chatId, 10);
    if (isNaN(id)) {
      throw new Error("Invalid chat ID");
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id },
    });

    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    return this.prisma.chat.update({
      where: { id },
      data: { title: newTitle },
    });
  }

  async getMessagesByChat(chatId: number): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { chatId },
      select: {
        id: true,
        isUser: true,
        content: true,
        chatId: true,
        dishId: true,
        planId: true,
        userId: true,
        createdAt: true,
        aiResponseType: true,
        isLiked: true,
        rawContent: true,
      },
      orderBy: {
        id: "asc",
      },
    });
  }

  async getMessageById(messageId: number): Promise<Message> {
    return await this.prisma.message.findUnique({ where: { id: messageId } });
  }

  async getLastUserMessage({
    chatId,
    userId,
  }: {
    chatId: number;
    userId: string;
  }) {
    return await this.prisma.message.findFirst({
      where: { userId, chatId, isUser: true },
      orderBy: { id: "desc" },
    });
  }

  async getLastAssistantMessage({ chatId }: { chatId: number }) {
    return await this.prisma.message.findFirst({
      where: { chatId, isUser: false },
      orderBy: { id: "desc" },
    });
  }
}
