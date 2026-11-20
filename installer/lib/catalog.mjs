// The models the installer offers when it has to download one (llama.cpp path). Sizes and sha256
// verified on the Hugging Face API on 2026-11-15 (lfs.oid of each file); see DESIGN.md.
// minVram = file + KV cache for an 8k context + headroom. Rough — measured on nothing yet.

const HF = 'https://huggingface.co';

export const CATALOG = [
  {
    id: 'qwen3.6-35b-a3b', name: 'Qwen 3.6 35B-A3B (MoE)', quant: 'Q4_K_M', minVram: 23,
    repo: 'ggml-org/Qwen3.6-35B-A3B-GGUF', file: 'Qwen3.6-35B-A3B-Q4_K_M.gguf', bytes: 20542732576,
    sha256: 'f4ffe03c9139e6a905a5d346f77d9fabdd179367c3280dfd005d1e75ca5ed8c8', license: 'Apache-2.0',
    blurb: { es: 'El mejor para 24 GB. Rápido: activa 3B por token.', en: 'Best for 24 GB. Fast: 3B active per token.' },
  },
  {
    id: 'qwen3.6-27b', name: 'Qwen 3.6 27B', quant: 'IQ4_XS', minVram: 18,
    repo: 'unsloth/Qwen3.6-27B-GGUF', file: 'Qwen3.6-27B-IQ4_XS.gguf', bytes: 15440005344,
    sha256: '8a3365759dc1b33b52c4e7d91d5a67d5ee1418e8408aa54196f04a98da53e5dc', license: 'Apache-2.0',
    blurb: { es: 'Denso, más lento, muy bueno. Para 20 GB o más.', en: 'Dense, slower, very good. 20 GB and up.' },
  },
  {
    id: 'qwen3.6-35b-a3b-iq3', name: 'Qwen 3.6 35B-A3B (MoE)', quant: 'IQ3_XXS', minVram: 15,
    repo: 'unsloth/Qwen3.6-35B-A3B-GGUF', file: 'Qwen3.6-35B-A3B-UD-IQ3_XXS.gguf', bytes: 13211155424,
    sha256: '9c964e657212fea1f24905dd7b0a89b82fd807d19fab0b41da14251b07b88fbe', license: 'Apache-2.0',
    blurb: { es: 'El grande, más comprimido. Para placas de 16 GB.', en: 'The big one, squeezed. For 16 GB cards.' },
  },
  {
    id: 'qwen3.5-9b', name: 'Qwen 3.5 9B', quant: 'Q4_K_M', minVram: 7.5,
    repo: 'unsloth/Qwen3.5-9B-GGUF', file: 'Qwen3.5-9B-Q4_K_M.gguf', bytes: 5680522464,
    sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8', license: 'Apache-2.0',
    blurb: { es: 'El chico que rinde. Para 8 GB.', en: 'The small one that delivers. For 8 GB.' },
  },
  {
    id: 'qwen3.5-4b', name: 'Qwen 3.5 4B', quant: 'Q4_K_M', minVram: 4,
    repo: 'unsloth/Qwen3.5-4B-GGUF', file: 'Qwen3.5-4B-Q4_K_M.gguf', bytes: 2740937888,
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4', license: 'Apache-2.0',
    blurb: { es: 'Entra en casi todo: placas de 6 GB, notebooks.', en: 'Fits almost anything: 6 GB cards, laptops.' },
  },
  // The alternative family. MIT on the card (the LICENSE file it links to 404s — see DESIGN.md)
  {
    id: 'ornith-1.5-35b', name: 'Ornith 1.5 35B (MoE)', quant: 'Q4_K_M', minVram: 24, alt: true,
    repo: 'ornith-ai/Ornith-1.5-35B-A3B-GGUF', file: 'Ornith-1.5-35B-Q4_K_M.gguf', bytes: 21713463040,
    sha256: '42739874cc2ccfdb8523b23fbe52e29b2a7555c8176737ca9ca0b5d59859d41f', license: 'MIT',
    blurb: { es: 'Alternativa: piensa antes de responder.', en: 'Alternative: thinks before answering.' },
  },
  {
    id: 'ornith-1.5-9b', name: 'Ornith 1.5 9B', quant: 'Q4_K_M', minVram: 7.5, alt: true,
    repo: 'ornith-ai/Ornith-1.5-9B-GGUF', file: 'Ornith-1.5-9B-Q4_K_M.gguf', bytes: 5780090816,
    sha256: '70c112196e0b7023803c9762752e46d29e612a92c83f995bc3ba1ceb07e8fab6', license: 'MIT',
    blurb: { es: 'Alternativa chica que razona.', en: 'Small alternative that reasons.' },
  },
];

export const urlOf = (m) => `${HF}/${m.repo}/resolve/main/${m.file}`;

// Every model, marked: fits or not, and the one we recommend (the biggest non-alternative that fits).
// No GPU (vramGB 0): llama.cpp runs on the CPU from RAM — slow, so cap it at the small ones.
export function budget(vramGB, ramGB = 0) {
  return vramGB > 0 ? vramGB : Math.min(6, Math.floor(ramGB / 2));
}

export function pickList(vramGB, ramGB = 0) {
  const b = budget(vramGB, ramGB);
  const rows = CATALOG.map((m) => ({ ...m, fits: b >= m.minVram }));
  const best = rows.find((m) => m.fits && !m.alt);
  return rows.map((m) => ({ ...m, recommended: !!best && m.id === best.id }));
}

export function recommended(vramGB, ramGB = 0) {
  return pickList(vramGB, ramGB).find((m) => m.recommended) || null;
}
