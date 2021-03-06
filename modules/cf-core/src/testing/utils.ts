import { ERC20, MinimumViableMultisig } from "@connext/contracts";
import {
  Address,
  AppABIEncodings,
  AppInstanceJson,
  AppInstanceProposal,
  AssetId,
  ContractABI,
  CONVENTION_FOR_ETH_ASSET_ID,
  DepositAppState,
  DepositAppStateEncoding,
  EventNames,
  JsonRpcResponse,
  MethodNames,
  MethodParam,
  MethodParams,
  MethodResults,
  OutcomeType,
  ProtocolParams,
  PublicIdentifier,
  Rpc,
  SolidityValueType,
  UninstallMessage,
  EventName,
  ProtocolEventMessage,
} from "@connext/types";
import {
  bigNumberifyJson,
  deBigNumberifyJson,
  getAddressFromAssetId,
  getSignerAddressFromPublicIdentifier,
  toBN,
} from "@connext/utils";
import { Contract, Wallet, providers, constants, utils } from "ethers";

import { CFCore } from "../cfCore";
import { AppInstance, StateChannel } from "../models";
import { CONTRACT_NOT_DEPLOYED } from "../errors";
import { getRandomPublicIdentifier } from "../testing/random-signing-keys";

import { TestContractAddresses } from "./contracts";
import { initialEmptyTTTState, tttAbiEncodings } from "./tic-tac-toe";
import { toBeEq } from "./bignumber-jest-matcher";

const { AddressZero, One, Zero } = constants;
const { bigNumberify, getAddress, hexlify, randomBytes } = utils;

expect.extend({ toBeEq });

interface AppContext {
  appDefinition: string;
  abiEncodings: AppABIEncodings;
  initialState: SolidityValueType;
  outcomeType: OutcomeType;
}

const { DepositApp, DolphinCoin, TicTacToeApp } = global[`contracts`] as TestContractAddresses;

export const newWallet = (wallet: Wallet) =>
  new Wallet(
    wallet.privateKey,
    new providers.JsonRpcProvider((wallet.provider as providers.JsonRpcProvider).connection.url),
  );

export function createAppInstanceProposalForTest(
  appIdentityHash: string,
  stateChannel?: StateChannel,
): AppInstanceProposal {
  const [initiator, responder] = StateChannel
    ? [stateChannel!.userIdentifiers[0], stateChannel!.userIdentifiers[1]]
    : [getRandomPublicIdentifier(), getRandomPublicIdentifier()];
  return {
    identityHash: appIdentityHash,
    initiatorIdentifier: initiator,
    responderIdentifier: responder,
    appDefinition: AddressZero,
    abiEncodings: {
      stateEncoding: "tuple(address foo, uint256 bar)",
      actionEncoding: undefined,
    } as AppABIEncodings,
    initiatorDeposit: "0x00",
    responderDeposit: "0x00",
    defaultTimeout: "0x01",
    stateTimeout: "0x00",
    initialState: {
      foo: AddressZero,
      bar: 0,
    } as SolidityValueType,
    appSeqNo: stateChannel ? stateChannel.numProposedApps : Math.ceil(1000 * Math.random()),
    outcomeType: OutcomeType.TWO_PARTY_FIXED_OUTCOME,
    responderDepositAssetId: CONVENTION_FOR_ETH_ASSET_ID,
    initiatorDepositAssetId: CONVENTION_FOR_ETH_ASSET_ID,
  };
}

export function createAppInstanceForTest(stateChannel?: StateChannel) {
  const [initiator, responder] = stateChannel
    ? [stateChannel!.userIdentifiers[0], stateChannel!.userIdentifiers[1]]
    : [getRandomPublicIdentifier(), getRandomPublicIdentifier()];
  return new AppInstance(
    /* initiator */ initiator,
    /* responder */ responder,
    /* defaultTimeout */ "0x00",
    /* appInterface */ {
      addr: getAddress(hexlify(randomBytes(20))),
      stateEncoding: "tuple(address foo, uint256 bar)",
      actionEncoding: undefined,
    },
    /* appSeqNo */ stateChannel ? stateChannel.numProposedApps : Math.ceil(1000 * Math.random()),
    /* latestState */ { foo: AddressZero, bar: bigNumberify(0) },
    /* latestVersionNumber */ 0,
    /* stateTimeout */ toBN(Math.ceil(1000 * Math.random())).toHexString(),
    /* outcomeType */ OutcomeType.TWO_PARTY_FIXED_OUTCOME,
    /* multisig */ stateChannel
      ? stateChannel.multisigAddress
      : getAddress(hexlify(randomBytes(20))),
    /* meta */ undefined,
    /* latestAction */ undefined,
    /* twoPartyOutcomeInterpreterParams */ {
      playerAddrs: [AddressZero, AddressZero],
      amount: Zero,
      tokenAddress: AddressZero,
    },
    /* multiAssetMultiPartyCoinTransferInterpreterParams */ undefined,
    /* singleAssetTwoPartyCoinTransferInterpreterParams */ undefined,
  );
}

