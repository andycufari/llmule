// What this build is. tools/build.sh stamps BUILT into the binaries (and puts 'dev' back after).
export const VERSION = '0.2.3-test';
export const BUILT = 'dev';
export const versionLine = () => `LLMule ${VERSION} (build ${BUILT})`;
