import { utils } from "ethers";

import { isBN, toBN } from "./bigNumbers";
import { abbreviate } from "./strings";

const { bigNumberify } = utils;

export const bigNumberifyJson = (json: any): any =>
  typeof json === "string"
    ? json
    : JSON.parse(JSON.stringify(json), (key: string, value: any): any =>
        value && value["_hex"] ? toBN(value._hex) : value,
      );

export const deBigNumberifyJson = (json: any): any =>
  JSON.parse(JSON.stringify(json), (key: string, val: any) =>
    val && isBN(val) ? val.toHexString() : val,
  );

// Give abrv = true to abbreviate hex strings and addresss to look like "0x6FEC..kuQk"
export const stringify = (value: any, abrv = false, spaces = 2): string =>
  JSON.stringify(
    value,
    (key: string, value: any): any =>
      value && value._hex
        ? bigNumberify(value).toString()
        : abrv && value && typeof value === "string" && value.startsWith("indra")
        ? abbreviate(value, 5)
        : abrv && value && typeof value === "string" && value.startsWith("0x") && value.length > 12
        ? abbreviate(value)
        : value,
    spaces,
  );

const nullify = (key: string, value: any) => (typeof value === "undefined" ? null : value);

export const safeJsonStringify = (value: any): string => {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, nullify);
  } catch (e) {
    console.log(`Failed to safeJsonstringify value ${value}: ${e.message}`);
    return value;
  }
};

export const safeJsonParse = (value: any): any => {
  try {
    return typeof value === "string" ? JSON.parse(value, nullify) : value;
  } catch (e) {
    console.log(`Failed to safeJsonParse value ${value}: ${e.message}`);
    return value;
  }
};