export async function requestDepositRights(
  depositor: CFCore,
  counterparty: CFCore,
  multisigAddress: string,
  assetId: AssetId = CONVENTION_FOR_ETH_ASSET_ID,
) {
  const proposeParams = await getProposeDepositAppParams(
    multisigAddress,
    depositor.publicIdentifier,
    counterparty.publicIdentifier,
    assetId,
  );
  const [appIdentityHash] = await installApp(
    depositor,
    counterparty,
    multisigAddress,
    proposeParams.appDefinition,
    proposeParams.initialState,
    proposeParams.initiatorDeposit,
    proposeParams.initiatorDepositAssetId,
    proposeParams.responderDeposit,
    proposeParams.responderDepositAssetId,
    proposeParams.defaultTimeout,
    proposeParams.stateTimeout,
  );
  return appIdentityHash;
}

export async function rescindDepositRights(
  node: CFCore,
  counterparty: CFCore,
  multisigAddress: string,
  assetId: AssetId = CONVENTION_FOR_ETH_ASSET_ID,
) {
  const apps = await getInstalledAppInstances(node, multisigAddress);
  const depositAppInstance = apps.filter(
    (app) =>
      app.appInterface.addr === DepositApp &&
      (app.latestState as DepositAppState).assetId === getAddressFromAssetId(assetId),
  )[0];
  if (!depositAppInstance) {
    // no apps to uninstall, return
    return;
  }
  // uninstall
  await uninstallApp(node, counterparty, depositAppInstance.identityHash, multisigAddress);
}

export async function getDepositApps(
  node: CFCore,
  multisigAddr: string,
  tokenAddresses: string[] = [],
): Promise<AppInstanceJson[]> {
  const apps = await getInstalledAppInstances(node, multisigAddr);
  if (apps.length === 0) {
    return [];
  }
  const depositApps = apps.filter((app) => app.appInterface.addr === DepositApp);
  if (tokenAddresses.length === 0) {
    return depositApps;
  }
  return depositApps.filter((app) =>
    tokenAddresses.includes((app.latestState as DepositAppState).assetId),
  );
}

/**
 * Checks the msg is what is expected, and that specificied keys exist
 * in the message.
 *
 * @param msg msg to check
 * @param expected expected message, can be partial
 * @param shouldExist array of keys to check existence of if value not known
 * for `expected` (e.g `appIdentityHash`s)
 */
export function assertMessage<T extends EventName>(
  msg: ProtocolEventMessage<T>,
  expected: any, // should be partial of nested types
  shouldExist: string[] = [],
): void {
  // ensure keys exist, shouldExist is array of
  // keys, ie. data.appIdentityHash
  shouldExist.forEach((key) => {
    let subset = { ...msg };
    key.split(`.`).forEach((k) => {
      expect(subset[k]).toBeDefined();
      subset = subset[k];
    });
  });
  // cast both to strings instead of BNs
  expect(deBigNumberifyJson(msg)).toMatchObject(deBigNumberifyJson(expected));
}

export function assertProposeMessage(
  senderId: string,
  msg: ProtocolEventMessage<"PROPOSE_INSTALL_EVENT">,
  params: ProtocolParams.Propose,
) {
  const { multisigAddress, initiatorIdentifier, responderIdentifier, ...emittedParams } = params;
  assertMessage<"PROPOSE_INSTALL_EVENT">(
    msg,
    {
      from: senderId,
      type: `PROPOSE_INSTALL_EVENT`,
      data: {
        params: {
          ...emittedParams,
          responderIdentifier,
        },
      },
    },
    [`data.appInstanceId`],
  );
}

