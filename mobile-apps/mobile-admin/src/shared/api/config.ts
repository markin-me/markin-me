import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

declare const process:
  | {
      env?: {
        EXPO_PUBLIC_API_BASE_URL?: string;
        EXPO_PUBLIC_STORE_ID?: string;
        EXPO_PUBLIC_TENANT_ID?: string;
      };
    }
  | undefined;

function getExpoHost() {
  const hostUri = String(Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost || '');
  const hostFromConstants = hostUri.split(':')[0];
  if (hostFromConstants) return hostFromConstants;

  const scriptUrl = String(NativeModules.SourceCode?.scriptURL || '');
  const match = scriptUrl.match(/\/\/([^/:]+)/);
  return match?.[1] || '';
}

function getDefaultBaseUrl() {
  const expoHost = getExpoHost();
  return expoHost ? `http://${expoHost}:3000` : 'http://127.0.0.1:3000';
}

export const apiConfig = {
  baseUrl: process?.env?.EXPO_PUBLIC_API_BASE_URL || getDefaultBaseUrl(),
  storeId: process?.env?.EXPO_PUBLIC_STORE_ID || '1',
  tenantId: process?.env?.EXPO_PUBLIC_TENANT_ID || '1',
};
