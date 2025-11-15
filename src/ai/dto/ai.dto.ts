import { IsString, IsNotEmpty } from "class-validator";

export class FetchAssistantRequestDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
