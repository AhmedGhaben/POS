import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
