import type { Brief, Candidate, DecisionMaker } from "@/lib/types";

export type StageId =
  | "decision_makers"
  | "sourcing"
  | "qualification"
  | "brief";

export const STAGES: { id: StageId; label: string; short: string }[] = [
  { id: "decision_makers", label: "Decision makers", short: "Stage 1" },
  { id: "sourcing", label: "Sourcing", short: "Stage 2" },
  { id: "qualification", label: "Qualification", short: "Stage 3" },
  { id: "brief", label: "Brief", short: "Stage 4" },
];

export type PipelineEvent =
  | {
      type: "pipeline_start";
      company: { id: string; name: string };
    }
  | { type: "stage_start"; stage: StageId }
  | { type: "log"; stage: StageId; message: string }
  | {
      type: "cache";
      stage: StageId;
      hit: boolean;
      detail: string;
    }
  | {
      type: "stage_done";
      stage: StageId;
      summary: string;
    }
  | { type: "stage_skipped"; stage: StageId; reason: string }
  | { type: "stage_error"; stage: StageId; error: string }
  | {
      type: "result";
      decision_makers: DecisionMaker[];
      candidates: Candidate[];
      briefs: Brief[];
    }
  | { type: "pipeline_done" }
  | { type: "pipeline_error"; error: string };

export type PipelineEmitter = (event: PipelineEvent) => void;
