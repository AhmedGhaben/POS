import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { Transform } from "class-transformer";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CreateTerminalDto {
  @IsString()
  storeId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class UpdateTerminalDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** A new till's name and store, for a pairing code. */
export class CreatePairingCodeDto extends CreateTerminalDto {}

export class PairTerminalDto {
  @Matches(/^\d{6}$/, { message: "That till code isn't valid or has expired" })
  code!: string;
}

/** A till's heartbeat ("Lojas agora"): what it knows about its own queue. */
export class TerminalHeartbeatDto {
  /** Entries waiting to upload on the till right now. */
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  pendingCount!: number;

  /** Nothing pending and nothing failed after its last sync pass. */
  @IsBoolean()
  syncedOk!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  /**
   * The till's sync engine is running (someone is signed in). False: saved
   * sales wait on the till until someone signs in. Older tills don't send
   * it; they only report while someone is signed in, so it counts as true.
   */
  @IsOptional()
  @IsBoolean()
  syncActive?: boolean;
}