export function assertInstallMessage(
  senderId: string,
  msg: ProtocolEventMessage<"INSTALL_EVENT">,
  appIdentityHash: string,
) {
  assertMessage<"INSTALL_EVENT">(msg, {
    from: senderId,
    type: `INSTALL_EVENT`,
    data: {
      appIdentityHash,
    },
  });
}

/**
 * Even though this function returns a transaction hash, the calling Node
 * will receive an event (CREATE_CHANNEL) that should be subscribed to to
 * ensure a channel has been instantiated and to get its multisig address
 * back in the event data.
 */
export const getMultisigCreationAddress = async (
  node: CFCore,
  addresss: string[],
): Promise<string> => {
  const {
    result: {
      result: { multisigAddress },
    },
  } = await node.rpcRouter.dispatch(constructChannelCreationRpc(addresss));
  return multisigAddress;
};

export function constructChannelCreationRpc(owners: string[]) {
  return {
    id: Date.now(),
    methodName: MethodNames.chan_create,
    parameters: {
      owners,
    } as MethodParams.CreateChannel,
  };
}

/**
 * Wrapper method making the call to the given node to get the list of
 * multisig addresses the node is aware of.
 * @param node
 * @returns list of multisig addresses
 */
export async function getChannelAddresses(node: CFCore): Promise<Set<string>> {
  const {
    result: {
      result: { multisigAddresses },
    },
  } = await node.rpcRouter.dispatch({
    id: Date.now(),
    methodName: MethodNames.chan_getChannelAddresses,
    parameters: {},
  });

  return new Set(multisigAddresses);
}

export async function getAppInstance(
  node: CFCore,
  appIdentityHash: string,
): Promise<AppInstanceJson> {
  const {
    result: {
      result: { appInstance },
    },
  } = await node.rpcRouter.dispatch({
    id: Date.now(),
    methodName: MethodNames.chan_getAppInstance,
    parameters: {
      appIdentityHash,
    },
  });

  return appInstance;
}

export async function getAppInstanceProposal(
  node: CFCore,
  appIdentityHash: string,
  multisigAddress: string,
): Promise<AppInstanceProposal> {
  const proposals = await getProposedAppInstances(node, multisigAddress);
  const candidates = proposals.filter((proposal) => proposal.identityHash === appIdentityHash);

  if (candidates.length === 0) {
    throw new Error(`Could not find proposal`);
  }

  if (candidates.length > 1) {
    throw new Error(`Failed to match exactly one proposed app instance`);
  }

  return candidates[0];
}

export async function getFreeBalanceState(
  node: CFCore,
  multisigAddress: string,
  assetId: string = CONVENTION_FOR_ETH_ASSET_ID,
): Promise<MethodResults.GetFreeBalanceState> {
  const {
    result: { result },
  } = await node.rpcRouter.dispatch({
    id: Date.now(),
    methodName: MethodNames.chan_getFreeBalanceState,
    parameters: {
      multisigAddress,
      assetId,
    },
  });

  return result;
}

export async function getTokenIndexedFreeBalanceStates(
  node: CFCore,
  multisigAddress: string,
): Promise<MethodResults.GetTokenIndexedFreeBalanceStates> {
  const {
    result: { result },
  } = await node.rpcRouter.dispatch({
    id: Date.now(),
    methodName: MethodNames.chan_getTokenIndexedFreeBalanceStates,
    parameters: {
      multisigAddress,
    },
  });

  return result as MethodResults.GetTokenIndexedFreeBalanceStates;
}

export async function getInstalledAppInstances(
  node: CFCore,
  multisigAddress: string,
): Promise<AppInstanceJson[]> {
  const rpc = {
    id: Date.now(),
    methodName: MethodNames.chan_getAppInstances,
    parameters: { multisigAddress } as MethodParams.GetAppInstances,
  };
  const response = (await node.rpcRouter.dispatch(rpc)) as JsonRpcResponse;
  const result = response.result.result as MethodResults.GetAppInstances;
  return result.appInstances;
}

export async function getProposedAppInstances(
  node: CFCore,
  multisigAddress: string,
): Promise<AppInstanceProposal[]> {
  const rpc = {
    id: Date.now(),
    methodName: MethodNames.chan_getProposedAppInstances,
    parameters: { multisigAddress } as MethodParams.GetProposedAppInstances,
  };
  const response = (await node.rpcRouter.dispatch(rpc)) as JsonRpcResponse;
  const result = response.result.result as MethodResults.GetProposedAppInstances;
  return result.appInstances;
}

