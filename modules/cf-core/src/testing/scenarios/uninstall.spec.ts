import { EventNames, AppInstanceJson } from "@connext/types";
import { One, Two, Zero } from "ethers/constants";

import { Node } from "../../node";
import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../constants";
import { USE_RESCIND_DEPOSIT_RIGHTS } from "../../errors";
import { UninstallMessage } from "../../types";

import { toBeEq } from "../bignumber-jest-matcher";
import { NetworkContextForTestSuite } from "../contracts";
import { setup, SetupContext } from "../setup";
import {
  assertNodeMessage,
  collateralizeChannel,
  constructUninstallRpc,
  createChannel,
  getFreeBalanceState,
  getInstalledAppInstances,
  installApp,
  getApps,
  requestDepositRights,
} from "../utils";
import { isHexString } from "ethers/utils";

expect.extend({ toBeEq });

const { TicTacToeApp } = global["network"] as NetworkContextForTestSuite;

function assertUninstallMessage(senderId: string, appInstanceId: string, msg: UninstallMessage) {
  assertNodeMessage(msg, {
    from: senderId,
    type: EventNames.UNINSTALL_EVENT,
    data: {
      appInstanceId,
    },
  });
}

describe("Uninstalling coin balance refund app", () => {
  let nodeA: Node;
  let nodeB: Node;

  let multisigAddress: string;
  let coinBalanceAppId: string;

  const assertAppsPresent = async (expected: number) => {
    const appsA = await getApps(nodeA, multisigAddress);
    const appsB = await getApps(nodeB, multisigAddress);
    expect(appsA.length).toEqual(expected);
    expect(appsB.length).toEqual(expected);
    return appsA.map((app: AppInstanceJson) => app.identityHash);
  };

  beforeEach(async () => {
    const context: SetupContext = await setup(global);
    nodeA = context["A"].node;
    nodeB = context["B"].node;

    multisigAddress = await createChannel(nodeA, nodeB);
    expect(multisigAddress).toBeDefined();
    expect(isHexString(multisigAddress)).toBeTruthy();

    await requestDepositRights(nodeA, nodeB, multisigAddress);
    coinBalanceAppId = (await assertAppsPresent(1))[0];
    expect(coinBalanceAppId).toBeDefined();
  });

  it("should fail if you try to uninstall coin balance refund app", async () => {
    await expect(
      nodeB.rpcRouter.dispatch(constructUninstallRpc(coinBalanceAppId)),
    ).rejects.toThrowError(USE_RESCIND_DEPOSIT_RIGHTS);
    await assertAppsPresent(1);
  });
});

