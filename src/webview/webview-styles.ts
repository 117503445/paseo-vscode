/** Paseo Webview 内联样式。 */
export const WEBVIEW_STYLES = /* css */ `
  :root {
    color-scheme: light dark;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    --paseo-border: var(--vscode-panel-border, var(--vscode-input-border, rgba(128, 128, 128, 0.24)));
    --paseo-focus: var(--vscode-focusBorder, var(--vscode-textLink-foreground));
    --paseo-hover: var(
      --vscode-list-hoverBackground,
      color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-foreground) 12%)
    );
    --paseo-subtle-bg: color-mix(in srgb, var(--vscode-sideBar-background) 92%, var(--vscode-foreground) 8%);
    --paseo-panel-bg: color-mix(in srgb, var(--vscode-input-background) 96%, var(--vscode-foreground) 4%);
    --paseo-raised-bg: color-mix(in srgb, var(--vscode-sideBar-background) 86%, var(--vscode-foreground) 14%);
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  html,
  body {
    height: 100%;
  }
  body {
    margin: 0;
    overflow: hidden;
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
  }
  button,
  input,
  select,
  textarea {
    font: inherit;
  }
  button {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--vscode-button-border, transparent);
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border-radius: 7px;
    padding: 4px 9px;
    cursor: pointer;
    line-height: 1.25;
    white-space: nowrap;
  }
  button:not(:disabled):hover {
    border-color: var(--paseo-border);
    background: var(--vscode-toolbar-hoverBackground, var(--paseo-hover));
  }
  button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  summary:focus-visible {
    outline: 1px solid var(--paseo-focus);
    outline-offset: 2px;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--vscode-input-border, transparent);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border-radius: 7px;
  }
  input,
  select {
    height: 28px;
    padding: 3px 7px;
  }
  select {
    color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
  }
  textarea {
    min-height: 76px;
    resize: vertical;
    padding: 8px;
    line-height: 1.45;
  }
  .app {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    min-height: 360px;
  }
  .topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px 8px;
    align-items: center;
    padding: 8px 10px 7px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--paseo-border));
    background: color-mix(in srgb, var(--vscode-sideBar-background) 96%, var(--vscode-foreground) 4%);
  }
  .thread-topbar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .title {
    min-width: 0;
    overflow: hidden;
    color: var(--vscode-foreground);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title-button {
    min-width: 0;
    overflow: hidden;
    border: 0;
    color: var(--vscode-foreground);
    background: transparent;
    font-weight: 600;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title-button:hover {
    background: var(--vscode-toolbar-hoverBackground, var(--paseo-hover));
  }
  .topbar-tools,
  .top-actions {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
  }
  .topbar-tools {
    grid-column: 2;
  }
  .icon-button {
    flex: 0 0 auto;
    color: var(--vscode-foreground);
    background: transparent;
    border-color: transparent;
  }
  .icon-button {
    width: 28px;
    min-width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 7px;
    line-height: 1;
  }
  .paseo-icon {
    display: block;
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    pointer-events: none;
  }
  .paseo-icon path {
    vector-effect: non-scaling-stroke;
  }
  .status-line {
    grid-column: 1 / -1;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.35;
  }
  .status-line .muted {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-pill {
    flex: 0 0 auto;
    color: var(--vscode-textLink-foreground);
    font-weight: 600;
  }
  .topbar > .muted,
  .topbar > .error {
    grid-column: 1 / -1;
    font-size: 12px;
    line-height: 1.4;
  }
  .muted,
  .empty {
    color: var(--vscode-descriptionForeground);
    overflow-wrap: anywhere;
  }
  .task-view {
    display: grid;
    grid-template-rows: 1fr;
    min-height: 0;
  }
  .task-list,
  .timeline {
    min-height: 0;
    overflow: auto;
  }
  .task-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
  }
  .task-item {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    min-height: 50px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--vscode-foreground);
    background: transparent;
    padding: 8px;
    text-align: left;
  }
  .task-item:hover {
    border-color: var(--paseo-border);
    background: var(--paseo-hover);
  }
  .task-main {
    min-width: 0;
  }
  .task-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .task-side {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
  }
  .task-side .muted {
    font-size: 11px;
    white-space: nowrap;
  }
  .task-side .icon-button {
    width: 24px;
    min-width: 24px;
    height: 24px;
    color: var(--vscode-descriptionForeground);
  }
  .thread-view {
    display: grid;
    min-height: 0;
  }
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 10px 14px;
  }
  .message {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }
  .user-message {
    align-items: flex-end;
  }
  .assistant-message {
    align-items: stretch;
  }
  .message-label {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    line-height: 1.35;
  }
  .bubble {
    max-width: min(88%, 420px);
    overflow-wrap: anywhere;
    border: 1px solid var(--paseo-border);
    border-radius: 12px;
    background: var(--paseo-subtle-bg);
    line-height: 1.45;
    padding: 8px 10px;
    white-space: pre-wrap;
  }
  .message-text {
    overflow-wrap: anywhere;
    line-height: 1.55;
    padding: 0 2px;
  }
  .markdown-body p {
    margin: 0 0 8px;
  }
  .markdown-body p:last-child,
  .markdown-body ul:last-child,
  .markdown-body ol:last-child,
  .markdown-body pre:last-child {
    margin-bottom: 0;
  }
  .markdown-body ul,
  .markdown-body ol {
    margin: 0 0 8px;
    padding-left: 20px;
  }
  .markdown-body li {
    margin: 2px 0;
  }
  .markdown-body code {
    border: 1px solid var(--paseo-border);
    border-radius: 5px;
    background: var(--vscode-textCodeBlock-background, var(--paseo-subtle-bg));
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    padding: 1px 4px;
  }
  .markdown-body pre {
    margin: 0 0 8px;
    overflow: auto;
    border: 1px solid var(--paseo-border);
    border-radius: 8px;
    background: var(--vscode-textCodeBlock-background, var(--paseo-subtle-bg));
    padding: 8px 10px;
  }
  .markdown-body pre code {
    display: block;
    border: 0;
    background: transparent;
    padding: 0;
    white-space: pre;
  }
  .markdown-body a {
    color: var(--vscode-textLink-foreground);
  }
  .message-actions {
    display: flex;
    justify-content: flex-start;
    gap: 4px;
    margin-top: 2px;
  }
  .message-actions .icon-button {
    width: 26px;
    min-width: 26px;
    height: 26px;
    color: var(--vscode-descriptionForeground);
  }
  .processing {
    overflow: hidden;
    border: 1px solid var(--paseo-border);
    border-radius: 8px;
    color: var(--vscode-descriptionForeground);
    background: var(--paseo-subtle-bg);
  }
  .processing[open] {
    background: color-mix(in srgb, var(--vscode-sideBar-background) 90%, var(--vscode-foreground) 10%);
  }
  .processing summary {
    display: flex;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    cursor: pointer;
    line-height: 1.35;
    padding: 5px 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .processing summary::-webkit-details-marker {
    display: none;
  }
  .processing summary::before {
    content: "›";
    flex: 0 0 auto;
    color: var(--vscode-descriptionForeground);
    transition: transform 120ms ease;
  }
  .processing[open] summary::before {
    transform: rotate(90deg);
  }
  .processing-body {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--vscode-foreground);
    background: transparent;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 12px;
    line-height: 1.45;
    padding: 0 9px 8px 25px;
    white-space: pre-wrap;
  }
  .error-block {
    border-color: color-mix(in srgb, var(--vscode-errorForeground) 35%, var(--paseo-border));
    color: var(--vscode-errorForeground);
    background: color-mix(in srgb, var(--vscode-sideBar-background) 92%, var(--vscode-errorForeground) 8%);
  }
  .live-processing {
    border-style: dashed;
  }
  .empty {
    padding: 18px 10px;
    text-align: center;
  }
  .composer {
    position: relative;
    display: grid;
    padding: 8px 10px 10px;
    border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--paseo-border));
    background: var(--vscode-sideBar-background);
  }
  .composer-panel {
    display: grid;
    gap: 7px;
    border: 1px solid var(--paseo-border);
    border-radius: 18px;
    background: var(--paseo-panel-bg);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
    padding: 8px;
  }
  .composer-panel:focus-within {
    border-color: var(--paseo-focus);
  }
  .composer-input {
    min-height: 88px;
    max-height: 220px;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--vscode-input-foreground);
    line-height: 1.5;
    padding: 4px 5px;
    resize: vertical;
  }
  .composer-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
  .composer-controls {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }
  .composer-left-controls,
  .composer-right-controls {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 5px;
  }
  .composer-right-controls {
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .composer-controls select {
    width: auto;
    min-width: 0;
    max-width: 112px;
    height: 28px;
    flex: 0 1 auto;
    overflow: hidden;
    border-color: transparent;
    border-radius: 999px;
    background: var(--paseo-subtle-bg);
    font-size: 12px;
    padding: 2px 8px;
    text-overflow: ellipsis;
  }
  .composer-controls select:hover:not(:disabled) {
    background: var(--vscode-toolbar-hoverBackground, var(--paseo-hover));
  }
  [data-testid="paseo-composer-provider"] {
    max-width: 84px;
  }
  [data-testid="paseo-composer-model"] {
    max-width: 104px;
  }
  [data-testid="paseo-composer-mode"] {
    max-width: 124px;
  }
  .composer-left-controls .icon-button {
    border-color: var(--paseo-border);
    background: transparent;
  }
  .composer-right-controls .icon-button {
    width: 30px;
    min-width: 30px;
    height: 30px;
    border-radius: 999px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  .composer-right-controls .icon-button:disabled {
    color: var(--vscode-descriptionForeground);
    background: var(--paseo-subtle-bg);
  }
  .composer-menu {
    position: absolute;
    left: 10px;
    bottom: calc(100% - 2px);
    z-index: 2;
    min-width: 210px;
    border: 1px solid var(--paseo-border);
    border-radius: 10px;
    background: var(--vscode-dropdown-background, var(--vscode-menu-background, var(--vscode-sideBar-background)));
    box-shadow: 0 8px 24px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.25));
    padding: 6px;
  }
  .menu-item {
    width: 100%;
    display: flex;
    min-height: 30px;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 7px;
    color: var(--vscode-foreground);
    background: transparent;
    font-size: 12px;
    justify-content: flex-start;
    padding: 5px 8px;
  }
  .menu-item:not(.disabled):hover {
    background: var(--vscode-menu-selectionBackground, var(--paseo-hover));
  }
  .menu-item input {
    width: auto;
    height: auto;
  }
  .menu-item.disabled {
    color: var(--vscode-descriptionForeground);
  }
  .error {
    color: var(--vscode-errorForeground);
  }
`;
