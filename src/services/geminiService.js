import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY);

// 🔥 FALLBACK MODELS
const MODELS = [
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",

  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",

  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",

  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-pro-latest",

  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

export async function askGemini(prompt) {
  for (const modelName of MODELS) {
    try {
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
        console.log(`Switching model...`);

        await new Promise((resolve) => setTimeout(resolve, 800));

        continue;
      }

      throw err;
    }
  }

  return null;
}