describe("Node A and B install apps of different outcome types, then uninstall them to test outcomes types and interpreters", () => {
  let nodeA: Node;
  let nodeB: Node;

  describe("Tests for different outcomes of the TwoPartyFixedOutcome type", () => {
    let appInstanceId: string;
    let multisigAddress: string;
    const depositAmount = One;

    const initialState = {
      versionNumber: 0,
      winner: 2, // Hard-coded winner for test
      board: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    };

    beforeEach(async () => {
      const context: SetupContext = await setup(global);
      nodeA = context["A"].node;
      nodeB = context["B"].node;

      multisigAddress = await createChannel(nodeA, nodeB);

      const balancesBefore = await getFreeBalanceState(nodeA, multisigAddress);

      expect(balancesBefore[nodeA.freeBalanceAddress]).toBeEq(Zero);
      expect(balancesBefore[nodeB.freeBalanceAddress]).toBeEq(Zero);

      await collateralizeChannel(multisigAddress, nodeA, nodeB, depositAmount);

      const balancesAfter = await getFreeBalanceState(nodeA, multisigAddress);
      expect(balancesAfter[nodeA.freeBalanceAddress]).toBeEq(depositAmount);
      expect(balancesAfter[nodeB.freeBalanceAddress]).toBeEq(depositAmount);
    });

    it("installs an app with the TwoPartyFixedOutcome outcome and expects Node A to win total", async done => {
      [appInstanceId] = await installApp(
        nodeA,
        nodeB,
        multisigAddress,
        TicTacToeApp,
        initialState,
        depositAmount,
        CONVENTION_FOR_ETH_TOKEN_ADDRESS,
        depositAmount,
        CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      );

      nodeB.once(EventNames.UNINSTALL_EVENT, async (msg: UninstallMessage) => {
        assertUninstallMessage(nodeA.publicIdentifier, appInstanceId, msg);

        const balancesSeenByB = await getFreeBalanceState(nodeB, multisigAddress);
        expect(balancesSeenByB[nodeA.freeBalanceAddress]).toBeEq(Two);
        expect(balancesSeenByB[nodeB.freeBalanceAddress]).toBeEq(Zero);
        expect(await getInstalledAppInstances(nodeB, multisigAddress)).toEqual([]);
        done();
      });

      await nodeA.rpcRouter.dispatch(constructUninstallRpc(appInstanceId));

      const balancesSeenByA = await getFreeBalanceState(nodeA, multisigAddress);
      expect(balancesSeenByA[nodeA.freeBalanceAddress]).toBeEq(Two);
      expect(balancesSeenByA[nodeB.freeBalanceAddress]).toBeEq(Zero);

      expect(await getInstalledAppInstances(nodeA, multisigAddress)).toEqual([]);
    });

    it("installs an app with the TwoPartyFixedOutcome outcome and expects Node B to win total", async done => {
      initialState.winner = 1;

      [appInstanceId] = await installApp(
        nodeA,
        nodeB,
        multisigAddress,
        TicTacToeApp,
        initialState,
        depositAmount,
        CONVENTION_FOR_ETH_TOKEN_ADDRESS,
        depositAmount,
        CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      );

      nodeB.once(EventNames.UNINSTALL_EVENT, async (msg: UninstallMessage) => {
        assertUninstallMessage(nodeA.publicIdentifier, appInstanceId, msg);

        const balancesSeenByB = await getFreeBalanceState(nodeB, multisigAddress);
        expect(balancesSeenByB[nodeB.freeBalanceAddress]).toBeEq(Two);
        expect(balancesSeenByB[nodeA.freeBalanceAddress]).toBeEq(Zero);
        expect(await getInstalledAppInstances(nodeB, multisigAddress)).toEqual([]);
        done();
      });

      await nodeA.rpcRouter.dispatch(constructUninstallRpc(appInstanceId));

      const balancesSeenByA = await getFreeBalanceState(nodeA, multisigAddress);
      expect(balancesSeenByA[nodeB.freeBalanceAddress]).toBeEq(Two);
      expect(balancesSeenByA[nodeA.freeBalanceAddress]).toBeEq(Zero);

      expect(await getInstalledAppInstances(nodeA, multisigAddress)).toEqual([]);
    });

    it("installs an app with the TwoPartyFixedOutcome outcome and expects the funds to be split between the nodes", async done => {
      initialState.winner = 3;

      [appInstanceId] = await installApp(
        nodeA,
        nodeB,
        multisigAddress,
        TicTacToeApp,
        initialState,
        depositAmount,
        CONVENTION_FOR_ETH_TOKEN_ADDRESS,
        depositAmount,
        CONVENTION_FOR_ETH_TOKEN_ADDRESS,
      );

      nodeB.once(EventNames.UNINSTALL_EVENT, async (msg: UninstallMessage) => {
        assertUninstallMessage(nodeA.publicIdentifier, appInstanceId, msg);

        const balancesSeenByB = await getFreeBalanceState(nodeB, multisigAddress);
        expect(balancesSeenByB[nodeA.freeBalanceAddress]).toBeEq(depositAmount);
        expect(balancesSeenByB[nodeB.freeBalanceAddress]).toBeEq(depositAmount);
        expect(await getInstalledAppInstances(nodeB, multisigAddress)).toEqual([]);
        done();
      });

      await nodeA.rpcRouter.dispatch(constructUninstallRpc(appInstanceId));

      const balancesSeenByA = await getFreeBalanceState(nodeA, multisigAddress);
      expect(balancesSeenByA[nodeA.freeBalanceAddress]).toBeEq(depositAmount);
      expect(balancesSeenByA[nodeB.freeBalanceAddress]).toBeEq(depositAmount);

      expect(await getInstalledAppInstances(nodeA, multisigAddress)).toEqual([]);
    });
  });
});