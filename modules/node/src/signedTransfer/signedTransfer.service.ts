import {
  SignedTransferStatus,
  SimpleSignedTransferAppName,
  SimpleSignedTransferAppState,
} from "@connext/types";
import { bigNumberifyJson } from "@connext/utils";
import { Injectable } from "@nestjs/common";
import { CFCoreService } from "../cfCore/cfCore.service";
import { LoggerService } from "../logger/logger.service";
import { AppType, AppInstance } from "../appInstance/appInstance.entity";
import { SignedTransferRepository } from "./signedTransfer.repository";

const appStatusesToSignedTransferStatus = (
  senderApp: AppInstance<typeof SimpleSignedTransferAppName>,
  receiverApp?: AppInstance<typeof SimpleSignedTransferAppName>,
): SignedTransferStatus | undefined => {
  if (!senderApp) {
    return undefined;
  }
  // pending iff no receiver app + not expired
  if (!receiverApp) {
    return SignedTransferStatus.PENDING;
  } else if (senderApp.latestState.finalized || receiverApp.latestState.finalized) {
    // iff sender uninstalled, payment is unlocked
    return SignedTransferStatus.COMPLETED;
  } else if (senderApp.type === AppType.REJECTED || receiverApp.type === AppType.REJECTED) {
    return SignedTransferStatus.FAILED;
  } else {
    throw new Error(`Cound not determine hash lock transfer status`);
  }
};

export const normalizeSignedTransferAppState = (
  app: AppInstance,
): AppInstance<typeof SimpleSignedTransferAppName> | undefined => {
  return (
    app && {
      ...app,
      latestState: bigNumberifyJson(app.latestState) as SimpleSignedTransferAppState,
    }
  );
};

@Injectable()
export class SignedTransferService {
  constructor(
    private readonly cfCoreService: CFCoreService,
    private readonly log: LoggerService,
    private readonly signedTransferRepository: SignedTransferRepository,
  ) {
    this.log.setContext("SignedTransferService");
  }

  async findSenderAndReceiverAppsWithStatus(
    paymentId: string,
  ): Promise<{ senderApp: AppInstance; receiverApp: AppInstance; status: any } | undefined> {
    this.log.info(`findSenderAndReceiverAppsWithStatus ${paymentId} started`);
    const senderApp = await this.findSenderAppByPaymentId(paymentId);
    const receiverApp = await this.findReceiverAppByPaymentId(paymentId);
    const status = appStatusesToSignedTransferStatus(senderApp, receiverApp);
    const result = { senderApp, receiverApp, status };
    this.log.info(
      `findSenderAndReceiverAppsWithStatus ${paymentId} complete: ${JSON.stringify(result)}`,
    );
    return result;
  }

  async findSenderAppByPaymentId(paymentId: string): Promise<AppInstance> {
    this.log.info(`findSenderAppByPaymentId ${paymentId} started`);
    // node receives from sender
    const app = await this.signedTransferRepository.findSignedTransferAppByPaymentIdAndReceiver(
      paymentId,
      this.cfCoreService.cfCore.signerAddress,
    );
    const result = normalizeSignedTransferAppState(app);
    this.log.info(`findSenderAppByPaymentId ${paymentId} completed: ${JSON.stringify(result)}`);
    return result;
  }

  async findReceiverAppByPaymentId(paymentId: string): Promise<AppInstance> {
    this.log.info(`findReceiverAppByPaymentId ${paymentId} started`);
    // node sends to receiver
    const app = await this.signedTransferRepository.findSignedTransferAppByPaymentIdAndSender(
      paymentId,
      this.cfCoreService.cfCore.signerAddress,
    );
    const result = normalizeSignedTransferAppState(app);
    this.log.info(`findReceiverAppByPaymentId ${paymentId} completed: ${JSON.stringify(result)}`);
    return result;
  }
}
