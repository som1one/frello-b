import { Message, RequestType } from "@prisma/client";

export interface AiServiceResponse {
  userMessage: Message;
  assistantMessage: Message;
  type: RequestType;
}
