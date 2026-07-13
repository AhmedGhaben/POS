import { IsDateString, IsEmail, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wage?: number;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
