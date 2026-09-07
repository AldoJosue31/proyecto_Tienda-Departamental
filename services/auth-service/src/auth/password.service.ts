import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

const BCRYPT_MAX_PASSWORD_BYTES = 72;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    this.assertSupportedLength(password);
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_PASSWORD_BYTES) {
      return false;
    }
    return bcrypt.compare(password, hash);
  }

  private assertSupportedLength(password: string): void {
    if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_PASSWORD_BYTES) {
      throw new Error("Passwords must not exceed 72 UTF-8 bytes.");
    }
  }
}
