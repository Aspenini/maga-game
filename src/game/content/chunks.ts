import { SeededRandom } from "../simulation/prng";
import type { GeneratedChunk, Phase, SpawnSpec } from "../simulation/types";

interface ChunkTemplate {
  id: string;
  phases: readonly Phase[];
  minDifficulty: number;
  length: number;
  spawns: SpawnSpec[];
}

const allPhases: readonly Phase[] = ["desert", "archive", "launch"];

const templates: readonly ChunkTemplate[] = [
  {
    id: "signal-ramp",
    phases: allPhases,
    minDifficulty: 0,
    length: 620,
    spawns: [
      { kind: "token", x: 80, lane: "low" },
      { kind: "token", x: 145, lane: "mid" },
      { kind: "token", x: 210, lane: "high" },
      { kind: "token", x: 275, lane: "mid" },
      { kind: "file", x: 340, lane: "low" },
    ],
  },
  {
    id: "barrier-hop",
    phases: allPhases,
    minDifficulty: 0,
    length: 650,
    spawns: [
      { kind: "token", x: 70, lane: "low" },
      { kind: "barrier", x: 250, lane: "ground" },
      { kind: "token", x: 250, lane: "high" },
      { kind: "file", x: 395, lane: "mid" },
    ],
  },
  {
    id: "crate-arc",
    phases: ["archive", "launch"],
    minDifficulty: 0.16,
    length: 700,
    spawns: [
      { kind: "crate", x: 225, lane: "ground" },
      { kind: "token", x: 165, lane: "mid" },
      { kind: "token", x: 225, lane: "high" },
      { kind: "token", x: 290, lane: "mid" },
      { kind: "file", x: 430, lane: "low" },
    ],
  },
  {
    id: "agent-briefing",
    phases: allPhases,
    minDifficulty: 0.12,
    length: 760,
    spawns: [
      { kind: "agent", x: 245, lane: "ground" },
      { kind: "token", x: 245, lane: "high" },
      { kind: "token", x: 400, lane: "low" },
      { kind: "file", x: 500, lane: "mid" },
    ],
  },
  {
    id: "drone-scan",
    phases: ["desert", "launch"],
    minDifficulty: 0.28,
    length: 760,
    spawns: [
      { kind: "drone", x: 270, lane: "mid" },
      { kind: "token", x: 110, lane: "low" },
      { kind: "token", x: 190, lane: "low" },
      { kind: "signal", x: 430, lane: "high" },
    ],
  },
  {
    id: "double-redaction",
    phases: ["archive"],
    minDifficulty: 0.45,
    length: 850,
    spawns: [
      { kind: "crate", x: 215, lane: "ground" },
      { kind: "file", x: 215, lane: "high" },
      { kind: "barrier", x: 525, lane: "ground" },
      { kind: "signal", x: 525, lane: "high" },
    ],
  },
  {
    id: "launch-window",
    phases: ["launch"],
    minDifficulty: 0.55,
    length: 900,
    spawns: [
      { kind: "agent", x: 220, lane: "ground" },
      { kind: "drone", x: 510, lane: "mid" },
      { kind: "token", x: 360, lane: "low" },
      { kind: "signal", x: 665, lane: "high" },
    ],
  },
];

export class ChunkGenerator {
  private random: SeededRandom;
  private lastId = "";
  private generatedCount = 0;

  constructor(seed: number) {
    this.random = new SeededRandom(seed);
  }

  next(phase: Phase, difficulty: number): GeneratedChunk {
    if (this.generatedCount === 0) {
      const opening = templates.find((template) => template.id === "signal-ramp")!;
      this.generatedCount += 1;
      this.lastId = opening.id;
      return {
        id: opening.id,
        length: opening.length,
        spawns: opening.spawns.map((spawn) => ({ ...spawn })),
      };
    }
    const eligible = templates.filter(
      (template) =>
        template.phases.includes(phase) &&
        template.minDifficulty <= difficulty &&
        (template.id !== this.lastId || templates.length === 1),
    );
    const template = this.random.pick(eligible.length > 0 ? eligible : templates);
    this.generatedCount += 1;
    this.lastId = template.id;
    const collectibleOffset = this.random.int(-12, 12);
    return {
      id: template.id,
      length: template.length,
      spawns: template.spawns.map((spawn) => ({
        ...spawn,
        x:
          spawn.kind === "token" || spawn.kind === "file" || spawn.kind === "signal"
            ? spawn.x + collectibleOffset
            : spawn.x,
      })),
    };
  }
}

export function minimumHazardGap(chunk: GeneratedChunk): number {
  const hazards = chunk.spawns
    .filter((spawn) => ["barrier", "crate", "agent", "drone"].includes(spawn.kind))
    .map((spawn) => spawn.x)
    .sort((a, b) => a - b);
  if (hazards.length < 2) return chunk.length;
  return Math.min(...hazards.slice(1).map((value, index) => value - hazards[index]!));
}