export async function getMultisigBalance(
  multisigAddr: string,
  tokenAddress: string = AddressZero,
): Promise<utils.BigNumber> {
  const provider = global[`wallet`].provider;
  return tokenAddress === AddressZero
    ? await provider.getBalance(multisigAddr)
    : await new Contract(tokenAddress, ERC20.abi as any, provider).functions.balanceOf(
        multisigAddr,
      );
}

export async function getMultisigAmountWithdrawn(
  multisigAddr: string,
  tokenAddress: string = AddressZero,
) {
  const provider = global[`wallet`].provider;
  const multisig = new Contract(multisigAddr, MinimumViableMultisig.abi as any, provider);
  try {
    return await multisig.functions.totalAmountWithdrawn(tokenAddress);
  } catch (e) {
    if (!e.message.includes(CONTRACT_NOT_DEPLOYED)) {
      console.log(CONTRACT_NOT_DEPLOYED);
      throw new Error(e);
    }
    // multisig is deployed on withdrawal, if not
    // deployed withdrawal amount is 0
    return Zero;
  }
}

export async function getProposeDepositAppParams(
  multisigAddress: string,
  initiatorIdentifier: string,
  responderIdentifier: string,
  assetId: string = CONVENTION_FOR_ETH_ASSET_ID,
): Promise<MethodParams.ProposeInstall> {
  const tokenAddress = getAddressFromAssetId(assetId);
  const startingTotalAmountWithdrawn = await getMultisigAmountWithdrawn(
    multisigAddress,
    tokenAddress,
  );
  const startingMultisigBalance = await getMultisigBalance(multisigAddress, tokenAddress);
  const initialState: DepositAppState = {
    multisigAddress,
    assetId: tokenAddress,
    startingTotalAmountWithdrawn,
    startingMultisigBalance,
    transfers: [
      {
        amount: Zero,
        to: getSignerAddressFromPublicIdentifier(initiatorIdentifier),
      },
      {
        amount: Zero,
        to: getSignerAddressFromPublicIdentifier(responderIdentifier),
      },
    ],
  };

  return {
    abiEncodings: {
      actionEncoding: undefined,
      stateEncoding: DepositAppStateEncoding,
    },
    appDefinition: DepositApp,
    initialState,
    initiatorDeposit: Zero,
    initiatorDepositAssetId: assetId,
    outcomeType: OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
    responderIdentifier,
    responderDeposit: Zero,
    responderDepositAssetId: assetId,
    defaultTimeout: Zero,
    stateTimeout: Zero,
    multisigAddress,
  };
}

export async function deposit(
  node: CFCore,
  multisigAddress: string,
  amount: utils.BigNumber = One,
  responderNode: CFCore,
  assetId: AssetId = CONVENTION_FOR_ETH_ASSET_ID,
) {
  // get rights
  await requestDepositRights(node, responderNode, multisigAddress, assetId);
  const wallet = global["wallet"] as Wallet;
  // send a deposit to the multisig
  const tx =
    getAddressFromAssetId(assetId) === AddressZero
      ? await wallet.sendTransaction({
          value: amount,
          to: multisigAddress,
        })
      : await new Contract(getAddressFromAssetId(assetId), ERC20.abi as any, wallet).transfer(
          multisigAddress,
          amount,
        );
  expect(tx.hash).toBeDefined();
  // rescind rights
  await rescindDepositRights(node, responderNode, multisigAddress, assetId);
}

export async function deployStateDepositHolder(node: CFCore, multisigAddress: string) {
  const response = await node.rpcRouter.dispatch({
    methodName: MethodNames.chan_deployStateDepositHolder,
    parameters: {
      multisigAddress,
    } as MethodParams.DeployStateDepositHolder,
  });

  const result = response.result.result as MethodResults.DeployStateDepositHolder;

  return result.transactionHash;
}

export function constructInstallRpc(appIdentityHash: string, multisigAddress: string): Rpc {
  return {
    id: Date.now(),
    methodName: MethodNames.chan_install,
    parameters: {
      appIdentityHash,
      multisigAddress,
    } as MethodParams.Install,
  };
}

export function constructRejectInstallRpc(appIdentityHash: string, multisigAddress: string): Rpc {
  return {
    id: Date.now(),
    methodName: MethodNames.chan_rejectInstall,
    parameters: {
      appIdentityHash,
      multisigAddress,
    } as MethodParams.RejectInstall,
  };
}

