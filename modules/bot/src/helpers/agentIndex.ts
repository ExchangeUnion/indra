import axios, { AxiosResponse } from "axios";

const BOT_REGISTRY_URL = process.env.BOT_REGISTRY_URL;

export const addAgentIdentifierToIndex = async (identifier: string): Promise<void> => {
  return axios.post(`${BOT_REGISTRY_URL}/agent`, {
    identifier,
  });
};

const getRandomInt = (max: number) => {
  return Math.floor(Math.random() * Math.floor(max));
};

export const getRandomAgentIdentifierFromIndex = async (exclude?: string): Promise<string> => {
  let { data: addresses }: AxiosResponse<string[]> = await axios.get(`${BOT_REGISTRY_URL}/agent`);
  addresses = addresses.filter((address) => address !== exclude);
  const index = getRandomInt(addresses.length);
  return addresses[index];
};
