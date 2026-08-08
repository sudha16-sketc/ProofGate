import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum SubjectStatus { NONE = 0, ACTIVE = 1, SUSPENDED = 2, REVOKED = 3 }

export enum IssuerStatus { NONE = 0, ACTIVE = 1, SUSPENDED = 2, REVOKED = 3 }

export enum PermitStatus { VALID = 0, CONSUMED = 1, REVOKED = 2 }

export type Subject = { status: SubjectStatus;
                        credId: Uint8Array;
                        issuerId: Uint8Array;
                        kycLevel: bigint;
                        policyVersion: bigint;
                        claimCommitment: Uint8Array;
                        attestedPolicyVersion: bigint;
                        expiresAt: bigint;
                        registeredAt: bigint
                      };

export type Issuer = { status: IssuerStatus;
                       pkX: Uint8Array;
                       pkY: Uint8Array;
                       metadataHash: Uint8Array;
                       createdAt: bigint;
                       revokedAt: bigint
                     };

export type Permit = { holder: Uint8Array;
                       feature: Uint8Array;
                       policyId: Uint8Array;
                       policyVersion: bigint;
                       credId: Uint8Array;
                       issuedAt: bigint;
                       expiresAt: bigint;
                       status: PermitStatus
                     };

export type Witnesses<PS> = {
  adminSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  subjectSk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  subjectPkX(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  subjectPkY(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  issuerPkX(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  issuerPkY(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  signedIssuerId(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  subjectCommitment(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credentialId(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credentialVersion(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  credentialVersionSlot(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  age(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  ageSlot(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  jurisdiction(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  kycLevel(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  kycLevelSlot(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  issuedAt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  issuedAtSlot(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  expiresAt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  expiresAtSlot(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  policyVersion(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  policyVersionSlot(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  rx(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  ry(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  s(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  permitSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  checkSignature(context: __compactRuntime.CircuitContext<PS>,
                 domain_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  checkPossession(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  attestCompliance(context: __compactRuntime.CircuitContext<PS>,
                   juris_0: Uint8Array[]): __compactRuntime.CircuitResults<PS, []>;
  rotateAdmin(context: __compactRuntime.CircuitContext<PS>,
              newAdminPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setPolicy(context: __compactRuntime.CircuitContext<PS>,
            policyIdParam_0: Uint8Array,
            versionParam_0: bigint,
            minimumAgeParam_0: bigint,
            requiredKycLevelParam_0: bigint,
            requiredCredentialVersionParam_0: bigint,
            jurisdictionCommitmentParam_0: Uint8Array,
            jurisdictionsParam_0: Uint8Array[]): __compactRuntime.CircuitResults<PS, []>;
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerPkXParam_0: Uint8Array,
                 issuerPkYParam_0: Uint8Array,
                 metadataHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setIssuerStatus(context: __compactRuntime.CircuitContext<PS>,
                  issuerPkXParam_0: Uint8Array,
                  issuerPkYParam_0: Uint8Array,
                  status_0: IssuerStatus): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credIdParam_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unrevokeCredential(context: __compactRuntime.CircuitContext<PS>,
                     credIdParam_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setSubjectStatus(context: __compactRuntime.CircuitContext<PS>,
                   subjectPk_0: Uint8Array,
                   status_0: SubjectStatus): __compactRuntime.CircuitResults<PS, []>;
  registerCredential(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  requestPermit(context: __compactRuntime.CircuitContext<PS>,
                feature_0: Uint8Array,
                expiresAt_0: bigint,
                expiresAtSlot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  consumePermit(context: __compactRuntime.CircuitContext<PS>,
                feature_0: Uint8Array,
                permitId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokePermit(context: __compactRuntime.CircuitContext<PS>,
               permitId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  attestCompliance(context: __compactRuntime.CircuitContext<PS>,
                   juris_0: Uint8Array[]): __compactRuntime.CircuitResults<PS, []>;
  rotateAdmin(context: __compactRuntime.CircuitContext<PS>,
              newAdminPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setPolicy(context: __compactRuntime.CircuitContext<PS>,
            policyIdParam_0: Uint8Array,
            versionParam_0: bigint,
            minimumAgeParam_0: bigint,
            requiredKycLevelParam_0: bigint,
            requiredCredentialVersionParam_0: bigint,
            jurisdictionCommitmentParam_0: Uint8Array,
            jurisdictionsParam_0: Uint8Array[]): __compactRuntime.CircuitResults<PS, []>;
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerPkXParam_0: Uint8Array,
                 issuerPkYParam_0: Uint8Array,
                 metadataHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setIssuerStatus(context: __compactRuntime.CircuitContext<PS>,
                  issuerPkXParam_0: Uint8Array,
                  issuerPkYParam_0: Uint8Array,
                  status_0: IssuerStatus): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credIdParam_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unrevokeCredential(context: __compactRuntime.CircuitContext<PS>,
                     credIdParam_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setSubjectStatus(context: __compactRuntime.CircuitContext<PS>,
                   subjectPk_0: Uint8Array,
                   status_0: SubjectStatus): __compactRuntime.CircuitResults<PS, []>;
  registerCredential(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  requestPermit(context: __compactRuntime.CircuitContext<PS>,
                feature_0: Uint8Array,
                expiresAt_0: bigint,
                expiresAtSlot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  consumePermit(context: __compactRuntime.CircuitContext<PS>,
                feature_0: Uint8Array,
                permitId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokePermit(context: __compactRuntime.CircuitContext<PS>,
               permitId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  adminKey(sk_0: Uint8Array): Uint8Array;
  issuerId(pkX_0: Uint8Array, pkY_0: Uint8Array): Uint8Array;
  subjectKey(domain_0: Uint8Array, pkX_0: Uint8Array, pkY_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  adminKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  issuerId(context: __compactRuntime.CircuitContext<PS>,
           pkX_0: Uint8Array,
           pkY_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  subjectKey(context: __compactRuntime.CircuitContext<PS>,
             domain_0: Uint8Array,
             pkX_0: Uint8Array,
             pkY_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  checkSignature(context: __compactRuntime.CircuitContext<PS>,
                 domain_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  checkPossession(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  attestCompliance(context: __compactRuntime.CircuitContext<PS>,
                   juris_0: Uint8Array[]): __compactRuntime.CircuitResults<PS, []>;
  rotateAdmin(context: __compactRuntime.CircuitContext<PS>,
              newAdminPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setPolicy(context: __compactRuntime.CircuitContext<PS>,
            policyIdParam_0: Uint8Array,
            versionParam_0: bigint,
            minimumAgeParam_0: bigint,
            requiredKycLevelParam_0: bigint,
            requiredCredentialVersionParam_0: bigint,
            jurisdictionCommitmentParam_0: Uint8Array,
            jurisdictionsParam_0: Uint8Array[]): __compactRuntime.CircuitResults<PS, []>;
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerPkXParam_0: Uint8Array,
                 issuerPkYParam_0: Uint8Array,
                 metadataHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setIssuerStatus(context: __compactRuntime.CircuitContext<PS>,
                  issuerPkXParam_0: Uint8Array,
                  issuerPkYParam_0: Uint8Array,
                  status_0: IssuerStatus): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credIdParam_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unrevokeCredential(context: __compactRuntime.CircuitContext<PS>,
                     credIdParam_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setSubjectStatus(context: __compactRuntime.CircuitContext<PS>,
                   subjectPk_0: Uint8Array,
                   status_0: SubjectStatus): __compactRuntime.CircuitResults<PS, []>;
  registerCredential(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  requestPermit(context: __compactRuntime.CircuitContext<PS>,
                feature_0: Uint8Array,
                expiresAt_0: bigint,
                expiresAtSlot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  consumePermit(context: __compactRuntime.CircuitContext<PS>,
                feature_0: Uint8Array,
                permitId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokePermit(context: __compactRuntime.CircuitContext<PS>,
               permitId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly contractDomain: Uint8Array;
  readonly adminPk: Uint8Array;
  readonly activePolicyId: Uint8Array;
  readonly activePolicyVersion: bigint;
  readonly minimumAge: bigint;
  readonly requiredKycLevel: bigint;
  readonly requiredCredentialVersion: bigint;
  readonly jurisdictionCommitment: Uint8Array;
  issuers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Issuer;
    [Symbol.iterator](): Iterator<[Uint8Array, Issuer]>
  };
  subjects: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Subject;
    [Symbol.iterator](): Iterator<[Uint8Array, Subject]>
  };
  revoked: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  permits: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Permit;
    [Symbol.iterator](): Iterator<[Uint8Array, Permit]>
  };
  readonly seq: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               contractDomainParam_0: Uint8Array,
               adminPkParam_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
