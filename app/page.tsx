"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Segment = {
  title: string;
  duration: string;
  talkingPoints: string[];
  notes: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Episode = {
  id: string;
  topic: string;
  tone: string;
  duration: string;
  title: string;
  description: string;
  segments: Segment[];
  guestQuestions: string[];
  guest?: {
    name: string;
    role: string;
  } | null;
  messages?: Message[];
  createdAt?: string;
  updatedAt?: string;
};

type SeriesItem = {
  number: number;
  title: string;
  topic: string;
  angle: string;
};

const DEFAULT_REJECTION =
  "I can help only with podcast creation and this podcast. Ask me to continue, edit, expand, improve, or modify the episode.";

function cleanMessages(
  messages: Message[] = [],
  topic = ""
) {
  return messages.filter((message, index) => {
    if (message.role === "assistant") {
      try {
        const parsed = JSON.parse(message.content);

        if (
          parsed &&
          typeof parsed === "object" &&
          (Array.isArray(parsed.segments) ||
            Array.isArray(parsed.guestQuestions))
        ) {
          return false;
        }
      } catch {}
    }

    if (
      index === 0 &&
      message.role === "user" &&
      topic &&
      message.content.trim() === topic.trim()
    ) {
      return false;
    }

    return true;
  });
}

export default function Home() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [topic, setTopic] = useState("");

  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [showSettings, setShowSettings] = useState(false);
  const [showAccountMenu, setShowAccountMenu] =
    useState(false);

  const [tone, setTone] = useState("Professional");
  const [duration, setDuration] = useState("30 minutes");

  const [guestName, setGuestName] = useState("");
  const [guestRole, setGuestRole] = useState("");

  const [activeMenu, setActiveMenu] = useState<
    "tone" | "duration" | "guest" | null
  >(null);

  const [shareMessage, setShareMessage] = useState("");

  const [history, setHistory] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] =
    useState<Episode | null>(null);

  const [historyMenuId, setHistoryMenuId] =
    useState<string | null>(null);
  const [deletingEpisodeId, setDeletingEpisodeId] =
    useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [conversation, setConversation] = useState<
    Message[]
  >([]);

  const [generating, setGenerating] = useState(false);
  const [historyLoading, setHistoryLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [expandedIndex, setExpandedIndex] =
    useState<number | null>(null);

  const [toolLoading, setToolLoading] = useState("");

  const [titleOptions, setTitleOptions] = useState<
    string[]
  >([]);

  const [generatedDescription, setGeneratedDescription] =
    useState("");

  const [showTitles, setShowTitles] = useState(false);

  const [seriesItems, setSeriesItems] = useState<
    SeriesItem[]
  >([]);

  const [showSeries, setShowSeries] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me");

        if (!response.ok) {
          router.push("/login");
          return;
        }

        const data = await response.json();

        if (data.user?.email) {
          setUserEmail(data.user.email);
        }

        await loadHistory();
      } catch (error) {
        console.error(
          "Authentication check failed:",
          error
        );

        router.push("/login");
      }
    };

    checkAuth();
  }, [router]);

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);

      const response = await fetch("/api/history");

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }

        throw new Error("Unable to load history");
      }

      const data = await response.json();

      setHistory(data.episodes || []);
    } catch (error) {
      console.error(
        "History loading error:",
        error
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveEpisode = async (
    episode = currentEpisode
  ) => {
    if (!episode) {
      return false;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/podcast-tools",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "saveEpisode",
            episodeId: episode.id,
            title: episode.title,
            description: episode.description,
            segments: episode.segments,
            guestQuestions:
              episode.guestQuestions,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to save changes."
        );
      }

      setDirty(false);

      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save changes."
      );

      return false;
    } finally {
      setSaving(false);
    }
  };

  const applyEpisode = (
    episode: Episode
  ) => {
    setCurrentEpisode(episode);

    setHistory((previous) =>
      previous.map((item) =>
        item.id === episode.id
          ? episode
          : item
      )
    );

    setDirty(false);
  };

  const handleGenerate = async () => {
    if (!topic.trim() || generating) {
      return;
    }

    setGenerating(true);
    setErrorMessage("");
    setActiveMenu(null);

    try {
      /*
       * =====================================================
       * CONTINUE EXISTING PODCAST
       * =====================================================
       */

      if (currentEpisode) {
        if (dirty) {
          const saved = await saveEpisode();

          if (!saved) {
            return;
          }
        }

        const userMessage = topic.trim();

        const response = await fetch(
          "/api/generate",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              episodeId:
                currentEpisode.id,
              message: userMessage,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setErrorMessage(
            data.error ||
              "Unable to continue this podcast."
          );

          return;
        }

        /*
         * AI rejected unrelated question
         */

        if (data.rejected) {
          setConversation(
            (previous) => [
              ...previous,
              {
                role: "user",
                content: userMessage,
              },
              {
                role: "assistant",
                content:
                  data.reply ||
                  DEFAULT_REJECTION,
              },
            ]
          );

          setTopic("");

          return;
        }

        /*
         * AI accepted podcast-related request
         */

        if (data.episode) {
          applyEpisode({
            ...currentEpisode,
            ...data.episode,
          });
        }

        setConversation(
          (previous) => [
            ...previous,
            {
              role: "user",
              content: userMessage,
            },
            {
              role: "assistant",
              content:
                data.reply ||
                "I updated the podcast based on your request.",
            },
          ]
        );

        setTopic("");

        return;
      }

      /*
       * =====================================================
       * CREATE BRAND NEW PODCAST
       * =====================================================
       */

      const originalTopic = topic.trim();

      const response = await fetch(
        "/api/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            topic: originalTopic,
            tone,
            duration,
            guestName:
              guestName.trim(),
            guestRole:
              guestRole.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(
          data.error ||
            "Unable to generate podcast."
        );

        return;
      }

      /*
       * Reject unrelated initial topic
       */

      if (data.rejected) {
        setErrorMessage(
          data.reply ||
            "Please enter a podcast topic or episode idea."
        );

        setTopic("");

        return;
      }

      if (!data.episode) {
        setErrorMessage(
          "AI did not return a podcast."
        );

        return;
      }

      const generatedEpisode: Episode = {
        ...data.episode,

        topic: originalTopic,

        tone,

        duration,

        guest: guestName.trim()
          ? {
              name: guestName.trim(),
              role: guestRole.trim(),
            }
          : null,
      };

      setCurrentEpisode(
        generatedEpisode
      );

      setConversation([]);

      setHistory((previous) => [
        generatedEpisode,
        ...previous.filter(
          (item) =>
            item.id !==
            generatedEpisode.id
        ),
      ]);

      setTopic("");

      setEditing(false);
      setDirty(false);

      setTitleOptions([]);
      setGeneratedDescription("");
      setSeriesItems([]);
    } catch (error) {
      console.error(
        "Generate error:",
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to the AI server."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteEpisode = async (
    episode: Episode
  ) => {
    const confirmed = window.confirm(
      `Delete "${episode.title || episode.topic || "Untitled Podcast"}"?\n\nThis podcast will be permanently removed from your history.`
    );

    if (!confirmed) {
      setHistoryMenuId(null);
      return;
    }

    setDeletingEpisodeId(episode.id);
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/podcast-tools",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "deleteEpisode",
            episodeId: episode.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to delete podcast."
        );
      }

      setHistory((previous) =>
        previous.filter(
          (item) => item.id !== episode.id
        )
      );

      if (currentEpisode?.id === episode.id) {
        handleNewEpisode();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete podcast."
      );
    } finally {
      setDeletingEpisodeId(null);
      setHistoryMenuId(null);
    }
  };

  const handleHistoryClick = (
    episode: Episode
  ) => {
    setCurrentEpisode(episode);

    setTone(
      episode.tone ||
        "Professional"
    );

    setDuration(
      episode.duration ||
        "30 minutes"
    );

    setGuestName(
      episode.guest?.name || ""
    );

    setGuestRole(
      episode.guest?.role || ""
    );

    setTopic("");

    setConversation(
      cleanMessages(
        episode.messages || [],
        episode.topic
      )
    );

    setErrorMessage("");

    setEditing(false);
    setDirty(false);

    setShowAccountMenu(false);
    setShowSettings(false);

    setTitleOptions([]);
    setSeriesItems([]);

    setShowTitles(false);
    setShowSeries(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleNewEpisode = () => {
    setCurrentEpisode(null);

    setConversation([]);

    setTopic("");

    setGuestName("");
    setGuestRole("");

    setTone("Professional");
    setDuration("30 minutes");

    setErrorMessage("");

    setActiveMenu(null);

    setEditing(false);
    setDirty(false);

    setShowTitles(false);
    setShowSeries(false);

    setTitleOptions([]);
    setSeriesItems([]);
  };

  const handleLogout = async () => {
    try {
      await fetch(
        "/api/auth/logout",
        {
          method: "POST",
        }
      );
    } catch (error) {
      console.error(error);
    }

    router.push("/login");
    router.refresh();
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title:
            currentEpisode?.title ||
            "PodcastAI",
          text:
            currentEpisode?.description ||
            "Check out my PodcastAI workspace.",
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(
          window.location.href
        );

        setShareMessage("Link copied!");

        setTimeout(() => {
          setShareMessage("");
        }, 2000);
      }
    } catch {}
  };

  const updateCurrent = (
    patch: Partial<Episode>
  ) => {
    if (!currentEpisode) {
      return;
    }

    const updated = {
      ...currentEpisode,
      ...patch,
    };

    setCurrentEpisode(updated);

    setHistory((previous) =>
      previous.map((item) =>
        item.id === updated.id
          ? updated
          : item
      )
    );

    setDirty(true);
  };

  const updateSegment = (
    index: number,
    patch: Partial<Segment>
  ) => {
    if (!currentEpisode) {
      return;
    }

    const segments =
      currentEpisode.segments.map(
        (segment, i) =>
          i === index
            ? {
                ...segment,
                ...patch,
              }
            : segment
      );

    updateCurrent({
      segments,
    });
  };

  const updateTalkingPoint = (
    segmentIndex: number,
    pointIndex: number,
    value: string
  ) => {
    if (!currentEpisode) {
      return;
    }

    const segments =
      currentEpisode.segments.map(
        (segment, index) => {
          if (
            index !== segmentIndex
          ) {
            return segment;
          }

          const talkingPoints = [
            ...segment.talkingPoints,
          ];

          talkingPoints[pointIndex] =
            value;

          return {
            ...segment,
            talkingPoints,
          };
        }
      );

    updateCurrent({
      segments,
    });
  };

  const addTalkingPoint = (
    segmentIndex: number
  ) => {
    if (!currentEpisode) {
      return;
    }

    const segments =
      currentEpisode.segments.map(
        (segment, index) => {
          if (
            index !== segmentIndex
          ) {
            return segment;
          }

          return {
            ...segment,
            talkingPoints: [
              ...segment.talkingPoints,
              "New talking point",
            ],
          };
        }
      );

    updateCurrent({
      segments,
    });
  };

  const deleteTalkingPoint = (
    segmentIndex: number,
    pointIndex: number
  ) => {
    if (!currentEpisode) {
      return;
    }

    const segments =
      currentEpisode.segments.map(
        (segment, index) => {
          if (
            index !== segmentIndex
          ) {
            return segment;
          }

          return {
            ...segment,
            talkingPoints:
              segment.talkingPoints.filter(
                (_, i) =>
                  i !== pointIndex
              ),
          };
        }
      );

    updateCurrent({
      segments,
    });
  };

  const moveSegment = (
    index: number,
    direction: number
  ) => {
    if (!currentEpisode) {
      return;
    }

    const newIndex =
      index + direction;

    if (
      newIndex < 0 ||
      newIndex >=
        currentEpisode.segments.length
    ) {
      return;
    }

    const segments = [
      ...currentEpisode.segments,
    ];

    const temporary =
      segments[index];

    segments[index] =
      segments[newIndex];

    segments[newIndex] =
      temporary;

    updateCurrent({
      segments,
    });
  };

  const deleteSegment = (
    index: number
  ) => {
    if (!currentEpisode) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this segment?"
      );

    if (!confirmed) {
      return;
    }

    updateCurrent({
      segments:
        currentEpisode.segments.filter(
          (_, i) =>
            i !== index
        ),
    });
  };

  const expandSegment = async (
    index: number
  ) => {
    if (!currentEpisode) {
      return;
    }

    try {
      setToolLoading(
        `expand-${index}`
      );

      setExpandedIndex(index);
      setErrorMessage("");

      const response = await fetch(
        "/api/podcast-tools",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "expandSegment",
            episodeId:
              currentEpisode.id,
            segmentIndex: index,
            segment:
              currentEpisode
                .segments[index],
            episodeContext: {
              topic:
                currentEpisode.topic,
              tone:
                currentEpisode.tone,
              duration:
                currentEpisode.duration,
              guest:
                currentEpisode.guest,
            },
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to expand segment."
        );
      }

      if (data.segment) {
        updateSegment(
          index,
          data.segment
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to expand segment."
      );
    } finally {
      setToolLoading("");
      setExpandedIndex(null);
    }
  };

  const regenerateSegmentTone = async (
    index: number,
    newTone: string
  ) => {
    if (!currentEpisode) {
      return;
    }

    try {
      setToolLoading(
        `tone-${index}`
      );

      setErrorMessage("");

      const response = await fetch(
        "/api/podcast-tools",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "regenerateSegmentTone",
            episodeId:
              currentEpisode.id,
            segmentIndex: index,
            tone: newTone,
            segment:
              currentEpisode
                .segments[index],
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to regenerate segment."
        );
      }

      if (data.segment) {
        updateSegment(
          index,
          data.segment
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to regenerate segment."
      );
    } finally {
      setToolLoading("");
    }
  };

  const generateTitles = async () => {
    if (!currentEpisode) {
      return;
    }

    try {
      setToolLoading("titles");
      setErrorMessage("");

      const response = await fetch(
        "/api/podcast-tools",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "generateTitles",
            episodeId:
              currentEpisode.id,
            topic:
              currentEpisode.topic,
            tone:
              currentEpisode.tone,
            description:
              currentEpisode.description,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to generate titles."
        );
      }

      setTitleOptions(
        data.titles || []
      );

      setGeneratedDescription(
        data.description || ""
      );

      setShowTitles(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate titles."
      );
    } finally {
      setToolLoading("");
    }
  };

  const generateSeries = async () => {
    if (!currentEpisode) {
      return;
    }

    try {
      setToolLoading("series");
      setErrorMessage("");

      const response = await fetch(
        "/api/podcast-tools",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action:
              "generateSeries",
            episodeId:
              currentEpisode.id,
            topic:
              currentEpisode.topic,
            tone:
              currentEpisode.tone,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to generate series."
        );
      }

      setSeriesItems(
        data.series || []
      );

      setShowSeries(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate series."
      );
    } finally {
      setToolLoading("");
    }
  };

  const exportTxt = () => {
    if (!currentEpisode) {
      return;
    }

    let text = "";

    text += `${currentEpisode.title}\n`;
    text += `${"=".repeat(
      currentEpisode.title.length
    )}\n\n`;

    text += `Description:\n${currentEpisode.description}\n\n`;

    text += `Topic: ${currentEpisode.topic}\n`;
    text += `Tone: ${currentEpisode.tone}\n`;
    text += `Duration: ${currentEpisode.duration}\n`;

    if (currentEpisode.guest) {
      text += `Guest: ${currentEpisode.guest.name}`;

      if (currentEpisode.guest.role) {
        text += ` — ${currentEpisode.guest.role}`;
      }

      text += "\n";
    }

    text += "\n";

    currentEpisode.segments.forEach(
      (segment, index) => {
        text += `SEGMENT ${
          index + 1
        }: ${segment.title}\n`;

        text += `Time: ${segment.duration}\n\n`;

        text += `Talking Points:\n`;

        segment.talkingPoints.forEach(
          (point) => {
            text += `• ${point}\n`;
          }
        );

        text += `\nHost Notes:\n`;
        text += `${segment.notes}\n\n`;

        text += `${"-".repeat(
          60
        )}\n\n`;
      }
    );

    if (
      currentEpisode.guestQuestions
        ?.length
    ) {
      text += `GUEST QUESTIONS\n\n`;

      currentEpisode.guestQuestions.forEach(
        (question, index) => {
          text += `${
            index + 1
          }. ${question}\n`;
        }
      );
    }

    const blob = new Blob(
      [text],
      {
        type: "text/plain;charset=utf-8",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `${currentEpisode.title
        .replace(
          /[^a-z0-9]+/gi,
          "-"
        )
        .toLowerCase()}.txt`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  };

  const printPdf = () => {
    window.print();
  };

  const filteredHistory = history.filter((episode) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    return [
      episode.title,
      episode.topic,
      episode.description,
      episode.guest?.name,
      episode.guest?.role,
    ].filter(Boolean).some((value) =>
      String(value).toLowerCase().includes(query)
    );
  });

  const cardClass = darkMode
    ? "border-[#444] bg-[#2a2a2a]"
    : "border-gray-200 bg-white";

  const inputClass = darkMode
    ? "border-[#444] bg-[#303030] text-white"
    : "border-gray-200 bg-white text-gray-900";

  const mutedClass = darkMode
    ? "text-gray-400"
    : "text-gray-600";

  return (
    <main
      className={`min-h-screen ${
        darkMode
          ? "bg-[#212121] text-white"
          : "bg-[#f7f7f8] text-[#111827]"
      }`}
    >
      <div className="flex min-h-screen">
        {/* =====================================================
            SIDEBAR
        ===================================================== */}

        <aside
          className={`fixed left-0 top-0 z-50 flex h-screen w-[270px] flex-col border-r transition-transform duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${
            darkMode
              ? "border-[#3a3a3a] bg-[#171717]"
              : "border-gray-200 bg-white"
          }`}
        >
          {/* Brand */}

          <div className="px-5 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${
                  darkMode
                    ? "bg-white text-black"
                    : "bg-black text-white"
                }`}
              >
                🎙️
              </div>

              <div className="min-w-0">
                <h1 className="text-lg font-semibold">
                  PodcastAI
                </h1>

                <p
                  className={`text-xs ${
                    darkMode
                      ? "text-gray-500"
                      : "text-gray-400"
                  }`}
                >
                  AI Podcast Studio
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className={`ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg transition ${
                  darkMode
                    ? "text-gray-400 hover:bg-[#2a2a2a] hover:text-white"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
                aria-label="Close sidebar"
                title="Close sidebar"
              >
                ☰
              </button>
            </div>
          </div>

          {/* New Episode */}

          <div className="px-4">
            <button
              onClick={handleNewEpisode}
              className={`flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                darkMode
                  ? "border-[#444] hover:bg-[#2a2a2a]"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className="text-lg">
                +
              </span>

              New Episode
            </button>
          </div>

          {/* Search */}

          <div className="px-5 pt-6">
            {searchOpen ? (
              <div className="flex items-center gap-2">
                <div
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${
                    darkMode
                      ? "border-[#444] bg-[#252525]"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <span className="text-sm">🔍</span>
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search podcasts..."
                    className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
                      darkMode
                        ? "text-white placeholder:text-gray-500"
                        : "text-gray-900 placeholder:text-gray-400"
                    }`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                  className="shrink-0 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                  darkMode
                    ? "text-gray-300 hover:bg-[#252525]"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                🔍 Search
              </button>
            )}
          </div>

          {/* History */}

          <div className="mt-5 flex-1 overflow-y-auto px-3">
            <p
              className={`px-3 pb-2 text-xs font-medium uppercase tracking-wider ${
                darkMode
                  ? "text-gray-500"
                  : "text-gray-400"
              }`}
            >
              History
            </p>

            {historyLoading ? (
              <div
                className={`px-3 py-3 text-xs ${mutedClass}`}
              >
                Loading history...
              </div>
            ) : history.length === 0 ? (
              <div
                className={`px-3 py-3 text-xs ${mutedClass}`}
              >
                No podcasts yet.
              </div>
            ) : (
              <div className="space-y-1">
                {filteredHistory.map((episode) => (
                  <div
                    key={episode.id}
                    className="relative flex items-center gap-1"
                  >
                    <button
                      onClick={() =>
                        handleHistoryClick(episode)
                      }
                      className={`min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                        currentEpisode?.id ===
                        episode.id
                          ? darkMode
                            ? "bg-[#303030] text-white"
                            : "bg-gray-100 text-gray-900"
                          : darkMode
                          ? "text-gray-300 hover:bg-[#252525]"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="truncate">
                        {episode.title ||
                          episode.topic ||
                          "Untitled Podcast"}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setHistoryMenuId(
                          (current) =>
                            current === episode.id
                              ? null
                              : episode.id
                        );
                      }}
                      disabled={
                        deletingEpisodeId === episode.id
                      }
                      className={`shrink-0 rounded-lg px-2 py-2 text-lg leading-none ${
                        darkMode
                          ? "text-gray-400 hover:bg-[#252525] hover:text-white"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                      aria-label="Podcast actions"
                    >
                      ⋯
                    </button>

                    {historyMenuId === episode.id && (
                      <div
                        className={`absolute right-1 top-11 z-50 w-24 overflow-hidden rounded-lg border shadow-lg ${
                          darkMode
                            ? "border-[#444] bg-[#2a2a2a]"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteEpisode(episode)
                          }
                          disabled={
                            deletingEpisodeId === episode.id
                          }
                          className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-[#333]"
                        >
                          {deletingEpisodeId === episode.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account */}

          <div
            className={`relative border-t p-3 ${
              darkMode
                ? "border-[#3a3a3a]"
                : "border-gray-200"
            }`}
          >
            <button
              onClick={() =>
                setShowAccountMenu(
                  !showAccountMenu
                )
              }
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${
                darkMode
                  ? "hover:bg-[#252525]"
                  : "hover:bg-gray-50"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                  darkMode
                    ? "bg-white text-black"
                    : "bg-black text-white"
                }`}
              >
                {userEmail
                  ? userEmail
                      .charAt(0)
                      .toUpperCase()
                  : "U"}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {userEmail
                    ? userEmail.split(
                        "@"
                      )[0]
                    : "Account"}
                </p>

                <p
                  className={`text-xs ${mutedClass}`}
                >
                  Account
                </p>
              </div>

              <span className="text-gray-400">
                •••
              </span>
            </button>

            {showAccountMenu && (
              <div
                className={`absolute bottom-16 left-3 right-3 z-50 rounded-xl border p-2 shadow-xl ${
                  darkMode
                    ? "border-[#444] bg-[#2a2a2a]"
                    : "border-gray-200 bg-white"
                }`}
              >
                <button
                  onClick={handleShare}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-[#3a3a3a]"
                >
                  Share
                </button>

                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowAccountMenu(false);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-[#3a3a3a]"
                >
                  Settings
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-[#3a3a3a]"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* =====================================================
            MAIN AREA
        ===================================================== */}

        <section
          className={`flex min-h-screen flex-1 flex-col transition-all duration-300 ease-in-out ${
            sidebarOpen ? "ml-[270px]" : "ml-0"
          }`}
        >
          {/* Header */}

          <header
            className={`sticky top-0 z-40 flex h-[64px] items-center justify-between border-b px-7 ${
              darkMode
                ? "border-[#3a3a3a] bg-[#212121]/95"
                : "border-gray-200 bg-white/95"
            } backdrop-blur`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {!sidebarOpen && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg transition ${
                    darkMode
                      ? "text-gray-300 hover:bg-[#303030]"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  aria-label="Open sidebar"
                  title="Open sidebar"
                >
                  ☰
                </button>
              )}

              <p className="truncate text-sm">
                {currentEpisode
                  ? currentEpisode.title
                  : "New Podcast Episode"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {shareMessage && (
                <span className="text-xs text-gray-500">
                  {shareMessage}
                </span>
              )}

              <button
                onClick={handleShare}
                className={`rounded-lg px-3 py-2 text-sm ${
                  darkMode
                    ? "hover:bg-[#303030]"
                    : "hover:bg-gray-100"
                }`}
              >
                Share
              </button>

              <button
                onClick={() =>
                  setShowAccountMenu(
                    !showAccountMenu
                  )
                }
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium ${
                  darkMode
                    ? "bg-[#303030] text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {userEmail
                  ? userEmail
                      .charAt(0)
                      .toUpperCase()
                  : "U"}
              </button>
            </div>
          </header>

          {/* =====================================================
              SETTINGS
          ===================================================== */}

          {showSettings && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-5">
              <div
                className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
                  darkMode
                    ? "border-[#444] bg-[#2a2a2a]"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Settings
                  </h2>

                  <button
                    onClick={() =>
                      setShowSettings(false)
                    }
                    className="text-gray-400"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-6 space-y-5">
                  {/* Account */}

                  <div>
                    <p className="text-sm font-medium">
                      Account
                    </p>

                    <p
                      className={`mt-1 text-sm ${mutedClass}`}
                    >
                      {userEmail}
                    </p>
                  </div>

                  {/* Appearance */}

                  <div>
                    <p className="text-sm font-medium">
                      Appearance
                    </p>

                    <button
                      onClick={() =>
                        setDarkMode(
                          !darkMode
                        )
                      }
                      className={`mt-2 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                        darkMode
                          ? "border-[#444]"
                          : "border-gray-200"
                      }`}
                    >
                      <span>
                        {darkMode
                          ? "Dark mode"
                          : "Light mode"}
                      </span>

                      <span>
                        {darkMode
                          ? "🌙"
                          : "☀️"}
                      </span>
                    </button>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full rounded-xl border border-red-200 px-4 py-3 text-left text-sm text-red-600"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================
              CONTENT
          ===================================================== */}

          <div className="flex-1 overflow-y-auto">
            {currentEpisode ? (
              <div className="mx-auto w-full max-w-5xl px-8 pb-32 pt-10">
                {/* Episode heading */}

                <div className="mb-8">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Podcast Episode
                  </p>

                  {editing ? (
                    <input
                      value={
                        currentEpisode.title
                      }
                      onChange={(e) =>
                        updateCurrent({
                          title:
                            e.target.value,
                        })
                      }
                      className={`mt-3 w-full rounded-xl border px-4 py-3 text-3xl font-bold outline-none ${
                        darkMode
                          ? "border-[#444] bg-[#2a2a2a] text-white"
                          : "border-gray-200 bg-white text-gray-900"
                      }`}
                    />
                  ) : (
                    <h2 className="mt-3 text-4xl font-bold leading-tight">
                      {
                        currentEpisode.title
                      }
                    </h2>
                  )}

                  {editing ? (
                    <textarea
                      value={
                        currentEpisode.description
                      }
                      onChange={(e) =>
                        updateCurrent({
                          description:
                            e.target.value,
                        })
                      }
                      className={`mt-4 min-h-[100px] w-full rounded-xl border p-4 text-sm leading-6 outline-none ${
                        darkMode
                          ? "border-[#444] bg-[#2a2a2a] text-white"
                          : "border-gray-200 bg-white text-gray-900"
                      }`}
                    />
                  ) : (
                    <p
                      className={`mt-4 max-w-4xl text-base leading-7 ${mutedClass}`}
                    >
                      {
                        currentEpisode.description
                      }
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        darkMode
                          ? "bg-[#303030]"
                          : "bg-gray-100"
                      }`}
                    >
                      🎭{" "}
                      {
                        currentEpisode.tone
                      }
                    </span>

                    <span
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        darkMode
                          ? "bg-[#303030]"
                          : "bg-gray-100"
                      }`}
                    >
                      ⏱{" "}
                      {
                        currentEpisode.duration
                      }
                    </span>

                    {currentEpisode.guest && (
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs ${
                          darkMode
                            ? "bg-[#303030]"
                            : "bg-gray-100"
                        }`}
                      >
                        👤{" "}
                        {
                          currentEpisode
                            .guest
                            .name
                        }
                      </span>
                    )}
                  </div>

                  {/* Tools */}

                  <div className="mt-5 flex flex-wrap gap-2 print:hidden">
                    <button
                      onClick={() => {
                        if (
                          editing &&
                          dirty
                        ) {
                          saveEpisode();
                        }

                        setEditing(
                          !editing
                        );
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        darkMode
                          ? "border-[#444] hover:bg-[#303030]"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {editing
                        ? "Done Editing"
                        : "✎ Edit Outline"}
                    </button>

                    {editing && (
                      <button
                        onClick={() =>
                          saveEpisode()
                        }
                        disabled={
                          saving ||
                          !dirty
                        }
                        className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
                      >
                        {saving
                          ? "Saving..."
                          : "Save Changes"}
                      </button>
                    )}

                    <button
                      onClick={
                        generateTitles
                      }
                      disabled={
                        !!toolLoading
                      }
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        darkMode
                          ? "border-[#444] hover:bg-[#303030]"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {toolLoading ===
                      "titles"
                        ? "Generating..."
                        : "✨ Titles & Description"}
                    </button>

                    <button
                      onClick={
                        generateSeries
                      }
                      disabled={
                        !!toolLoading
                      }
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        darkMode
                          ? "border-[#444] hover:bg-[#303030]"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {toolLoading ===
                      "series"
                        ? "Generating..."
                        : "📚 Series Planner"}
                    </button>

                    <button
                      onClick={exportTxt}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        darkMode
                          ? "border-[#444] hover:bg-[#303030]"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      ↓ TXT
                    </button>

                    <button
                      onClick={printPdf}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        darkMode
                          ? "border-[#444] hover:bg-[#303030]"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      🖨 PDF
                    </button>
                  </div>
                </div>

                {/* =================================================
                    SEGMENTS
                ================================================= */}

                <div className="space-y-5">
                  {currentEpisode.segments.map(
                    (
                      segment,
                      index
                    ) => (
                      <div
                        key={`${currentEpisode.id}-${index}`}
                        className={`rounded-2xl border p-6 shadow-sm ${cardClass}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-400">
                              Segment{" "}
                              {index + 1}
                            </p>

                            {editing ? (
                              <input
                                value={
                                  segment.title
                                }
                                onChange={(
                                  e
                                ) =>
                                  updateSegment(
                                    index,
                                    {
                                      title:
                                        e
                                          .target
                                          .value,
                                    }
                                  )
                                }
                                className={`mt-2 w-full rounded-lg border px-3 py-2 text-xl font-semibold outline-none ${inputClass}`}
                              />
                            ) : (
                              <h3 className="mt-2 text-xl font-semibold">
                                {
                                  segment.title
                                }
                              </h3>
                            )}
                          </div>

                          {editing ? (
                            <input
                              value={
                                segment.duration
                              }
                              onChange={(
                                e
                              ) =>
                                updateSegment(
                                  index,
                                  {
                                    duration:
                                      e
                                        .target
                                        .value,
                                  }
                                )
                              }
                              className={`w-24 rounded-lg border px-3 py-2 text-right text-xs outline-none ${inputClass}`}
                            />
                          ) : (
                            <span
                              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                                darkMode
                                  ? "bg-[#303030]"
                                  : "bg-gray-100"
                              }`}
                            >
                              {
                                segment.duration
                              }
                            </span>
                          )}
                        </div>

                        {/* Talking Points */}

                        <div className="mt-6">
                          <h4 className="text-sm font-medium">
                            Talking Points
                          </h4>

                          <div className="mt-3 space-y-3">
                            {segment.talkingPoints.map(
                              (
                                point,
                                pointIndex
                              ) => (
                                <div
                                  key={
                                    pointIndex
                                  }
                                  className="flex gap-3"
                                >
                                  <span className="pt-2 text-gray-400">
                                    •
                                  </span>

                                  {editing ? (
                                    <>
                                      <input
                                        value={
                                          point
                                        }
                                        onChange={(
                                          e
                                        ) =>
                                          updateTalkingPoint(
                                            index,
                                            pointIndex,
                                            e
                                              .target
                                              .value
                                          )
                                        }
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none ${inputClass}`}
                                      />

                                      <button
                                        onClick={() =>
                                          deleteTalkingPoint(
                                            index,
                                            pointIndex
                                          )
                                        }
                                        className="px-2 text-xs text-red-500"
                                      >
                                        ✕
                                      </button>
                                    </>
                                  ) : (
                                    <span
                                      className={`text-sm leading-6 ${mutedClass}`}
                                    >
                                      {
                                        point
                                      }
                                    </span>
                                  )}
                                </div>
                              )
                            )}
                          </div>

                          {editing && (
                            <button
                              onClick={() =>
                                addTalkingPoint(
                                  index
                                )
                              }
                              className="mt-3 rounded-lg border px-3 py-2 text-xs dark:border-[#444]"
                            >
                              + Add talking point
                            </button>
                          )}
                        </div>

                        {/* Host Notes */}

                        <div className="mt-6">
                          <h4 className="text-sm font-medium">
                            Host Notes
                          </h4>

                          {editing ? (
                            <textarea
                              value={
                                segment.notes
                              }
                              onChange={(
                                e
                              ) =>
                                updateSegment(
                                  index,
                                  {
                                    notes:
                                      e
                                        .target
                                        .value,
                                  }
                                )
                              }
                              className={`mt-3 min-h-[120px] w-full rounded-xl border p-3 text-sm leading-6 outline-none ${inputClass}`}
                            />
                          ) : (
                            <p
                              className={`mt-3 text-sm leading-7 ${mutedClass}`}
                            >
                              {
                                segment.notes
                              }
                            </p>
                          )}
                        </div>

                        {/* Segment tools */}

                        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
                          <button
                            onClick={() =>
                              expandSegment(
                                index
                              )
                            }
                            disabled={
                              !!toolLoading
                            }
                            className={`rounded-lg border px-3 py-2 text-xs ${
                              darkMode
                                ? "border-[#444] hover:bg-[#303030]"
                                : "border-gray-200 hover:bg-gray-50"
                            } disabled:opacity-50`}
                          >
                            {expandedIndex ===
                            index
                              ? "Expanding..."
                              : "✦ Expand this segment"}
                          </button>

                          <select
                            onChange={(e) => {
                              if (
                                e.target
                                  .value
                              ) {
                                regenerateSegmentTone(
                                  index,
                                  e.target
                                    .value
                                );
                              }

                              e.target.value =
                                "";
                            }}
                            defaultValue=""
                            disabled={
                              !!toolLoading
                            }
                            className={`rounded-lg border px-3 py-2 text-xs outline-none ${inputClass}`}
                          >
                            <option value="">
                              Tone preview…
                            </option>

                            <option value="Casual">
                              Casual
                            </option>

                            <option value="Professional">
                              Professional
                            </option>

                            <option value="Comedic">
                              Comedic
                            </option>

                            <option value="Investigative">
                              Investigative
                            </option>
                          </select>

                          {editing && (
                            <>
                              <button
                                onClick={() =>
                                  moveSegment(
                                    index,
                                    -1
                                  )
                                }
                                disabled={
                                  index === 0
                                }
                                className="rounded-lg border px-3 py-2 text-xs disabled:opacity-30 dark:border-[#444]"
                              >
                                ↑
                              </button>

                              <button
                                onClick={() =>
                                  moveSegment(
                                    index,
                                    1
                                  )
                                }
                                disabled={
                                  index ===
                                  currentEpisode
                                    .segments
                                    .length -
                                    1
                                }
                                className="rounded-lg border px-3 py-2 text-xs disabled:opacity-30 dark:border-[#444]"
                              >
                                ↓
                              </button>

                              <button
                                onClick={() =>
                                  deleteSegment(
                                    index
                                  )
                                }
                                className="rounded-lg border px-3 py-2 text-xs text-red-600 dark:border-[#444]"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* =================================================
                    GUEST QUESTIONS
                ================================================= */}

                {currentEpisode
                  .guestQuestions
                  ?.length > 0 && (
                  <div
                    className={`mt-5 rounded-2xl border p-6 ${cardClass}`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">
                        Guest Questions
                      </h3>

                      {editing && (
                        <span className="text-xs text-gray-400">
                          Editable
                        </span>
                      )}
                    </div>

                    <ol className="mt-4 space-y-3 text-sm">
                      {currentEpisode.guestQuestions.map(
                        (
                          question,
                          index
                        ) => (
                          <li
                            key={index}
                            className="flex gap-3"
                          >
                            <span className="font-medium">
                              {index + 1}.
                            </span>

                            {editing ? (
                              <input
                                value={
                                  question
                                }
                                onChange={(
                                  e
                                ) => {
                                  const questions =
                                    [
                                      ...currentEpisode.guestQuestions,
                                    ];

                                  questions[
                                    index
                                  ] =
                                    e.target.value;

                                  updateCurrent({
                                    guestQuestions:
                                      questions,
                                  });
                                }}
                                className={`flex-1 rounded-lg border px-3 py-2 outline-none ${inputClass}`}
                              />
                            ) : (
                              <span
                                className={
                                  mutedClass
                                }
                              >
                                {
                                  question
                                }
                              </span>
                            )}
                          </li>
                        )
                      )}
                    </ol>

                    {editing && (
                      <button
                        onClick={() =>
                          updateCurrent({
                            guestQuestions: [
                              ...currentEpisode.guestQuestions,
                              "New guest question",
                            ],
                          })
                        }
                        className="mt-4 rounded-lg border px-3 py-2 text-xs dark:border-[#444]"
                      >
                        + Add question
                      </button>
                    )}
                  </div>
                )}

                {/* =================================================
                    CONVERSATION
                ================================================= */}

                {conversation.length >
                  0 && (
                  <div className="mt-6 space-y-4 print:hidden">
                    {conversation.map(
                      (
                        message,
                        index
                      ) => (
                        <div
                          key={index}
                          className={`flex ${
                            message.role ===
                            "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                              message.role ===
                              "user"
                                ? darkMode
                                  ? "bg-white text-black"
                                  : "bg-black text-white"
                                : darkMode
                                ? "bg-[#303030] text-gray-200"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {
                              message.content
                            }
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* =================================================
                 WELCOME SCREEN
              ================================================= */

              <div className="flex min-h-[calc(100vh-64px)] flex-1 flex-col items-center justify-center px-6">
                <div
                  className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-lg ${
                    darkMode
                      ? "bg-white text-black"
                      : "bg-black text-white"
                  }`}
                >
                  🎙️
                </div>

                <h2 className="text-center text-3xl font-semibold">
                  What will you podcast
                  about?
                </h2>

                <p
                  className={`mt-3 text-center text-sm ${mutedClass}`}
                >
                  Turn your idea into a
                  structured,
                  recording-ready
                  episode.
                </p>
              </div>
            )}

            {/* =====================================================
                TITLE MODAL
            ===================================================== */}

            {showTitles &&
              currentEpisode && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-5 print:hidden">
                  <div
                    className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${
                      darkMode
                        ? "border-[#444] bg-[#2a2a2a]"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">
                        Title Options
                      </h3>

                      <button
                        onClick={() =>
                          setShowTitles(
                            false
                          )
                        }
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      {titleOptions.map(
                        (
                          title,
                          index
                        ) => (
                          <button
                            key={index}
                            onClick={() => {
                              updateCurrent({
                                title,
                              });

                              setShowTitles(
                                false
                              );
                            }}
                            className="w-full rounded-xl border p-3 text-left text-sm hover:bg-gray-100 dark:border-[#444] dark:hover:bg-[#333]"
                          >
                            {title}
                          </button>
                        )
                      )}
                    </div>

                    {generatedDescription && (
                      <div className="mt-5 border-t pt-4 dark:border-[#444]">
                        <p className="text-xs text-gray-400">
                          Generated show
                          notes
                        </p>

                        <p className="mt-2 text-sm leading-6">
                          {
                            generatedDescription
                          }
                        </p>

                        <button
                          onClick={() => {
                            updateCurrent({
                              description:
                                generatedDescription,
                            });

                            setShowTitles(
                              false
                            );
                          }}
                          className="mt-3 rounded-lg bg-black px-3 py-2 text-xs text-white dark:bg-white dark:text-black"
                        >
                          Use Description
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* =====================================================
                SERIES MODAL
            ===================================================== */}

            {showSeries && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-5 print:hidden">
                <div
                  className={`max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-6 shadow-2xl ${
                    darkMode
                      ? "border-[#444] bg-[#2a2a2a]"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      6-Episode Series
                      Planner
                    </h3>

                    <button
                      onClick={() =>
                        setShowSeries(
                          false
                        )
                      }
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {seriesItems.map(
                      (item) => (
                        <div
                          key={
                            item.number
                          }
                          className={`rounded-xl border p-4 ${cardClass}`}
                        >
                          <p className="text-xs text-gray-400">
                            Episode{" "}
                            {
                              item.number
                            }
                          </p>

                          <h4 className="mt-1 font-semibold">
                            {item.title}
                          </h4>

                          <p className="mt-1 text-sm">
                            {item.topic}
                          </p>

                          <p
                            className={`mt-2 text-xs leading-5 ${mutedClass}`}
                          >
                            {item.angle}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* =====================================================
                INPUT
            ===================================================== */}

            <div
              className={`mx-auto w-full max-w-3xl px-4 ${
                currentEpisode
                  ? "sticky bottom-0 pb-4 pt-2"
                  : "pb-6 pt-3"
              }`}
            >
              {errorMessage && (
                <div
                  className={`mb-2 rounded-xl border px-3 py-2 text-xs ${
                    darkMode
                      ? "border-red-900 bg-red-950/40 text-red-300"
                      : "border-red-200 bg-red-50 text-red-600"
                  }`}
                >
                  {errorMessage}
                </div>
              )}

              <div
                className={`rounded-2xl border shadow-lg ${
                  darkMode
                    ? "border-[#444] bg-[#2f2f2f]"
                    : "border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-end gap-2 px-3 py-2">
                  <textarea
                    value={topic}
                    onChange={(e) =>
                      setTopic(
                        e.target.value
                      )
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key ===
                          "Enter" &&
                        !e.shiftKey
                      ) {
                        e.preventDefault();

                        if (
                          topic.trim() &&
                          !generating
                        ) {
                          handleGenerate();
                        }
                      }
                    }}
                    placeholder={
                      currentEpisode
                        ? "Continue this podcast..."
                        : "Tell me your podcast idea..."
                    }
                    rows={1}
                    className={`max-h-28 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none ${
                      darkMode
                        ? "text-white placeholder:text-gray-500"
                        : "text-gray-900 placeholder:text-gray-400"
                    }`}
                  />

                  <button
                    onClick={
                      handleGenerate
                    }
                    disabled={
                      !topic.trim() ||
                      generating
                    }
                    className={`mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      darkMode
                        ? "bg-white text-black"
                        : "bg-black text-white"
                    } disabled:opacity-30`}
                  >
                    {generating
                      ? "…"
                      : "↑"}
                  </button>
                </div>

                {/* New podcast options only */}

                {!currentEpisode && (
                  <div
                    className={`flex items-center gap-1 border-t px-3 py-1.5 ${
                      darkMode
                        ? "border-[#444]"
                        : "border-gray-200"
                    }`}
                  >
                    {/* Tone */}

                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMenu(
                            activeMenu ===
                              "tone"
                              ? null
                              : "tone"
                          )
                        }
                        className="rounded-lg px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300"
                      >
                        🎭 {tone}
                      </button>

                      {activeMenu ===
                        "tone" && (
                        <div
                          className={`absolute bottom-10 left-0 z-40 w-44 rounded-xl border p-2 shadow-xl ${
                            darkMode
                              ? "border-[#444] bg-[#2a2a2a]"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          {[
                            "Casual",
                            "Professional",
                            "Comedic",
                            "Investigative",
                          ].map(
                            (
                              option
                            ) => (
                              <button
                                key={
                                  option
                                }
                                onClick={() => {
                                  setTone(
                                    option
                                  );

                                  setActiveMenu(
                                    null
                                  );
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-[#404040]"
                              >
                                {
                                  option
                                }
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Duration */}

                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMenu(
                            activeMenu ===
                              "duration"
                              ? null
                              : "duration"
                          )
                        }
                        className="rounded-lg px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300"
                      >
                        ⏱{" "}
                        {
                          duration
                        }
                      </button>

                      {activeMenu ===
                        "duration" && (
                        <div
                          className={`absolute bottom-10 left-0 z-40 w-40 rounded-xl border p-2 shadow-xl ${
                            darkMode
                              ? "border-[#444] bg-[#2a2a2a]"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          {[
                            "15 minutes",
                            "30 minutes",
                            "60 minutes",
                          ].map(
                            (
                              option
                            ) => (
                              <button
                                key={
                                  option
                                }
                                onClick={() => {
                                  setDuration(
                                    option
                                  );

                                  setActiveMenu(
                                    null
                                  );
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-[#404040]"
                              >
                                {
                                  option
                                }
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Guest */}

                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMenu(
                            activeMenu ===
                              "guest"
                              ? null
                              : "guest"
                          )
                        }
                        className="rounded-lg px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300"
                      >
                        👤 Guest
                      </button>

                      {activeMenu ===
                        "guest" && (
                        <div
                          className={`absolute bottom-10 left-0 z-40 w-64 rounded-xl border p-3 shadow-xl ${
                            darkMode
                              ? "border-[#444] bg-[#2a2a2a]"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <p className="mb-3 text-xs font-medium">
                            Guest details
                          </p>

                          <input
                            value={
                              guestName
                            }
                            onChange={(
                              e
                            ) =>
                              setGuestName(
                                e.target
                                  .value
                              )
                            }
                            placeholder="Guest name"
                            className={`mb-2 w-full rounded-lg border px-3 py-2 text-xs outline-none ${inputClass}`}
                          />

                          <input
                            value={
                              guestRole
                            }
                            onChange={(
                              e
                            ) =>
                              setGuestRole(
                                e.target
                                  .value
                              )
                            }
                            placeholder="Guest role"
                            className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${inputClass}`}
                          />

                          <button
                            onClick={() =>
                              setActiveMenu(
                                null
                              )
                            }
                            className="mt-3 w-full rounded-lg bg-black py-2 text-xs font-medium text-white dark:bg-white dark:text-black"
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-2 text-center text-[11px] text-gray-400">
                {currentEpisode
                  ? "Continue this podcast — PodcastAI stays focused on this episode."
                  : "PodcastAI can generate outlines, talking points, guest questions and scripts."}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* =====================================================
          PRINT / PDF STYLES
      ===================================================== */}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }

          aside,
          header,
          textarea,
          button,
          select,
          .print\\:hidden {
            display: none !important;
          }

          main,
          section {
            display: block !important;
            width: 100% !important;
            min-height: auto !important;
            height: auto !important;
            background: white !important;
            color: black !important;
          }

          section > div {
            overflow: visible !important;
          }

          .rounded-2xl {
            break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}