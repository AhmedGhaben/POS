import { IsString, Matches, MinLength } from "class-validator";
import { PIN_PATTERN } from "../../common/utils/pin";

export class SetPinDto {
  @Matches(PIN_PATTERN, { message: "A PIN is 4 to 6 digits" })
  pin!: string;
}

/** Setting your own PIN needs your password. */
export class SetMyPinDto extends SetPinDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
