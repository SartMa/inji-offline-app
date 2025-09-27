const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Updated symbolicator config for newer Metro versions
config.symbolicator = {
  customizeFrame(frame) {
    if (frame.file && frame.file.endsWith('InternalBytecode.js')) {
      return {
        ...frame,
        file: 'native/InternalBytecode',
        collapse: true,
      };
    }
    return frame;
  },
};

module.exports = config;
