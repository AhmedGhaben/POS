import { IsString, MaxLength } from "class-validator";

export class UploadLogoDto {
  /** data:image/png|jpeg|webp;base64,... — the browser resizes before sending. */
  @IsString()
  @MaxLength(450_000)
  dataUrl!: string;
}
