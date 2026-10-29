import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage } from './chunkedStorage';

/** Auth session storage: encrypted on the device (Android Keystore), chunked for the size limit. */
export const secureStorage = createChunkedStorage({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
});
