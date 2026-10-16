// #popclip
// name: emaki
// identifier: ai.emaki.popclip.video
// description: Turn the selected text into a Seedance 2.5 AI video with emaki and open it.
// icon: symbol:film
// popclip version: 4688
// keywords: seedance ai video generator text to video emaki
// apps:
// - { name: emaki, link: 'https://emaki.ai/seedance-2-5' }
// entitlements: [network]

import axios from "axios";

export const options = [
  {
    identifier: "apikey",
    label: "emaki API key",
    type: "secret",
    description: "Create one at emaki.ai/settings/apikeys. Each run costs credits on your emaki account.",
  },
  {
    identifier: "model",
    label: "Model",
    type: "multiple",
    values: ["seedance_2_5", "seedance_2", "seedance_2_mini", "nano_banana_2_lite"],
    valueLabels: ["Seedance 2.5 video", "Seedance 2.0 video", "Seedance 2.0 mini video", "Image (Nano Banana 2 Lite)"],
    defaultValue: "seedance_2_5",
  },
] as const;

type Options = InferOptions<typeof options>;

const BASE = "https://emaki.ai";

// Error statuses carry a JSON body; read it instead of letting axios throw.
const call = (path: string, body: unknown, key: string) =>
  axios.post(`${BASE}${path}`, body, {
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    validateStatus: () => true,
  });

const explain = (status: number, body: any): string => {
  const msg = body?.error || body?.message || `HTTP ${status}`;
  if (status === 401) return "emaki rejected the API key. Check it in the extension settings.";
  if (status === 402) return "Not enough emaki credits for this run.";
  if (status === 403) return "This model needs a purchase on emaki.";
  if (status === 409) return "Another emaki run is still generating. Try again when it finishes.";
  return `emaki: ${msg}`;
};

export const action: ActionFunction<Options> = async (input, options) => {
  const prompt = input.text.trim();
  if (!prompt) return;
  const key = options.apikey?.trim();
  if (!key) {
    popclip.showText("Add your emaki API key in the extension settings (emaki.ai/settings/apikeys).");
    return;
  }
  const model = options.model || "seedance_2_5";
  const image = model.startsWith("nano_banana");
  const submit = await call("/api/video/ai", { prompt: prompt.slice(0, 2000), model, parameters: {} }, key);
  const id: string | undefined = submit.data?.data?.id;
  if (submit.status !== 200 || !submit.data?.success || !id) {
    popclip.showText(explain(submit.status, submit.data));
    return;
  }

  // A clip takes a few minutes; poll every 5 seconds for up to 15.
  const deadline = Date.now() + (image ? 5 : 15) * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await call("/api/video/status", { videoId: id }, key).catch(() => undefined);
    const d = res?.data?.data ?? {};
    if (d.status === "completed" && d.videoUrl) {
      popclip.openUrl(d.videoUrl);
      return;
    }
    if (d.status === "failed") {
      popclip.showText(`emaki could not finish this run (${d.failureCode || "failed"}). Try rewording the text.`);
      return;
    }
  }
  popclip.showText("Still rendering. The run will appear in your emaki library when it finishes.");
};