export function constructAppProposalRpc(
  multisigAddress: string,
  responderIdentifier: PublicIdentifier,
  appDefinition: string,
  abiEncodings: AppABIEncodings,
  initialState: SolidityValueType,
  initiatorDeposit: utils.BigNumber = Zero,
  initiatorDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
  responderDeposit: utils.BigNumber = Zero,
  responderDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
  defaultTimeout: utils.BigNumber = Zero,
  stateTimeout: utils.BigNumber = defaultTimeout,
): Rpc {
  const { outcomeType } = getAppContext(appDefinition, initialState);
  return {
    id: Date.now(),
    methodName: MethodNames.chan_proposeInstall,
    parameters: deBigNumberifyJson({
      responderIdentifier,
      initiatorDeposit,
      initiatorDepositAssetId,
      responderDeposit,
      responderDepositAssetId,
      appDefinition,
      initialState,
      abiEncodings,
      outcomeType,
      defaultTimeout,
      stateTimeout,
      multisigAddress,
    } as MethodParams.ProposeInstall),
  };
}

/**
 * @param MethodParams.proposal The parameters of the installation proposal.
 * @param appInstanceProposal The proposed app instance contained in the Node.
 */
export function confirmProposedAppInstance(
  methodParams: MethodParam,
  appInstanceProposal: AppInstanceProposal,
  nonInitiatingNode: boolean = false,
) {
  const proposalParams = methodParams as MethodParams.ProposeInstall;
  expect(proposalParams.abiEncodings).toEqual(appInstanceProposal.abiEncodings);
  expect(proposalParams.appDefinition).toEqual(appInstanceProposal.appDefinition);

  if (nonInitiatingNode) {
    expect(proposalParams.initiatorDeposit).toEqual(
      bigNumberify(appInstanceProposal.responderDeposit),
    );
    expect(proposalParams.responderDeposit).toEqual(
      bigNumberify(appInstanceProposal.initiatorDeposit),
    );
  } else {
    expect(proposalParams.initiatorDeposit).toEqual(
      bigNumberify(appInstanceProposal.initiatorDeposit),
    );
    expect(proposalParams.responderDeposit).toEqual(
      bigNumberify(appInstanceProposal.responderDeposit),
    );
  }

  expect(proposalParams.defaultTimeout).toEqual(toBN(appInstanceProposal.defaultTimeout));
  expect(proposalParams.stateTimeout).toEqual(toBN(appInstanceProposal.stateTimeout));

  // TODO: uncomment when getState is implemented
  // expect(proposalParams.initialState).toEqual(appInstanceInitialState);
}

export function constructGetStateChannelRpc(multisigAddress: string): Rpc {
  return {
    parameters: {
      multisigAddress,
    },
    id: Date.now(),
    methodName: MethodNames.chan_getStateChannel,
  };
}

export function constructTakeActionRpc(
  appIdentityHash: string,
  multisigAddress: string,
  action: any,
): Rpc {
  return {
    parameters: deBigNumberifyJson({
      appIdentityHash,
      action,
      multisigAddress,
    } as MethodParams.TakeAction),
    id: Date.now(),
    methodName: MethodNames.chan_takeAction,
  };
}

export function constructGetAppsRpc(multisigAddress: string): Rpc {
  return {
    parameters: { multisigAddress } as MethodParams.GetAppInstances,
    id: Date.now(),
    methodName: MethodNames.chan_getAppInstances,
  };
}

export function constructUninstallRpc(appIdentityHash: string, multisigAddress: string): Rpc {
  return {
    parameters: {
      appIdentityHash,
      multisigAddress,
    } as MethodParams.Uninstall,
    id: Date.now(),
    methodName: MethodNames.chan_uninstall,
  };
}

export async function collateralizeChannel(
  multisigAddress: string,
  node1: CFCore,
  node2: CFCore,
  amount: utils.BigNumber = One,
  assetId: string = CONVENTION_FOR_ETH_ASSET_ID,
  collateralizeNode2: boolean = true,
): Promise<void> {
  await deposit(node1, multisigAddress, amount, node2, assetId);
  if (collateralizeNode2) {
    await deposit(node2, multisigAddress, amount, node1, assetId);
  }
}

