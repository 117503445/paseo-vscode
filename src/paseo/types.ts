import type { AgentProviderDefinition } from "@getpaseo/server";

export type DaemonConnectionStatus =
  | "no-workspace"
  | "idle"
  | "connecting"
  | "starting"
  | "connected"
  | "error";

export interface AgentView {
  id: string;
  title: string;
  provider: string;
  cwd: string;
  status: string;
  updatedAt: string;
  lastError: string | null;
}

export interface ProviderView {
  provider: string;
  label: string;
  status: string;
  error: string | null;
  models: SelectOptionView[];
  modes: SelectOptionView[];
  defaultModeId: string | null;
}

export interface SelectOptionView {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface TimelineItemView {
  id: string;
  type: "user" | "assistant" | "reasoning" | "tool" | "todo" | "error" | "system";
  text: string;
  status?: string;
  timestamp?: string;
}

export interface PaseoViewState {
  workspacePath: string | null;
  daemon: {
    status: DaemonConnectionStatus;
    host: string | null;
    message: string | null;
    logPath: string | null;
  };
  agents: AgentView[];
  providers: ProviderView[];
  selectedAgentId: string | null;
  timeline: TimelineItemView[];
  busy: boolean;
  error: string | null;
}

export interface CreateAgentInput {
  provider: string;
  model?: string;
  modeId?: string;
  prompt: string;
}

export interface SendMessageInput {
  agentId: string;
  text: string;
}

export interface ExtensionToWebviewMessage {
  type: "state";
  state: PaseoViewState;
}

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "reconnect" }
  | { type: "selectAgent"; agentId: string }
  | { type: "createAgent"; input: CreateAgentInput }
  | { type: "sendMessage"; input: SendMessageInput };

export type PaseoServerModule = typeof import("@getpaseo/server");

export type ProviderDefinitionView = Pick<AgentProviderDefinition, "id" | "label">;
