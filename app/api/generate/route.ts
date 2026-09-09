import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL = "openai/gpt-oss-120b";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
};

type Segment = {
  title: string;
  duration: string;
  talkingPoints: string[];
  notes: string;
};

function getSessionToken(request: Request) {
  const cookieHeader =
    request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(";")
    .find((item) =>
      item
        .trim()
        .startsWith("session_token=")
    );

  if (!cookie) {
    return null;
  }

  return cookie
    .trim()
    .split("=")
    .slice(1)
    .join("=");
}

async function callGroq(
  messages: {
    role: "system" | "user";
    content: string;
  }[],
  maxTokens = 5000,
  temperature = 0.3
) {
  const apiKey =
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is missing."
    );
  }

  const response = await fetch(
    GROQ_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${apiKey}`,
      },

      body: JSON.stringify({
        model: MODEL,

        messages,

        response_format: {
          type: "json_object",
        },

        reasoning_effort: "low",

        reasoning_format: "hidden",

        max_completion_tokens:
          maxTokens,

        temperature,
      }),
    }
  );

  const raw =
    await response.text();

  if (!response.ok) {
    console.error(
      "Groq API error:",
      response.status,
      raw
    );

    throw new Error(
      `Groq API error ${response.status}: ${raw}`
    );
  }

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    console.error(
      "Groq returned non-JSON:",
      raw
    );

    throw new Error(
      "Groq returned an invalid response."
    );
  }

  const content =
    data?.choices?.[0]?.message
      ?.content;

  if (!content) {
    console.error(
      "Empty Groq content:",
      data
    );

    throw new Error(
      "Groq returned an empty response."
    );
  }

  try {
    return JSON.parse(content);
  } catch {
    console.error(
      "Groq content was not valid JSON:",
      content
    );

    throw new Error(
      "AI returned invalid JSON."
    );
  }
}

async function callGemini(
  messages: {
    role: "system" | "user";
    content: string;
  }[],
  maxTokens = 5000,
  temperature = 0.3
) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const systemMessage = messages.find(
    (item) => item.role === "system"
  );

  const contents = messages
    .filter((item) => item.role === "user")
    .map((item) => ({
      role: "user",
      parts: [{ text: item.content }],
    }));

  const response = await fetch(
    `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: systemMessage
          ? {
              parts: [{ text: systemMessage.content }],
            }
          : undefined,
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens,
          temperature,
        },
      }),
    }
  );

  const raw = await response.text();

  if (!response.ok) {
    console.error(
      "Gemini API error:",
      response.status,
      raw
    );
    throw new Error(
      `Gemini API error ${response.status}: ${raw}`
    );
  }

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "Gemini returned an invalid response."
    );
  }

  const content = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text || "")
    .join("")
    .trim();

  if (!content) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  try {
    return JSON.parse(content);
  } catch {
    console.error(
      "Gemini content was not valid JSON:",
      content
    );
    throw new Error("Gemini returned invalid JSON.");
  }
}

async function callAI(
  messages: {
    role: "system" | "user";
    content: string;
  }[],
  maxTokens = 5000,
  temperature = 0.3
) {
  let groqError: unknown = null;

  if (process.env.GROQ_API_KEY) {
    try {
      return await callGroq(
        messages,
        maxTokens,
        temperature
      );
    } catch (error) {
      groqError = error;
      console.error(
        "Groq failed. Trying Gemini fallback:",
        error
      );
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGemini(
        messages,
        maxTokens,
        temperature
      );
    } catch (geminiError) {
      console.error(
        "Gemini fallback failed:",
        geminiError
      );

      throw new Error(
        `Both Groq and Gemini failed. Groq: ${
          groqError instanceof Error
            ? groqError.message
            : "unavailable"
        } Gemini: ${
          geminiError instanceof Error
            ? geminiError.message
            : "unavailable"
        }`
      );
    }
  }

  throw new Error(
    "No AI API key is configured. Add GROQ_API_KEY or GEMINI_API_KEY."
  );
}