export async function createChannel(nodeA: CFCore, nodeB: CFCore): Promise<string> {
  const sortedOwners = [nodeA.signerAddress, nodeB.signerAddress];
  const [multisigAddress]: any = await Promise.all([
    new Promise(async (resolve) => {
      nodeB.once(EventNames.CREATE_CHANNEL_EVENT, async (msg) => {
        assertMessage<typeof EventNames.CREATE_CHANNEL_EVENT>(
          msg,
          {
            from: nodeA.publicIdentifier,
            type: EventNames.CREATE_CHANNEL_EVENT,
            data: {
              owners: sortedOwners,
            },
          },
          [`data.multisigAddress`],
        );
        expect(await getInstalledAppInstances(nodeB, msg.data.multisigAddress)).toEqual([]);
        resolve(msg.data.multisigAddress);
      });
    }),
    new Promise((resolve) => {
      nodeA.once(EventNames.CREATE_CHANNEL_EVENT, (msg) => {
        assertMessage<typeof EventNames.CREATE_CHANNEL_EVENT>(
          msg,
          {
            from: nodeA.publicIdentifier,
            type: EventNames.CREATE_CHANNEL_EVENT,
            data: {
              owners: sortedOwners,
              counterpartyIdentifier: nodeB.publicIdentifier,
            },
          },
          [`data.multisigAddress`],
        );
        resolve(msg.data.multisigAddress);
      });
    }),
    getMultisigCreationAddress(nodeA, [nodeA.publicIdentifier, nodeB.publicIdentifier]),
  ]);
  expect(multisigAddress).toBeDefined();
  expect(await getInstalledAppInstances(nodeA, multisigAddress)).toEqual([]);
  return multisigAddress;
}

// NOTE: Do not run this concurrently, it won't work
export async function installApp(
  nodeA: CFCore,
  nodeB: CFCore,
  multisigAddress: string,
  appDefinition: string,
  initialState?: SolidityValueType,
  initiatorDeposit: utils.BigNumber = Zero,
  initiatorDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
  responderDeposit: utils.BigNumber = Zero,
  responderDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
  defaultTimeout: utils.BigNumber = Zero,
  stateTimeout: utils.BigNumber = defaultTimeout,
): Promise<[string, ProtocolParams.Propose]> {
  const appContext = getAppContext(appDefinition, initialState);

  const installationProposalRpc = constructAppProposalRpc(
    multisigAddress,
    nodeB.publicIdentifier,
    appContext.appDefinition,
    appContext.abiEncodings,
    appContext.initialState,
    initiatorDeposit,
    initiatorDepositAssetId,
    responderDeposit,
    responderDepositAssetId,
    defaultTimeout,
    stateTimeout,
  );

  const proposedParams = installationProposalRpc.parameters as ProtocolParams.Propose;

  // generate expected post install balances
  const singleAsset = initiatorDepositAssetId === responderDepositAssetId;
  const preInstallInitiatorAsset = await getFreeBalanceState(
    nodeA,
    multisigAddress,
    initiatorDepositAssetId,
  );
  const preInstallResponderAsset = await getFreeBalanceState(
    nodeA,
    multisigAddress,
    responderDepositAssetId,
  );
  const expectedInitiatorAsset = {
    [nodeA.signerAddress]: preInstallInitiatorAsset[nodeA.signerAddress].sub(initiatorDeposit),
    [nodeB.signerAddress]: preInstallInitiatorAsset[nodeB.signerAddress].sub(
      singleAsset ? responderDeposit : Zero,
    ),
  };
  const expectedResponderAsset = {
    [nodeA.signerAddress]: preInstallResponderAsset[nodeA.signerAddress].sub(
      singleAsset ? initiatorDeposit : Zero,
    ),
    [nodeB.signerAddress]: preInstallResponderAsset[nodeB.signerAddress].sub(responderDeposit),
  };

  const appIdentityHash: string = await new Promise(async (resolve) => {
    nodeB.once(`PROPOSE_INSTALL_EVENT`, async (msg) => {
      // assert message
      assertProposeMessage(nodeA.publicIdentifier, msg, proposedParams);
      // Sanity-check
      confirmProposedAppInstance(
        installationProposalRpc.parameters,
        await getAppInstanceProposal(nodeB, msg.data.appInstanceId, multisigAddress),
      );
      resolve(msg.data.appInstanceId);
    });

    await nodeA.rpcRouter.dispatch(installationProposalRpc);
  });

  confirmProposedAppInstance(
    installationProposalRpc.parameters,
    await getAppInstanceProposal(nodeA, appIdentityHash, multisigAddress),
  );

  // send nodeB install call
  await Promise.all([
    nodeB.rpcRouter.dispatch(constructInstallRpc(appIdentityHash, multisigAddress)),
    new Promise(async (resolve) => {
      nodeA.on(EventNames.INSTALL_EVENT, async (msg) => {
        if (msg.data.appIdentityHash === appIdentityHash) {
          // assert message
          assertInstallMessage(nodeB.publicIdentifier, msg, appIdentityHash);
          const appInstanceNodeA = await getAppInstance(nodeA, appIdentityHash);
          const appInstanceNodeB = await getAppInstance(nodeB, appIdentityHash);
          expect(appInstanceNodeA).toEqual(appInstanceNodeB);
          resolve();
        }
      });
    }),
  ]);

  const postInstallInitiatorAsset = await getFreeBalanceState(
    nodeA,
    multisigAddress,
    initiatorDepositAssetId,
  );
  const postInstallResponderAsset = await getFreeBalanceState(
    nodeA,
    multisigAddress,
    responderDepositAssetId,
  );
  Object.entries(postInstallInitiatorAsset).forEach(([addr, balance]) => {
    expect(balance).toBeEq(expectedInitiatorAsset[addr]);
  });
  Object.entries(postInstallResponderAsset).forEach(([addr, balance]) => {
    expect(balance).toBeEq(expectedResponderAsset[addr]);
  });

  return [appIdentityHash, proposedParams];
}

