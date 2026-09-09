import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL = "openai/gpt-oss-120b";

function getSessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(";")
    .find((item) =>
      item.trim().startsWith("session_token=")
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
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 3000
) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing.");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },

    body: JSON.stringify({
      model: MODEL,

      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],

      response_format: {
        type: "json_object",
      },

      reasoning_effort: "low",

      reasoning_format: "hidden",

      max_completion_tokens: maxTokens,

      temperature: 0.4,
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    console.error(
      "Groq error:",
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
    throw new Error(
      "Groq returned invalid JSON."
    );
  }

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "Groq returned an empty response."
    );
  }

  try {
    return JSON.parse(content);
  } catch {
    console.error(
      "Invalid AI JSON:",
      content
    );

    throw new Error(
      "AI returned invalid JSON."
    );
  }
}

async function getAuthenticatedEpisode(
  request: Request,
  episodeId: string
) {
  const token = getSessionToken(request);

  if (!token) {
    throw new Error("Please login first.");
  }

  if (!episodeId) {
    throw new Error("Podcast ID is required.");
  }

  if (!ObjectId.isValid(episodeId)) {
    throw new Error("Invalid podcast ID.");
  }

  const db = await getDb();

  const session = await db
    .collection("sessions")
    .findOne({
      token,
      expiresAt: {
        $gt: new Date(),
      },
    });

  if (!session) {
    throw new Error(
      "Session expired. Please login again."
    );
  }

  const episode = await db
    .collection("episodes")
    .findOne({
      _id: new ObjectId(episodeId),
      userId: session.userId,
    });

  if (!episode) {
    throw new Error(
      "Podcast not found."
    );
  }

  return {
    db,
    session,
    episode,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      action,
      episodeId,
    } = body;

    if (!action) {
      return NextResponse.json(
        {
          error: "Action is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * EXPAND SEGMENT
     * =====================================================
     */

    if (action === "expandSegment") {
      const {
        segmentIndex,
        segment,
        episodeContext,
      } = body;

      if (
        typeof segmentIndex !== "number"
      ) {
        return NextResponse.json(
          {
            error:
              "Segment index is required.",
          },
          {
            status: 400,
          }
        );
      }

      if (!segment) {
        return NextResponse.json(
          {
            error:
              "Segment data is required.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        db,
        session,
        episode,
      } =
        await getAuthenticatedEpisode(
          request,
          episodeId
        );

      const currentSegment =
        episode.segments?.[
          segmentIndex
        ] || segment;

      const systemPrompt = `
You are PodcastAI.

You are expanding ONE segment of an existing podcast.

Do NOT rewrite the entire podcast.

Return ONLY JSON in this format:

{
  "title": "...",
  "duration": "...",
  "talkingPoints": [
    "...",
    "...",
    "...",
    "...",
    "..."
  ],
  "notes": "..."
}

Rules:

- Keep the same topic.
- Keep the same purpose.
- Make the segment more detailed.
- Add useful examples.
- Add practical sub-points.
- Improve host notes.
- Give 3 to 5 strong talking points.
- Make it useful for recording.
- Do not change unrelated parts.
- Return JSON only.
`;

      const userPrompt = `
PODCAST CONTEXT:

${JSON.stringify(
  episodeContext || {
    topic: episode.topic,
    tone: episode.tone,
    duration: episode.duration,
    guest: episode.guest,
  },
  null,
  2
)}

SEGMENT NUMBER:

${segmentIndex + 1}

CURRENT SEGMENT:

${JSON.stringify(
  currentSegment,
  null,
  2
)}

Expand this segment with useful detail.
`;

      const result = await callGroq(
        systemPrompt,
        userPrompt,
        3000
      );

      if (
        !result ||
        typeof result !== "object"
      ) {
        throw new Error(
          "AI did not return a valid expanded segment."
        );
      }

      const updatedSegment = {
        title:
          typeof result.title === "string"
            ? result.title
            : currentSegment.title,

        duration:
          typeof result.duration === "string"
            ? result.duration
            : currentSegment.duration,

        talkingPoints:
          Array.isArray(
            result.talkingPoints
          )
            ? result.talkingPoints.filter(
                (item: any) =>
                  typeof item === "string"
              )
            : currentSegment.talkingPoints,

        notes:
          typeof result.notes === "string"
            ? result.notes
            : currentSegment.notes,
      };

      const segments = [
        ...(episode.segments || []),
      ];

      if (
        segmentIndex < 0 ||
        segmentIndex >= segments.length
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid segment index.",
          },
          {
            status: 400,
          }
        );
      }

      segments[segmentIndex] =
        updatedSegment;

      await db
        .collection("episodes")
        .updateOne(
          {
            _id: episode._id,
            userId: session.userId,
          },
          {
            $set: {
              segments,
              updatedAt: new Date(),
            },
          }
        );

      return NextResponse.json({
        success: true,
        segment: updatedSegment,
        episodeId:
          episode._id.toString(),
        segmentIndex,
      });
    }

    /*
     * =====================================================
     * REGENERATE SEGMENT TONE
     * =====================================================
     */

    if (
      action ===
      "regenerateSegmentTone"
    ) {
      const {
        segmentIndex,
        tone,
        segment,
      } = body;

      if (
        typeof segmentIndex !== "number"
      ) {
        return NextResponse.json(
          {
            error:
              "Segment index is required.",
          },
          {
            status: 400,
          }
        );
      }

      if (!tone) {
        return NextResponse.json(
          {
            error:
              "Tone is required.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        db,
        session,
        episode,
      } =
        await getAuthenticatedEpisode(
          request,
          episodeId
        );

      const currentSegment =
        episode.segments?.[
          segmentIndex
        ] || segment;

      const systemPrompt = `
You are PodcastAI.

Rewrite ONE podcast segment in a different tone.

Return ONLY JSON:

{
  "title": "...",
  "duration": "...",
  "talkingPoints": [
    "...",
    "...",
    "..."
  ],
  "notes": "..."
}

Requested tone:
${tone}

Rules:

- Preserve the subject.
- Preserve the important information.
- Only change the style and tone.
- Do not change unrelated information.
- Keep the segment useful for recording.
`;

      const userPrompt = `
Podcast topic:
${episode.topic}

Current podcast tone:
${episode.tone}

Requested tone:
${tone}

Current segment:

${JSON.stringify(
  currentSegment,
  null,
  2
)}

Rewrite this segment using the requested tone.
`;

      const result = await callGroq(
        systemPrompt,
        userPrompt,
        2500
      );

      const updatedSegment = {
        title:
          result.title ||
          currentSegment.title,

        duration:
          result.duration ||
          currentSegment.duration,

        talkingPoints:
          Array.isArray(
            result.talkingPoints
          )
            ? result.talkingPoints
            : currentSegment.talkingPoints,

        notes:
          result.notes ||
          currentSegment.notes,
      };

      const segments = [
        ...(episode.segments || []),
      ];

      if (
        segmentIndex < 0 ||
        segmentIndex >= segments.length
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid segment index.",
          },
          {
            status: 400,
          }
        );
      }

      segments[segmentIndex] =
        updatedSegment;

      await db
        .collection("episodes")
        .updateOne(
          {
            _id: episode._id,
            userId: session.userId,
          },
          {
            $set: {
              segments,
              updatedAt: new Date(),
            },
          }
        );

      return NextResponse.json({
        success: true,
        segment: updatedSegment,
        segmentIndex,
      });
    }

    /*
     * =====================================================
     * GENERATE TITLES + DESCRIPTION
     * =====================================================
     */

    if (
      action ===
      "generateTitles"
    ) {
      const {
        topic,
        tone,
        description,
      } = body;

      const {
        db,
        session,
        episode,
      } =
        await getAuthenticatedEpisode(
          request,
          episodeId
        );

      const systemPrompt = `
You are a professional podcast branding expert.

Generate:

1. Five catchy podcast episode titles.
2. One strong show-notes description.

Return ONLY JSON:

{
  "titles": [
    "Title 1",
    "Title 2",
    "Title 3",
    "Title 4",
    "Title 5"
  ],
  "description": "..."
}

Rules:

- Titles must be natural.
- Titles must be interesting.
- Titles must be relevant.
- Titles should work for Spotify and YouTube.
- Avoid clickbait.
`;

      const userPrompt = `
Podcast topic:
${topic || episode.topic}

Tone:
${tone || episode.tone}

Current description:
${description || episode.description}

Generate five title options and one improved description.
`;

      const result = await callGroq(
        systemPrompt,
        userPrompt,
        1800
      );

      const titles =
        Array.isArray(result.titles)
          ? result.titles.filter(
              (item: any) =>
                typeof item === "string"
            )
          : [];

      const newDescription =
        typeof result.description ===
        "string"
          ? result.description
          : episode.description || "";

      await db
        .collection("episodes")
        .updateOne(
          {
            _id: episode._id,
            userId: session.userId,
          },
          {
            $set: {
              updatedAt: new Date(),
            },
          }
        );

      return NextResponse.json({
        success: true,
        titles,
        description: newDescription,
      });
    }

    /*
     * =====================================================
     * SERIES PLANNER
     * =====================================================
     */

    if (
      action ===
      "generateSeries"
    ) {
      const {
        topic,
        tone,
      } = body;

      const {
        episode,
      } =
        await getAuthenticatedEpisode(
          request,
          episodeId
        );

      const systemPrompt = `
You are an expert podcast series planner.

Create a six-episode podcast series.

Return ONLY JSON:

{
  "series": [
    {
      "number": 1,
      "title": "...",
      "topic": "...",
      "angle": "..."
    }
  ]
}

Rules:

- Exactly 6 episodes.
- Each episode must have a different angle.
- Episodes should logically connect.
- Avoid repeating the same idea.
`;

      const userPrompt = `
Main podcast topic:
${topic || episode.topic}

Tone:
${tone || episode.tone}

Create a logical six-episode podcast series.
`;

      const result = await callGroq(
        systemPrompt,
        userPrompt,
        2500
      );

      const series =
        Array.isArray(result.series)
          ? result.series
              .slice(0, 6)
              .map(
                (
                  item: any,
                  index: number
                ) => ({
                  number:
                    index + 1,

                  title:
                    item.title ||
                    `Episode ${
                      index + 1
                    }`,

                  topic:
                    item.topic || "",

                  angle:
                    item.angle || "",
                })
              )
          : [];

      return NextResponse.json({
        success: true,
        series,
      });
    }

    /*
     * =====================================================
     * SAVE EDITED EPISODE
     * =====================================================
     */

    if (
      action ===
      "saveEpisode"
    ) {
      const {
        title,
        description,
        segments,
        guestQuestions,
      } = body;

      const {
        db,
        session,
        episode,
      } =
        await getAuthenticatedEpisode(
          request,
          episodeId
        );

      if (!Array.isArray(segments)) {
        return NextResponse.json(
          {
            error:
              "Segments must be an array.",
          },
          {
            status: 400,
          }
        );
      }

      await db
        .collection("episodes")
        .updateOne(
          {
            _id: episode._id,
            userId: session.userId,
          },
          {
            $set: {
              title:
                typeof title === "string"
                  ? title
                  : episode.title,

              description:
                typeof description ===
                "string"
                  ? description
                  : episode.description,

              segments,

              guestQuestions:
                Array.isArray(
                  guestQuestions
                )
                  ? guestQuestions
                  : episode.guestQuestions ||
                    [],

              updatedAt: new Date(),
            },
          }
        );

      return NextResponse.json({
        success: true,

        message:
          "Podcast saved successfully.",
      });
    }

    /*
     * =====================================================
     * DELETE ONE PODCAST
     * =====================================================
     */

    if (
      action ===
      "deleteEpisode"
    ) {
      const {
        db,
        session,
        episode,
      } =
        await getAuthenticatedEpisode(
          request,
          episodeId
        );

      await db
        .collection("episodes")
        .deleteOne({
          _id: episode._id,
          userId: session.userId,
        });

      return NextResponse.json({
        success: true,

        deleted: true,

        episodeId:
          episode._id.toString(),

        message:
          "Podcast deleted successfully.",
      });
    }

    /*
     * =====================================================
     * UNKNOWN ACTION
     * =====================================================
     */

    return NextResponse.json(
      {
        error:
          `Unknown podcast action: ${action}`,
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "Podcast tools error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process podcast tool.",
      },
      {
        status: 500,
      }
    );
  }
}