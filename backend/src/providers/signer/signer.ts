export type Signature = {
  keyId: string;
  algorithm: "Ed25519";
  signatureBase64: string;
};

export interface Signer {
  readonly keyId: string;
  sign(data: Buffer): Signature;
  verify(data: Buffer, signatureBase64: string): boolean;
}
