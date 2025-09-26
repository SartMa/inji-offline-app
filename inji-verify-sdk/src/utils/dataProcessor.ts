import { decode, decodeBinary } from "@mosip/pixelpass";
import {
  HEADER_DELIMITER,
  SUPPORTED_QR_HEADERS,
  ZIP_HEADER,
  OvpQrHeader,
} from "./constants";

const toUint8Array = (input: any): Uint8Array => {
  if (!input) {
    return new Uint8Array();
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer);
  }
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }
  // Fallback – stringify unknown input
  return new TextEncoder().encode(String(input));
};

export const decodeQrData = async (qrData: any) => {
  try {
    if (!qrData) throw new Error("No QR data provided");
    const rawBytes = toUint8Array(qrData);
    let encodedBytes = rawBytes;
    let header = "";

    if (HEADER_DELIMITER) {
      const rawString = new TextDecoder("utf-8").decode(rawBytes);
      const splitQrData = rawString.split(HEADER_DELIMITER);
      header = splitQrData[0];

      if (!SUPPORTED_QR_HEADERS.includes(header)) {
        throw new Error("Unsupported QR header");
      }
      if (splitQrData.length !== 2) {
        throw new Error("Invalid QR format");
      }
      encodedBytes = new TextEncoder().encode(splitQrData[1]);
    }

    const decodedData = new TextDecoder("utf-8").decode(encodedBytes);
    if (decodedData.startsWith(ZIP_HEADER)) {
      return await decodeBinary(encodedBytes);
    }
    return decode(decodedData);
  } catch (error) {
    throw error instanceof Error
      ? new Error(error.message)
      : new Error(String(error));
  }
};

export const extractRedirectUrlFromQrData = (qrData: string) => {
  // qr data format = OVP://payload:text-content
  const regex = new RegExp(`^${OvpQrHeader}(.*)$`);
  const match = qrData.match(regex);
  return match ? match[1] : null;
};

export const initiateOvpFlow = (redirectUri: string) => {
  const encodedOriginUrl = window.encodeURIComponent(window.location.origin);
  window.location.href = `${redirectUri}&client_id=${encodedOriginUrl}&redirect_uri=${encodedOriginUrl}/redirect`;
};

export const handleOvpFlow = async (qrData: string) => {
  const redirectUrl = extractRedirectUrlFromQrData(qrData);
  if (redirectUrl) {
    initiateOvpFlow(redirectUrl);
  } else {
    throw new Error("Failed to extract the redirect url from the qr data");
  }
};