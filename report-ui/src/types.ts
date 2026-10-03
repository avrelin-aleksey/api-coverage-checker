/** Created by Avrelin Aleksei. Copyright 2026 Avrelin Aleksei. */
export type ReportFile = {
  generated_at: string;
  created_by?: string;
  catalog: Array<{ key: string; title: string }>;
  boards: Board[];
};

export type Section = {
  name: string;
  description?: string;
};

export type Board = {
  key: string;
  title: string;
  score: number;
  hit_count: number;
  miss_count: number;
  skipped_count: number;
  history?: Array<{ at: string; score: number }>;
  sections?: Section[];
  operations: OperationRow[];
};

export type OperationRow = {
  route: string;
  verb: string;
  summary?: string;
  score: number;
  calls: number;
  skipped?: boolean;
  skip_note?: string;
  skip_note_ru?: string;
  restore_yaml?: string;
  tags?: string[];
  request: string;
  statuses: Array<{ label: string; calls: number; seen: string; body: string }>;
  query: Array<{ name: string; seen: string }>;
  history?: Array<{ at: string; score: number }>;
};
