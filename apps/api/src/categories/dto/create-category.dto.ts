import { IsString, Matches, MaxLength } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(60)
  name!: string;
}
