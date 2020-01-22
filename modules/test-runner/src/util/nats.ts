import { Client, connect } from "ts-nats";

import { env } from "./env";

let natsConnection: Client;

export const createOrRetrieveNatsConnection = async (): Promise<Client> => {
  if (natsConnection) {
    return natsConnection;
  }

  try {
    natsConnection = await connect({ servers: [env.nodeUrl] });
  } catch (e) {
    // Try one more time in case the first attempt timed out
    natsConnection = await connect({ servers: [env.nodeUrl] });
  }

  return natsConnection;
};