export async function confirmChannelCreation(
  nodeA: CFCore,
  nodeB: CFCore,
  data: MethodResults.CreateChannel,
  owners: Address[], // free balance addr[]
) {
  const openChannelsNodeA = await getChannelAddresses(nodeA);
  const openChannelsNodeB = await getChannelAddresses(nodeB);

  expect(openChannelsNodeA.has(data.multisigAddress)).toBeTruthy();
  expect(openChannelsNodeB.has(data.multisigAddress)).toBeTruthy();
  if (data.owners) {
    expect(data.owners).toMatchObject(owners);
  }
}

export async function confirmAppInstanceInstallation(
  proposedParams: ProtocolParams.Propose,
  appInstance: AppInstanceJson,
) {
  const params = bigNumberifyJson(proposedParams) as ProtocolParams.Propose;
  expect(appInstance.appInterface.addr).toEqual(params.appDefinition);
  expect(appInstance.appInterface.stateEncoding).toEqual(params.abiEncodings.stateEncoding);
  expect(appInstance.appInterface.actionEncoding).toEqual(params.abiEncodings.actionEncoding);
  expect(appInstance.defaultTimeout).toEqual(params.defaultTimeout.toHexString());
  expect(appInstance.stateTimeout).toEqual(params.stateTimeout.toHexString());
  expect(appInstance.latestState).toEqual(params.initialState);
}

export async function makeInstallCall(
  node: CFCore,
  appIdentityHash: string,
  multisigAddress: string,
) {
  return node.rpcRouter.dispatch(constructInstallRpc(appIdentityHash, multisigAddress));
}

export function makeProposeCall(
  nodeB: CFCore,
  appDefinition: string,
  multisigAddress: string,
  initialState?: SolidityValueType,
  initiatorDeposit: utils.BigNumber = Zero,
  initiatorDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
  responderDeposit: utils.BigNumber = Zero,
  responderDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
): Rpc {
  const appContext = getAppContext(appDefinition, initialState);
  return constructAppProposalRpc(
    multisigAddress,
    nodeB.publicIdentifier,
    appContext.appDefinition,
    appContext.abiEncodings,
    appContext.initialState,
    initiatorDeposit,
    initiatorDepositAssetId,
    responderDeposit,
    responderDepositAssetId,
  );
}

