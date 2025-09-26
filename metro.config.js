const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.symbolicator = {
  customizeStackFrame(frame) {
    if (frame.file && frame.file.endsWith('InternalBytecode.js')) {
      return {
        ...frame,
        file: 'native/InternalBytecode',
        collapse: true,
      };
    }
    return frame;
  },
  customizeStack(stack) {
    if (!stack?.stack?.length) {
      return stack;
    }
    const filtered = stack.stack.filter(
      (frame) => !(frame.file && frame.file.endsWith('InternalBytecode.js'))
    );
    return {
      ...stack,
      stack: filtered,
    };
  },
};

module.exports = config;
