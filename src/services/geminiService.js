import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY);

const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

const modelCooldowns = {};

export async function askGemini(prompt) {
  for (const modelName of MODELS) {
    try {
      const now = Date.now();

      // 🔥 Skip cooling-down models
      if (modelCooldowns[modelName] && now - modelCooldowns[modelName] < 5000) {
        console.log(`Skipping cooldown model: ${modelName}`);
        continue;
      }

      console.log(`Trying model: ${modelName}`);

      const model = genAI.getGenerativeModel({
        model: modelName,
      });

      const result = await model.generateContent(prompt);

      const response = await result.response;

      const text = response.text();

      return {
        text,
        model: modelName,
      };
    } catch (err) {
      console.error(`Failed: ${modelName}`, err);

      const errorText = err?.message?.toLowerCase() || "";

      const shouldSwitch =
        errorText.includes("quota") ||
        errorText.includes("429") ||
        errorText.includes("rate limit") ||
        errorText.includes("resource exhausted") ||
        errorText.includes("not found") ||
        errorText.includes("unsupported");

      if (shouldSwitch) {
        modelCooldowns[modelName] = Date.now();

        console.log(`Switching model...`);

        await new Promise((resolve) => setTimeout(resolve, 1500));

        continue;
      }

      throw err;
    }
  }

  return {
    text: null,
    model: "Unavailable",
  };
}
