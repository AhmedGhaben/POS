import { IsIn } from "class-validator";
import { SUPPORTED_LANGUAGES } from "../../common/i18n/languages";

export class UpdateMyLanguageDto {
  @IsIn(SUPPORTED_LANGUAGES, { message: "Unsupported language" })
  language!: string;
}
