import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const BlankToUndefined = () =>
  Transform(({ value }) => (typeof value === "string" ? value.trim() || undefined : value));

export class IssueInvoiceDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "Buyer name is required" })
  @MaxLength(150)
  buyerName!: string;

  @IsOptional() @BlankToUndefined() @IsString() @MaxLength(300)
  buyerAddress?: string;

  @IsOptional() @BlankToUndefined() @IsString() @MaxLength(50)
  buyerTaxId?: string;

  @IsOptional() @BlankToUndefined() @IsEmail()
  buyerEmail?: string;

  /** Copy the buyer details onto the sale's customer, for next time. */
  @IsOptional()
  @IsBoolean()
  saveToCustomer?: boolean;
}
