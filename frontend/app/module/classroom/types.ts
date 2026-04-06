export type ClassroomAccessMode = "private" | "community" | "open";

export type ClassroomStatus = "active" | "archived";

export type ClassroomInviteType = "link" | "email" | "qr";

export type ClassroomRow = {
  id: string;
  owner_profile_id: string;
  title: string;
  description: string | null;
  access_mode: ClassroomAccessMode;
  status: ClassroomStatus;
  created_at: string;
  updated_at: string;
};

export type ClassroomBasicsInput = {
  title: string;
  description: string;
  access_mode: ClassroomAccessMode;
};

export type ClassroomInviteRow = {
  id: string;
  classroom_id: string;
  token: string;
  invite_type: ClassroomInviteType;
  email_target: string | null;
  active: boolean;
  created_at: string;
};

export type ClassroomJourneyCatalogRow = {
  journey_id: string;
  journey_slug: string | null;
  journey_cover_url: string | null;
  translation_title: string | null;
  translation_description: string | null;
  translation_lang2: string | null;
  events_count: number | null;
  year_from_min?: number | null;
  year_to_max?: number | null;
  is_favourite?: boolean | null;
  avg_rating?: number | null;
  ratings_count?: number | null;
  approved_at: string | null;
  visibility: string | null;
};

export type ClassroomJourneyAssignmentRow = {
  id: string;
  classroom_id: string;
  group_event_id: string;
  sort_order: number;
  is_required: boolean;
  assigned_at: string;
  journey: ClassroomJourneyCatalogRow | null;
};

export type ClassroomJourneyProgressRow = {
  id: string;
  classroom_id: string;
  group_event_id: string;
  profile_id: string;
  progress_percentage: number;
  is_completed: boolean;
  completed_at: string | null;
  last_event_id: string | null;
};

export type ClassroomQuizAttemptRow = {
  id: string;
  classroom_id: string;
  group_event_id: string;
  profile_id: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
};

export type ClassroomQuizSummary = {
  attemptsCount: number;
  latestScore: number | null;
  latestPct: number | null;
  bestScore: number | null;
  bestPct: number | null;
  averageScore: number | null;
  averagePct: number | null;
  totalQuestions: number | null;
  latestAttempt: ClassroomQuizAttemptRow | null;
};

export type ClassroomJourneyRankingRow = {
  classroom_id: string;
  group_event_id: string;
  profile_id: string;
  display_name: string;
  attempts_count: number;
  latest_score: number | null;
  best_score: number | null;
  latest_completed_at: string | null;
  best_completed_at: string | null;
  ranking_position: number;
};

export type ClassroomInviteLanding = {
  invite_id: string;
  classroom_id: string;
  invite_type: ClassroomInviteType;
  email_target: string | null;
  created_at: string;
  title: string;
  description: string | null;
  access_mode: ClassroomAccessMode;
  status: ClassroomStatus;
  owner_profile_id: string;
};

export type ClassroomJoinResult = {
  classroom_id: string;
  membership_id: string | null;
  joined: boolean;
  already_member: boolean;
  is_owner: boolean;
};
