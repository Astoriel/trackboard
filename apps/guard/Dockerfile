FROM golang:1.26.4-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/trackboard-guard ./cmd/trackboard-guard

FROM alpine:3.21

RUN adduser -D -H trackboard
USER trackboard
COPY --from=build /out/trackboard-guard /usr/local/bin/trackboard-guard

ENTRYPOINT ["trackboard-guard"]
