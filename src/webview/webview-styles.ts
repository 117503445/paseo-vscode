/** Paseo Webview 内联样式。 */
export const WEBVIEW_STYLES = /* css */ `
  :root {
    color-scheme: light dark;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }
  body {
    margin: 0;
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
  }
  button, input, select, textarea {
    font: inherit;
  }
  button {
    min-height: 28px;
    border: 1px solid var(--vscode-button-border, transparent);
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
  }
  button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  input, select, textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--vscode-input-border, transparent);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border-radius: 4px;
  }
  input, select {
    height: 28px;
    padding: 3px 6px;
  }
  textarea {
    min-height: 76px;
    resize: vertical;
    padding: 8px;
  }
  .app {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    min-height: 360px;
  }
  .topbar {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
  }
  .title {
    font-weight: 600;
  }
  .title-button {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vscode-foreground);
    background: transparent;
    border: 0;
    text-align: left;
  }
  .top-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: end;
  }
  .icon-button, .count-button {
    min-width: 28px;
    color: var(--vscode-foreground);
    background: transparent;
    border-color: var(--vscode-input-border, transparent);
    padding: 3px 6px;
  }
  .count-button {
    justify-self: start;
    color: var(--vscode-descriptionForeground);
  }
  .status-line {
    grid-column: 1 / -1;
    display: flex;
    gap: 6px;
    min-width: 0;
    align-items: center;
  }
  .status-pill {
    font-weight: 600;
  }
  .muted, .empty {
    color: var(--vscode-descriptionForeground);
    overflow-wrap: anywhere;
  }
  .task-view {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }
  .filters {
    display: grid;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
  }
  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .segmented button {
    color: var(--vscode-foreground);
    background: transparent;
    border-color: var(--vscode-input-border, transparent);
  }
  .segmented button.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .task-list, .timeline {
    overflow: auto;
    min-height: 0;
  }
  .task-item {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    text-align: left;
    color: var(--vscode-foreground);
    background: transparent;
    border: 0;
    border-radius: 0;
    padding: 8px 10px;
  }
  .task-item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .task-main {
    min-width: 0;
  }
  .task-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .task-side {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .thread-view {
    display: grid;
    min-height: 0;
  }
  .timeline {
    padding: 10px 10px 14px;
  }
  .message {
    display: grid;
    gap: 5px;
    margin-bottom: 14px;
  }
  .message-label {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
  .bubble {
    justify-self: end;
    max-width: 88%;
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--vscode-editorWidget-background);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .message-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }
  .message-actions {
    display: flex;
    justify-content: flex-start;
    gap: 4px;
    margin-top: 2px;
  }
  .processing {
    margin: 4px 0 6px;
    padding-left: 8px;
    border-left: 1px solid var(--vscode-input-border, transparent);
    color: var(--vscode-descriptionForeground);
  }
  .processing summary {
    cursor: pointer;
    min-height: 22px;
    line-height: 22px;
  }
  .processing-body {
    margin: 3px 0 6px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
  }
  .error-block {
    color: var(--vscode-errorForeground);
  }
  .live-processing {
    border-left-style: dashed;
  }
  .empty {
    padding: 18px 10px;
    text-align: center;
  }
  .composer {
    position: relative;
    display: grid;
    gap: 8px;
    padding: 10px;
    border-top: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
  }
  .composer-controls {
    display: grid;
    grid-template-columns: auto minmax(54px, 1fr) minmax(54px, 1fr) minmax(54px, 1fr) auto;
    gap: 6px;
    align-items: center;
  }
  .composer-menu {
    position: absolute;
    left: 10px;
    bottom: calc(100% - 6px);
    z-index: 2;
    min-width: 190px;
    padding: 6px;
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 6px;
    background: var(--vscode-dropdown-background);
    box-shadow: 0 4px 12px var(--vscode-widget-shadow, rgba(0,0,0,0.25));
  }
  .menu-item {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 4px 6px;
    border-radius: 4px;
    color: var(--vscode-foreground);
    background: transparent;
    border: 0;
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
