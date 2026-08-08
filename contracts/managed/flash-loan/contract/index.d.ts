import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type OperatorPublicKey = Uint8Array;

export type Witnesses<PS> = {
  getTrade(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { buyPrice: bigint,
                                                                         sellPrice: bigint,
                                                                         qty: bigint
                                                                       }];
  getOperatorSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  divMod(context: __compactRuntime.WitnessContext<Ledger, PS>,
         x_0: bigint,
         y_0: bigint): [PS, [bigint, bigint]];
}

export type ImpureCircuits<PS> = {
  fund(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  executeFlashLoan(context: __compactRuntime.CircuitContext<PS>,
                   borrowAmount_0: bigint,
                   pair_0: string): __compactRuntime.CircuitResults<PS, []>;
  withdrawProfit(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  fund(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  executeFlashLoan(context: __compactRuntime.CircuitContext<PS>,
                   borrowAmount_0: bigint,
                   pair_0: string): __compactRuntime.CircuitResults<PS, []>;
  withdrawProfit(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  deriveOperatorPublicKey(sk_0: Uint8Array): OperatorPublicKey;
}

export type Circuits<PS> = {
  deriveOperatorPublicKey(context: __compactRuntime.CircuitContext<PS>,
                          sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, OperatorPublicKey>;
  fund(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  executeFlashLoan(context: __compactRuntime.CircuitContext<PS>,
                   borrowAmount_0: bigint,
                   pair_0: string): __compactRuntime.CircuitResults<PS, []>;
  withdrawProfit(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly vaultBalance: bigint;
  readonly profitBalance: bigint;
  readonly loansCompleted: bigint;
  readonly totalBorrowed: bigint;
  readonly lastPair: string;
  readonly lastProfit: bigint;
  readonly lastFee: bigint;
  readonly operator: OperatorPublicKey;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
