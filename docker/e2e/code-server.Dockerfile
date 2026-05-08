ARG CODE_SERVER_IMAGE=ghcr.io/coder/code-server:4.104.2

FROM node:22-bookworm AS builder
WORKDIR /workspace/extension
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run package:vsix

FROM ${CODE_SERVER_IMAGE}
USER root
RUN mkdir -p /workspace/project /tmp/paseo-home \
  && printf 'package main\n\nfunc main() {}\n' > /workspace/project/main.go \
  && chown -R coder:coder /workspace/project /tmp/paseo-home
USER coder
COPY --from=builder /workspace/extension/dist/paseo-vscode.vsix /tmp/paseo-vscode.vsix
RUN code-server --install-extension /tmp/paseo-vscode.vsix \
  --extensions-dir /home/coder/.local/share/code-server/extensions
