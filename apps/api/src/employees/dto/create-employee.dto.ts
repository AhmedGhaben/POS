import { Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { StaffLoginDto } from "../../users/dto/staff-login.dto";

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

  /** Create a login for this employee in the same request (owner only). */
  @IsOptional()
  @ValidateNested()
  @Type(() => StaffLoginDto)
  login?: StaffLoginDto;
}
