export type ProviderId = 'charts' | 'decades' | 'party' | 'lastfm' | 'spotify' | 'youtube';

export type SourceGroup = 'now' | 'decades' | 'history';

/** Where a round's 15 second window opens. */
export type StartMode = 'opening' | 'hook';

export const HISTORY_PROVIDERS = ['lastfm', 'spotify', 'youtube'] as const;

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  previewUrl: string;
  previewFrom: 'deezer' | 'itunes';
  link?: string;
  /** In a party, whose listening this song came from. */
  contributor?: string;
  /** Deezer's popularity score, up to about a million. Drives difficulty. */
  rank?: number;
}

export interface ResolvedTracks {
  tracks: Track[];
  dropped: number;
}

export interface Pool {
  source: ProviderId;
  variant: string;
  label: string;
  tracks: Track[];
  /** Tracks the provider returned that had no playable preview. */
  dropped: number;
}

export interface ConnectionState {
  connected: boolean;
  configured: boolean;
  /** True for the services that can only be linked to an account. */
  needsAccount: boolean;
  account?: string;
  detail?: string;
}

export type Connections = Record<ProviderId, ConnectionState>;

export interface VariantOption {
  id: string;
  label: string;
}

export interface Account {
  id: number;
  username: string;
}

export interface Stats {
  played: number;
  won: number;
  streak: number;
  bestStreak: number;
  byStage: number[];
}

export type Rating = 1 | -1;

export interface PartyMember {
  username: string;
  source: ProviderId | null;
  isHost: boolean;
}

export interface Party {
  code: string;
  name: string;
  members: PartyMember[];
  youAreHost: boolean;
}

export interface Me {
  account: Account | null;
  connections: Connections;
  variants: Record<ProviderId, VariantOption[]>;
  /** Server-side stats, present only while signed in. */
  stats: Stats | null;
  ratings: Record<string, Rating>;
  party: Party | null;
  /** True when this server asks for an invite code before making an account. */
  invitesRequired: boolean;
}

export const STAGE_DURATIONS = [0.1, 0.5, 2, 8, 15] as const;
export const MAX_STAGE = STAGE_DURATIONS.length;
