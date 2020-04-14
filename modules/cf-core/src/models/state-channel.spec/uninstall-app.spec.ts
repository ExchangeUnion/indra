import { Zero, AddressZero } from "ethers/constants";
import { getAddress } from "ethers/utils";
import { createRandomAddress } from "@connext/types";
import { getSignerAddressFromPublicIdentifier } from "@connext/utils";


import { createAppInstanceForTest } from "../../testing/utils";
import { generateRandomNetworkContext } from "../../testing/mocks";

import { AppInstance } from "../app-instance";
import { StateChannel } from "../state-channel";
import { FreeBalanceClass } from "../free-balance";
import { getRandomPublicIdentifiers } from "../../testing/random-signing-keys";

describe("StateChannel::uninstallApp", () => {
  const networkContext = generateRandomNetworkContext();

  let sc1: StateChannel;
  let sc2: StateChannel;
  let testApp: AppInstance;

  beforeAll(() => {
    const multisigAddress = getAddress(createRandomAddress());
    const ids = getRandomPublicIdentifiers(2);

    sc1 = StateChannel.setupChannel(
      networkContext.IdentityApp,
      {
        proxyFactory: networkContext.ProxyFactory,
        multisigMastercopy: networkContext.MinimumViableMultisig,
      },
      multisigAddress,
      ids[0],
      ids[1],
    );

    testApp = createAppInstanceForTest(sc1);

    sc1 = sc1.installApp(testApp, {
      [AddressZero]: {
        [getSignerAddressFromPublicIdentifier(ids[0])]: Zero,
        [getSignerAddressFromPublicIdentifier(ids[1])]: Zero,
      },
    });

    sc2 = sc1.uninstallApp(testApp, {
      [AddressZero]: {
        [getSignerAddressFromPublicIdentifier(ids[0])]: Zero,
        [getSignerAddressFromPublicIdentifier(ids[1])]: Zero,
      },
    });
  });

  it("should not alter any of the base properties", () => {
    expect(sc2.multisigAddress).toBe(sc1.multisigAddress);
    expect(sc2.userIdentifiers).toMatchObject(sc1.userIdentifiers);
  });

  it("should not have changed the sequence number", () => {
    expect(sc2.numProposedApps).toBe(sc1.numProposedApps);
  });

  it("should have decreased the active apps number", () => {
    expect(sc2.numActiveApps).toBe(sc1.numActiveApps - 1);
  });

  it("should have deleted the app being uninstalled", () => {
    expect(sc2.isAppInstanceInstalled(testApp.identityHash)).toBe(false);
  });

  describe("the updated ETH Free Balance", () => {
    let fb: FreeBalanceClass;

    beforeAll(() => {
      fb = sc2.getFreeBalanceClass();
    });

    it("should have updated balances for Alice and Bob", () => {
      for (const amount of Object.values(
        fb.withTokenAddress(AddressZero) || {},
      )) {
        expect(amount).toEqual(Zero);
      }
    });
  });
});
