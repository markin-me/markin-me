const { createRunOncePlugin, withMainApplication } = require('@expo/config-plugins');
const generateCode = require('@expo/config-plugins/build/utils/generateCode');

function withOnnxruntimePackage(config) {
  return withMainApplication(config, (nextConfig) => {
    const { language } = nextConfig.modResults;
    if (language === 'kt') {
      let contents = generateCode.mergeContents({
        src: nextConfig.modResults.contents,
        newSrc: 'import ai.onnxruntime.reactnative.OnnxruntimePackage',
        tag: 'onnxruntime-react-native-import',
        anchor: /^import /m,
        offset: 0,
        comment: '//',
      }).contents;
      contents = generateCode.mergeContents({
        src: contents,
        newSrc: '      add(OnnxruntimePackage())',
        tag: 'onnxruntime-react-native-package',
        anchor: /override fun getPackages\(\)/,
        offset: 2,
        comment: '//',
      }).contents;
      nextConfig.modResults.contents = contents;
    }
    return nextConfig;
  });
}

module.exports = createRunOncePlugin(withOnnxruntimePackage, 'with-onnxruntime-package', '1.0.0');
