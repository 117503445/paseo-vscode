FROM golang:1.22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/project
COPY go.mod go.sum ./
RUN go mod download \
  && go run github.com/playwright-community/playwright-go/cmd/playwright --version
COPY package.json Taskfile.yml ./
COPY scripts/go-scripts ./scripts/go-scripts

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENTRYPOINT ["go", "run", "./scripts/go-scripts", "e2e", "--inside-runner"]
