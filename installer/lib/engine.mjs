// The engines LLMule installs when the machine has none, pinned to one release each and checked by sha256
// before anything is unpacked (DESIGN.md §5, §12):
//   llama.cpp (llama-server) to share a whole model · mesh-llm to run a slice of a pool's model
// Digests from the GitHub API of each tag (asset `digest`), 2026-11-15. To move a pin: change the tag, refill
// the table from `gh api repos/<repo>/releases/tags/<tag> --jq '.assets[]|"\(.name) \(.size) \(.digest)"'`.

export const LLAMA_TAG = 'b12359';
export const LLAMA_PORT = 9931; // llama-server's default since Oct 2026; we pass it explicitly anyway

// name → [bytes, sha256]
const LLAMA = {
  'llama-b12359-bin-macos-arm64.tar.gz': [16907811, '82b00abc740160e1b9980e6cc79c117345fa34af058c80e6c0a69aa8ddccde75'],
  'llama-b12359-bin-macos-x64.tar.gz': [12661621, '25320d529077ef5a3d16e7b5da26438f221d88c8c0930a32b0c79457f5eede56'],
  'llama-b12359-bin-ubuntu-x64.tar.gz': [23311084, '0bc1f091e8916102b6d8f2cf944233a620e90a0f856c72d0ce41150c65c2e72e'],
  'llama-b12359-bin-ubuntu-arm64.tar.gz': [18949862, 'dc7aa17a67884619b7223870aca9fd6addbc01717713b04a714add1c31137359'],
  'llama-b12359-bin-ubuntu-vulkan-x64.tar.gz': [36153377, '19b60f00395a3f4954e46a5037695bc1d843404fc9d3124f82a612ecd8fbe9f0'],
  'llama-b12359-bin-ubuntu-vulkan-arm64.tar.gz': [29435221, '3f8ae812a58ac92e5a596ca9fbc988f52854d147c5a7fe1264dddc90c1d085b4'],
  'llama-b12359-bin-ubuntu-cuda-13.5-x64.tar.gz': [178419847, '9440f417615bed0e191acef03bff0249117d2be74335358265a6d28475a9baf0'],
  'cudart-llama-b12359-bin-ubuntu-cuda-13.5-x64.tar.gz': [444078822, '976a9146bb8a487a6ea701224d7fb14b05e494ab3c8f5c1799ffc4e5805d640c'],
  'llama-b12359-bin-ubuntu-cuda-12.8-x64.tar.gz': [199223370, '50c937bec5bbd9f74c99138034f7403283ee21f1943f2429d7b1e4c079eafc11'],
  'cudart-llama-b12359-bin-ubuntu-cuda-12.8-x64.tar.gz': [594371571, '75a12d227f44a391608992329241765343bd143ee9445b90dc62e154ee726e5d'],
  'llama-b12359-bin-ubuntu-cuda-13.5-arm64.tar.gz': [173529798, 'e12fd3ca9a599349cac5ec767825e17f8cab9dc2dab8d8e5b85d50ce21ef6d7d'],
  'cudart-llama-b12359-bin-ubuntu-cuda-13.5-arm64.tar.gz': [559874231, '998f62318999710d398dad40821d1d037731f360791e41628d9dfcde207909d1'],
  'llama-b12359-bin-win-cpu-x64.zip': [25097509, '837c1655e87df3b66989f4be33a792a1399c785bf259038dc75c900096683e69'],
  'llama-b12359-bin-win-vulkan-x64.zip': [38090643, 'e8d18c6e4210cca87e7307c2ea78363ac8d158e4e1397358ec96ab70b53a0d5e'],
  'llama-b12359-bin-win-cuda-13.5-x64.zip': [179546112, '1de9ca1ff408d6e348ea0007c6880ad2393311a02e7799bcde26dc16daef03dd'],
  'cudart-llama-bin-win-cuda-13.5-x64.zip': [426314199, 'c2bf4cc202bfbaaa7a0b75f5082457c3811326947bb216059b72839d844e9cba'],
  'llama-b12359-bin-win-cuda-12.4-x64.zip': [318976332, 'e9c0abf442e8339c06728366c1ad2c711332f9939c0c00603fb75d85fd44c914'],
  'cudart-llama-bin-win-cuda-12.4-x64.zip': [391443627, '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'],
};

