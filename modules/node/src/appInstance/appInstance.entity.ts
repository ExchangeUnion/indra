import { AppActions, AppStates, AppName, HexString, OutcomeType } from "@connext/types";
import { utils } from "ethers";
import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from "typeorm";

import { Channel } from "../channel/channel.entity";
import { IsEthAddress, IsKeccak256Hash, IsValidPublicIdentifier } from "../validate";

export enum AppType {
  PROPOSAL = "PROPOSAL",
  INSTANCE = "INSTANCE",
  FREE_BALANCE = "FREE_BALANCE",
  REJECTED = "REJECTED", // removed proposal
  UNINSTALLED = "UNINSTALLED", // removed app
}

@Entity()
export class AppInstance<T extends AppName = any> {
  @PrimaryColumn("text")
  @IsKeccak256Hash()
  identityHash!: string;

  @Column({ type: "enum", enum: AppType })
  type!: AppType;

  @Column("text")
  @IsEthAddress()
  appDefinition!: string;

  @Column("text")
  stateEncoding!: string;

  @Column("text", { nullable: true })
  actionEncoding!: string;

  @Column("integer")
  appSeqNo!: number;

  @Column("jsonb")
  initialState!: AppStates[T];

  @Column("jsonb")
  latestState!: AppStates[T];

  @Column("integer")
  latestVersionNumber!: number;

  @Column("text", {
    transformer: {
      from: (value: string): utils.BigNumber => new utils.BigNumber(value),
      to: (value: utils.BigNumber): string => value.toString(),
    },
  })
  initiatorDeposit!: utils.BigNumber;

  @Column("text")
  @IsEthAddress()
  initiatorDepositAssetId!: string;

  @Column({ type: "enum", enum: OutcomeType })
  outcomeType!: OutcomeType;

  @Column("text")
  @IsValidPublicIdentifier()
  initiatorIdentifier!: string;

  @Column("text")
  @IsValidPublicIdentifier()
  responderIdentifier!: string;

  @Column("text", {
    transformer: {
      from: (value: string): utils.BigNumber => new utils.BigNumber(value),
      to: (value: utils.BigNumber): string => value.toString(),
    },
  })
  responderDeposit!: utils.BigNumber;

  @Column("text")
  @IsEthAddress()
  responderDepositAssetId!: string;

  @Column("text")
  defaultTimeout!: HexString;

  @Column("text", { nullable: true })
  stateTimeout!: HexString;

  // assigned a value on installation not proposal
  @Column("text", { nullable: true })
  @IsValidPublicIdentifier()
  userIdentifier?: string;

  // assigned a value on installation not proposal
  @Column("text", { nullable: true })
  @IsValidPublicIdentifier()
  nodeIdentifier?: string;

  @Column("jsonb", { nullable: true })
  meta?: any;

  @Column("jsonb", { nullable: true })
  latestAction!: AppActions[T];

  // Interpreter-related Fields
  @Column("jsonb", { nullable: true })
  outcomeInterpreterParameters?: any;

  @ManyToOne((type: any) => Channel, (channel: Channel) => channel.appInstances)
  channel!: Channel;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
