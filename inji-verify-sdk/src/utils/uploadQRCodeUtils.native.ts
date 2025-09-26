import type { scanResult } from '../components/qrcode-verification/QRCodeVerification.types';
import { OvpQrHeader } from './constants';

export const extractRedirectUrlFromQrData = (qrData: string) => {
  const regex = new RegExp(`^${OvpQrHeader}(.*)$`);
  const match = qrData.match(regex);
  return match ? match[1] : null;
};

export const readQRcodeFromImageFile = async (): Promise<string | undefined> => {
  throw new Error('readQRcodeFromImageFile is not supported on React Native.');
};

export const scanFilesForQr = async (): Promise<scanResult> => {
  return {
    data: null,
    error: new Error('File upload QR scanning is not supported on React Native.'),
  };
};

export const doFileChecks = (): boolean => {
  return false;
};
