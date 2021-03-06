import { HexString } from "@connext/types";
import * as Token from "@openzeppelin/contracts/build/contracts/ERC20Mintable.json";
import { utils } from "ethers";

import * as AppApplyActionFails from "../artifacts/AppApplyActionFails.json";
import * as AppComputeOutcomeFails from "../artifacts/AppComputeOutcomeFails.json";
import * as AppWithAction from "../artifacts/AppWithAction.json";
import * as ChallengeRegistry from "../artifacts/ChallengeRegistry.json";
import * as ConditionalTransactionDelegateTarget from "../artifacts/ConditionalTransactionDelegateTarget.json";
import * as CounterfactualApp from "../artifacts/CounterfactualApp.json";
import * as DelegateProxy from "../artifacts/DelegateProxy.json";
import * as DepositApp from "../artifacts/DepositApp.json";
import * as DolphinCoin from "../artifacts/DolphinCoin.json";
import * as Echo from "../artifacts/Echo.json";
import * as ERC20 from "../artifacts/ERC20.json";
import * as HashLockTransferApp from "../artifacts/HashLockTransferApp.json";
import * as HighRollerApp from "../artifacts/HighRollerApp.json";
import * as IdentityApp from "../artifacts/IdentityApp.json";
import * as MinimumViableMultisig from "../artifacts/MinimumViableMultisig.json";
import * as MultiAssetMultiPartyCoinTransferInterpreter from "../artifacts/MultiAssetMultiPartyCoinTransferInterpreter.json";
import * as NimApp from "../artifacts/NimApp.json";
import * as Proxy from "../artifacts/Proxy.json";
import * as ProxyFactory from "../artifacts/ProxyFactory.json";
import * as SimpleLinkedTransferApp from "../artifacts/SimpleLinkedTransferApp.json";
import * as SimpleSignedTransferApp from "../artifacts/SimpleSignedTransferApp.json";
import * as SimpleTwoPartySwapApp from "../artifacts/SimpleTwoPartySwapApp.json";
import * as SingleAssetTwoPartyCoinTransferInterpreter from "../artifacts/SingleAssetTwoPartyCoinTransferInterpreter.json";
import * as TicTacToeApp from "../artifacts/TicTacToeApp.json";
import * as TimeLockedPassThrough from "../artifacts/TimeLockedPassThrough.json";
import * as TwoPartyFixedOutcomeInterpreter from "../artifacts/TwoPartyFixedOutcomeInterpreter.json";
import * as WithdrawApp from "../artifacts/WithdrawApp.json";

type Abi = Array<string | utils.FunctionFragment | utils.EventFragment | utils.ParamType>;

type Artifact = {
  contractName: string;
  abi: Abi;
  bytecode: HexString;
  deployedBytecode: HexString;
};

type Artifacts = { [contractName: string]: Artifact };

export const artifacts = {
  AppApplyActionFails,
  AppComputeOutcomeFails,
  AppWithAction,
  ChallengeRegistry,
  ConditionalTransactionDelegateTarget,
  CounterfactualApp,
  DelegateProxy,
  DepositApp,
  DolphinCoin,
  Echo,
  ERC20,
  HashLockTransferApp,
  HighRollerApp,
  IdentityApp,
  MinimumViableMultisig,
  MultiAssetMultiPartyCoinTransferInterpreter,
  NimApp,
  Proxy,
  ProxyFactory,
  SimpleLinkedTransferApp,
  SimpleSignedTransferApp,
  SimpleTwoPartySwapApp,
  SingleAssetTwoPartyCoinTransferInterpreter,
  TicTacToeApp,
  TimeLockedPassThrough,
  Token,
  TwoPartyFixedOutcomeInterpreter,
  WithdrawApp,
} as Artifacts;

export {
  AppApplyActionFails,
  AppComputeOutcomeFails,
  AppWithAction,
  ChallengeRegistry,
  ConditionalTransactionDelegateTarget,
  CounterfactualApp,
  DelegateProxy,
  DepositApp,
  DolphinCoin,
  Echo,
  ERC20,
  HashLockTransferApp,
  HighRollerApp,
  IdentityApp,
  MinimumViableMultisig,
  MultiAssetMultiPartyCoinTransferInterpreter,
  NimApp,
  Proxy,
  ProxyFactory,
  SimpleLinkedTransferApp,
  SimpleSignedTransferApp,
  SimpleTwoPartySwapApp,
  SingleAssetTwoPartyCoinTransferInterpreter,
  TicTacToeApp,
  TimeLockedPassThrough,
  Token,
  TwoPartyFixedOutcomeInterpreter,
  WithdrawApp,
};
