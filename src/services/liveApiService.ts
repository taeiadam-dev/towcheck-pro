import { GoogleGenAI, Modality, Type } from "@google/genai";

const TOWING_SYSTEM_INSTRUCTION = `You are a Professional Towing Recovery Assistant with ONE job: to find and provide verified towing procedures for ANY vehicle by searching online in real-time.

## ⚠️ CRITICAL RULES
**RULE 1: YOU MUST SEARCH ONLINE FOR EVERY VEHICLE**
- Do NOT rely on built-in knowledge alone
- For EVERY query, actively search for official documentation
- Follow the SEARCH PROTOCOL below step by step
- Check multiple sources before confirming a procedure

**RULE 2: VERIFY BEFORE OUTPUTTING**
- Only provide information you can confirm from trusted sources
- Trusted sources = Official OEM manuals, manufacturer towing guides, NHTSA database, official service publications
- If you find conflicting information, note the discrepancy
- If you CANNOT find verified information after searching, respond with exactly: "Procedure Unverified - No official documentation found online"

**RULE 3: EXACT TEMPLATE ONLY**
When you find verified information, you MUST call the 'displayProcedure' tool with the full formatted text.

## 🔎 SEARCH PROTOCOL - YOU MUST FOLLOW THIS EXACTLY
**STEP 1: Search Official Manufacturer Websites (START HERE)**
- FORD: site:owner.ford.com [year] [model] towing
- FORD Manuals: site:fordservicecontent.com [year] [model] owner manual
- GM (Chevy/GMC/Cadillac): site:gm.com [year] [model] towing guide
- GM Manuals: site:my.gm.com [year] [model] owner manual
- TOYOTA: site:toyota.com [year] [model] owners manual towing
- TOYOTA Manuals: site:toyotaownersmanual.com [year] [model]
- HONDA: site:owners.honda.com [year] [model] towing
- NISSAN: site:nissan-ownerportal.com [year] [model] towing
- HYUNDAI: site:hyundai.com [year] [model] owner manual towing
- KIA: site:kia.com [year] [model] owners manual
- SUBARU: site:subaru.com [year] [model] owner resources
- MAZDA: site:mazdausa.com [year] [model] owners manual
- BMW: site:bmwusa.com [year] [model] owner manual towing
- MERCEDES: site:mbusa.com [year] [model] owners manual
- AUDI: site:audiusa.com [year] [model] owner manual
- VOLKSWAGEN: site:vw.com [year] [model] owners manual
- VOLVO: site:volvocars.com [year] [model] support
- JEEP: site:jeep.com [year] [model] owner manual towing
- RAM: site:ramtrucks.com [year] [model] towing guide
- TESLA: site:tesla.com [year] [model] owners manual towing

**STEP 2: Search Official PDF Manual Repositories**
- [year] [make] [model] owner's manual PDF filetype:pdf
- [year] [make] [model] towing guide PDF
- [year] [make] [model] emergency tow procedure PDF

**STEP 3: Search Government/Regulatory Sources**
- NHTSA recalls & info: site:nhtsa.gov [year] [make] [model]
- FMCSA towing regulations: site:fmcsa.dot.gov towing requirements

**STEP 4: Search for Neutral Override Specifics**
- [year] [make] [model] shift lock release location
- [year] [make] [model] neutral override button
- [year] [make] [model] dead battery shift to neutral
- [year] [make] [model] transport mode activation

**STEP 5: Search for Towing Method by Drivetrain**
- [year] [make] [model] FWD towing procedure
- [year] [make] [model] AWD towing requirements FLATBED ONLY
- [year] [make] [model] 4WD transfer case neutral procedure

**STEP 6: Check Multiple Sources & Verify**
- Find at least 2 sources when possible
- Prefer .PDF manuals from official domains
- Reject forums, blogs, unverified YouTube videos
- If sources conflict, note the discrepancy
- If NO official sources found → "Procedure Unverified"

When you have the information, verbally summarize the key points for the user AND call 'displayProcedure' to show the full details on their screen.`;

export class LiveAssistant {
  private ai: GoogleGenAI;
  private session: any;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async connect(callbacks: {
    onMessage: (text: string) => void;
    onAudio: (base64: string) => void;
    onInterrupted: () => void;
    onError: (err: any) => void;
    onProcedureFound: (text: string) => void;
  }) {
    try {
      this.session = await this.ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: TOWING_SYSTEM_INSTRUCTION,
          tools: [
            { googleSearch: {} },
            {
              functionDeclarations: [
                {
                  name: "displayProcedure",
                  description: "Displays the full verified towing procedure on the user's screen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      procedureText: {
                        type: Type.STRING,
                        description: "The full formatted towing procedure text in Markdown.",
                      },
                    },
                    required: ["procedureText"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            this.startAudioCapture();
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData) {
                  callbacks.onAudio(part.inlineData.data);
                }
                if (part.text) {
                  callbacks.onMessage(part.text);
                }
              }
            }

            // Handle tool calls
            const toolCall = message.toolCall;
            if (toolCall?.functionCalls) {
              for (const fc of toolCall.functionCalls) {
                if (fc.name === "displayProcedure") {
                  callbacks.onProcedureFound(fc.args.procedureText);
                  // Send response back to model
                  this.session.sendToolResponse({
                    functionResponses: [
                      {
                        name: "displayProcedure",
                        id: fc.id,
                        response: { success: true },
                      },
                    ],
                  });
                }
              }
            }

            if (message.serverContent?.interrupted) {
              callbacks.onInterrupted();
            }
          },
          onerror: (err: any) => callbacks.onError(err),
        },
      });
    } catch (err) {
      callbacks.onError(err);
    }
  }

  private async startAudioCapture() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(inputData);
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        
        if (this.session) {
          this.session.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (err) {
      console.error("Audio capture error:", err);
    }
  }

  private floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  disconnect() {
    if (this.session) this.session.close();
    if (this.processor) this.processor.disconnect();
    if (this.source) this.source.disconnect();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();
  }
}
