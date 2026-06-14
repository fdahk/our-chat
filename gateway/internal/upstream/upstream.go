// Package upstream 把网关收到的上行帧透传给 Node 内部端点落库。网关只管连接,业务仍在 Node:
// 落库/发号/幂等/扩散都由 Node 复用既有逻辑完成,网关不碰 DB(docs 16 §5.4「上行透传」)。
package upstream

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

type Client struct {
	baseURL       string
	internalToken string
	http          *http.Client
}

func New(baseURL, internalToken string) *Client {
	return &Client{
		baseURL:       baseURL,
		internalToken: internalToken,
		// 上行是同步等 ack 的热路径,给一个有界超时,避免 Node 卡住时连接堆积。
		http: &http.Client{Timeout: 10 * time.Second},
	}
}

// Forward 把原始上行帧 POST 给 Node /internal/gateway/uplink,带上验签得到的 userId 与内部令牌。
// 返回 Node 的响应体(网关原样回投给发送方连接,如 message.ack / message.error)。
// userId 走头部由网关注入——身份以网关验签为准,Node 不信任帧内自报的 senderId。
func (c *Client) Forward(ctx context.Context, userID int64, deviceID string, frame []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/gateway/uplink", bytes.NewReader(frame))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Gateway-Token", c.internalToken)
	req.Header.Set("X-User-Id", strconv.FormatInt(userID, 10))
	req.Header.Set("X-Device-Id", deviceID)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream 返回 %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}
