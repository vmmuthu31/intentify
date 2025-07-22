// React Native Polyfills for Solana Libraries
// This file must be imported before any other code that uses crypto/buffer

import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

// Make Buffer available globally
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Polyfill for TextEncoder/TextDecoder
if (typeof global.TextEncoder === 'undefined') {
  // Simple TextEncoder/TextDecoder polyfill for React Native
  (global as any).TextEncoder = class TextEncoder {
    encode(str: string) {
      const utf8 = [];
      for (let i = 0; i < str.length; i++) {
        let charCode = str.charCodeAt(i);
        if (charCode < 0x80) {
          utf8.push(charCode);
        } else if (charCode < 0x800) {
          utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
        } else if (
          (charCode & 0xfc00) === 0xd800 &&
          i + 1 < str.length &&
          (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00
        ) {
          charCode = 0x10000 + ((charCode & 0x03ff) << 10) + (str.charCodeAt(++i) & 0x03ff);
          utf8.push(
            0xf0 | (charCode >> 18),
            0x80 | ((charCode >> 12) & 0x3f),
            0x80 | ((charCode >> 6) & 0x3f),
            0x80 | (charCode & 0x3f)
          );
        } else {
          utf8.push(
            0xe0 | (charCode >> 12),
            0x80 | ((charCode >> 6) & 0x3f),
            0x80 | (charCode & 0x3f)
          );
        }
      }
      return new Uint8Array(utf8);
    }
  };

  (global as any).TextDecoder = class TextDecoder {
    decode(bytes: Uint8Array) {
      let result = '';
      let i = 0;
      while (i < bytes.length) {
        let c1 = bytes[i++];
        if (c1 < 128) {
          result += String.fromCharCode(c1);
        } else if (c1 > 191 && c1 < 224) {
          let c2 = bytes[i++];
          result += String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
        } else if (c1 > 239 && c1 < 365) {
          let c2 = bytes[i++];
          let c3 = bytes[i++];
          let c4 = bytes[i++];
          let u = (((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
          result += String.fromCharCode(0xd800 + (u >> 10));
          result += String.fromCharCode(0xdc00 + (u & 1023));
        } else {
          let c2 = bytes[i++];
          let c3 = bytes[i++];
          result += String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
        }
      }
      return result;
    }
  };
}

// Polyfill process.env if needed
if (typeof global.process === 'undefined') {
  (global as any).process = {
    env: {},
    version: '',
    platform: 'react-native' as any,
  };
}

// Polyfill crypto.getRandomValues for React Native
if (typeof (global as any).crypto === 'undefined') {
  (global as any).crypto = {
    getRandomValues: (arr: any) => {
      if (arr instanceof Uint8Array) {
        // Use a simple polyfill for getRandomValues
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
      }
      return arr;
    },
    subtle: {} as any,
    randomUUID: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }),
  };
}

export {}; // Make this a module
