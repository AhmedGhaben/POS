import { IsISO8601, IsString, MaxLength } from "class-validator";

export class PinLoginDto {
  @IsString()
  userId!: string;

  /** Checked against the stored PIN; a malformed one is simply wrong. */
  @IsString()
  @MaxLength(12)
  pin!: string;
}

/** The till checked this person's PIN while offline, at `verifiedAt`. */
export class PinResumeDto {
  @IsString()
  userId!: string;

  @IsISO8601()
  verifiedAt!: string;
}
