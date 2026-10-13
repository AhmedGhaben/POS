import { IsString, MaxLength } from "class-validator";

export class ProductPhotoDto {
  /** data:image/jpeg;base64,... (512 KB at most once decoded). */
  @IsString()
  @MaxLength(720_000)
  dataUrl!: string;
}