export const MESH_TAG = 'v0.79.0';
const MESH = {
  'mesh-llm-v0.79.0-aarch64-apple-darwin.tar.gz': [67020091, '9d0c8870b9b1fbd98eb9a6141d8f22e01da25907777c7177f64f07e51a4533bf'],
  'mesh-llm-v0.79.0-x86_64-unknown-linux-gnu.tar.gz': [76333258, 'ff0da25ce17d582f270c97a5816dab829cee2d1ed7b3cfa57ecc9ed3121a3e3e'],
  'mesh-llm-v0.79.0-x86_64-unknown-linux-gnu-vulkan.tar.gz': [107750834, '2cdeb0e9577d3a694385e254f18a3e9abba6850730dcedc010ad3fabb480a0ad'],
  'mesh-llm-v0.79.0-x86_64-unknown-linux-gnu-rocm.tar.gz': [434628023, '699b8e0d0170c979854d419d78532ff2b03a87a5ed6de3a7463fdb55228dfb58'],
  'mesh-llm-v0.79.0-x86_64-unknown-linux-gnu-cuda-12.tar.gz': [1446118214, '19a6b5224de9b30f20fb7f6530b61ad191a69a44093cfe202aa7d285f73a18dd'],
  'mesh-llm-v0.79.0-x86_64-unknown-linux-gnu-cuda-13.tar.gz': [1738151937, '81713be5a046f7593648d947fcf5f011fb1fadfef4b2021a91a6f21b22efefe4'],
  'mesh-llm-v0.79.0-aarch64-unknown-linux-gnu.tar.gz': [72348332, '0da1bee80c479c99b0fc5f7f12bcb371931ee9f563dd30ec6c6ce44d6f676672'],
  'mesh-llm-v0.79.0-aarch64-unknown-linux-gnu-cuda-13.tar.gz': [1012298888, '5e982cc4b2ed4714f58d1a78a5425044ab6d96877777dd1a2cbeb7da72e14f07'],
  'mesh-llm-v0.79.0-x86_64-pc-windows-msvc.zip': [50789282, '596adcc400eea6eb168030fb80849049b7c41da94c63a709a6e5086faab7b795'],
  'mesh-llm-v0.79.0-x86_64-pc-windows-msvc-vulkan.zip': [66064709, '31fb187e5479b007a50d5bcbcbc725c57b2bb5f95f2c58ec98f246c391a53201'],
  'mesh-llm-v0.79.0-x86_64-pc-windows-msvc-cuda-12.zip': [855247544, '8e9f860d13d8e15cfea7cba9d4c6ce5ed33bf733fb56bbb5fab2e04ba1b37106'],
  'mesh-llm-v0.79.0-x86_64-pc-windows-msvc-cuda-13.zip': [772697751, 'effb447cb7633d569de7586921d3bce3c3238415244453662abf0c6831ea7ab1'],
};

const nvidiaOf = (m) => (m.gpus || []).filter((g) => g.vendor === 'nvidia');
// CUDA 13 runtimes need a driver from the 580 series on (NVIDIA's table for 13.0) [A for 13.5: assumed the same]
// Unknown driver → the newest
const cuda13 = (m) => {
  const major = Number(String(nvidiaOf(m)[0]?.driver || '').split('.')[0]);
  return !(major > 0) || major >= 580;
};

const withSums = (table, base, files, extra) => ({
  ...extra,
  files: files.map((name) => ({ name, url: `${base}/${name}`, bytes: table[name]?.[0] ?? 0, sha256: table[name]?.[1] ?? '' })),
});