function normalizeSegments(
  segments: any[]
): Segment[] {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.map(
    (segment: any) => ({
      title:
        typeof segment?.title ===
        "string"
          ? segment.title
          : "Untitled Segment",

      duration:
        typeof segment?.duration ===
        "string"
          ? segment.duration
          : "5 min",

      talkingPoints:
        Array.isArray(
          segment?.talkingPoints
        )
          ? segment.talkingPoints
              .filter(
                (point: any) =>
                  typeof point ===
                  "string"
              )
          : [],

      notes:
        typeof segment?.notes ===
        "string"
          ? segment.notes
          : "",
    })
  );
}

function normalizeEpisode(
  episode: any,
  original: any
) {
  return {
    title:
      typeof episode?.title ===
      "string"
        ? episode.title
        : original.title || "",

    description:
      typeof episode?.description ===
      "string"
        ? episode.description
        : original.description || "",

    segments:
      Array.isArray(
        episode?.segments
      )
        ? normalizeSegments(
            episode.segments
          )
        : normalizeSegments(
            original.segments || []
          ),

    guestQuestions:
      Array.isArray(
        episode?.guestQuestions
      )
        ? episode.guestQuestions.filter(
            (question: any) =>
              typeof question ===
              "string"
          )
        : Array.isArray(
            original.guestQuestions
          )
        ? original.guestQuestions
        : [],
  };
}

