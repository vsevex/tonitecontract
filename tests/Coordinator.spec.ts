import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { CoordinatorUnit } from "../wrappers/Coordinator";
import { randomTestKey } from "@ton/ton/dist/utils/randomTestKey";
import { Address, toNano } from "@ton/core";
import { randomAddress } from "@ton/test-utils";

describe("Coordinator test cases", () => {
  let blockchain: Blockchain;
  let coordinator: SandboxContract<CoordinatorUnit>;
  const secretEcvrf = 12345n;
  const keyReplay = randomTestKey("coordinator-test");
  let deployer: SandboxContract<TreasuryContract>;
  let owner: Address;

  beforeEach(async () => {
    blockchain = await Blockchain.create({ config: "slim" });
    deployer = await blockchain.treasury("deployer");

    let ecvrfZeroRist255Key = blockchain.openContract(
      CoordinatorUnit.createFromOwnerAndKey(
        deployer.address,
        0n,
        keyReplay.publicKey
      )
    );
    await ecvrfZeroRist255Key.sendDeploy(deployer.getSender());
    coordinator = blockchain.openContract(
      CoordinatorUnit.createFromOwnerAndKey(
        deployer.address,
        secretEcvrf,
        keyReplay.publicKey
      )
    );
    await coordinator.sendDeploy(deployer.getSender());
    owner = randomAddress();
  });

  it("create from owner and key", async () => {
    const sameContract = CoordinatorUnit.createFromOwnerAndKey(
      deployer.address,
      secretEcvrf,
      keyReplay.publicKey
    );
    expect(sameContract.address.toString()).toEqual(
      coordinator.address.toString()
    );

    const differentOwner = CoordinatorUnit.createFromOwnerAndKey(
      owner,
      secretEcvrf,
      keyReplay.publicKey
    );
    expect(differentOwner.address.toString()).not.toEqual(
      coordinator.address.toString()
    );
  });

  it("should send subscribe random", async () => {
    const consumer = randomAddress();

    const result = await coordinator.sendSubscribeRandom(
      deployer.getSender(),
      toNano("2.0"),
      consumer
    );
    const event = result.events[0];
    expect(event.type).toEqual("message_sent");
    expect(result.events[0].type).toEqual("message_sent");
    const outMessage = result.transactions[0].outMessages.get(0);
    expect(result.transactions[0].outMessagesCount).toEqual(1);
    const body = outMessage?.body.asSlice();
    expect(body?.loadUint(32)).toEqual(0xab4c4859);
    expect(body?.loadAddress().toString()).toEqual(consumer.toString());
  });
});
