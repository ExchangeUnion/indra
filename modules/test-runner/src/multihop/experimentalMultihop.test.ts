import { IConnextClient, ConditionalTransferTypes, PublicParams } from "@connext/types";
import { stringify, getRandomBytes32, ConsoleLogger } from "@connext/utils";
import axios from "axios";
import { soliditySha256 } from "ethers/utils";
import { providers } from "ethers";
import { before } from "mocha";

import { createClient, fundChannel, ETH_AMOUNT_MD, ETH_AMOUNT_SM, env, expect } from "../util";

describe.only("Experimental multihop tests", () => {
  let clientA: IConnextClient;
  let clientB: IConnextClient;
  let clientC: IConnextClient;
  const nodeBUrl = "http://172.17.0.1:8081";
  const provider = new providers.JsonRpcProvider(env.ethProviderUrl);
  const log = new ConsoleLogger("test", 4);

  before(async () => {
    clientA = await createClient();
    clientB = await createClient();
    clientC = await createClient({
      nodeUrl: nodeBUrl,
    });
    console.log(`ClientA: ${clientA.publicIdentifier}`);
    console.log(`NodeA: ${clientA.nodeIdentifier}`);
    console.log(`NodeB: ${clientC.nodeIdentifier}`);
    console.log(`ClientC: ${clientC.publicIdentifier}`);
    await fundChannel(clientA, ETH_AMOUNT_MD);
  });

  it("can create a  nodeA to nodeB channel", async () => {
    let nodeANodeBMultisig: string;
    try {
      nodeANodeBMultisig = await axios.post(`${nodeBUrl}/admin/nodetonode`, {
        userIdentifier: clientA.nodeIdentifier,
      });
    } catch (e) {
      nodeANodeBMultisig = "";
    }
    console.log(`NodeToNode Multisig: ${nodeANodeBMultisig}`);
  });

  it.skip("clientA can transfer funds to clientB over nodeA", async () => {
    const preImage = getRandomBytes32();
    const timelock = ((await provider.getBlockNumber()) + 5000).toString();
    const lockHash = soliditySha256(["bytes32"], [preImage]);
    await Promise.all([
      clientA.conditionalTransfer({
        amount: ETH_AMOUNT_SM.toString(),
        conditionType: ConditionalTransferTypes.HashLockTransfer,
        lockHash,
        timelock,
        meta: { foo: "bar", sender: clientA.publicIdentifier },
        recipient: clientB.publicIdentifier,
      } as PublicParams.HashLockTransfer),
      new Promise((resolve) => {
        clientB.on("CONDITIONAL_TRANSFER_CREATED_EVENT", resolve);
      }),
    ]);
  });

  it.only("clientA can transfer funds to clientC over both nodeA and nodeB", async () => {
    const res = await axios.post(`${env.nodeUrl}/admin/nodetonode`, {
      userIdentifier: clientC.nodeIdentifier,
    });

    console.log("res.data: ", res.data);
    expect(res.data).to.be.ok;
    const preImage = getRandomBytes32();
    const timelock = ((await provider.getBlockNumber()) + 5000).toString();
    const lockHash = soliditySha256(["bytes32"], [preImage]);

    const [transferInstallRet] = await Promise.all([
      clientA.conditionalTransfer({
        amount: ETH_AMOUNT_SM.toString(),
        conditionType: ConditionalTransferTypes.HashLockTransfer,
        lockHash,
        timelock,
        meta: {
          path: [clientA.nodeIdentifier, clientC.nodeIdentifier, clientC.publicIdentifier],
        },
        recipient: clientC.publicIdentifier,
      } as PublicParams.HashLockTransfer),
      new Promise((resolve) => {
        clientC.on("CONDITIONAL_TRANSFER_CREATED_EVENT", resolve);
      }),
    ]);

    console.log(stringify(transferInstallRet));
  });
});