export async function makeAndSendProposeCall(
  nodeA: CFCore,
  nodeB: CFCore,
  appDefinition: string,
  multisigAddress: string,
  initialState?: SolidityValueType,
  initiatorDeposit: utils.BigNumber = Zero,
  initiatorDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
  responderDeposit: utils.BigNumber = Zero,
  responderDepositAssetId: string = CONVENTION_FOR_ETH_ASSET_ID,
): Promise<{
  appIdentityHash: string;
  params: ProtocolParams.Propose;
}> {
  const installationProposalRpc = makeProposeCall(
    nodeB,
    appDefinition,
    multisigAddress,
    initialState,
    initiatorDeposit,
    initiatorDepositAssetId,
    responderDeposit,
    responderDepositAssetId,
  );

  const {
    result: {
      result: { appIdentityHash },
    },
  } = await nodeA.rpcRouter.dispatch(installationProposalRpc);

  return {
    appIdentityHash,
    params: installationProposalRpc.parameters as ProtocolParams.Propose,
  };
}

/**
 * @return the ERC20 token balance of the receiver
 */
export async function transferERC20Tokens(
  toAddress: string,
  tokenAddress: string = DolphinCoin,
  contractABI: ContractABI = ERC20.abi,
  amount: utils.BigNumber = One,
): Promise<utils.BigNumber> {
  const deployerAccount = global["wallet"];
  const contract = new Contract(tokenAddress, contractABI, deployerAccount);
  const balanceBefore: utils.BigNumber = await contract.functions.balanceOf(toAddress);
  await contract.functions.transfer(toAddress, amount);
  const balanceAfter: utils.BigNumber = await contract.functions.balanceOf(toAddress);
  expect(balanceAfter.sub(balanceBefore)).toEqual(amount);
  return balanceAfter;
}

export function getAppContext(
  appDefinition: string,
  initialState?: SolidityValueType,
  senderAddress?: string, // needed for both types of transfer apps
  receiverAddress?: string, // needed for both types of transfer apps
): AppContext {
  const checkForAddresses = () => {
    const missingAddr = !senderAddress || !receiverAddress;
    if (missingAddr && !initialState) {
      throw new Error(
        `Must have sender and redeemer addresses to generate initial state for either transfer app context`,
      );
    }
  };
  const checkForInitialState = () => {
    if (!initialState) {
      throw new Error(`Must have initial state to generate app context`);
    }
  };

  switch (appDefinition) {
    case TicTacToeApp:
      return {
        appDefinition,
        abiEncodings: tttAbiEncodings,
        initialState: initialState || initialEmptyTTTState(),
        outcomeType: OutcomeType.TWO_PARTY_FIXED_OUTCOME,
      };

    case DepositApp:
      checkForInitialState();
      return {
        appDefinition,
        initialState: initialState!,
        abiEncodings: {
          stateEncoding: DepositAppStateEncoding,
          actionEncoding: undefined,
        },
        outcomeType: OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER,
      };

    default:
      throw new Error(`Proposing the specified app is not supported: ${appDefinition}`);
  }
}

export async function takeAppAction(
  node: CFCore,
  appIdentityHash: string,
  multisigAddress: string,
  action: any,
) {
  const res = await node.rpcRouter.dispatch(
    constructTakeActionRpc(appIdentityHash, action, multisigAddress),
  );
  return res.result.result;
}

export async function uninstallApp(
  node: CFCore,
  counterparty: CFCore,
  appIdentityHash: string,
  multisigAddress: string,
): Promise<string> {
  await Promise.all([
    node.rpcRouter.dispatch(constructUninstallRpc(appIdentityHash, multisigAddress)),
    new Promise((resolve) => {
      counterparty.once(EventNames.UNINSTALL_EVENT, (msg: UninstallMessage) => {
        expect(msg.data.appIdentityHash).toBe(appIdentityHash);
        resolve(appIdentityHash);
      });
    }),
  ]);
  return appIdentityHash;
}

export async function getApps(node: CFCore, multisigAddress: string): Promise<AppInstanceJson[]> {
  return (await node.rpcRouter.dispatch(constructGetAppsRpc(multisigAddress))).result.result
    .appInstances;
}

export async function getBalances(
  nodeA: CFCore,
  nodeB: CFCore,
  multisigAddress: string,
  assetId: AssetId,
): Promise<[utils.BigNumber, utils.BigNumber]> {
  let tokenFreeBalanceState = await getFreeBalanceState(nodeA, multisigAddress, assetId);

  const tokenBalanceNodeA = tokenFreeBalanceState[nodeA.signerAddress];

  tokenFreeBalanceState = await getFreeBalanceState(nodeB, multisigAddress, assetId);

  const tokenBalanceNodeB = tokenFreeBalanceState[nodeB.signerAddress];

  return [tokenBalanceNodeA, tokenBalanceNodeB];
}
