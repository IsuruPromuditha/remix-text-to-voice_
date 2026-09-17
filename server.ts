import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: "50mb" }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post("/api/edit-image", async (req, res) => {
    try {
      const { image, prompt: userPrompt, previousPrompt } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      // Remove the data:image/png;base64, prefix if present, but since it could be jpeg, we match more broadly
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      
      // Determine mimetype from base64 string or default to png
      const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";

      const prompt = `You are editing an existing image.
The current subject/content of this image is: "${previousPrompt || 'The provided image'}".

User's edit instruction: "${userPrompt}"

CRITICAL INSTRUCTIONS:
- You MUST ONLY modify or edit the most recent subject described above ("${previousPrompt || 'The provided image'}") according to the user's instruction ("${userPrompt}").
- DO NOT look at or incorporate unrelated previous ideas, and DO NOT replace the subject with a different object.
- Apply the edit carefully while maintaining the relevant subject, structure, and composition of the current image.
- The output MUST be a high-quality photograph or image reflecting the user's requested edits.
- DO NOT generate an illustration, painting, sketch, or 3D render unless explicitly asked to do so.`;

      console.log(`\n======================================================`);
      console.log(`[Nano Banana Flash Lite] [edit-image] Sending edit prompt to gemini-3.1-flash-lite-image:`);
      console.log(`Subject: "${previousPrompt || 'none'}" | Instruction: "${userPrompt}"`);
      console.log(`Previous Image size (bytes): ${image ? image.length : 0}`);
      console.log(`======================================================\n`);

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          // @ts-ignore - passing imageConfig dynamically
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      let imageUrl = null;
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
         for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
               const b64 = part.inlineData.data;
               imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${b64}`;
               break;
            }
         }
      }

      if (!imageUrl) {
         throw new Error("No image generated");
      }

      res.json({ imageUrl, promptUsed: userPrompt });
    } catch (error) {
      console.error("Error editing image:", error);
      res.status(500).json({ error: "Failed to edit image" });
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt: userPrompt, theme } = req.body;

      if (!userPrompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const prompt = `Create a stunning, high-aesthetic editorial photograph or tangible design object for a moodboard.
Moodboard Theme/Context: ${theme || "General high-end aesthetic"}
Subject to generate: "${userPrompt}"

CRITICAL INSTRUCTIONS:
- The output MUST be a high-quality photograph, architectural shot, fashion editorial visual, texture, or tangible object.
- Use warm, organic lighting, beautiful cinematic composition, and rich textures.
- DO NOT generate cartoonish illustrations, text overlays, floating icons, or 3D renders unless explicitly requested.`;

      console.log(`\n======================================================`);
      console.log(`[Nano Banana Flash Lite] [generate-image] Sending prompt to gemini-3.1-flash-lite-image:`);
      console.log(`Theme: "${theme || 'General'}"`);
      console.log(`Prompt: "${userPrompt}"`);
      console.log(`======================================================\n`);

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: prompt,
        config: {
          // @ts-ignore - passing imageConfig dynamically
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      let imageUrl = null;
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
         for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
               const b64 = part.inlineData.data;
               imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${b64}`;
               break;
            }
         }
      }

      if (!imageUrl) {
         throw new Error("No image generated by model");
      }

      res.json({ imageUrl, promptUsed: userPrompt });
    } catch (error: any) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image: " + (error.message || "") });
    }
  });

  app.post("/api/text-to-speech", async (req, res) => {
    try {
      const { text, voice = "Kore", style = "announcement" } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      let spokenContent = text;
      if (style === "hype") {
        spokenContent = `Say energetically and with excitement like an underground club event promoter: ${text}`;
      } else if (style === "atmospheric") {
        spokenContent = `Say in a smooth, atmospheric, late-night tone: ${text}`;
      } else if (style === "announcement") {
        spokenContent = `Say clearly, warmly, and engagingly as an event announcement: ${text}`;
      }

      console.log(`\n======================================================`);
      console.log(`[Gemini TTS] Generating speech with gemini-3.1-flash-tts-preview:`);
      console.log(`Voice: ${voice} | Style: ${style}`);
      console.log(`Text: "${text}"`);
      console.log(`======================================================\n`);

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: spokenContent }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      let base64Audio: string | null = null;
      let mimeType = "audio/pcm;rate=24000";

      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            base64Audio = part.inlineData.data;
            mimeType = part.inlineData.mimeType || mimeType;
            break;
          }
        }
      }

      if (!base64Audio) {
        throw new Error("No audio returned from Gemini TTS");
      }

      res.json({
        audio: base64Audio,
        mimeType,
        voice,
        style,
        text,
      });
    } catch (error: any) {
      console.error("Error generating text-to-speech:", error);
      res.status(500).json({ error: error.message || "Failed to generate speech" });
    }
  });

  app.post("/api/parse-intent", async (req, res) => {
    try {
      const { transcript, currentTheme, hasActiveImage, activeImagePrompt, boardSummary } = req.body;
      if (!transcript) {
        return res.status(400).json({ error: "Transcript is required" });
      }

      const prompt = `You are the AI routing intelligence for Reverie, an AI voice-controlled moodboard creator.
Analyze what the user just said in the context of their moodboard layout.

Current State:
- Moodboard Theme: "${currentTheme || 'None yet (empty board)'}"
- Currently Active Image in Center (The MOST RECENT image generated/viewed): ${hasActiveImage ? `YES - Subject/Prompt: "${activeImagePrompt || 'Active Image'}"` : 'NO'}
- Previous historical items saved on board (DO NOT reference or use when editing the active image): ${boardSummary || 'None'}

User Spoken Transcript: "${transcript}"

Determine which of the following 5 actions the user intends:
1. "START_NEW_THEME": User is proposing a theme or asking for an initial image (e.g. "I want to create a wedding mood board. let's first start by looking at flowers - generate a colourful bridal bouquet.", "Let's do a cozy autumn living room theme").
2. "EDIT_ACTIVE": User wants to edit/modify/add to/change the currently active image in the center (e.g. "show me this with red hues, also add lilies", "make it brighter", "change the flowers to pink", "make them more pink").
3. "SAVE_AND_NEXT": User wants to save/keep the currently active image onto the mood board AND move on to create a NEW image (e.g. "next", "let's move on", "keep this one and give me a wedding dress", "save this, now let's do shoes", "good, next").
4. "DISCARD_ACTIVE": User wants to discard/delete/throw away the currently active image without saving it (e.g. "delete this", "let's start this one from scratch", "throw this out", "nevermind delete").
5. "IGNORE": Filler speech, background noise, or unrelated chatter ("um", "let me think", "just a sec").

CRITICAL RULES:
- If the user says words like "next", "let's move on", "save this and...", you MUST choose "SAVE_AND_NEXT".
- If the user says words like "delete this", "start from scratch", "throw this out", you MUST choose "DISCARD_ACTIVE".
- CRITICAL RULE ON EDIT VS NEW SUBJECT:
  * Choose "EDIT_ACTIVE" when the user asks to modify, adjust, style, or change aspects of the CURRENT active image (e.g. "make the sleeves longer", "change the color to sage green", "add lace", "show me this in a forest", "make it brighter", "try a vintage look", "zoom out", "make them more pink").
  * Choose "SAVE_AND_NEXT" or "START_NEW_THEME" when the user asks to generate a COMPLETELY DIFFERENT subject or object for the moodboard (e.g. "now let's generate bouquets of flowers", "create a wedding cake next", "give me table decorations", "let's do shoes next", "generate white roses"). Do NOT classify requests for brand new subjects as EDIT_ACTIVE even if there is an active image currently on screen!
- CRITICAL RULE ON IMAGE EDITS AND PROMPTS:
  * When action is "EDIT_ACTIVE", you MUST ONLY look at the Currently Active Image ("${activeImagePrompt || 'Active Image'}") and the user's spoken edit instructions.
  * You MUST NEVER look at, incorporate, or use the previous historical items saved on the board (${boardSummary || 'None'}) when forming the edit instruction!
  * When action is "EDIT_ACTIVE", for imagePrompt: write ONLY a direct, concise edit instruction focused strictly on modifying the Currently Active Image (e.g. if active image is "bridesmaids dresses" and user says "make them more pink", imagePrompt MUST BE "Make the bridesmaids dresses more pink" or "Change the dresses to a softer pink tone"). DO NOT output a full photography prompt from a previous board item!
- If there is NO active image, any request to generate something must be "START_NEW_THEME" (if a theme is mentioned or it's the first image) or "SAVE_AND_NEXT" (to generate another item under the existing theme).
- For imagePrompt when action is START_NEW_THEME or SAVE_AND_NEXT: write a concise, highly aesthetic photography prompt suitable for an AI image generator. If action is SAVE_AND_NEXT and the user just said "next" or "move on" without specifying what image to make next, INVENT an inspiring, cohesive next subject based on the moodboard theme!
- For themeTitle: extract a clean 2-4 word Title Case theme name (e.g., "Wedding Reverie", "Autumn Warmth", "Parisian Chic"). If currentTheme is already set and user isn't changing it, keep themeTitle equal to currentTheme.

Respond STRICTLY as JSON with this exact structure:
{
  "action": "START_NEW_THEME" | "EDIT_ACTIVE" | "SAVE_AND_NEXT" | "DISCARD_ACTIVE" | "IGNORE",
  "themeTitle": string | null,
  "imagePrompt": string | null,
  "feedbackMessage": string (1 warm, elegant sentence describing what is happening, e.g. "Creating your Wedding Moodboard with a colourful bridal bouquet...", "Adding red hues and lilies...", "Saving to board and creating your next image...", "Discarding active image...")
}`;

      console.log(`\n======================================================`);
      console.log(`[Nano Banana Flash Lite] [parse-intent] Sending prompt to gemini-3.1-flash-lite:`);
      console.log(`Transcript: "${transcript}" | hasActiveImage: ${hasActiveImage}`);
      console.log(`======================================================\n`);

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const text = response.text || "{}";
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error: any) {
      console.error("Error parsing intent:", error);
      res.status(500).json({ error: "Failed to parse intent", action: "IGNORE" });
    }
  });

  const server = http.createServer(app);

  // WebSocket server for live transcription relay
  const wss = new WebSocketServer({ server, path: '/ws/transcribe' });

  wss.on('connection', (clientWs, req) => {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set');
      clientWs.send(
        JSON.stringify({
          error: 'GEMINI_API_KEY environment variable is missing on the server.',
        })
      );
      clientWs.close();
      return;
    }

    console.log('Client connected to WebSocket transcription proxy');

    const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    let geminiWs: WebSocket | null = null;
    let isGeminiConnected = false;
    const pendingMessages: string[] = [];

    // Configuration from client or defaults
    let setupConfig = {
      model: 'models/gemini-3.5-transcribe-live',
      adaptation_phrases: ['moodboard', 'mood board', 'next', 'move on', 'delete', 'red hues', 'bouquet', 'wedding', 'aesthetic', 'palette', 'start from scratch', 'lillies', 'bridal'],
      language_codes: [] as string[],
    };

    try {
      geminiWs = new WebSocket(geminiWsUrl);
    } catch (err) {
      console.error('Failed to create Gemini WebSocket:', err);
      clientWs.send(JSON.stringify({ error: 'Failed to connect to Gemini Live API.' }));
      clientWs.close();
      return;
    }

    geminiWs.on('open', () => {
      console.log('Connected to Gemini Live API WebSocket');
      isGeminiConnected = true;

      // Send initial setup message as requested
      const sessionSetupMessage = {
        setup: {
          model: setupConfig.model,
          input_audio_transcription: {
            ...(setupConfig.language_codes.length > 0
              ? { language_hints: { language_codes: setupConfig.language_codes } }
              : {}),
            adaptation_phrases: setupConfig.adaptation_phrases,
          },
        },
      };

      console.log('Sending setup message to Gemini Live API:', JSON.stringify(sessionSetupMessage));
      geminiWs?.send(JSON.stringify(sessionSetupMessage));

      // Send any queued audio messages
      while (pendingMessages.length > 0) {
        const msg = pendingMessages.shift();
        if (msg && geminiWs?.readyState === WebSocket.OPEN) {
          geminiWs.send(msg);
        }
      }

      clientWs.send(JSON.stringify({ type: 'connected', status: 'Gemini Live Session Ready' }));
    });

    geminiWs.on('message', (data: WebSocket.RawData) => {
      try {
        const strData = data.toString();
        const parsed = JSON.parse(strData);

        const serverContent = parsed.serverContent || parsed.server_content;
        
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'gemini_response',
            raw: parsed,
            serverContent: serverContent || null,
          }));
        }
      } catch (e) {
        console.error('Error parsing Gemini WebSocket message:', e);
      }
    });

    geminiWs.on('error', (err) => {
      console.error('Gemini WebSocket error:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', error: err.message || 'Gemini API Error' }));
      }
    });

    geminiWs.on('close', (code, reason) => {
      console.log(`Gemini WebSocket closed: ${code} - ${reason.toString()}`);
      isGeminiConnected = false;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'disconnected', reason: 'Gemini Session Closed' }));
      }
    });

    clientWs.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'configure') {
          if (msg.adaptation_phrases) {
            setupConfig.adaptation_phrases = msg.adaptation_phrases;
          }
          if (msg.language_codes) {
            setupConfig.language_codes = msg.language_codes;
          }
          if (msg.model) {
            setupConfig.model = msg.model;
          }
          return;
        }

        if (msg.type === 'audio' || msg.audio) {
          const audioBase64 = msg.audio || msg.data;
          const mimeType = msg.mimeType || 'audio/pcm;rate=16000';

          const realtimePayload = JSON.stringify({
            realtime_input: {
              media_chunks: [
                {
                  mime_type: mimeType,
                  data: audioBase64,
                },
              ],
            },
          });

          if (isGeminiConnected && geminiWs?.readyState === WebSocket.OPEN) {
            geminiWs.send(realtimePayload);
          } else {
            pendingMessages.push(realtimePayload);
          }
        }
      } catch (err) {
        console.error('Error handling client message:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('Client WebSocket connection closed');
      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
