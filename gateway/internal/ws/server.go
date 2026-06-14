// Package ws 是客户端 WS 接入点:握手时从 cookie 验签 JWT 得到身份,升级连接,登记 presence,启动读写循环。
// 身份只认服务端验签结果,绝不信任客户端自报的 userId(docs 16 §5.3)。
package ws

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/our-chat/gateway/internal/auth"
	"github.com/our-chat/gateway/internal/hub"
	"github.com/our-chat/gateway/internal/metrics"
)

const tokenCookie = "token" // 与 Node authCookies.ts 的 TOKEN_COOKIE 一致

type Handler struct {
	hub      *hub.Hub
	presence presenceRegistrar
	secret   []byte
	log      *slog.Logger
	upgrader websocket.Upgrader
}

// presenceRegistrar 只取 hub.presence 的 Register 一个方法,握手成功后把连接镜像进 Redis。
type presenceRegistrar interface {
	Register(ctx context.Context, userID int64, deviceID, socketID string) error
}

func NewHandler(h *hub.Hub, p presenceRegistrar, secret []byte, log *slog.Logger) *Handler {
	return &Handler{
		hub:      h,
		presence: p,
		secret:   secret,
		log:      log,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			// PoC:跨域由 JWT cookie(HttpOnly+SameSite)兜底,这里放行升级。
			// 生产应按 CLIENT_ORIGINS 白名单校验 Origin。
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 先验签再升级:鉴权不过直接 401,不浪费一次协议升级。
	cookie, err := r.Cookie(tokenCookie)
	if err != nil || cookie.Value == "" {
		metrics.Handshakes.WithLabelValues("unauthorized").Inc()
		http.Error(w, "未认证:缺少登录凭据", http.StatusUnauthorized)
		return
	}
	ident, err := auth.Verify(cookie.Value, h.secret)
	if err != nil {
		metrics.Handshakes.WithLabelValues("unauthorized").Inc()
		http.Error(w, "认证失败:登录凭据无效或已过期", http.StatusUnauthorized)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade 内部已写过响应
	}

	socketID := newSocketID()
	// 设备标识取握手自报值(query deviceId),缺省回落 socketID(每条连接唯一)。
	deviceID := r.URL.Query().Get("deviceId")
	if deviceID == "" {
		deviceID = socketID
	}

	c, err := h.hub.NewConn(ident.UserID, deviceID, socketID, conn)
	if err != nil {
		metrics.Handshakes.WithLabelValues("over_quota").Inc()
		_ = conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "网关繁忙,请重试"))
		_ = conn.Close()
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := h.presence.Register(ctx, ident.UserID, deviceID, socketID); err != nil {
		h.log.Warn("presence 登记失败", "userId", ident.UserID, "err", err)
	}

	metrics.Handshakes.WithLabelValues("ok").Inc()
	h.log.Info("连接建立", "userId", ident.UserID, "deviceId", deviceID)
	h.hub.Start(c)
}

func newSocketID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
