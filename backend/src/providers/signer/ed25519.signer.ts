import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type { Signature, Signer } from "./signer.js";

export class Ed25519Signer implements Signer {
  readonly keyId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  /** @param privateKeyPemBase64 PKCS#8 PEM, base64-encoded (generate with `npm run keys:generate`). */
  constructor(privateKeyPemBase64: string, keyId: string) {
    const pem = Buffer.from(privateKeyPemBase64, "base64").toString("utf8");
    this.privateKey = createPrivateKey(pem);
    if (this.privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error("EVIDENCE_SIGNING_PRIVATE_KEY must be an Ed25519 key");
    }
    this.publicKey = createPublicKey(this.privateKey);
    this.keyId = keyId;
  }

  sign(data: Buffer): Signature {
    return {
      keyId: this.keyId,
      algorithm: "Ed25519",
      signatureBase64: sign(null, data, this.privateKey).toString("base64"),
    };
  }

  verify(data: Buffer, signatureBase64: string): boolean {
    return verify(null, data, this.publicKey, Buffer.from(signatureBase64, "base64"));
  }
}