// llama-server for this machine → { gpu, files: [{ name, url, bytes, sha256 }] }
export function engineAsset(m) {
  const nv = nvidiaOf(m).length > 0;
  const amd = (m.gpus || []).some((g) => g.vendor === 'amd');
  const t = LLAMA_TAG;
  const base = `https://github.com/ggml-org/llama.cpp/releases/download/${t}`;
  const pick = (gpu, ...files) => withSums(LLAMA, base, files, { gpu });
  if (m.platform === 'darwin') return pick(m.arch === 'arm64' ? 'metal' : 'cpu', `llama-${t}-bin-macos-${m.arch === 'arm64' ? 'arm64' : 'x64'}.tar.gz`);
  if (m.platform === 'win32') {
    if (nv) return cuda13(m)
      ? pick('cuda', `llama-${t}-bin-win-cuda-13.5-x64.zip`, 'cudart-llama-bin-win-cuda-13.5-x64.zip')
      : pick('cuda', `llama-${t}-bin-win-cuda-12.4-x64.zip`, 'cudart-llama-bin-win-cuda-12.4-x64.zip');
    if (amd) return pick('vulkan', `llama-${t}-bin-win-vulkan-x64.zip`);
    return pick('cpu', `llama-${t}-bin-win-cpu-x64.zip`);
  }
  const arch = m.arch === 'arm64' ? 'arm64' : 'x64';
  if (nv && arch === 'x64') return cuda13(m)
    ? pick('cuda', `llama-${t}-bin-ubuntu-cuda-13.5-x64.tar.gz`, `cudart-llama-${t}-bin-ubuntu-cuda-13.5-x64.tar.gz`)
    : pick('cuda', `llama-${t}-bin-ubuntu-cuda-12.8-x64.tar.gz`, `cudart-llama-${t}-bin-ubuntu-cuda-12.8-x64.tar.gz`);
  if (nv) return pick('cuda', `llama-${t}-bin-ubuntu-cuda-13.5-arm64.tar.gz`, `cudart-llama-${t}-bin-ubuntu-cuda-13.5-arm64.tar.gz`);
  if (amd) return pick('vulkan', `llama-${t}-bin-ubuntu-vulkan-${arch}.tar.gz`);
  return pick('cpu', `llama-${t}-bin-ubuntu-${arch}.tar.gz`);
}

// mesh-llm for this machine → same shape, or null where there's no build (Mac Intel)
export function meshAsset(m) {
  const nv = nvidiaOf(m).length > 0;
  const amd = (m.gpus || []).some((g) => g.vendor === 'amd');
  const v = MESH_TAG;
  const base = `https://github.com/Mesh-LLM/mesh-llm/releases/download/${v}`;
  const pick = (gpu, file) => withSums(MESH, base, [file], { gpu });
  if (m.platform === 'darwin') return m.arch === 'arm64' ? pick('metal', `mesh-llm-${v}-aarch64-apple-darwin.tar.gz`) : null;
  if (m.platform === 'win32') {
    if (nv) return pick('cuda', `mesh-llm-${v}-x86_64-pc-windows-msvc-cuda-${cuda13(m) ? 13 : 12}.zip`);
    if (amd) return pick('vulkan', `mesh-llm-${v}-x86_64-pc-windows-msvc-vulkan.zip`);
    return pick('cpu', `mesh-llm-${v}-x86_64-pc-windows-msvc.zip`);
  }
  if (m.arch === 'arm64') return pick(nv ? 'cuda' : 'cpu', `mesh-llm-${v}-aarch64-unknown-linux-gnu${nv ? '-cuda-13' : ''}.tar.gz`);
  if (nv) return pick('cuda', `mesh-llm-${v}-x86_64-unknown-linux-gnu-cuda-${cuda13(m) ? 13 : 12}.tar.gz`);
  if (amd) return pick('rocm', `mesh-llm-${v}-x86_64-unknown-linux-gnu-rocm.tar.gz`);
  return pick('cpu', `mesh-llm-${v}-x86_64-unknown-linux-gnu.tar.gz`);
}

// How LLMule starts llama-server: localhost only, explicit port, one model, all layers on the GPU
export function serverArgs(modelPath, { ctx = 8192, gpu = true, port = LLAMA_PORT } = {}) {
  return ['-m', modelPath, '--host', '127.0.0.1', '--port', String(port), '-c', String(ctx), '-np', '1',
    ...(gpu ? ['-ngl', '999'] : []), '--alias', 'llmule-local'];
}