export async function POST(
  request: Request
) {
  try {
    /*
     * =====================================================
     * AUTHENTICATION
     * =====================================================
     */

    const token =
      getSessionToken(request);

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Please login first.",
        },
        {
          status: 401,
        }
      );
    }

    const db = await getDb();

    const session =
      await db
        .collection("sessions")
        .findOne({
          token,

          expiresAt: {
            $gt: new Date(),
          },
        });

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Session expired. Please login again.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =====================================================
     * REQUEST BODY
     * =====================================================
     */

    const body =
      await request.json();

    const {
      topic,
      tone,
      duration,
      guestName,
      guestRole,
      episodeId,
      message,
    } = body;

    /*
     * =====================================================
     * AI KEYS
     * =====================================================
     */

    if (
      !process.env.GROQ_API_KEY &&
      !process.env.GEMINI_API_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "No AI API key is configured. Add GROQ_API_KEY or GEMINI_API_KEY.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * EXISTING PODCAST
     * =====================================================
     */

    if (episodeId) {
      if (
        !ObjectId.isValid(
          episodeId
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid podcast ID.",
          },
          {
            status: 400,
          }
        );
      }

      const existingEpisode =
        await db
          .collection("episodes")
          .findOne({
            _id: new ObjectId(
              episodeId
            ),

            userId:
              session.userId,
          });

      if (!existingEpisode) {
        return NextResponse.json(
          {
            error:
              "Podcast not found.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        !message ||
        !message.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Please enter a message.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * =====================================================
       * COMPLETE PODCAST STATE
       * =====================================================
       */

      const currentPodcast = {
        title:
          existingEpisode.title ||
          "",

        topic:
          existingEpisode.topic ||
          "",

        tone:
          existingEpisode.tone ||
          "Professional",

        duration:
          existingEpisode.duration ||
          "30 minutes",

        description:
          existingEpisode.description ||
          "",

        guest:
          existingEpisode.guest ||
          null,

        segments:
          existingEpisode.segments ||
          [],

        guestQuestions:
          existingEpisode.guestQuestions ||
          [],
      };

      /*
       * =====================================================
       * COMPLETE CHAT HISTORY
       * =====================================================
       */

      const storedMessages =
        Array.isArray(
          existingEpisode.messages
        )
          ? (existingEpisode.messages as ChatMessage[])
          : [];

      /*
       * Keep a useful amount of history.
       *
       * The latest messages are most important,
       * while the podcast state above gives Groq
       * the complete current episode.
       */

      const previousMessages =
        storedMessages.slice(-40);

      const historyText =
        previousMessages.length > 0
          ? previousMessages
              .map(
                (
                  item,
                  index
                ) =>
                  `${index + 1}. ${
                    item.role ===
                    "user"
                      ? "USER"
                      : "ASSISTANT"
                  }: ${item.content}`
              )
              .join("\n")
          : "No previous conversation.";

      /*
       * =====================================================
       * PODCAST CONTINUATION SYSTEM
       * =====================================================
       *
       * IMPORTANT:
       *
       * The AI is NOT limited to only editing.
       *
       * It can answer relevant questions about
       * the podcast as well.
       */

      const systemPrompt = `
You are PodcastAI.

You are currently inside ONE SPECIFIC PODCAST.

You must understand the user's current message using:

1. The complete current podcast.
2. The previous conversation.
3. The user's latest message.

Never treat the latest message as an isolated question.

==================================================
CURRENT PODCAST
==================================================

${JSON.stringify(
  currentPodcast,
  null,
  2
)}

==================================================
PREVIOUS CHAT HISTORY
==================================================

${historyText}

==================================================
IMPORTANT CONTEXT RULE
==================================================

The previous conversation is extremely important.

If the user says:

"improve it"

look at the previous conversation and determine what "it" means.

If the user says:

"give me two more"

look at the previous conversation and determine what they want two more of.

If the user says:

"make that better"

look at the previous discussion and determine what "that" refers to.

If the user says:

"continue"

continue the previous discussion.

If the user says:

"what about the second point?"

look at the previous conversation and the podcast segments.

Do NOT ask the user to repeat context that is already available.

==================================================
RELEVANT QUESTIONS ARE ALLOWED
==================================================

The user is allowed to ask questions related to the podcast.

For example, if the podcast is about:

"A Chef's Journey in the Kitchen"

then questions such as:

"How can I make a different food item?"

"What ingredients could I discuss?"

"What cooking techniques should I mention?"

"What questions should I ask the chef?"

"Can you explain this cooking method?"

are relevant to the podcast.

Answer them naturally.

Base the answer primarily on the podcast topic, guest, segments, and previous conversation.

Do NOT reject a relevant question just because it is phrased as a normal question.

==================================================
UNRELATED QUESTIONS
==================================================

Reject questions that have NO meaningful connection to this podcast.

Examples:

"What is 25 x 25?"

"Write Python code."

"What is today's weather?"

"Help me with my unrelated college assignment."

"Who won today's cricket match?"

"How do I install Windows?"

These should return:

{
  "type": "reject",
  "reply": "I can help with this podcast and questions related to it. Please keep your request connected to the episode."
}

==================================================
VERY IMPORTANT
==================================================

Do NOT become a general-purpose chatbot.

Stay inside the podcast context.

However, if a question is reasonably connected to the podcast topic, answer it.

==================================================
WHEN THE USER WANTS TO MODIFY THE PODCAST
==================================================

Actually modify the podcast.

Examples:

"Add 3 questions about international trade."

"Improve the introduction."

"Make segment 2 more engaging."

"Add another talking point."

"Remove the third question."

"Make the outro shorter."

"Add an example to segment 3."

"Give me two more questions."

Return the COMPLETE updated podcast.

Do not return only the changed part.

Preserve everything the user did not ask to change.

==================================================
WHEN THE USER ONLY ASKS A QUESTION
==================================================

If the user asks a relevant question but does NOT ask to modify the podcast:

Answer the question.

Do NOT unnecessarily change the podcast.

Return the existing podcast unchanged.

==================================================
OUTPUT FORMAT
==================================================

For unrelated requests:

{
  "type": "reject",
  "reply": "..."
}

For a relevant question that does NOT modify the podcast:

{
  "type": "answer",
  "reply": "Your useful answer...",
  "updatedPodcast": {
    "title": "...",
    "description": "...",
    "segments": [...],
    "guestQuestions": [...]
  }
}

For a request that modifies the podcast:

{
  "type": "update",
  "reply": "Short explanation of what was changed.",
  "updatedPodcast": {
    "title": "...",
    "description": "...",
    "segments": [...],
    "guestQuestions": [...]
  }
}

==================================================
OUTPUT RULES
==================================================

Always return valid JSON.

Never use markdown outside JSON.

updatedPodcast must contain the COMPLETE podcast.

Do not omit existing segments.

Do not omit existing guest questions.

If nothing needs to change, return the current podcast unchanged.

If the user asks for more questions, keep the old questions and add the new ones.

If the user asks for an improvement, preserve the meaning but improve the requested part.

If the user asks for expansion, add useful details, examples, talking points, and notes.

==================================================
USER'S NEW MESSAGE
==================================================

${message.trim()}
`;

      /*
       * =====================================================
       * CALL AI WITH GROQ → GEMINI FALLBACK
       * =====================================================
       */

      let aiResult: any;

      try {
        aiResult =
          await callAI(
            [
              {
                role: "system",
                content:
                  systemPrompt,
              },

              {
                role: "user",
                content:
                  `Use all the podcast context and previous conversation above to respond to this latest request:\n\n${message.trim()}`,
              },
            ],
            6000,
            0.3
          );
      } catch (aiError) {
        console.error(
          "Continuation AI error:",
          aiError
        );

        return NextResponse.json(
          {
            error:
              aiError instanceof Error
                ? aiError.message
                : "Unable to generate podcast response.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * =====================================================
       * REJECT
       * =====================================================
       */

      if (
        aiResult?.type ===
        "reject"
      ) {
        return NextResponse.json({
          success: true,

          rejected: true,

          reply:
            aiResult.reply ||
            "I can help with this podcast and questions related to it. Please keep your request connected to the episode.",

          episode: {
            id:
              existingEpisode._id.toString(),

            title:
              existingEpisode.title ||
              "",
          },
        });
      }

      /*
       * =====================================================
       * VALID RESPONSE
       * =====================================================
       */

      const normalized =
        normalizeEpisode(
          aiResult?.updatedPodcast,
          currentPodcast
        );

      /*
       * =====================================================
       * SAVE CHAT MESSAGE
       * =====================================================
       */

      const now =
        new Date();

      const userChatMessage = {
        role: "user",
        content:
          message.trim(),
        createdAt: now,
      };

      const assistantChatMessage = {
        role: "assistant",
        content:
          aiResult?.reply ||
          "I have processed your request using this podcast's context.",
        createdAt: now,
      };

      /*
       * =====================================================
       * UPDATE MONGODB
       * =====================================================
       */

      await db
        .collection<any>("episodes")
        .updateOne(
          {
            _id:
              existingEpisode._id,

            userId:
              session.userId,
          },

          {
            $set: {
              title:
                normalized.title,

              description:
                normalized.description,

              segments:
                normalized.segments,

              guestQuestions:
                normalized.guestQuestions,

              updatedAt:
                now,
            },

         $push: {
          messages: {
            $each: [
              userChatMessage,
              assistantChatMessage,
            ],
          },
        },
      } as any
    );

      /*
       * =====================================================
       * RETURN UPDATED PODCAST
       * =====================================================
       */

      const updatedMessages = [
        ...storedMessages,
        userChatMessage,
        assistantChatMessage,
      ];

      return NextResponse.json({
        success: true,

        rejected: false,

        reply:
          aiResult?.reply ||
          "I have processed your request using this podcast's context.",

        episode: {
          id:
            existingEpisode._id.toString(),

          topic:
            existingEpisode.topic ||
            "",

          tone:
            existingEpisode.tone ||
            "Professional",

          duration:
            existingEpisode.duration ||
            "30 minutes",

          guest:
            existingEpisode.guest ||
            null,

          title:
            normalized.title,

          description:
            normalized.description,

          segments:
            normalized.segments,

          guestQuestions:
            normalized.guestQuestions,

          messages:
            updatedMessages,
        },
      });

      /*
       * =====================================================
       * END EXISTING PODCAST
       * =====================================================
       */
    }

    /*
     * =====================================================
     * NEW PODCAST
     * =====================================================
     */

    if (
      !topic ||
      !topic.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Podcast topic is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * VALIDATE NEW TOPIC WITH AI
     * =====================================================
     */

    const validation =
      await callAI(
        [
          {
            role: "system",
            content: `
You are validating a new podcast idea.

A valid podcast topic can be about almost any meaningful subject that can become a podcast episode.

Examples:
- AI
- technology
- cooking
- business
- startups
- healthcare
- education
- interviews
- politics
- economics
- sports
- history
- science
- entertainment
- careers
- travel

Reject only clearly non-podcast requests such as:
- "2 + 2"
- "What is 5 x 5?"
- "Write Python code"
- "What is today's weather?"

Return JSON only.

Valid:
{
  "valid": true
}

Invalid:
{
  "valid": false,
  "reply": "Please enter a podcast topic or episode idea."
}
`,
          },

          {
            role: "user",
            content:
              topic.trim(),
          },
        ],
        500,
        0
      );

    if (
      validation?.valid !==
      true
    ) {
      return NextResponse.json({
        success: true,

        rejected: true,

        reply:
          validation?.reply ||
          "Please enter a podcast topic or episode idea.",
      });
    }

    /*
     * =====================================================
     * GUEST INFORMATION
     * =====================================================
     */

    const guestText =
      guestName &&
      guestName.trim()
        ? `
Guest name:
${guestName.trim()}

Guest role:
${guestRole?.trim() || "Not specified"}
`
        : `
No guest is included.
`;

    /*
     * =====================================================
     * INITIAL PODCAST PROMPT
     * =====================================================
     */

    const initialPrompt = `
Create a complete podcast episode outline.

Topic:
${topic.trim()}

Tone:
${tone || "Professional"}

Duration:
${duration || "30 minutes"}

${guestText}

Return ONLY JSON.

Use exactly:

{
  "title": "Episode title",
  "description": "Episode description",
  "segments": [
    {
      "title": "Segment title",
      "duration": "5 min",
      "talkingPoints": [
        "Point 1",
        "Point 2",
        "Point 3"
      ],
      "notes": "Host notes"
    }
  ],
  "guestQuestions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ]
}

Rules:

- Create a clear introduction.
- Create the main discussion.
- Include guest Q&A when a guest exists.
- Create a conclusion/outro.
- Give 3 to 5 talking points per segment.
- Give useful host notes.
- Respect the requested duration.
- Match the requested tone.
- Make it useful for recording.
- If there is no guest, guestQuestions must be [].
`;

    /*
     * =====================================================
     * GENERATE INITIAL EPISODE WITH AI
     * =====================================================
     */

    const generated =
      await callAI(
        [
          {
            role: "system",
            content:
              "You are an expert podcast producer. Return valid JSON only.",
          },

          {
            role: "user",
            content:
              initialPrompt,
          },
        ],
        6000,
        0.5
      );

    if (
      !generated ||
      !Array.isArray(
        generated.segments
      )
    ) {
      return NextResponse.json(
        {
          error:
            "AI returned invalid podcast data.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * NORMALIZE INITIAL EPISODE
     * =====================================================
     */

    const normalizedSegments =
      normalizeSegments(
        generated.segments
      );

    const normalizedQuestions =
      Array.isArray(
        generated.guestQuestions
      )
        ? generated.guestQuestions.filter(
            (question: any) =>
              typeof question ===
              "string"
          )
        : [];

    const now =
      new Date();

    /*
     * =====================================================
     * MONGODB DOCUMENT
     * =====================================================
     */

    const episodeDocument = {
      userId:
        session.userId,

      topic:
        topic.trim(),

      tone:
        tone || "Professional",

      duration:
        duration || "30 minutes",

      guest:
        guestName &&
        guestName.trim()
          ? {
              name:
                guestName.trim(),

              role:
                guestRole?.trim() ||
                "",
            }
          : null,

      title:
        typeof generated.title ===
        "string"
          ? generated.title
          : topic.trim(),

      description:
        typeof generated.description ===
        "string"
          ? generated.description
          : "",

      segments:
        normalizedSegments,

      guestQuestions:
        normalizedQuestions,

      /*
       * Only the user's original
       * topic is saved as chat history.
       *
       * The full AI outline is stored
       * separately in the episode.
       */

      messages: [
        {
          role: "user",

          content:
            topic.trim(),

          createdAt: now,
        },
      ],

      createdAt:
        now,

      updatedAt:
        now,
    };

    /*
     * =====================================================
     * INSERT
     * =====================================================
     */

    const inserted =
      await db
        .collection("episodes")
        .insertOne(
          episodeDocument
        );

    /*
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return NextResponse.json({
      success: true,

      newEpisode: true,

      episode: {
        id:
          inserted.insertedId.toString(),

        topic:
          topic.trim(),

        tone:
          tone || "Professional",

        duration:
          duration || "30 minutes",

        guest:
          guestName &&
          guestName.trim()
            ? {
                name:
                  guestName.trim(),

                role:
                  guestRole?.trim() ||
                  "",
              }
            : null,

        title:
          episodeDocument.title,

        description:
          episodeDocument.description,

        segments:
          normalizedSegments,

        guestQuestions:
          normalizedQuestions,

        messages:
          episodeDocument.messages,
      },
    });
  } catch (error) {
    console.error(
      "Generate route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate podcast.",
      },
      {
        status: 500,
      }
    );
  }
}